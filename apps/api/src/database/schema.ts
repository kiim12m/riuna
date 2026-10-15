import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userTable = pgTable("user", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  locale: text("locale"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  isAnonymous: boolean("is_anonymous").default(false),
  // Cuentas locales: usuario y contrasena sin correo real. `username` y
  // `displayUsername` los exige el plugin homonimo de Better Auth;
  // `isLocalAccount` es propio y marca a quien no tiene correo al que escribir.
  username: text("username").unique(),
  displayUsername: text("display_username"),
  isLocalAccount: boolean("is_local_account").default(false),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { mode: "date" }),
});

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const accountTable = pgTable(
  "account",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const userAvatarTable = pgTable(
  "user_avatar",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique("user_avatar_user_id_unique")
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_avatar_userId_idx").on(table.userId)],
);

export const verificationTable = pgTable(
  "verification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const workspaceTable = pgTable("workspace", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
});

export const workspaceUserTable = pgTable(
  "workspace_member",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull(),
  },
  (table) => [
    index("workspace_member_workspaceId_idx").on(table.workspaceId),
    index("workspace_member_userId_idx").on(table.userId),
  ],
);

export const workspaceBillingTable = pgTable(
  "workspace_billing",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .unique("workspace_billing_workspace_id_unique")
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    foundingFree: boolean("founding_free").notNull().default(false),
    trialEndsAt: timestamp("trial_ends_at", { mode: "date" }),
    creemCustomerId: text("creem_customer_id"),
    creemSubscriptionId: text("creem_subscription_id").unique(),
    creemProductId: text("creem_product_id"),
    plan: text("plan"),
    billingInterval: text("billing_interval"),
    status: text("status"),
    seats: integer("seats").notNull().default(1),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    canceledAt: timestamp("canceled_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("workspace_billing_workspaceId_idx").on(table.workspaceId)],
);

export const trialGrantTable = pgTable("trial_grant", {
  emailHash: text("email_hash").primaryKey(),
  trialEndsAt: timestamp("trial_ends_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const billingEventTable = pgTable("billing_event", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { mode: "date" })
    .defaultNow()
    .notNull(),
});

export const teamTable = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_workspaceId_idx").on(table.workspaceId)],
);

export const teamMemberTable = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teamTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
    // Responsable del departamento (ADR 059): ve en solo lectura el plan y
    // los cierres de los demas del equipo, nunca su valoracion. Better Auth
    // no la conoce: al añadir a alguien queda en `false`.
    isLead: boolean("is_lead").notNull().default(false),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const invitationTable = pgTable(
  "invitation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    teamId: text("team_id"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_workspaceId_idx").on(table.workspaceId),
    index("invitation_email_idx").on(table.email),
    index("invitation_inviterId_idx").on(table.inviterId),
  ],
);

export const workspaceRoleTable = pgTable(
  "workspace_role",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workspace_role_workspaceId_idx").on(table.workspaceId),
    index("workspace_role_role_idx").on(table.role),
  ],
);

