import { publishEvent } from "../../../events";
import { log } from "../../../utils/log";
import type { GitHubConfig } from "../config";
import { createOrUpdateExternalLink } from "../services/link-manager";
import {
  findAllIntegrationsByRepo,
  findTaskByNumber,
  isTaskInFinalState,
  updateTaskStatus,
} from "../services/task-service";
import { extractTaskNumberFromBranch } from "../utils/branch-matcher";
import { resolveTargetStatus } from "../utils/resolve-column";

type PushPayload = {
  ref: string;
  head_commit?: {
    id: string;
    message: string;
    author?: { name: string };
    timestamp: string;
  };
  repository: {
    owner: { login: string };
    name: string;
    html_url: string;
  };
};

const PROTECTED_BRANCHES = [
  "main",
  "master",
  "develop",
  "staging",
  "production",
];

export async function handlePush(payload: PushPayload) {
  const { ref, repository, head_commit } = payload;

  const branchName = ref.replace("refs/heads/", "");
  log.info(`[Push] Processing branch: ${branchName}`);

  if (PROTECTED_BRANCHES.includes(branchName)) {
    log.info(`[Push] Skipping protected branch: ${branchName}`);
    return;
  }

  const integrations = await findAllIntegrationsByRepo(
    repository.owner.login,
    repository.name,
  );

  if (integrations.length === 0) {
    log.info(
      `[Push] No integrations found for ${repository.owner.login}/${repository.name}`,
    );
    return;
  }

  log.info(`[Push] Found ${integrations.length} integration(s) for this repo`);

  for (const integration of integrations) {
    if (!integration.project) {
      continue;
    }

    const config = JSON.parse(integration.config) as GitHubConfig;
    const projectSlug = integration.project.slug;
    log.info(
      `[Push] Trying project: ${projectSlug}, pattern: ${config.branchPattern}`,
    );

    const taskNumber = extractTaskNumberFromBranch(
      branchName,
      config,
      projectSlug,
    );

    if (!taskNumber) {
      log.info(
        `[Push] Could not extract task number from branch: ${branchName} (pattern: ${config.branchPattern}, slug: ${projectSlug})`,
      );
      continue;
    }

    log.info(
      `[Push] Extracted task number: ${taskNumber} for project ${projectSlug}`,
    );

    const task = await findTaskByNumber(integration.projectId, taskNumber);

    if (!task) {
      log.info(
        `[Push] Task #${taskNumber} not found in project ${integration.projectId}`,
      );
      continue;
    }

    log.info(`[Push] Found task: ${task.id}, current status: ${task.status}`);

    await createOrUpdateExternalLink({
      taskId: task.id,
      integrationId: integration.id,
      resourceType: "branch",
      externalId: branchName,
      url: `${repository.html_url}/tree/${branchName}`,
      title: branchName,
      metadata: {
        lastCommit: head_commit
          ? {
              sha: head_commit.id,
              message: head_commit.message,
              author: head_commit.author?.name,
              timestamp: head_commit.timestamp,
            }
          : null,
      },
    });

    const targetStatus = await resolveTargetStatus(
      integration.projectId,
      "branch_push",
      config.statusTransitions?.onBranchPush || "in-progress",
    );
    log.info(`[Push] Target status: ${targetStatus}, current: ${task.status}`);

    const isTaskFinal = await isTaskInFinalState(task);

    if (task.status !== targetStatus && !isTaskFinal) {
      log.info(
        `[Push] Updating task ${task.id} status from ${task.status} to ${targetStatus}`,
      );
      const statusResult = await updateTaskStatus(task.id, targetStatus);
      if (
        statusResult.applied &&
        statusResult.before.status !== statusResult.after.status
      ) {
        await publishEvent("task.status_changed", {
          taskId: statusResult.after.id,
          projectId: statusResult.after.projectId,
          userId: null,
          oldStatus: statusResult.before.status,
          newStatus: statusResult.after.status,
          title: statusResult.after.title,
          assigneeId: statusResult.after.userId,
          type: "status_changed",
        });
      }
    } else {
      log.info(`[Push] Skipping status update - already ${task.status}`);
    }

    return;
  }

  log.info(
    `[Push] No matching task found in any integrated project for branch: ${branchName}`,
  );
}
