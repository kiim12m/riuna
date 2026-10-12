import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { defaults, Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  automationRunTableRelations,
  automationTableRelations,
  columnTableRelations,
  commentTableRelations,
  cycleTableRelations,
  dashboardTableRelations,
  dashboardWidgetTableRelations,
  epicTableRelations,
  externalLinkTableRelations,
  fieldDefinitionTableRelations,
  githubIntegrationTableRelations,
  goalTableRelations,
  goalTargetTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  personalPlanEntryTableRelations,
  projectTableRelations,
  scheduleBlockTableRelations,
  sessionTableRelations,
  taskAssigneeTableRelations,
  taskEpicTableRelations,
  taskRecurrenceTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  taskWatcherTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  templateTableRelations,
  timeEntryTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  userTableRelations,
  userWorkScheduleTableRelations,
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
  automationRunTable,
  automationTable,
  billingEventTable,
  billingReminderSentTable,
  calendarFeedTable,
  columnTable,
  commentTable,
  cycleTable,
  dashboardTable,
  dashboardWidgetTable,
  deviceCodeTable,
  epicTable,
  externalLinkTable,
  externalRefTable,
  fieldDefinitionTable,
  githubIntegrationTable,
  goalTable,
  goalTargetTable,
  instanceAlertTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  jobStatusTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  personalPlanEntryTable,
  projectTable,
  reviewPrivateTable,
  reviewTable,
  scheduleBlockTable,
  sessionTable,
  taskAssigneeTable,
  taskEpicTable,
  taskRecurrenceTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  taskWatcherTable,
  teamMemberTable,
  teamTable,
  templateTable,
  timeEntryTable,
  trialGrantTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userPreferenceTable,
  userTable,
  userTimeOffTable,
  userWorkScheduleTable,
  verificationTable,
  viewTable,
  workflowRuleTable,
  workspaceBillingTable,
  workspaceHolidayTable,
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
  automationTable,
  automationRunTable,
  billingReminderSentTable,
  billingEventTable,
  workspaceBillingTable,
  workspaceHolidayTable,
  calendarFeedTable,
  columnTable,
  commentTable,
  dashboardTable,
  dashboardWidgetTable,
  goalTable,
  goalTargetTable,
  deviceCodeTable,
  cycleTable,
  epicTable,
  externalLinkTable,
  externalRefTable,
  fieldDefinitionTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  instanceAlertTable,
  jobLeaseTable,
  jobStatusTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  personalPlanEntryTable,
  projectTable,
  reviewTable,
  reviewPrivateTable,
  scheduleBlockTable,
  sessionTable,
  taskAssigneeTable,
  taskEpicTable,
  taskRecurrenceTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  taskWatcherTable,
  teamMemberTable,
  teamTable,
  templateTable,
  timeEntryTable,
  trialGrantTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  // Faltaba: sus relaciones estaban registradas y la tabla no, asi que
  // `schema.userWorkScheduleTable` y `db.query` no la conocian. Los
  // controladores la importan directamente y por eso nada fallaba en
  // produccion -el mismo hueco que la Fase 1 encontro con `task_assignee`-.
  userTimeOffTable,
  userPreferenceTable,
  userWorkScheduleTable,
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
  automationTableRelations,
  automationRunTableRelations,
  columnTableRelations,
  commentTableRelations,
  cycleTableRelations,
  dashboardTableRelations,
  dashboardWidgetTableRelations,
  goalTableRelations,
  goalTargetTableRelations,
  epicTableRelations,
  externalLinkTableRelations,
  fieldDefinitionTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  personalPlanEntryTableRelations,
  projectTableRelations,
  scheduleBlockTableRelations,
  sessionTableRelations,
  taskAssigneeTableRelations,
  taskEpicTableRelations,
  taskRecurrenceTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  taskWatcherTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  templateTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userWorkScheduleTableRelations,
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

// Un `Date` que viaja como parametro crudo dentro de un `sql` (las fronteras de
// dia de `due-window.ts`, por ejemplo) lo serializa node-postgres, no drizzle,
// y por defecto en hora **local** con desfase -`...T00:00:00+02:00`-. Contra
// una columna `timestamp` sin zona PostgreSQL ignora el desfase, asi que con la
// API en Madrid (ADR 049) la frontera se corria dos horas y el `CASE` de la
// ventana de vencimiento contradecia a la condicion tipada, que si pasa por
// drizzle y viaja en UTC. Asi los dos caminos guardan y comparan la hora de
// pared UTC, que es el convenio de todas las columnas sin zona del esquema.
defaults.parseInputDatesAsUTC = true;

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