export const projectTable = pgTable(
  "project",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    icon: text("icon").default("Layout"),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    isPublic: boolean("is_public").default(false),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    lastTaskNumber: integer("last_task_number").notNull().default(0),
    position: integer("position").notNull().default(0),
    // La cascada del arbol es por proyecto y viene apagada: cerrar una tarea
    // y arrastrar con ella veinte descendientes es una accion que nadie ha
    // pedido si no la ha encendido antes.
    cascadeClose: boolean("cascade_close").notNull().default(false),
    cascadeArchive: boolean("cascade_archive").notNull().default(false),
    maxTaskDepth: integer("max_task_depth").notNull().default(5),
    // El progreso de una rama pesa por la estimacion en vez de contar tareas
    // hechas (ADR 083).
    weightedProgress: boolean("weighted_progress").notNull().default(false),
    // Con valor, el proyecto es la Bandeja de esa persona (ADR 051): no sale
    // en las listas de proyectos, pero sus tareas no son privadas. Al borrar
    // a la persona, o al salir ella del espacio, vuelve a ser un proyecto
    // normal y no se pierde nada.
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    // El estado del proyecto (ADR 087): su salud, con una nota, sus fechas
    // propias y quien lo lleva. La lista de proyectos filtra y ordena por
    // todo menos la nota, que va siempre con la salud.
    health: text("health").notNull().default("not_started"),
    healthNote: text("health_note"),
    startDate: timestamp("start_date", { mode: "date" }),
    endDate: timestamp("end_date", { mode: "date" }),
    leadUserId: text("lead_user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    // Los valores de los campos de proyecto (ADR 088), como los de una tarea.
    customFields: jsonb("custom_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // El proyecto padre (ADR 089), de un solo nivel: un subproyecto no tiene
    // hijos. Al borrar el padre, sus hijos vuelven a ser proyectos sueltos.
    parentId: text("parent_id").references((): AnyPgColumn => projectTable.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("project_workspace_id_id_unique").on(table.workspaceId, table.id),
    check(
      "project_health_valid",
      sql`${table.health} IN ('not_started', 'on_track', 'at_risk', 'off_track', 'finished', 'cancelled')`,
    ),
    index("project_parent_id_idx").on(table.parentId),
    check("project_not_own_parent", sql`${table.parentId} <> ${table.id}`),
    check(
      "project_dates_ordered",
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    index("project_workspaceId_position_idx").on(
      table.workspaceId,
      table.position,
    ),
    uniqueIndex("project_one_inbox_per_member")
      .on(table.workspaceId, table.ownerUserId)
      .where(sql`owner_user_id IS NOT NULL`),
  ],
);

export const columnTable = pgTable(
  "column",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    icon: text("icon"),
    color: text("color"),
    isFinal: boolean("is_final").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("column_projectId_idx").on(table.projectId)],
);

export const workflowRuleTable = pgTable(
  "workflow_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationType: text("integration_type").notNull(),
    eventType: text("event_type").notNull(),
    columnId: text("column_id")
      .notNull()
      .references(() => columnTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_rule_projectId_idx").on(table.projectId),
    index("workflow_rule_columnId_idx").on(table.columnId),
    // Una regla por evento de integracion: `resolveTargetStatus` lee una sola,
    // y con dos no habria forma de saber cual manda.
    uniqueIndex("workflow_rule_project_integration_event_unique").on(
      table.projectId,
      table.integrationType,
      table.eventType,
    ),
  ],
);

export const taskTable = pgTable(
  "task",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer("position").default(0),
    number: integer("number").default(1),
    userId: text("assignee_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Asignacion a un departamento entero, independiente del asignado
    // individual: una tarea puede pertenecer a un equipo sin tener todavia
    // una persona concreta detras, y el equipo sobrevive a los cambios de
    // pertenencia que una lista de asignados no reflejaria.
    teamId: text("team_id").references(() => teamTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("to-do"),
    columnId: text("column_id").references(() => columnTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    priority: text("priority").default("low").notNull(),
    startDate: timestamp("start_date", { mode: "date" }),
    dueDate: timestamp("due_date", { mode: "date" }),
    // Un hito (ADR 082): una sola fecha —el inicio es el vencimiento—, sin
    // estimacion ni subtareas. Columna propia porque se filtra.
    isMilestone: boolean("is_milestone").notNull().default(false),
    // Fechas automaticas (ADR 083): las de un padre salen de su rama y se
    // guardan aqui mismo, para que filtros, orden y exportacion las vean. La
    // 2.3 lo amplia a las sucesoras de una precedencia.
    autoDates: boolean("auto_dates").notNull().default(false),
    // El arbol. `parent_id` es la verdad; `path` y `depth` son su forma
    // materializada, que es lo que permite contestar "todo el subarbol" con un
    // prefijo en vez de una recursiva por consulta. `path` incluye la propia
    // tarea y va entre barras —`/raiz/hija/nieta/`—, de modo que los
    // descendientes estrictos de X son `path LIKE X.path || '_%'`. Padre e
    // hija comparten siempre proyecto: ver ADR 011.
    parentId: text("parent_id").references((): AnyPgColumn => taskTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    // Estimacion en segundos, la misma unidad que `time_entry.duration`, para
    // que el agregado del subarbol compare estimado y registrado sin convertir
    // nada por el camino.
    estimate: integer("estimate"),
    // Los valores de los campos personalizados, indexados por la `key` de su
    // definicion. Van en la propia fila y no en una tabla de valores porque
    // el tablero ya esta leyendo esta fila: asi pintar una tarjeta con ocho
    // campos sigue siendo una consulta y no ocho filas que pivotar. Los
    // campos de tipo relacion no guardan nada aqui —viven en `task_relation`,
    // que si tiene integridad referencial—. Ver ADR 013.
    customFields: jsonb("custom_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // El ciclo al que pertenece, o ninguno. Se borra a `null` con el ciclo: la
    // tarea sobrevive a su sprint.
    cycleId: text("cycle_id").references(() => cycleTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // De que recurrencia salio, si salio de alguna. Borrar la recurrencia no
    // borra lo que ya genero.
    recurrenceId: text("recurrence_id").references(
      () => taskRecurrenceTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    /**
     * Cuando la tarea entro en una columna final. **Lo mantiene un disparador**
     * (`task_completed_at`), no la aplicacion: hay cinco escritores de `status`
     * en el dominio de tareas y otros tantos entre importacion, webhooks y MCP,
     * y la Fase 4.5 ya demostro que cuatro caminos que escriben lo mismo a mano
     * acaban divergiendo.
     *
     * **No es la fuente de verdad de "esta hecha"** —eso lo dice la columna—,
     * solo responde *cuando*. Ver ADR 025.
     */
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_projectId_idx").on(table.projectId),
    index("task_cycleId_idx").on(table.cycleId),
    index("task_dueDate_idx").on(table.dueDate),
    // Parcial y solo para las cerradas: las ventanas estrechas de «hechas esta
    // semana» sobre anos de historia (ADR 030). Medido con 50.000 tareas
    // repartidas en tres anos: de 20 ms a 0,5 ms, y el planificador lo usa.
    index("task_completedAt_idx")
      .on(table.completedAt)
      .where(sql`completed_at IS NOT NULL`),
    index("task_assigneeId_idx").on(table.userId),
    index("task_teamId_idx").on(table.teamId),
    index("task_columnId_idx").on(table.columnId),
    index("task_parentId_idx").on(table.parentId),
    // `text_pattern_ops` es lo que hace que el `LIKE 'prefijo%'` del subarbol
    // use el indice: el operador por defecto depende de la intercalacion de la
    // base de datos y con una que no sea C no sirve para prefijos.
    index("task_path_idx").using("btree", sql`${table.path} text_pattern_ops`),
    // GIN con la clase por defecto (`jsonb_ops`), no `jsonb_path_ops`: la
    // primera indexa claves ademas de valores y responde tambien a "esta
    // tarea tiene el campo X", que es lo que necesita el editor para saber
    // que hay que rellenar. Ojo: GIN acelera contencion y existencia, no
    // comparaciones por rango —`presupuesto > 1000` pide un indice de
    // expresion por campo, y eso se decide en la Fase 4 cuando se sepa que
    // campos se filtran de verdad. Ver ADR 013.
    index("task_custom_fields_idx").using("gin", table.customFields),
    unique("task_project_number_unique").on(table.projectId, table.number),
    // Las dos invariantes del arbol, vigiladas por la base de datos y no por
    // la buena memoria de quien anada el proximo `insert(taskTable)`: el
    // camino termina en la propia tarea, y la profundidad es el numero de
    // saltos que ese camino describe.
    check(
      "task_path_ends_with_id",
      sql`${table.path} LIKE '%/' || ${table.id} || '/'`,
    ),
    check(
      "task_depth_matches_path",
      sql`${table.depth} = length(${table.path}) - length(replace(${table.path}, '/', '')) - 2`,
    ),
  ],
);

// Asignados adicionales. `task.assignee_id` sigue siendo el responsable
// principal y no se toca: todo lo heredado (notificaciones, filtros, tarjetas,
// integraciones) sigue leyendolo. Esta tabla anade el resto, y el principal
// tambien esta aqui, de modo que consultar "quien tiene esta tarea" es una
// sola consulta y no una union con la columna.
export const taskAssigneeTable = pgTable(
  "task_assignee",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("taskAssignee_taskId_idx").on(table.taskId),
    index("taskAssignee_userId_idx").on(table.userId),
    unique("task_assignee_unique").on(table.taskId, table.userId),
  ],
);

// Quien sigue una tarea a proposito (ADR 076). Los asignados no se copian aqui:
// son observadores implicitos y los avisos los suman al leer.
export const taskWatcherTable = pgTable(
  "task_watcher",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("taskWatcher_userId_idx").on(table.userId),
    unique("task_watcher_unique").on(table.taskId, table.userId),
  ],
);

// Recordatorio personal en una tarea (ADR 077): uno por persona y tarea. Se
// borra al avisar, asi que la tabla solo guarda los pendientes; el indice de
// `remind_at` es el que recorre el planificador cada minuto.
export const taskReminderTable = pgTable(
  "task_reminder",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { mode: "date" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("taskReminder_remindAt_idx").on(table.remindAt),
    unique("task_reminder_unique").on(table.taskId, table.userId),
  ],
);

// Avisos de proyecto y de espacio (ADR 081). `project_id` nulo es un aviso
// del espacio. Fijar lo saca como franja en las vistas del proyecto hasta
// `pinned_until`, o sin fin.
// La historia de un proyecto (ADR 087): `activity` es de tareas —su
// `task_id` es obligatorio— y el estado de un proyecto no tiene tarea.
export const projectActivityTable = pgTable(
  "project_activity",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    eventData: jsonb("event_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("project_activity_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const announcementTable = pgTable(
  "announcement",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    pinnedUntil: timestamp("pinned_until", { mode: "date" }),
    notified: boolean("notified").notNull().default(false),
    authorId: text("author_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("announcement_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("announcement_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// Una pagina de la wiki (ADR 092): del espacio, con `project_id` nulo, o de un
// proyecto, en arbol por `parent_id`. El contenido es Markdown, el mismo
// formato que la descripcion de una tarea, y `version` es el contador del
// bloqueo optimista: guardar sobre una version que ya no es la ultima es un
// 409, no una escritura perdida.
export const wikiPageTable = pgTable(
  "wiki_page",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
    }),
    // En cascada: borrar la rama es borrar su raiz. Subir las hijas un nivel
    // lo hace el controlador antes de borrar.
    parentId: text("parent_id").references(
      (): AnyPgColumn => wikiPageTable.id,
      {
        onDelete: "cascade",
      },
    ),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => userTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("wiki_page_workspaceId_idx").on(table.workspaceId),
    index("wiki_page_projectId_idx").on(table.projectId),
    index("wiki_page_parentId_idx").on(table.parentId),
  ],
);

// Cada version guardada de una pagina, entera: las paginas son cortas y las
// diferencias se calculan al leer.
export const wikiPageVersionTable = pgTable(
  "wiki_page_version",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => wikiPageTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    authorId: text("author_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    // La «nota del cambio», opcional.
    note: text("note"),
    // Si esta version es la vuelta a otra anterior, cual.
    restoredFrom: integer("restored_from"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wiki_page_version_page_version_unique").on(
      table.pageId,
      table.version,
    ),
  ],
);

// Que pagina y que tarea se enlazan, y desde donde: `page` si la pagina
// enlaza la tarea, `task` si la descripcion de la tarea enlaza la pagina. Lo
// rehacen las escrituras, para no buscar con `LIKE` en cada descripcion.
export const wikiLinkTable = pgTable(
  "wiki_link",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => wikiPageTable.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.taskId, table.source] }),
    index("wiki_link_taskId_idx").on(table.taskId),
    check("wiki_link_source_valid", sql`${table.source} IN ('page', 'task')`),
  ],
);

// Las epicas cortan el proyecto en vertical: agrupan tareas de cualquier rama
// del arbol y de cualquier columna. Son entidad propia y no una etiqueta
// porque tienen fechas, orden y un ciclo de vida —se archivan— que una
// etiqueta no sabria llevar.
export const epicTable = pgTable(
  "epic",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    position: integer("position").notNull().default(0),
    startDate: timestamp("start_date", { mode: "date" }),
    dueDate: timestamp("due_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Borrado suave, alineado con el `archived_at` que ya usa `project`.
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (table) => [
    index("epic_projectId_idx").on(table.projectId),
    index("epic_projectId_position_idx").on(table.projectId, table.position),
  ],
);

// Muchos a muchos a proposito: una tarea puede servir a mas de una epica, y
// obligar a elegir una sola convertiria la epica en un segundo estado.
export const taskEpicTable = pgTable(
  "task_epic",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    epicId: text("epic_id")
      .notNull()
      .references(() => epicTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_epic_taskId_idx").on(table.taskId),
    index("task_epic_epicId_idx").on(table.epicId),
    unique("task_epic_unique").on(table.taskId, table.epicId),
  ],
);

/**
 * Ciclos (sprints): una caja de tiempo con nombre y fechas a la que se le meten
 * tareas antes de empezar.
 *
 * Cuelga del **proyecto**, como la epica, y por el mismo motivo: hereda el
 * control de acceso, el permiso `project:update`, el canal de tiempo real y la
 * barra de filtros sin inventar nada. La diferencia con la epica es que la
 * epica agrupa por *tema* y no caduca, y el ciclo dice *cuando*: una tarea
 * tiene las dos a la vez.
 *
 * A diferencia de `epic` **no lleva `archived_at`**. `closed` ya es el estado
 * terminal, y un ciclo cerrado tiene que quedarse: es lo que sostiene la
 * velocidad historica. Tampoco lleva `position`, porque las fechas ya lo
 * ordenan.
 */
export const cycleTable = pgTable(
  "cycle",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    /** El objetivo del sprint, en una linea. */
    goal: text("goal"),
    status: text("status").notNull().default("planned"),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }).notNull(),
    /**
     * Cuando se cerro. Es lo que congela la velocidad: a partir de aqui el
     * ciclo no cambia aunque alguien termine una tarea tarde.
     */
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("cycle_projectId_idx").on(table.projectId),
    index("cycle_projectId_startDate_idx").on(table.projectId, table.startDate),
    // **Un solo ciclo activo por proyecto**, vigilado por la base de datos y no
    // por la buena voluntad del controlador: es la misma decision que las dos
    // CHECK del arbol de la Fase 2. Dos peticiones simultaneas de "activar"
    // podrian pasar las dos la comprobacion previa y dejar el proyecto con dos
    // sprints en marcha; el indice parcial las corta en el commit.
    uniqueIndex("cycle_one_active_per_project")
      .on(table.projectId)
      .where(sql`status = 'active'`),
    check(
      "cycle_status_valid",
      sql`${table.status} IN ('planned', 'active', 'closed')`,
    ),
    check("cycle_dates_ordered", sql`${table.endDate} >= ${table.startDate}`),
  ],
);

/**
 * Plantillas de proyecto y de arbol.
 *
 * Cuelgan del **espacio de trabajo** y no del proyecto, al reves que las epicas
 * y los ciclos: una plantilla que solo sirviera en el proyecto donde se creo no
 * seria una plantilla. Es la misma decision que `field_definition` toma con su
 * `project_id` nulo.
 *
 * `content` guarda el arbol entero en `jsonb`. La alternativa —tablas de tareas
 * plantilla con su propia jerarquia— duplicaria `task`, sus dos CHECK y su
 * `path`, para datos que no se consultan ni se filtran: se leen enteros al
 * aplicar la plantilla y nunca por partes. Ver ADR 027.
 */
export const templateTable = pgTable(
  "template",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description"),
    /** `project` trae columnas y epicas ademas del arbol; `task` solo el arbol. */
    kind: text("kind").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("template_workspaceId_idx").on(table.workspaceId),
    check("template_kind_valid", sql`${table.kind} IN ('project', 'task')`),
  ],
);

/**
 * Tareas recurrentes: la plantilla de lo que hay que crear y cada cuanto.
 *
 * La cadencia se guarda como un **modelo explicito** y no como una cadena
 * RRULE. RRULE es el estandar y lo cubre todo, pero exige una dependencia nueva
 * para interpretar casos que aqui no pide nadie ("el ultimo jueves laborable de
 * cada trimestre"); el modelo explicito —frecuencia, intervalo, dias— cubre lo
 * que la gente configura de verdad y se lee sin libreria. Ver ADR 026.
 *
 * `template` guarda los campos de la tarea a crear, con la misma convencion de
 * `jsonb` que `field_definition.config` y `view.config`: la alternativa era una
 * tabla ancha que duplicaria la forma de `task` y envejeceria peor.
 */
export const taskRecurrenceTable = pgTable(
  "task_recurrence",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Sin valor por defecto a proposito: una plantilla sin titulo o una
    // cadencia sin frecuencia no son un estado inicial valido, son una fila
    // rota. Y con `default '{}'` la CHECK de abajo no comprobaria nada, porque
    // `'{}'->>'frequency'` es NULL y una CHECK pasa con NULL.
    template: jsonb("template").$type<Record<string, unknown>>().notNull(),
    cadence: jsonb("cadence").$type<Record<string, unknown>>().notNull(),
    /** Cuando toca la proxima. Es la columna que el planificador consulta. */
    nextRunAt: timestamp("next_run_at", { mode: "date" }).notNull(),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    /** Opcional: a partir de aqui deja de generar. */
    endsAt: timestamp("ends_at", { mode: "date" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_recurrence_projectId_idx").on(table.projectId),
    // El indice que sirve al planificador: "que toca ya". Parcial, porque una
    // recurrencia apagada no se mira nunca y no tiene por que ocupar el indice.
    index("task_recurrence_due_idx").on(table.nextRunAt).where(sql`active`),
    check(
      "task_recurrence_frequency_valid",
      sql`${table.cadence}->>'frequency' IS NOT NULL AND ${table.cadence}->>'frequency' IN ('daily', 'weekly', 'monthly')`,
    ),
  ],
);

/**
 * El plan personal: que dia piensa alguien hacer una tarea.
 *
 * Aparte de `task.due_date` a proposito (ADR 040): el vencimiento es un
 * compromiso con el equipo y el plan es de quien lo hace. Una tarea tiene una
 * sola fila por persona -unica por `(user_id, task_id)`-, y cae en cascada con
 * el usuario o la tarea: un plan no sobrevive a lo que planifica.
 */
/**
 * El cierre de un periodo -dia o semana- de una persona en un espacio
 * (ADR 054): lo que su responsable de departamento puede ver. La valoracion
 * va aparte, en `review_private`, y **nunca** aqui: la separacion es
 * estructural para que ninguna lectura del responsable pueda unirla.
 */
export const reviewTable = pgTable(
  "review",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** `day` o `week`. */
    period: text("period").notNull(),
    /** Medianoche de Madrid del primer dia del periodo, como `planned_date`. */
    periodStart: timestamp("period_start", { mode: "date" }).notNull(),
    /** Lo que frena, en texto libre. */
    blockers: text("blockers"),
    /** Cifras del periodo al cerrarlo: hechas, registrado, movidas… */
    summary: jsonb("summary").notNull().default({}),
    closedAt: timestamp("closed_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("review_user_period_unique").on(
      table.userId,
      table.workspaceId,
      table.period,
      table.periodStart,
    ),
    check("review_period_valid", sql`${table.period} IN ('day', 'week')`),
  ],
);

/**
 * La valoracion de un cierre, 1:1 con `review` (ADR 054): impacto, energia y
 * una nota. **Siempre privada**: solo la lee la propia persona, desde el
 * modulo `review/`. Una prueba de arquitectura falla si otro modulo la nombra.
 */
export const reviewPrivateTable = pgTable(
  "review_private",
  {
    reviewId: text("review_id")
      .primaryKey()
      .references(() => reviewTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    impact: smallint("impact"),
    energy: smallint("energy"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "review_private_impact_valid",
      sql`${table.impact} IS NULL OR ${table.impact} BETWEEN 1 AND 4`,
    ),
    check(
      "review_private_energy_valid",
      sql`${table.energy} IS NULL OR ${table.energy} BETWEEN 1 AND 3`,
    ),
  ],
);

export const personalPlanEntryTable = pgTable(
  "personal_plan_entry",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    plannedDate: timestamp("planned_date", { mode: "date" }).notNull(),
    position: integer("position").notNull().default(0),
    /**
     * Minuto del dia (0-1439) al que el Cronograma ancla la entrada (ADR 041).
     * Nulo: fluye en orden de `position`, como hasta ahora. Con valor: hora
     * fija, actua de bloqueador frente a las demas entradas de ese dia.
     */
    startMinute: smallint("start_minute"),
    /**
     * Imprescindible del dia, 1-3 (ADR 053): como mucho tres por persona,
     * espacio y dia, y lo impone la base con el indice unico parcial de
     * abajo. Se borra sola al cambiar de dia (disparador
     * `personal_plan_entry_clear_key_rank`): ser imprescindible el lunes no
     * dice nada del martes.
     */
    keyRank: smallint("key_rank"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("personal_plan_entry_user_task").on(table.userId, table.taskId),
    index("personal_plan_entry_user_date_idx").on(
      table.userId,
      table.plannedDate,
    ),
    uniqueIndex("personal_plan_entry_key_rank_per_day")
      .on(table.userId, table.workspaceId, table.plannedDate, table.keyRank)
      .where(sql`key_rank IS NOT NULL`),
    check(
      "personal_plan_entry_start_minute_valid",
      sql`${table.startMinute} IS NULL OR ${table.startMinute} BETWEEN 0 AND 1439`,
    ),
    check(
      "personal_plan_entry_key_rank_valid",
      sql`${table.keyRank} IS NULL OR ${table.keyRank} BETWEEN 1 AND 3`,
    ),
  ],
);

/**
 * Citas fijas o bloqueos del Cronograma que no son tareas (visita de obra,
 * comida) — ADR 041. Un bloque suelto lleva `planned_date`; uno repetido
 * lleva `cadence` (misma forma que `task_recurrence.cadence`,
 * `recurrence/cadence.ts`) y `planned_date` nula. Nunca las dos a la vez.
 */
export const scheduleBlockTable = pgTable(
  "schedule_block",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    plannedDate: timestamp("planned_date", { mode: "date" }),
    cadence: jsonb("cadence").$type<Record<string, unknown>>(),
    /** Opcional: a partir de aqui, un bloque repetido deja de proyectarse.
     * Mismo nombre y forma que `task_recurrence.ends_at`. Solo tiene sentido
     * con `cadence` -un bloque suelto ya tiene su unico dia en `planned_date`-. */
    endsAt: timestamp("ends_at", { mode: "date" }),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("schedule_block_user_date_idx").on(table.userId, table.plannedDate),
    check(
      "schedule_block_kind_valid",
      sql`${table.kind} IN ('fixed', 'break')`,
    ),
    check(
      "schedule_block_minutes_valid",
      sql`${table.startMinute} BETWEEN 0 AND 1439 AND ${table.endMinute} BETWEEN 1 AND 1440 AND ${table.endMinute} > ${table.startMinute}`,
    ),
    check(
      "schedule_block_date_xor_cadence",
      sql`(${table.plannedDate} IS NOT NULL) != (${table.cadence} IS NOT NULL)`,
    ),
    check(
      "schedule_block_ends_at_only_repeating",
      sql`${table.endsAt} IS NULL OR ${table.cadence} IS NOT NULL`,
    ),
  ],
);

// El catalogo de campos personalizados. Esta tabla dice que campos existen y
// de que tipo; los valores viven en `task.custom_fields`.
//
// El alcance es una de dos: con `project_id` puesto el campo solo existe en
// ese proyecto, y con `project_id` nulo existe en todo el espacio. El
// `workspace_id` esta siempre —regla de Riuna para las tablas nuevas— y
// ademas es lo que permite listar los campos de un espacio sin recorrer sus
// proyectos.
export const fieldDefinitionTable = pgTable(
  "field_definition",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    // `key` es la clave dentro del JSONB y no cambia nunca; `name` es la
    // etiqueta visible. Separarlas es lo que permite renombrar "Presupuesto"
    // a "Presupuesto 2026" sin huerfanar el valor guardado en cada tarea.
    key: text("key").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    // Lo que depende del tipo: las opciones de un select, el codigo de moneda,
    // el minimo y el maximo de un numero. Va en JSONB porque su forma la
    // decide `type`, y una columna por variante seria una tabla ancha de
    // nulos.
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Borrado suave, como en `epic`: archivar una definicion la retira de los
    // formularios sin borrar el valor que miles de tareas ya tienen guardado.
    archivedAt: timestamp("archived_at", { mode: "date" }),
    // A que se pone el campo: a las tareas o, definido en el espacio, a los
    // proyectos (ADR 088). Sus valores van en `project.custom_fields`.
    entity: text("entity").notNull().default("task"),
  },
  (table) => [
    index("field_definition_workspaceId_idx").on(table.workspaceId),
    index("field_definition_projectId_idx").on(table.projectId),
    // Dos indices parciales en vez de un UNIQUE de tres columnas: en SQL
    // estandar dos filas con `project_id` nulo no colisionan nunca —NULL no
    // es igual a NULL—, asi que un `unique(workspace_id, project_id, key)`
    // dejaria repetir la clave de todos los campos de espacio. `NULLS NOT
    // DISTINCT` lo arreglaria pero solo existe desde Postgres 15.
    // Con `entity`: un «presupuesto» de tarea y otro de proyecto conviven.
    uniqueIndex("field_definition_workspace_key_unique")
      .on(table.workspaceId, table.entity, table.key)
      .where(sql`project_id IS NULL`),
    uniqueIndex("field_definition_project_key_unique")
      .on(table.projectId, table.key)
      .where(sql`project_id IS NOT NULL`),
    // El vocabulario de tipos, vigilado por la base de datos y no por la
    // buena memoria de quien anada el proximo `insert`, que es el criterio
    // que dejo establecido el arbol de la Fase 2.
    check(
      "field_definition_type_valid",
      sql`${table.type} IN ('text', 'number', 'currency', 'select', 'multi_select', 'date', 'checkbox', 'user', 'url', 'relation', 'formula')`,
    ),
    // Un campo de proyecto se define en el espacio, nunca en un proyecto.
    check(
      "field_definition_entity_valid",
      sql`${table.entity} = 'task' OR (${table.entity} = 'project' AND ${table.projectId} IS NULL)`,
    ),
  ],
);

