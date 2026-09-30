import { relations } from "drizzle-orm";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  columnTable,
  commentTable,
  cycleTable,
  dashboardTable,
  dashboardWidgetTable,
  epicTable,
  externalLinkTable,
  fieldDefinitionTable,
  githubIntegrationTable,
  goalTable,
  goalTargetTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  personalPlanEntryTable,
  projectTable,
  scheduleBlockTable,
  sessionTable,
  taskAssigneeTable,
  taskEpicTable,
  taskRecurrenceTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  templateTable,
  timeEntryTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  userWorkScheduleTable,
  verificationTable,
  viewTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

export const userTableRelations = relations(userTable, ({ many, one }) => ({
  sessions: many(sessionTable),
  accounts: many(accountTable),
  teamMembers: many(teamMemberTable),
  workspaceMemberships: many(workspaceUserTable),
  assignedTasks: many(taskTable),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  notifications: many(notificationTable),
  notificationPreference: one(userNotificationPreferenceTable),
  notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
  workSchedule: one(userWorkScheduleTable),
  sentInvitations: many(invitationTable),
  apikeys: many(apikeyTable),
}));

export const sessionTableRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
}));

export const accountTableRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const verificationTableRelations = relations(
  verificationTable,
  () => ({}),
);

export const workspaceTableRelations = relations(
  workspaceTable,
  ({ many }) => ({
    teams: many(teamTable),
    members: many(workspaceUserTable),
    projects: many(projectTable),
    assets: many(assetTable),
    fieldDefinitions: many(fieldDefinitionTable),
    views: many(viewTable),
    dashboards: many(dashboardTable),
    goals: many(goalTable),
    templates: many(templateTable),
    invitations: many(invitationTable),
    notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
  }),
);

export const workspaceUserTableRelations = relations(
  workspaceUserTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceUserTable.workspaceId],
      references: [workspaceTable.id],
    }),
    user: one(userTable, {
      fields: [workspaceUserTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const projectTableRelations = relations(
  projectTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [projectTable.workspaceId],
      references: [workspaceTable.id],
    }),
    tasks: many(taskTable),
    epics: many(epicTable),
    cycles: many(cycleTable),
    taskRecurrences: many(taskRecurrenceTable),
    fieldDefinitions: many(fieldDefinitionTable),
    assets: many(assetTable),
    columns: many(columnTable),
    workflowRules: many(workflowRuleTable),
    githubIntegration: many(githubIntegrationTable),
    integrations: many(integrationTable),
    notificationWorkspaceProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const columnTableRelations = relations(columnTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [columnTable.projectId],
    references: [projectTable.id],
  }),
  tasks: many(taskTable),
  workflowRules: many(workflowRuleTable),
}));

export const workflowRuleTableRelations = relations(
  workflowRuleTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [workflowRuleTable.projectId],
      references: [projectTable.id],
    }),
    column: one(columnTable, {
      fields: [workflowRuleTable.columnId],
      references: [columnTable.id],
    }),
  }),
);

export const taskTableRelations = relations(taskTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [taskTable.projectId],
    references: [projectTable.id],
  }),
  assignee: one(userTable, {
    fields: [taskTable.userId],
    references: [userTable.id],
  }),
  team: one(teamTable, {
    fields: [taskTable.teamId],
    references: [teamTable.id],
  }),
  column: one(columnTable, {
    fields: [taskTable.columnId],
    references: [columnTable.id],
  }),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  labels: many(labelTable),
  externalLinks: many(externalLinkTable),
  sourceRelations: many(taskRelationTable, { relationName: "sourceTask" }),
  targetRelations: many(taskRelationTable, { relationName: "targetTask" }),
  remindersSent: many(taskReminderSentTable),
  assignees: many(taskAssigneeTable),
  parent: one(taskTable, {
    fields: [taskTable.parentId],
    references: [taskTable.id],
    relationName: "taskTree",
  }),
  children: many(taskTable, { relationName: "taskTree" }),
  epics: many(taskEpicTable),
  cycle: one(cycleTable, {
    fields: [taskTable.cycleId],
    references: [cycleTable.id],
  }),
  recurrence: one(taskRecurrenceTable, {
    fields: [taskTable.recurrenceId],
    references: [taskRecurrenceTable.id],
  }),
}));

