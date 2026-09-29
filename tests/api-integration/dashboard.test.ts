import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_WIDGETS_PER_DASHBOARD } from "../../apps/api/src/dashboard/widget-config";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type Dashboard = {
  id: string;
  name: string;
  widgets: Array<{
    id: string;
    title: string;
    position: number;
    span: number;
    rowSpan: number;
  }>;
};

type WidgetPayload =
  | { id: string; data: Record<string, unknown> }
  | { id: string; error: string };

function json(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  } as const;
}

describe("API integration: personal dashboards", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function seedDashboard(workspaceId: string, userId: string) {
    const [dashboard] = await db
      .insert(schema.dashboardTable)
      .values({ workspaceId, createdBy: userId, name: "Panel" })
      .returning();

    return dashboard;
  }

  it("creates a dashboard and lists it with its widgets", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await app.request(
      "/api/dashboard",
      json({ workspaceId: member.workspace.id, name: "Mi panel" }),
    );
    expect(created.status).toBe(200);
    const dashboard = (await created.json()) as Dashboard;

    const widget = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "count",
        title: "Pendientes",
        config: { metric: "count" },
      }),
    );
    expect(widget.status).toBe(200);

    const list = await app.request(
      `/api/dashboard?workspaceId=${member.workspace.id}`,
    );
    const payload = (await list.json()) as Dashboard[];

    expect(payload).toHaveLength(1);
    expect(payload[0].widgets).toHaveLength(1);
    expect(payload[0].widgets[0].title).toBe("Pendientes");
  });

  it("seeds the default layout the first time, and only once", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const first = (await (
      await app.request(`/api/dashboard?workspaceId=${member.workspace.id}`)
    ).json()) as Dashboard[];

    // Un panel vacio no responde ninguna pregunta: quien entra por primera vez
    // ve su trabajo, no un boton de "anadir widget".
    expect(first).toHaveLength(1);
    expect(first[0].widgets.length).toBeGreaterThan(0);

    const titles = first[0].widgets.map((widget) => widget.title);
    expect(titles).toContain("Tareas pendientes");

    // La distribucion se lee en tres alturas (ADR 043): las cifras de arriba,
    // la semana a ancho completo y lo que queda por hacer debajo. Se comprueban
    // los tamaños y no solo los titulos porque son lo que hace que la rejilla
    // signifique algo: un widget sembrado a 1x1 no es la pantalla que se diseño.
    const byTitle = new Map(
      first[0].widgets.map((widget) => [widget.title, widget]),
    );

    expect(byTitle.get("Vencidas")).toMatchObject({ span: 3, rowSpan: 1 });
    expect(byTitle.get("Mi semana")).toMatchObject({ span: 12, rowSpan: 2 });
    expect(byTitle.get("Tareas pendientes")).toMatchObject({
      span: 8,
      rowSpan: 4,
    });

    // Las ocho cifras suman dos filas exactas de la rejilla de doce.
    const tileSpan = first[0].widgets
      .filter((widget) => widget.rowSpan === 1)
      .reduce((total, widget) => total + widget.span, 0);
    expect(tileSpan).toBe(24);

    const second = (await (
      await app.request(`/api/dashboard?workspaceId=${member.workspace.id}`)
    ).json()) as Dashboard[];

    // Y una sola vez: el indice unico parcial es lo que lo garantiza incluso
    // con dos cargas a la vez.
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].widgets).toHaveLength(first[0].widgets.length);
  });

  it("gives each person their own panel, not a shared one", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const [other] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${Date.now()}`,
        email: "otra@example.com",
        emailVerified: true,
        name: "Otra persona",
      })
      .returning();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: other.id,
      role: "member",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const ownerPanels = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    mockAuthenticatedSession(other);
    const otherApp = createApp().app;
    const otherPanels = (await (
      await otherApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    // Comparten espacio de trabajo: lo que los separa es la propiedad.
    expect(ownerPanels).toHaveLength(1);
    expect(otherPanels).toHaveLength(1);
    expect(otherPanels[0].id).not.toBe(ownerPanels[0].id);
  });

  it("refuses to change someone else's dashboard", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const dashboard = await seedDashboard(owner.workspace.id, owner.user.id);

    const intruder = await createWorkspaceMember({ role: "admin" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: intruder.user.id,
      role: "admin",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(intruder.user);
    const { app } = createApp();

    const response = await app.request(`/api/dashboard/${dashboard.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Mio ahora" }),
    });

    // Ni siquiera un administrador del espacio: un panel **personal** no es
    // suyo. Desde la rebanada 2 el administrador si puede retirar uno
    // compartido, pero eso es otra cosa y lo fija `dashboard-sharing.test.ts`.
    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const member = await createWorkspaceMember();
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard?workspaceId=${member.workspace.id}`,
    );

    expect(response.status).toBe(401);
  });

  it("caps how many widgets a dashboard holds", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    for (let i = 0; i < MAX_WIDGETS_PER_DASHBOARD; i += 1) {
      const response = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "count", title: `W${i}`, config: {} }),
      );
      expect(response.status).toBe(200);
    }

    const overflow = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "count", title: "Uno de mas", config: {} }),
    );

    expect(overflow.status).toBe(422);
  });

  it("refuses a widget pointing at a project of another workspace", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    const stranger = await createWorkspaceMember({ role: "member" });
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "count",
        title: "Ajeno",
        projectId: foreign.project.id,
        config: {},
      }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a status breakdown without a project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // `status` compara contra los slugs de las columnas de un proyecto, asi
    // que entre proyectos no significa nada: su sustituto es `done`.
    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "breakdown",
        title: "Por estado",
        config: { groupBy: "status" },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("refuses epic progress without a project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "epic_progress", title: "Epicas", config: {} }),
    );

    expect(response.status).toBe(400);
  });

  // El agregado de tiempo solo sabe agrupar por persona, proyecto o fecha: en
  // un recuento o un reparto por prioridad devolvia cifras de otra cosa.
  it("refuses logged time on a count or a breakdown widget", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const count = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "count", title: "Horas", config: { metric: "sumLogged" } }),
    );
    const breakdown = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "breakdown",
        title: "Horas por prioridad",
        config: { metric: "sumLogged", groupBy: "priority" },
      }),
    );

    expect(count.status).toBe(400);
    expect(breakdown.status).toBe(400);
  });

  // Crear un widget de objetivo ya lo comprobaba; editarlo no, y guardaba un
  // objetivo ajeno o ninguno.
  it("checks the goal again when a goal widget is edited", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const stranger = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    const [mine, foreign] = await db
      .insert(schema.goalTable)
      .values([
        {
          workspaceId: member.workspace.id,
          createdBy: member.user.id,
          name: "Mio",
          startsAt: new Date("2026-07-01"),
          endsAt: new Date("2026-09-30"),
        },
        {
          workspaceId: stranger.workspace.id,
          createdBy: stranger.user.id,
          name: "Ajeno",
          startsAt: new Date("2026-07-01"),
          endsAt: new Date("2026-09-30"),
        },
      ])
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const widget = (await (
      await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "goal", title: "OKR", goalId: mine.id, config: {} }),
      )
    ).json()) as { id: string };

    const edit = (goalId: string | null) =>
      app.request(`/api/dashboard/widget/${widget.id}`, {
        ...json({ goalId }),
        method: "PATCH",
      });

    expect((await edit(foreign.id)).status).toBe(404);
    expect((await edit(null)).status).toBe(400);
  });

  it("reorders widgets and refuses ids from another dashboard", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const mine = await seedDashboard(member.workspace.id, member.user.id);
    const other = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) {
      const response = await app.request(
        `/api/dashboard/${mine.id}/widget`,
        json({ type: "count", title, config: {} }),
      );
      ids.push(((await response.json()) as { id: string }).id);
    }

    const reversed = [...ids].reverse();
    const ok = await app.request(`/api/dashboard/${mine.id}/widget/order`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widgetIds: reversed }),
    });
    expect(ok.status).toBe(200);

    const rows = await db
      .select({
        id: schema.dashboardWidgetTable.id,
        position: schema.dashboardWidgetTable.position,
      })
      .from(schema.dashboardWidgetTable)
      .where(eq(schema.dashboardWidgetTable.dashboardId, mine.id));

    const byId = new Map(rows.map((row) => [row.id, row.position]));
    expect(byId.get(reversed[0])).toBe(0);
    expect(byId.get(reversed[2])).toBe(2);

    const foreign = await app.request(
      `/api/dashboard/${other.id}/widget/order`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ widgetIds: ids }),
      },
    );
    expect(foreign.status).toBe(400);
  });

  /**
   * La geometria de la rejilla de doce columnas (ADR 043).
   *
   * El ancho y el alto son lo unico que se guarda de la distribucion, asi que
   * el contrato de sus limites es lo que impide dejar un panel en un estado que
   * la pantalla no sabe dibujar.
   */
  describe("grid geometry", () => {
    it("stores width and height, and defaults them per type", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      // Sin tamano, cada tipo nace con el suyo: una tabla de veinte filas de
      // una fila de alto seria un recorte, no un widget.
      const table = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "table", title: "Lista", config: {} }),
      );
      expect(table.status).toBe(200);
      expect(await table.json()).toMatchObject({ span: 8, rowSpan: 4 });

      const tile = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({
          type: "count",
          title: "Cifra",
          config: {},
          span: 3,
          rowSpan: 1,
        }),
      );
      const created = (await tile.json()) as { id: string };

      const resized = await app.request(`/api/dashboard/widget/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ span: 12, rowSpan: 6 }),
      });
      expect(resized.status).toBe(200);
      expect(await resized.json()).toMatchObject({ span: 12, rowSpan: 6 });
    });

    it("refuses a size the grid cannot draw", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const tooWide = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "count", title: "Ancha", config: {}, span: 13 }),
      );
      expect(tooWide.status).toBe(400);

      const tooTall = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "count", title: "Alta", config: {}, rowSpan: 7 }),
      );
      expect(tooTall.status).toBe(400);

      // Un ancho fraccionario pasaba la validacion y moria contra el CHECK de
      // la base como un 500, cuando es un 400 de manual.
      const fractional = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "count", title: "Media", config: {}, span: 2.5 }),
      );
      expect(fractional.status).toBe(400);
    });
  });

  describe("widget data", () => {
    async function seedTasks(
      projectId: string,
      userId: string,
      dueDates: Array<Date | null>,
    ) {
      let number = 1;
      for (const dueDate of dueDates) {
        const tree = taskTreeValues();
        await db.insert(schema.taskTable).values({
          ...tree,
          projectId,
          userId,
          title: `Tarea ${number}`,
          status: "to-do",
          priority: "medium",
          number,
          position: number,
          dueDate,
        });
        await db
          .insert(schema.taskAssigneeTable)
          .values({ taskId: tree.id, userId });
        number += 1;
      }
    }

    /**
     * La regresion que importa del barrido compartido.
     *
     * `collapse-counts.ts` resuelve varias tarjetas de recuento en una sola
     * consulta con un `FILTER` por widget; la ruta en serie las resuelve una a
     * una con `aggregate()`. Son dos implementaciones del mismo numero, y si
     * divergen el panel miente sin dar ningun error. Aqui se comparan contra
     * las mismas filas: con dos o mas tarjetas se colapsa, con una no.
     */
    it("gives the same figure collapsed as it does one by one", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const inThreeDays = new Date(today);
      inThreeDays.setDate(inThreeDays.getDate() + 3);

      // Dos vencidas, una hoy, una mas adelante en la semana y una sin fecha.
      await seedTasks(project.id, member.user.id, [
        yesterday,
        yesterday,
        today,
        inThreeDays,
        null,
      ]);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const add = async (title: string, config: unknown) => {
        const response = await app.request(
          `/api/dashboard/${dashboard.id}/widget`,
          json({ type: "count", title, config }),
        );
        expect(response.status).toBe(200);
        return ((await response.json()) as { id: string }).id;
      };

      const overdue = await add("Vencidas", {
        scope: "assigned",
        dueWindow: "overdue",
      });
      const dueToday = await add("Hoy", {
        scope: "assigned",
        dueWindow: "today",
      });
      const noDate = await add("Sin fecha", {
        scope: "assigned",
        dueWindow: "none",
      });

      const read = async () => {
        const response = await app.request(
          `/api/dashboard/${dashboard.id}/data`,
          { method: "POST" },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { widgets: WidgetPayload[] };
        const values = new Map<string, number>();
        for (const entry of body.widgets) {
          if ("error" in entry) throw new Error(entry.error);
          const buckets = entry.data.buckets as Array<{ value: number }>;
          values.set(entry.id, buckets[0]?.value ?? 0);
        }
        return values;
      };

      const collapsed = await read();
      expect(collapsed.get(overdue)).toBe(2);
      expect(collapsed.get(dueToday)).toBe(1);
      expect(collapsed.get(noDate)).toBe(1);

      // Con una sola tarjeta no hay grupo que colapsar, asi que la misma
      // pregunta viaja por `aggregate()`. Tiene que dar lo mismo.
      await app.request(`/api/dashboard/widget/${dueToday}`, {
        method: "DELETE",
      });
      await app.request(`/api/dashboard/widget/${noDate}`, {
        method: "DELETE",
      });

      const serial = await read();
      expect(serial.get(overdue)).toBe(collapsed.get(overdue));
    });

    it("lays out seven days from the week start the client asks for", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      const today = new Date();
      today.setHours(12, 0, 0, 0);
      await seedTasks(project.id, member.user.id, [today]);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const created = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({
          type: "week",
          title: "Mi semana",
          config: { scope: "assigned" },
        }),
      );
      expect(created.status).toBe(200);

      const response = await app.request(
        `/api/dashboard/${dashboard.id}/data?weekStartsOn=1`,
        { method: "POST" },
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as { widgets: WidgetPayload[] };
      const entry = body.widgets[0];
      if (!entry || "error" in entry) throw new Error("week widget failed");

      const week = entry.data.week as {
        days: Array<{ day: string; tasks: unknown[]; overflow: number }>;
      };

      // Siempre siete columnas, tenga tareas o no cada dia: una semana con
      // huecos sigue siendo una semana.
      expect(week.days).toHaveLength(7);
      expect(new Date(`${week.days[0].day}T00:00:00`).getDay()).toBe(1);

      const placed = week.days.flatMap((day) => day.tasks);
      expect(placed).toHaveLength(1);
    });
  });

  /**
   * Las dos formas de la ventana de vencimiento, contra las mismas filas.
   *
   * `dueWindowExpression` **etiqueta** y `dueWindowCondition` **filtra**, y la
   * unica forma de demostrar que dicen lo mismo es poner tareas justo en las
   * fronteras y comprobar que cada una cae en una sola ventana y en la que su
   * etiqueta dice. La prueba de unidad solo compara los parametros enlazados, y
   * por eso no vio que `week` empezaba hoy en la condicion y manana en el
   * `CASE`: una tarea de hoy la contaban las dos tarjetas.
   */
  describe("due windows", () => {
    it("labels and filters every task into the same single window", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const at = (days: number, hours = 12) => {
        const date = new Date(today);
        date.setDate(date.getDate() + days);
        date.setHours(hours, 0, 0, 0);
        return date;
      };

      // **Todas a mediodia, a proposito.** Una fecha de vencimiento se guarda
      // como `timestamp` sin zona y viaja por el convenio UTC de drizzle, asi
      // que en un servidor con desfase las horas cercanas a medianoche cruzan
      // de dia al guardarse: una tarea que vence hoy a las 00:00 se clasifica
      // como vencida. Eso es la deuda de zona horaria que `day-boundaries.ts`
      // declara desde la Fase 4.5 y afecta por igual a Hoy, al Planificador y a
      // "Mis tareas"; medirla no es cosa de esta prueba, que compara **las dos
      // formas de la ventana entre si** y necesita fixtures que ninguna de las
      // dos pueda interpretar de dos maneras.
      const fixtures: Array<[string, Date | null]> = [
        ["vencida", at(-3)],
        ["ayer", at(-1)],
        ["hoy", at(0)],
        ["manana", at(1)],
        ["dentro de tres dias", at(3)],
        ["dentro de diez dias", at(10)],
        ["sin fecha", null],
      ];

      let number = 1;
      for (const [title, dueDate] of fixtures) {
        const tree = taskTreeValues();
        await db.insert(schema.taskTable).values({
          ...tree,
          projectId: project.id,
          userId: member.user.id,
          title,
          status: "to-do",
          priority: "medium",
          number,
          position: number,
          dueDate,
        });
        await db
          .insert(schema.taskAssigneeTable)
          .values({ taskId: tree.id, userId: member.user.id });
        number += 1;
      }

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const windows = ["overdue", "today", "week", "later", "none"] as const;

      // Una tarjeta por ventana, mas un reparto que usa el `CASE`.
      const cards = new Map<(typeof windows)[number], string>();
      for (const dueWindow of windows) {
        const response = await app.request(
          `/api/dashboard/${dashboard.id}/widget`,
          json({
            type: "count",
            title: `card-${dueWindow}`,
            config: { scope: "assigned", dueWindow },
          }),
        );
        expect(response.status).toBe(200);
        cards.set(dueWindow, ((await response.json()) as { id: string }).id);
      }

      const breakdown = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({
          type: "breakdown",
          title: "reparto",
          config: { scope: "assigned", groupBy: "dueWindow" },
        }),
      );
      expect(breakdown.status).toBe(200);
      const breakdownId = ((await breakdown.json()) as { id: string }).id;

      const response = await app.request(
        `/api/dashboard/${dashboard.id}/data`,
        {
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { widgets: WidgetPayload[] };

      const value = (id: string) => {
        const entry = body.widgets.find((item) => item.id === id);
        if (!entry || "error" in entry) throw new Error(`widget ${id} failed`);
        const buckets = entry.data.buckets as Array<{
          key: string | null;
          value: number;
        }>;
        return buckets;
      };

      const byWindow = Object.fromEntries(
        [...cards].map(([window, id]) => [window, value(id)[0]?.value ?? 0]),
      );

      // Cada tarea en una sola ventana: la suma es exactamente el total.
      expect(
        Object.values(byWindow).reduce((total, count) => total + count, 0),
      ).toBe(fixtures.length);

      expect(byWindow).toEqual({
        overdue: 2,
        today: 1,
        // Manana y dentro de tres dias. `week` **empieza manana**, no hoy: la
        // rama `today` del `CASE` va antes y se queda con las de hoy.
        week: 2,
        later: 1,
        none: 1,
      });

      // Y el reparto, que compila el `CASE`, dice exactamente lo mismo.
      const labelled = Object.fromEntries(
        value(breakdownId).map((bucket) => [bucket.key, bucket.value]),
      );
      expect(labelled).toEqual(byWindow);
    });
  });

  /**
   * Las horas de una tarjeta personal son **las de quien mira**.
   *
   * El ambito personal acota la tarea, y el tiempo registrado cuelga de
   * `time_entry`: sin acotar tambien la entrada, "mis horas" eran las de
   * cualquiera sobre tareas asignadas a mi.
   */
  describe("logged time", () => {
    it("counts only the viewer's own entries under the assigned scope", async () => {
      const member = await createWorkspaceMember({ role: "member" });
      const other = await createWorkspaceMember({ role: "member" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const dashboard = await seedDashboard(
        member.workspace.id,
        member.user.id,
      );

      const tree = taskTreeValues();
      await db.insert(schema.taskTable).values({
        ...tree,
        projectId: project.id,
        userId: member.user.id,
        title: "Compartida",
        status: "to-do",
        priority: "medium",
        number: 1,
        position: 1,
      });
      await db
        .insert(schema.taskAssigneeTable)
        .values({ taskId: tree.id, userId: member.user.id });

      const start = new Date();
      start.setHours(start.getHours() - 2);
      const end = new Date();

      // Una hora mia y una hora de otra persona, sobre la misma tarea.
      for (const [userId, seconds] of [
        [member.user.id, 3600],
        [other.user.id, 7200],
      ] as const) {
        await db.insert(schema.timeEntryTable).values({
          taskId: tree.id,
          userId,
          startTime: start,
          endTime: end,
          duration: seconds,
        });
      }

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const created = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({
          type: "time",
          title: "Horas",
          config: { scope: "assigned", groupBy: "none" },
        }),
      );
      expect(created.status).toBe(200);

      const response = await app.request(
        `/api/dashboard/${dashboard.id}/data`,
        {
          method: "POST",
        },
      );
      const body = (await response.json()) as { widgets: WidgetPayload[] };
      const entry = body.widgets[0];
      if (!entry || "error" in entry) throw new Error("time widget failed");

      const buckets = entry.data.buckets as Array<{ value: number }>;
      // 3600, no 10800: las dos horas de la otra persona no son mias.
      expect(buckets[0]?.value).toBe(3600);
    });
  });

  it("takes the widgets with it when the dashboard goes", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "count", title: "Uno", config: {} }),
    );

    const response = await app.request(`/api/dashboard/${dashboard.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const widgets = await db
      .select()
      .from(schema.dashboardWidgetTable)
      .where(eq(schema.dashboardWidgetTable.dashboardId, dashboard.id));

    expect(widgets).toHaveLength(0);
  });
});