// Una vista guardada: el filtro, el orden, la agrupacion y las columnas con
// que alguien quiere mirar un proyecto.
//
// La propiedad es de quien la crea, no del rol. Cualquiera del espacio puede
// guardarse una vista y compartirla; solo su dueno —o un administrador— la
// edita o la borra. Es lo contrario que `field_definition`, y a proposito: un
// campo cambia la forma de las tareas de todo el mundo, y una vista solo dice
// como mirarlas. Atar esto a `project:update` repetiria el problema de la
// Fase 3, donde definir un campo quedo fuera del alcance de un `member`.
/**
 * Un panel personal. Fase 7, rebanada 1.
 *
 * Cuelga del espacio de trabajo y pertenece a quien lo crea, como las vistas
 * (ADR 015): un panel dice como mirar, no cambia la forma de nada, asi que se
 * gobierna por propiedad y no por el vocabulario de permisos. De momento **solo
 * hay paneles personales**; compartir con el equipo llega despues y sera una
 * columna mas, no otra tabla.
 */
export const dashboardTable = pgTable(
  "dashboard",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    /**
     * El panel que se crea solo la primera vez, con una distribucion de
     * partida. Uno por persona y espacio.
     */
    isDefault: boolean("is_default").notNull().default(false),
    /**
     * Compartido con todo el espacio. Calcado de `view.is_shared` (ADR 015):
     * lo comparte quien lo crea, lo ve todo el mundo, y solo su dueño —o un
     * administrador del espacio— lo edita o lo retira.
     */
    isShared: boolean("is_shared").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // "Mis paneles en este espacio" es la unica consulta que hace la pantalla.
    index("dashboard_workspace_creator_idx").on(
      table.workspaceId,
      table.createdBy,
    ),
    // El panel de partida se crea al leer, asi que dos cargas simultaneas la
    // primera vez crearian dos. Lo vigila la base y no el controlador, que es
    // lo que dos peticiones a la vez se saltan. Mismo patron que
    // `cycle_one_active_per_project`.
    uniqueIndex("dashboard_one_default_per_person")
      .on(table.workspaceId, table.createdBy)
      .where(sql`is_default`),
    index("dashboard_workspace_shared_idx").on(
      table.workspaceId,
      table.isShared,
    ),
  ],
);

