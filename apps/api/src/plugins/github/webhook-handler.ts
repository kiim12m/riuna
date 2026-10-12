import { log } from "../../utils/log";
import { getGithubApp } from "./utils/github-app";
import { handleIssueClosed } from "./webhooks/issue-closed";
import { handleIssueCommentCreated } from "./webhooks/issue-comment-created";
import { handleIssueEdited } from "./webhooks/issue-edited";
import { handleIssueLabeled } from "./webhooks/issue-labeled";
import { handleIssueOpened } from "./webhooks/issue-opened";
import { handleIssueReopened } from "./webhooks/issue-reopened";
import { handleLabelCreated } from "./webhooks/label-created";
import { handlePullRequestClosed } from "./webhooks/pull-request-closed";
import { handlePullRequestOpened } from "./webhooks/pull-request-opened";
import { handlePush } from "./webhooks/push";

export async function handleGitHubWebhook(
  body: string,
  signature: string,
  eventName: string,
  deliveryId: string,
): Promise<{ success: boolean; error?: string }> {
  log.info(
    `[GitHub Webhook] Received event: ${eventName}, delivery: ${deliveryId}`,
  );

  const githubApp = getGithubApp();

  if (!githubApp) {
    log.error("[GitHub Webhook] GitHub App not configured");
    return { success: false, error: "GitHub integration not configured" };
  }

  try {
    log.info(`[GitHub Webhook] Verifying and processing ${eventName}...`);
    await githubApp.webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName as
        | "issues"
        | "pull_request"
        | "push"
        | "label"
        | "issue_comment",
      signature,
      payload: body,
    });

    log.info(`[GitHub Webhook] Successfully processed ${eventName}`);
    return { success: true };
  } catch (error) {
    log.error("[GitHub Webhook] Verification/processing failed:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Webhook verification failed",
    };
  }
}

export function setupWebhookHandlers() {
  const githubApp = getGithubApp();

  if (!githubApp) {
    log.info("GitHub App not configured, skipping webhook handlers");
    return;
  }

  githubApp.webhooks.on("issues.opened", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.opened");
    try {
      await handleIssueOpened(
        payload as Parameters<typeof handleIssueOpened>[0],
      );
      log.info("[GitHub Webhook] issues.opened handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.opened handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issues.closed", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.closed");
    try {
      await handleIssueClosed(
        payload as Parameters<typeof handleIssueClosed>[0],
      );
      log.info("[GitHub Webhook] issues.closed handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.closed handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issues.reopened", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.reopened");
    try {
      await handleIssueReopened(
        payload as Parameters<typeof handleIssueReopened>[0],
      );
      log.info("[GitHub Webhook] issues.reopened handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.reopened handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issues.labeled", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.labeled");
    try {
      await handleIssueLabeled(
        payload as Parameters<typeof handleIssueLabeled>[0],
      );
      log.info("[GitHub Webhook] issues.labeled handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.labeled handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issues.unlabeled", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.unlabeled");
    try {
      await handleIssueLabeled(
        payload as Parameters<typeof handleIssueLabeled>[0],
      );
      log.info("[GitHub Webhook] issues.unlabeled handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.unlabeled handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issues.edited", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issues.edited");
    try {
      await handleIssueEdited(
        payload as Parameters<typeof handleIssueEdited>[0],
      );
      log.info("[GitHub Webhook] issues.edited handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issues.edited handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("push", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling push");
    try {
      await handlePush(payload as Parameters<typeof handlePush>[0]);
      log.info("[GitHub Webhook] push handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] push handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("pull_request.opened", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling pull_request.opened");
    try {
      await handlePullRequestOpened(
        payload as Parameters<typeof handlePullRequestOpened>[0],
      );
      log.info("[GitHub Webhook] pull_request.opened handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] pull_request.opened handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("pull_request.closed", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling pull_request.closed");
    try {
      await handlePullRequestClosed(
        payload as Parameters<typeof handlePullRequestClosed>[0],
      );
      log.info("[GitHub Webhook] pull_request.closed handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] pull_request.closed handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("pull_request.reopened", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling pull_request.reopened");
    try {
      await handlePullRequestOpened(
        payload as Parameters<typeof handlePullRequestOpened>[0],
      );
      log.info("[GitHub Webhook] pull_request.reopened handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] pull_request.reopened handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("label.created", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling label.created");
    try {
      await handleLabelCreated(
        payload as Parameters<typeof handleLabelCreated>[0],
      );
      log.info("[GitHub Webhook] label.created handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] label.created handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.on("issue_comment.created", async ({ payload }) => {
    log.info("[GitHub Webhook] Handling issue_comment.created");
    try {
      await handleIssueCommentCreated(
        payload as Parameters<typeof handleIssueCommentCreated>[0],
      );
      log.info("[GitHub Webhook] issue_comment.created handled successfully");
    } catch (error) {
      log.error("[GitHub Webhook] issue_comment.created handler error:", error);
      throw error;
    }
  });

  githubApp.webhooks.onError((error) => {
    log.error("[GitHub Webhook] Error in webhook handler:", error);
  });

  log.info("✓ GitHub webhook handlers registered");
}