export const epicTableRelations = relations(epicTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [epicTable.projectId],
    references: [projectTable.id],
  }),
  tasks: many(taskEpicTable),
}));

export const templateTableRelations = relations(templateTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [templateTable.workspaceId],
    references: [workspaceTable.id],
  }),
}));

export const taskRecurrenceTableRelations = relations(
  taskRecurrenceTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [taskRecurrenceTable.projectId],
      references: [projectTable.id],
    }),
    tasks: many(taskTable),
  }),
);

export const personalPlanEntryTableRelations = relations(
  personalPlanEntryTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [personalPlanEntryTable.workspaceId],
      references: [workspaceTable.id],
    }),
    user: one(userTable, {
      fields: [personalPlanEntryTable.userId],
      references: [userTable.id],
    }),
    task: one(taskTable, {
      fields: [personalPlanEntryTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const scheduleBlockTableRelations = relations(
  scheduleBlockTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [scheduleBlockTable.workspaceId],
      references: [workspaceTable.id],
    }),
    user: one(userTable, {
      fields: [scheduleBlockTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const cycleTableRelations = relations(cycleTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [cycleTable.projectId],
    references: [projectTable.id],
  }),
  tasks: many(taskTable),
}));

export const taskEpicTableRelations = relations(taskEpicTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [taskEpicTable.taskId],
    references: [taskTable.id],
  }),
  epic: one(epicTable, {
    fields: [taskEpicTable.epicId],
    references: [epicTable.id],
  }),
}));

export const goalTableRelations = relations(goalTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [goalTable.workspaceId],
    references: [workspaceTable.id],
  }),
  creator: one(userTable, {
    fields: [goalTable.createdBy],
    references: [userTable.id],
  }),
  targets: many(goalTargetTable),
}));

export const goalTargetTableRelations = relations(
  goalTargetTable,
  ({ one }) => ({
    goal: one(goalTable, {
      fields: [goalTargetTable.goalId],
      references: [goalTable.id],
    }),
    project: one(projectTable, {
      fields: [goalTargetTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const dashboardTableRelations = relations(
  dashboardTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [dashboardTable.workspaceId],
      references: [workspaceTable.id],
    }),
    creator: one(userTable, {
      fields: [dashboardTable.createdBy],
      references: [userTable.id],
    }),
    widgets: many(dashboardWidgetTable),
  }),
);

export const dashboardWidgetTableRelations = relations(
  dashboardWidgetTable,
  ({ one }) => ({
    goal: one(goalTable, {
      fields: [dashboardWidgetTable.goalId],
      references: [goalTable.id],
    }),
    dashboard: one(dashboardTable, {
      fields: [dashboardWidgetTable.dashboardId],
      references: [dashboardTable.id],
    }),
    // Opcional: sin proyecto, el widget mira todo el espacio.
    project: one(projectTable, {
      fields: [dashboardWidgetTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const viewTableRelations = relations(viewTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [viewTable.workspaceId],
    references: [workspaceTable.id],
  }),
  // Opcional: sin proyecto, la vista vale en todo el espacio.
  project: one(projectTable, {
    fields: [viewTable.projectId],
    references: [projectTable.id],
  }),
  creator: one(userTable, {
    fields: [viewTable.createdBy],
    references: [userTable.id],
  }),
}));

export const fieldDefinitionTableRelations = relations(
  fieldDefinitionTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [fieldDefinitionTable.workspaceId],
      references: [workspaceTable.id],
    }),
    // Opcional a proposito: sin proyecto, la definicion vale para todo el
    // espacio de trabajo.
    project: one(projectTable, {
      fields: [fieldDefinitionTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const taskAssigneeTableRelations = relations(
  taskAssigneeTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskAssigneeTable.taskId],
      references: [taskTable.id],
    }),
    user: one(userTable, {
      fields: [taskAssigneeTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const timeEntryTableRelations = relations(timeEntryTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [timeEntryTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [timeEntryTable.userId],
    references: [userTable.id],
  }),
}));

export const activityTableRelations = relations(activityTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [activityTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [activityTable.userId],
    references: [userTable.id],
  }),
}));

export const assetTableRelations = relations(assetTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [assetTable.workspaceId],
    references: [workspaceTable.id],
  }),
  project: one(projectTable, {
    fields: [assetTable.projectId],
    references: [projectTable.id],
  }),
  task: one(taskTable, {
    fields: [assetTable.taskId],
    references: [taskTable.id],
  }),
  activity: one(activityTable, {
    fields: [assetTable.activityId],
    references: [activityTable.id],
  }),
  creator: one(userTable, {
    fields: [assetTable.createdBy],
    references: [userTable.id],
  }),
}));