/**
 * Un widget dentro de un panel.
 *
 * **`project_id` nulo es lo que decide el registro de campos**, igual que en
 * `view` y en `field_definition`: con proyecto se compila contra el registro
 * completo de ese proyecto —`status`, epicas y sus campos personalizados—, y
 * sin el contra el registro del espacio, que retira los nombres cuyo
 * significado cambia de proyecto en proyecto. Es la respuesta a lo que la
 * ADR 024 dejo aplazado.
 *
 * `config` guarda el filtro **en forma editable**, la misma que `view.config`,
 * mas la agrupacion y la metrica. Se valida al escribir con el mismo esquema
 * que las vistas, para que una vista guardada pueda alimentar un widget sin
 * conversion.
 */
/**
 * Un objetivo con periodo: el OKR trimestral de la Fase 7.
 *
 * Cuelga del espacio de trabajo y se gobierna por **propiedad**, igual que
 * `view` y que `dashboard`: compartirlo con el equipo llega con el `is_shared`
 * de la rebanada 2, que es una columna, no un modelo distinto.
 *
 * El periodo no es decoracion: acota la medida. "Cerrar 40 tareas este
 * trimestre" solo significa algo contra unas fechas, y son estas las que se le
 * pasan al agregado como ventana de cierre.
 */
