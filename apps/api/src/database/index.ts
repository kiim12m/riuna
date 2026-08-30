import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  columnTableRelations,
  commentTableRelations,
  epicTableRelations,
  externalLinkTableRelations,
  fieldDefinitionTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskAssigneeTableRelations,
  taskEpicTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  userTableRelations,
  verificationTableRelations,
  viewTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
} from "./relations";
import { resolveDatabaseConnectionString } from "./resolve-database-url";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  billingEventTable,
  billingReminderSentTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  epicTable,
  externalLinkTable,
  externalRefTable,
  fieldDefinitionTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskAssigneeTable,
  taskEpicTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  verificationTable,
  viewTable,
  workflowRuleTable,
  workspaceBillingTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

config();

export const schema = {
  accountTable,
  assetTable,
  activityTable,
  apikeyTable,
  billingReminderSentTable,
  billingEventTable,
  workspaceBillingTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  epicTable,
  externalLinkTable,
  externalRefTable,
  fieldDefinitionTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  projectTable,
  sessionTable,
  taskAssigneeTable,
  taskEpicTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  verificationTable,
  viewTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
  accountTableRelations,
  assetTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  columnTableRelations,
  commentTableRelations,
  epicTableRelations,
  externalLinkTableRelations,
  fieldDefinitionTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  projectTableRelations,
  sessionTableRelations,
  taskAssigneeTableRelations,
  taskEpicTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  verificationTableRelations,
  viewTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
};

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: DatabaseInstance | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseConnectionString(),
      // Fail fast when Railway's internal network is slow rather than hanging
      // indefinitely and blocking every API request.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
  }

  return pool;
}

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDatabasePool(), {
      schema,
    });
  }

  return dbInstance;
}

const db = new Proxy({} as DatabaseInstance, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDatabase(), property, receiver);

    if (typeof value === "function") {
      return value.bind(getDatabase());
    }

    return value;
  },
});

export default db;