export const labelTableRelations = relations(labelTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [labelTable.taskId],
    references: [taskTable.id],
  }),
}));

export const notificationTableRelations = relations(
  notificationTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [notificationTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationPreferenceTableRelations = relations(
  userNotificationPreferenceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userNotificationPreferenceTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userWorkScheduleTableRelations = relations(
  userWorkScheduleTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userWorkScheduleTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationWorkspaceRuleTableRelations = relations(
  userNotificationWorkspaceRuleTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [userNotificationWorkspaceRuleTable.userId],
      references: [userTable.id],
    }),
    workspace: one(workspaceTable, {
      fields: [userNotificationWorkspaceRuleTable.workspaceId],
      references: [workspaceTable.id],
    }),
    selectedProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const userNotificationWorkspaceProjectTableRelations = relations(
  userNotificationWorkspaceProjectTable,
  ({ one }) => ({
    workspaceRule: one(userNotificationWorkspaceRuleTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.workspaceRuleId,
      ],
      references: [
        userNotificationWorkspaceRuleTable.workspaceId,
        userNotificationWorkspaceRuleTable.id,
      ],
    }),
    project: one(projectTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.projectId,
      ],
      references: [projectTable.workspaceId, projectTable.id],
    }),
  }),
);

export const githubIntegrationTableRelations = relations(
  githubIntegrationTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [githubIntegrationTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const teamTableRelations = relations(teamTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [teamTable.workspaceId],
    references: [workspaceTable.id],
  }),
  teamMembers: many(teamMemberTable),
  tasks: many(taskTable),
}));

export const teamMemberTableRelations = relations(
  teamMemberTable,
  ({ one }) => ({
    team: one(teamTable, {
      fields: [teamMemberTable.teamId],
      references: [teamTable.id],
    }),
    user: one(userTable, {
      fields: [teamMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const invitationTableRelations = relations(
  invitationTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [invitationTable.workspaceId],
      references: [workspaceTable.id],
    }),
    inviter: one(userTable, {
      fields: [invitationTable.inviterId],
      references: [userTable.id],
    }),
  }),
);

export const workspaceRoleTableRelations = relations(
  workspaceRoleTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceRoleTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);

export const apikeyTableRelations = relations(apikeyTable, ({ one }) => ({
  user: one(userTable, {
    fields: [apikeyTable.referenceId],
    references: [userTable.id],
  }),
}));

export const integrationTableRelations = relations(
  integrationTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [integrationTable.projectId],
      references: [projectTable.id],
    }),
    externalLinks: many(externalLinkTable),
  }),
);

export const taskRelationTableRelations = relations(
  taskRelationTable,
  ({ one }) => ({
    sourceTask: one(taskTable, {
      fields: [taskRelationTable.sourceTaskId],
      references: [taskTable.id],
      relationName: "sourceTask",
    }),
    targetTask: one(taskTable, {
      fields: [taskRelationTable.targetTaskId],
      references: [taskTable.id],
      relationName: "targetTask",
    }),
  }),
);

export const externalLinkTableRelations = relations(
  externalLinkTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [externalLinkTable.taskId],
      references: [taskTable.id],
    }),
    integration: one(integrationTable, {
      fields: [externalLinkTable.integrationId],
      references: [integrationTable.id],
    }),
  }),
);

export const taskReminderSentTableRelations = relations(
  taskReminderSentTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskReminderSentTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const commentTableRelations = relations(commentTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [commentTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [commentTable.userId],
    references: [userTable.id],
  }),
}));