export const goalTable = pgTable(
  "goal",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description"),
    /** Mismo criterio que un panel y que una vista. */
    isShared: boolean("is_shared").notNull().default(false),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date" }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("goal_workspace_creator_idx").on(table.workspaceId, table.createdBy),
    index("goal_workspace_shared_idx").on(table.workspaceId, table.isShared),
    check("goal_dates_ordered", sql`${table.endsAt} >= ${table.startsAt}`),
  ],
);

/**
 * Un resultado clave: la consulta de un widget mas un valor diana.
 *
 * `config` tiene **la misma forma** que el de un widget —filtro editable,
 * ambito personal, metrica—, asi que el progreso lo calcula `aggregate()` tal
 * cual, sin una segunda capa de agregacion que mantener en paralelo. Lo unico
 * que no lleva es agrupacion: un resultado clave es un numero, no un reparto.
 */
export const goalTargetTable = pgTable(
  "goal_target",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goalTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nulo = todo el espacio de trabajo, igual que en un widget.
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** La diana. Entera: son tareas, horas o puntos, nunca fracciones. */
    targetValue: integer("target_value").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("goal_target_goalId_idx").on(table.goalId),
    check("goal_target_value_positive", sql`${table.targetValue} > 0`),
  ],
);

export const dashboardWidgetTable = pgTable(
  "dashboard_widget",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboardTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nulo para un widget que mira todo el espacio de trabajo.
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    /**
     * A que objetivo mira un widget de tipo `goal`.
     *
     * Columna y no una clave dentro de `config` porque es una **clave ajena**:
     * borrar el objetivo tiene que llevarse el widget por delante, y un id
     * suelto en un JSONB dejaria un widget apuntando a un fantasma.
     */
    goalId: text("goal_id").references(() => goalTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    position: integer("position").notNull().default(0),
    /** Cuantas de las doce columnas de la rejilla ocupa. Ver ADR 043. */
    span: integer("span").notNull().default(1),
    /**
     * Cuantas filas de `--panel-row` ocupa de alto.
     *
     * Existe porque una rejilla de ancho enumerado no dice nada del alto: los
     * widgets crecian con su contenido y una lista de veinte filas al lado de
     * una tarjeta de una cifra dejaba la rejilla desalineada. Con un alto
     * declarado, lo que no cabe hace scroll dentro de la tarjeta.
     */
    rowSpan: integer("row_span").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("dashboard_widget_dashboardId_idx").on(table.dashboardId),
    check(
      "dashboard_widget_type_valid",
      sql`${table.type} IN ('count', 'breakdown', 'trend', 'time', 'epic_progress', 'table', 'inbox', 'goal', 'week')`,
    ),
    check("dashboard_widget_span_valid", sql`${table.span} BETWEEN 1 AND 12`),
    check(
      "dashboard_widget_row_span_valid",
      sql`${table.rowSpan} BETWEEN 1 AND 6`,
    ),
  ],
);

