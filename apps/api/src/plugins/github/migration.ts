import { and, eq, sql } from "drizzle-orm";
import db from "../../database";
import {
  externalLinkTable,
  integrationTable,
  taskTable,
} from "../../database/schema";
import { log } from "../../utils/log";
import { defaultGitHubConfig } from "./config";

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public'
				AND table_name = ${tableName}
			);
		`);
    return (result.rows[0] as { exists: boolean })?.exists === true;
  } catch {
    return false;
  }
}

export async function migrateGitHubIntegration() {
  const oldTableExists = await tableExists("github_integration");

  if (!oldTableExists) {
    log.info("No old github_integration table found, skipping migration");
    return;
  }

  log.info("🔄 Starting GitHub integration migration...");

  try {
    const oldIntegrations = await db.query.githubIntegrationTable.findMany();

    if (oldIntegrations.length === 0) {
      log.info("No old integrations to migrate");
      await dropOldTable();
      return;
    }

    let migratedCount = 0;

    for (const old of oldIntegrations) {
      const existingIntegration = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.projectId, old.projectId),
          eq(integrationTable.type, "github"),
        ),
      });

      if (existingIntegration) {
        continue;
      }

      await db.insert(integrationTable).values({
        projectId: old.projectId,
        type: "github",
        config: JSON.stringify({
          repositoryOwner: old.repositoryOwner,
          repositoryName: old.repositoryName,
          installationId: old.installationId,
          ...defaultGitHubConfig,
        }),
        isActive: old.isActive ?? true,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt,
      });

      migratedCount++;
    }

    log.info(`✓ Migrated ${migratedCount} integrations`);

    await migrateTaskLinks();

    await dropOldTable();

    log.info("✅ GitHub integration migration complete!");
  } catch (error) {
    log.error("Failed to migrate GitHub integration:", error);
    throw error;
  }
}

async function migrateTaskLinks() {
  log.info("🔄 Migrating task links from descriptions...");

  const tasks = await db.query.taskTable.findMany();

  let linksCreated = 0;
  let descriptionsUpdated = 0;

  for (const task of tasks) {
    if (!task.description) continue;

    const linkMatch = task.description.match(
      /(Linked to|Created from) GitHub issue: (https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+))/,
    );

    if (!linkMatch) continue;

    const linkType = linkMatch[1];
    const url = linkMatch[2];
    const owner = linkMatch[3];
    const repo = linkMatch[4];
    const issueNumber = linkMatch[5];

    if (!url || !owner || !repo || !issueNumber) continue;

    const integration = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, task.projectId),
        eq(integrationTable.type, "github"),
      ),
    });

    if (!integration) continue;

    const config = JSON.parse(integration.config);
    if (config.repositoryOwner !== owner || config.repositoryName !== repo) {
      continue;
    }

    const existingLink = await db.query.externalLinkTable.findFirst({
      where: and(
        eq(externalLinkTable.taskId, task.id),
        eq(externalLinkTable.integrationId, integration.id),
        eq(externalLinkTable.resourceType, "issue"),
      ),
    });

    if (!existingLink) {
      await db.insert(externalLinkTable).values({
        taskId: task.id,
        integrationId: integration.id,
        resourceType: "issue",
        externalId: issueNumber,
        url: url,
        title: null,
        metadata: JSON.stringify({
          migrated: true,
          createdFrom: linkType === "Created from" ? "github" : "kaneo",
        }),
      });
      linksCreated++;
    }

    const cleanedDescription = task.description
      .replace(/\n\n---\n\n\*.*GitHub issue:.*\*/g, "")
      .replace(/\n---\n<sub>Task:.*<\/sub>/g, "")
      .trim();

    if (cleanedDescription !== task.description) {
      await db
        .update(taskTable)
        .set({ description: cleanedDescription || null })
        .where(eq(taskTable.id, task.id));
      descriptionsUpdated++;
    }
  }

  log.info(`✓ Created ${linksCreated} external links`);
  log.info(`✓ Cleaned ${descriptionsUpdated} task descriptions`);
}

async function dropOldTable() {
  log.info("🗑️ Dropping old github_integration table...");
  await db.execute(sql`DROP TABLE IF EXISTS github_integration CASCADE`);
  log.info("✓ Dropped github_integration table");
}
