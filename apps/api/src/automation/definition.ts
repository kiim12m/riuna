import * as v from "valibot";
import { editableFilterSchema } from "../view/filter-schema";

// La forma de una automatizacion (ADR 066): disparador, condiciones y
// acciones. La base guarda `jsonb` sin mirar dentro; quien manda es esto.

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const ids = v.pipe(v.array(id), v.maxLength(50));
const fieldKey = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
// Un texto con marcadores: `{tarea}`, `{titulo}`, `{estado}`, `{proyecto}`,
// `{enlace}`.
const template = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(2000),
);
const secret = v.pipe(v.string(), v.maxLength(2000));

export const PRIORITIES = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
const priority = v.picklist(PRIORITIES);

export const triggerSchema = v.variant("type", [
  v.object({ type: v.literal("task.created") }),
  v.object({
    type: v.literal("task.status_changed"),
    // Columnas de un proyecto: solo en una regla de proyecto.
    fromColumnId: v.optional(id),
    toColumnId: v.optional(id),
    // A una columna final de su proyecto: vale tambien en una de espacio.
    toFinal: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("task.assigned"),
    // Ninguno de los dos: cualquier asignacion.
    userId: v.optional(id),
    teamId: v.optional(id),
  }),
  v.object({
    type: v.literal("task.priority_changed"),
    to: v.optional(priority),
  }),
  v.object({
    type: v.literal("task.field_changed"),
    fieldKey: v.optional(fieldKey),
  }),
  v.object({ type: v.literal("task.commented") }),
  // Por fecha (Bloque 2), los mira el planificador cada cinco minutos.
  v.object({
    type: v.literal("task.due_in"),
    // El dia de vencimiento esta a N dias o menos (0 = vence hoy) y aun no ha
    // vencido.
    days: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(60)),
  }),
  v.object({ type: v.literal("task.overdue") }),
  // A una hora fija de ciertos dias, en la zona de la instancia. Solo para
  // el envio del stand-up de un departamento.
  v.object({
    type: v.literal("schedule"),
    // 0 = domingo, como `Date.getDay()`.
    weekdays: v.pipe(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
      v.minLength(1),
      v.maxLength(7),
    ),
    time: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  }),
  v.object({
    type: v.literal("task.labeled"),
    labelName: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(120))),
  }),
]);

export type Trigger = v.InferOutput<typeof triggerSchema>;
export type TriggerType = Trigger["type"];

/** Los que no vienen de un evento: los mira el planificador. */
export const DATE_TRIGGERS = ["task.due_in", "task.overdue"] as const;

// Telegram y los webhooks de Slack y Discord: lo que va cifrado es lo que da
// acceso al canal (la URL del webhook, el token del bot).
const chatDestination = v.object({
  webhookUrl: v.optional(secret),
  botToken: v.optional(secret),
  chatId: v.optional(v.pipe(v.string(), v.maxLength(120))),
  threadId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

// Cada accion lleva un `id` de interfaz para poder conservar su secreto al
// editar la regla sin volver a escribirlo.
const actionId = { id: v.pipe(v.string(), v.minLength(1), v.maxLength(120)) };

export const actionSchema = v.variant("type", [
  v.object({ ...actionId, type: v.literal("move"), columnId: id }),
  v.object({ ...actionId, type: v.literal("complete"), done: v.boolean() }),
  v.object({ ...actionId, type: v.literal("priority"), priority }),
  v.object({
    ...actionId,
    type: v.literal("due_date"),
    // Dias desde el de hoy; nulo quita el vencimiento.
    days: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(-365), v.maxValue(365)),
    ),
  }),
  v.object({
    ...actionId,
    type: v.literal("custom_field"),
    fieldKey,
    value: v.unknown(),
  }),
  v.object({ ...actionId, type: v.literal("label"), labelId: id }),
  v.object({
    ...actionId,
    type: v.literal("assign_users"),
    mode: v.picklist(["add", "replace", "remove"]),
    userIds: ids,
  }),
  v.object({
    ...actionId,
    type: v.literal("assign_team"),
    teamId: v.nullable(id),
  }),
  v.object({
    ...actionId,
    type: v.literal("create_task"),
    title: v.pipe(template, v.maxLength(500)),
    asSubtask: v.boolean(),
    assigneeIds: v.optional(ids),
  }),
  v.object({
    ...actionId,
    type: v.literal("notify"),
    recipients: v.object({
      assignees: v.optional(v.boolean()),
      creator: v.optional(v.boolean()),
      teamMembers: v.optional(v.boolean()),
      teamLeads: v.optional(v.boolean()),
      userIds: v.optional(ids),
    }),
    message: template,
  }),
  v.object({
    ...actionId,
    type: v.literal("webhook"),
    url: v.pipe(v.string(), v.url(), v.maxLength(2000)),
    // Sin el, se conserva el guardado; vacio, se quita.
    secret: v.optional(secret),
  }),
  v.object({
    ...actionId,
    type: v.literal("chat"),
    channel: v.picklist(["slack", "discord", "telegram"]),
    message: template,
    // Solo en una regla de espacio: la de proyecto usa su integracion.
    destination: v.optional(chatDestination),
  }),
  v.object({
    ...actionId,
    type: v.literal("standup"),
    channel: v.picklist(["slack", "discord", "telegram"]),
    destination: chatDestination,
  }),
]);

export type Action = v.InferOutput<typeof actionSchema>;
export type ActionType = Action["type"];

/** Lo que manda una peticion al crear o editar. */
export const automationInputSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  enabled: v.optional(v.boolean()),
  trigger: triggerSchema,
  // El departamento cuyo stand-up se envia: solo con el disparador `schedule`.
  teamId: v.optional(id),
  conditions: v.optional(editableFilterSchema),
  actions: v.pipe(v.array(actionSchema), v.minLength(1), v.maxLength(10)),
});

export type AutomationInput = v.InferOutput<typeof automationInputSchema>;

/** Las acciones que sacan datos de Riuna. */
export const OUTBOUND_ACTIONS: readonly ActionType[] = [
  "webhook",
  "chat",
  "standup",
];