export const viewTable = pgTable(
  "view",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nula para una vista que vale en todo el espacio de trabajo.
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    // Que vista la usa: `table`, `board`, `list`, `calendar` o `gantt`. Se
    // guarda para no ofrecer una vista de tabla como si fuera un calendario.
    type: text("type").notNull().default("table"),
    // El arbol de filtros, el modo de jerarquia, el orden, la agrupacion y las
    // columnas. Va en JSONB porque su forma la decide el motor de vistas y
    // cambiara con el; una columna por ajuste seria una tabla ancha de nulos.
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Compartida con el espacio, o solo de quien la creo.
    isShared: boolean("is_shared").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (table) => [
    index("view_workspaceId_idx").on(table.workspaceId),
    index("view_projectId_idx").on(table.projectId),
    index("view_createdBy_idx").on(table.createdBy),
    // Listar "las mias y las compartidas" de un proyecto es la consulta de
    // todas las pantallas que usan esto.
    index("view_workspace_shared_idx").on(table.workspaceId, table.isShared),
    check(
      "view_type_valid",
      sql`${table.type} IN ('table', 'board', 'list', 'calendar', 'gantt', 'portfolio')`,
    ),
  ],
);

/**
 * De donde vino una fila que entro de fuera, para que reimportar actualice en
 * vez de duplicar.
 *
 * `AGENTS.md` da la idempotencia por hecha «a traves de `external_ref`» y la
 * tabla no existia: `import-tasks` no tenia idempotencia de ninguna clase —dos
 * importaciones del mismo fichero creaban 2N tareas— y los importadores de
 * GitHub y Gitea la conseguian con un `findFirst` sin bloqueo ni restriccion
 * unica, que funciona en secuencia y duplica en concurrencia.
 *
 * No sirve `external_link` para esto, por tres motivos: exige `integration_id`
 * con clave foranea (habria que fabricar una integracion falsa por proyecto,
 * visible en los ajustes), exige `task_id` (y la Fase 5 promete preservar
 * tambien epicas y crear definiciones de campo), y no tiene unicidad.
 *
 * `source` es texto libre —`csv:<hash>`, `xlsx:<nombre>`, `trello`, `jira`—
 * para que los importadores externos de la Fase 8 la reutilicen sin migrar.
 */
export const externalRefTable = pgTable(
  "external_ref",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    source: text("source").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // La unicidad **es** la idempotencia: sin ella la tabla solo documenta la
    // procedencia, y una reimportacion concurrente vuelve a duplicar.
    uniqueIndex("external_ref_source_entity_external_unique").on(
      table.workspaceId,
      table.source,
      table.entityType,
      table.externalId,
    ),
    index("external_ref_entity_idx").on(table.entityType, table.entityId),
    index("external_ref_workspaceId_idx").on(table.workspaceId),
    check(
      "external_ref_entity_type_valid",
      sql`${table.entityType} IN ('task', 'epic', 'field_definition')`,
    ),
  ],
);

export const billingReminderSentTable = pgTable(
  "billing_reminder_sent",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reminderType: text("reminder_type").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("billing_reminder_sent_workspaceId_idx").on(table.workspaceId),
    index("billing_reminder_sent_userId_idx").on(table.userId),
    unique("billing_reminder_sent_user_type_unique").on(
      table.userId,
      table.reminderType,
    ),
  ],
);

export const jobLeaseTable = pgTable("job_lease", {
  name: text("name").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
});

// Como acabo la ultima vuelta de cada trabajo programado (ADR 075). Una fila
// por trabajo: es lo que enseña el estado de la instancia y lo que vigila la
// alerta de «falla seguido». En la base y no en memoria porque sobrevive a un
// reinicio y vale con varias instancias.
export const jobStatusTable = pgTable("job_status", {
  job: text("job").primaryKey(),
  lastStartedAt: timestamp("last_started_at", { mode: "date" }).notNull(),
  lastFinishedAt: timestamp("last_finished_at", { mode: "date" }).notNull(),
  // ok | degraded | error
  lastStatus: text("last_status").notNull(),
  lastDurationMs: integer("last_duration_ms").notNull(),
  lastSuccessAt: timestamp("last_success_at", { mode: "date" }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
});

// Una alerta de la instancia mientras dura (ADR 075): se abre al cumplirse la
// condicion, avisa una vez y se cierra, con otro aviso, cuando deja de
// cumplirse. El indice unico parcial impide dos abiertas para lo mismo.
export const instanceAlertTable = pgTable(
  "instance_alert",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    // backup.stale, offsite.failing, job.failing:<trabajo>
    key: text("key").notNull(),
    message: text("message").notNull(),
    openedAt: timestamp("opened_at", { mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("instance_alert_one_open_per_key")
      .on(table.key)
      .where(sql`resolved_at IS NULL`),
  ],
);

export const taskReminderSentTable = pgTable(
  "task_reminder_sent",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reminderType: text("reminder_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_reminder_sent_taskId_idx").on(table.taskId),
    unique("task_reminder_sent_task_type_unique").on(
      table.taskId,
      table.reminderType,
    ),
  ],
);

export const timeEntryTable = pgTable(
  "time_entry",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    description: text("description"),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }),
    duration: integer("duration").default(0),
    /**
     * Con valor, la entrada es una sesion de trabajo del modo foco
     * (ADR 056): `pomodoro`, `flowtime` o `countdown`. Se filtra: el cierre
     * del dia cuenta las sesiones. Los descansos no registran tiempo.
     */
    focusMode: text("focus_mode"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("time_entry_taskId_idx").on(table.taskId),
    // Sirve el filtro por usuario solo y el rango de fechas del parte de
    // horas (ADR 042); sustituye al indice de userId solo, que este cubre.
    index("time_entry_userId_startTime_idx").on(table.userId, table.startTime),
    check(
      "time_entry_focus_mode_valid",
      sql`${table.focusMode} IS NULL OR ${table.focusMode} IN ('pomodoro', 'flowtime', 'countdown')`,
    ),
    // Un cronometro por persona (ADR 044), vigilado por la base de datos y no
    // por la buena voluntad del controlador: mismo patron que
    // `cycle_one_active_per_project`. `end_time IS NULL` es "en marcha".
    uniqueIndex("time_entry_one_running_per_user")
      .on(table.userId)
      .where(sql`end_time IS NULL`),
  ],
);

export const activityTable = pgTable(
  "activity",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    content: text("content"),
    eventData: jsonb("event_data"),
    externalUserName: text("external_user_name"),
    externalUserAvatar: text("external_user_avatar"),
    externalSource: text("external_source"),
    externalUrl: text("external_url"),
  },
  (table) => [
    index("activity_task_id_idx").on(table.taskId),
    index("activity_userId_idx").on(table.userId),
    unique("activity_task_external_source_external_url_unique").on(
      table.taskId,
      table.externalSource,
      table.externalUrl,
    ),
  ],
);

export const assetTable = pgTable(
  "asset",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nulo solo en un adjunto de una pagina del espacio (ADR 092).
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    activityId: text("activity_id").references(() => activityTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    wikiPageId: text("wiki_page_id").references(() => wikiPageTable.id, {
      onDelete: "cascade",
    }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    kind: text("kind").notNull().default("image"),
    surface: text("surface").notNull().default("description"),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("asset_workspaceId_idx").on(table.workspaceId),
    index("asset_projectId_idx").on(table.projectId),
    index("asset_taskId_idx").on(table.taskId),
    index("asset_activityId_idx").on(table.activityId),
    index("asset_wikiPageId_idx").on(table.wikiPageId),
    index("asset_createdBy_idx").on(table.createdBy),
  ],
);

export const labelTable = pgTable(
  "label",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    workspaceId: text("workspace_id").references(() => workspaceTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("label_task_id_idx").on(table.taskId),
    index("label_workspace_id_idx").on(table.workspaceId),
    unique("label_task_name_unique").on(table.taskId, table.name),
    uniqueIndex("label_workspace_name_unique")
      .on(table.workspaceId, table.name)
      .where(sql`${table.taskId} is null`),
  ],
);

export const notificationTable = pgTable(
  "notification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title"),
    content: text("content"),
    type: text("type").notNull().default("info"),
    eventData: jsonb("event_data"),
    isRead: boolean("is_read").default(false),
    resourceId: text("resource_id"),
    resourceType: text("resource_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notification_userId_idx").on(table.userId)],
);

export const userNotificationPreferenceTable = pgTable(
  "user_notification_preference",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    ntfyServerUrl: text("ntfy_server_url"),
    ntfyTopic: text("ntfy_topic"),
    ntfyToken: text("ntfy_token"),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    gotifyServerUrl: text("gotify_server_url"),
    gotifyToken: text("gotify_token"),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    taskAssignmentEnabled: boolean("task_assignment_enabled")
      .default(true)
      .notNull(),
    taskCommentEnabled: boolean("task_comment_enabled").default(true).notNull(),
    taskStatusChangeEnabled: boolean("task_status_change_enabled")
      .default(true)
      .notNull(),
    dueDateReminderEnabled: boolean("due_date_reminder_enabled")
      .default(true)
      .notNull(),
    dueDateReminderLeadTimeMinutes: integer(
      "due_date_reminder_lead_time_minutes",
    )
      .default(1440)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

// Las preferencias de presentacion de una persona -vista por defecto, densidad,
// que enseñan las tarjetas, inicio de semana…- viajan con su cuenta y no se
// quedan en el navegador. Un solo documento por persona: son leidas siempre
// enteras y nunca se filtran ni se ordenan por ellas (AGENTS.md: una columna
// solo si se filtra, se ordena, se agrupa o es clave ajena). El tema no esta
// aqui a proposito: es del dispositivo (portatil oscuro, movil «sistema»).
export const userPreferenceTable = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  preferences: jsonb("preferences")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Automatizaciones de usuario (Fase 8, ADR 066): cuando pasa algo -el
// disparador-, si la tarea cumple unas condiciones, se hacen unas acciones.
// Amplian `workflow_rule` sin sustituirlo: aquella mapea eventos de GitHub y
// Gitea a una columna, y los movimientos que provoca disparan estas.
export const automationTable = pgTable(
  "automation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Nulo para una regla de espacio, que actua en todos sus proyectos menos
    // los «Personal».
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    // El departamento de un envio del stand-up, y con el, quien es su
    // responsable y puede gestionarlo.
    teamId: text("team_id").references(() => teamTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Columna propia porque es por lo que se busca en cada evento; su forma y
    // la de las acciones las valida la API, no la base.
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Condiciones editables, las mismas que guarda un widget.
    conditions: jsonb("conditions").$type<unknown[]>().notNull().default([]),
    actions: jsonb("actions").$type<unknown[]>().notNull().default([]),
    // Por que se paro sola, si se paro: quien la guardo ya no tiene permiso.
    pausedReason: text("paused_reason"),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Quien la guardo la ultima vez: es en nombre de quien actua.
    updatedBy: text("updated_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (table) => [
    // La consulta de cada evento: las reglas activas de un espacio para un
    // disparador. Solo las activas, que son las que importan.
    index("automation_active_trigger_idx")
      .on(table.workspaceId, table.triggerType)
      .where(sql`${table.enabled} AND ${table.archivedAt} IS NULL`),
    index("automation_workspaceId_idx").on(table.workspaceId),
    index("automation_projectId_idx").on(table.projectId),
    index("automation_teamId_idx").on(table.teamId),
    index("automation_createdBy_idx").on(table.createdBy),
    index("automation_updatedBy_idx").on(table.updatedBy),
  ],
);

// Lo que hizo cada ejecucion de una automatizacion, para el historial de la
// regla. Se purga a los 30 dias.
export const automationRunTable = pgTable(
  "automation_run",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    automationId: text("automation_id")
      .notNull()
      .references(() => automationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull(),
    // El resultado de cada accion, el error o el motivo por el que no corrio.
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Lo que ya se hizo y no se repite, como el stand-up de un dia.
    occurrence: text("occurrence"),
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (table) => [
    index("automation_run_automation_started_idx").on(
      table.automationId,
      table.startedAt.desc(),
    ),
    index("automation_run_taskId_idx").on(table.taskId),
    check(
      "automation_run_status_valid",
      sql`${table.status} IN ('ok', 'failed', 'skipped')`,
    ),
  ],
);

// La jornada personal (ADR 045): fuente unica de horario y capacidad para el
// Planificador, el Cronograma y Hoy. Sin fila, se aplican los valores por
// defecto de super-productivity -09:00 a 17:00, sin comida, lunes a viernes-,
// asi que una instalacion existente no cambia hasta que alguien abre "Mi
// cuenta > Preferencias" y guarda la suya.
export const userWorkScheduleTable = pgTable(
  "user_work_schedule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workStartMinute: smallint("work_start_minute")
      .notNull()
      .default(9 * 60),
    workEndMinute: smallint("work_end_minute")
      .notNull()
      .default(17 * 60),
    lunchEnabled: boolean("lunch_enabled").notNull().default(false),
    lunchStartMinute: smallint("lunch_start_minute"),
    lunchEndMinute: smallint("lunch_end_minute"),
    // Mascara de 7 bits indexada como `Date#getDay()` -bit 0 domingo, bit 1
    // lunes...-, para leerla con `(workDays >> date.getDay()) & 1` sin
    // remapear nada. Por defecto lunes a viernes: bits 1-5.
    workDays: smallint("work_days").notNull().default(0b0_111_110),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "user_work_schedule_minutes_valid",
      sql`${table.workStartMinute} BETWEEN 0 AND 1439 AND ${table.workEndMinute} BETWEEN 1 AND 1440 AND ${table.workEndMinute} > ${table.workStartMinute}`,
    ),
    check(
      "user_work_schedule_lunch_valid",
      sql`NOT ${table.lunchEnabled} OR (
        ${table.lunchStartMinute} IS NOT NULL AND ${table.lunchEndMinute} IS NOT NULL
        AND ${table.lunchStartMinute} BETWEEN 0 AND 1439
        AND ${table.lunchEndMinute} BETWEEN 1 AND 1440
        AND ${table.lunchEndMinute} > ${table.lunchStartMinute}
      )`,
    ),
    check(
      "user_work_schedule_work_days_valid",
      sql`${table.workDays} BETWEEN 0 AND 127`,
    ),
  ],
);

// Ausencias (ADR 060): rangos de dias en que alguien no esta. **Sin motivo**
// -una baja medica es un dato sensible-, y la nota solo la ve su dueño. Los
// dias van a la medianoche del servidor, como `planned_date` (ADR 049).
export const userTimeOffTable = pgTable(
  "user_time_off",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    startsOn: timestamp("starts_on", { mode: "date" }).notNull(),
    endsOn: timestamp("ends_on", { mode: "date" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("user_time_off_user_workspace_starts_idx").on(
      table.userId,
      table.workspaceId,
      table.startsOn,
    ),
    check(
      "user_time_off_range_valid",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

// Festivos del espacio (ADR 060): un dia con su nombre, uno por dia.
export const workspaceHolidayTable = pgTable(
  "workspace_holiday",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    day: timestamp("day", { mode: "date" }).notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_holiday_workspace_day").on(
      table.workspaceId,
      table.day,
    ),
  ],
);

// El enlace del calendario de una persona en un espacio (ADR 057). Solo se
// guarda el sha256 del token: el token se enseña una vez al crearlo, y
// regenerar o revocar mata el anterior al momento.
export const calendarFeedTable = pgTable(
  "calendar_feed",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calendar_feed_workspace_user").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const userNotificationWorkspaceRuleTable = pgTable(
  "user_notification_workspace_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isActive: boolean("is_active").default(true).notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    projectMode: text("project_mode").default("all").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("user_notification_workspace_rule_userId_idx").on(table.userId),
    index("user_notification_workspace_rule_workspaceId_idx").on(
      table.workspaceId,
    ),
    unique("user_notification_workspace_rule_user_workspace_unique").on(
      table.userId,
      table.workspaceId,
    ),
    unique("user_notification_workspace_rule_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const userNotificationWorkspaceProjectTable = pgTable(
  "user_notification_workspace_project",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceRuleId: text("workspace_rule_id").notNull(),
    projectId: text("project_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.workspaceRuleId],
      foreignColumns: [
        userNotificationWorkspaceRuleTable.workspaceId,
        userNotificationWorkspaceRuleTable.id,
      ],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projectTable.workspaceId, projectTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("user_notification_workspace_project_ruleId_idx").on(
      table.workspaceRuleId,
    ),
    index("user_notification_workspace_project_projectId_idx").on(
      table.projectId,
    ),
    index("user_notification_workspace_project_workspaceId_projectId_idx").on(
      table.workspaceId,
      table.projectId,
    ),
    index("unwp_workspaceId_workspaceRuleId_idx").on(
      table.workspaceId,
      table.workspaceRuleId,
    ),
    unique("user_notification_workspace_project_rule_project_unique").on(
      table.workspaceRuleId,
      table.projectId,
    ),
  ],
);

export const githubIntegrationTable = pgTable("github_integration", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projectTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .unique(),
  repositoryOwner: text("repository_owner").notNull(),
  repositoryName: text("repository_name").notNull(),
  installationId: integer("installation_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const integrationTable = pgTable(
  "integration",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    config: text("config").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("integration_projectId_idx").on(table.projectId),
    index("integration_type_idx").on(table.type),
    unique("integration_project_type_unique").on(table.projectId, table.type),
  ],
);

export const externalLinkTable = pgTable(
  "external_link",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    resourceType: text("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("external_link_taskId_idx").on(table.taskId),
    index("external_link_integrationId_idx").on(table.integrationId),
    index("external_link_externalId_idx").on(table.externalId),
    index("external_link_resourceType_idx").on(table.resourceType),
    // Sus once puntos de escritura hacen leer-y-luego-escribir sin bloqueo, asi
    // que un webhook concurrente con una importacion creaba dos tareas para la
    // misma incidencia, de forma permanente: las importaciones posteriores
    // actualizan una de las dos y la otra queda huerfana para siempre.
    //
    // `0020_gitea_dedup_guards.sql` blindo asi `activity` y `label` y se dejo
    // esta.
    uniqueIndex("external_link_integration_resource_external_unique").on(
      table.integrationId,
      table.resourceType,
      table.externalId,
    ),
  ],
);

export const commentTable = pgTable(
  "comment",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("comment_task_idx").on(table.taskId),
    index("comment_user_idx").on(table.userId),
  ],
);

export const taskRelationTable = pgTable(
  "task_relation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    sourceTaskId: text("source_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    targetTaskId: text("target_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    relationType: text("relation_type").notNull(),
    // Solo en `precedes` (ADR 084): dias laborables entre el fin de la
    // predecesora y el inicio de la sucesora. Negativo, para solapar.
    lag: integer("lag"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_relation_source_idx").on(table.sourceTaskId),
    index("task_relation_target_idx").on(table.targetTaskId),
  ],
);

export const apikeyTable = pgTable(
  "apikey",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
    }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { mode: "date" }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_key_idx").on(table.key),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_userId_idx").on(table.userId),
  ],
);

export const deviceCodeTable = pgTable(
  "device_code",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { mode: "date" }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [
    uniqueIndex("device_code_device_code_uidx").on(table.deviceCode),
    uniqueIndex("device_code_user_code_uidx").on(table.userCode),
    index("device_code_user_id_idx").on(table.userId),
  ],
);

export const mcpOauthStateTable = pgTable(
  "mcp_oauth_state",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("mcp_oauth_state_kind_key_uidx").on(table.kind, table.key),
    index("mcp_oauth_state_expiresAt_idx").on(table.expiresAt),
  ],
);

// Auth-schema compatible aliases in schema.ts
export const user = userTable;
export const session = sessionTable;
export const account = accountTable;
export const verification = verificationTable;
export const workspace = workspaceTable;
export const team = teamTable;
export const teamMember = teamMemberTable;
export const workspace_member = workspaceUserTable;
export const invitation = invitationTable;
export const organizationRole = workspaceRoleTable;
export const apikey = apikeyTable;
export const deviceCode = deviceCodeTable;

// Auth-schema compatible relation exports in schema.ts
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  workspace_members: many(workspace_member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const workspaceRelations = relations(workspace, ({ many }) => ({
  teams: many(team),
  workspace_members: many(workspace_member),
  invitations: many(invitation),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [team.workspaceId],
    references: [workspace.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const workspace_memberRelations = relations(
  workspace_member,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [workspace_member.workspaceId],
      references: [workspace.id],
    }),
    user: one(user, {
      fields: [workspace_member.userId],
      references: [user.id],
    }),
  }),
);

export const invitationRelations = relations(invitation, ({ one }) => ({
  workspace: one(workspace, {
    fields: [invitation.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [organizationRole.workspaceId],
      references: [workspace.id],
    }),
  }),
);
