import type { Page } from "@playwright/test";
import { createTask, expect, test } from "../fixtures";

/**
 * Ninguna pantalla se sale de ancho a 390 px (Fase 9, Bloque 6).
 *
 * Es la guarda de «el resto solo se revisa para que no se rompa»: recorre las
 * rutas principales y busca cualquier elemento visible que asome por la
 * derecha, y cualquier marco de página que se deslice de lado. Se admite dentro de un contenedor que se desplaza en horizontal (el
 * tablero, la tabla, el Gantt): ahí se llega deslizando. Lo que no se admite
 * es lo que queda fuera sin forma de verlo, aunque un `overflow: hidden` lo
 * corte: cortado tampoco se ve.
 */

async function offenders(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const found: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Lo que esta entero fuera de pantalla es un panel cerrado (la barra
      // lateral, una hoja), no algo que se haya salido.
      if (rect.right <= width + 1 || rect.left >= width) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.position === "fixed") continue;
      let scrollable = false;
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        // El marco de toda pagina se desplaza (`overflow-auto`), y lo que lo
        // desborda arrastra la pagina entera de lado: eso no es un scroll
        // pensado, es el fallo que se busca.
        if (parent.matches('[data-slot="sidebar-inset"]')) break;
        const overflow = getComputedStyle(parent).overflowX;
        if (
          (overflow === "auto" || overflow === "scroll") &&
          parent.getBoundingClientRect().right <= width + 1
        ) {
          scrollable = true;
          break;
        }
      }
      if (scrollable) continue;
      const label =
        element.getAttribute("aria-label") ||
        element.textContent?.trim().slice(0, 30) ||
        "";
      found.push(
        `${element.tagName.toLowerCase()} «${label}» hasta ${Math.round(rect.right)} px`,
      );
    }
    const frame = document.querySelector('[data-slot="sidebar-inset"]');
    return {
      page: Math.max(
        document.documentElement.scrollWidth - width,
        frame ? frame.scrollWidth - frame.clientWidth : 0,
      ),
      elements: [...new Set(found)].slice(0, 5),
    };
  });
}

test("ninguna pantalla principal se sale de ancho a 390 px", async ({
  page,
  riuna,
}) => {
  test.setTimeout(300_000);
  const day = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString();
  const taskIds: string[] = [];
  for (const [title, due] of [
    ["Revisar el presupuesto de la reforma de la calle Mayor", -2],
    ["Enviar factura", 0],
    ["Llamar al cliente para confirmar la visita técnica", 3],
  ] as const) {
    const id = await createTask(riuna, title, {
      dueDate: day(due),
      priority: "high",
    });
    await riuna.api("put", `/api/task/assignee/${id}`, {
      userId: riuna.userId,
    });
    taskIds.push(id);
  }

  const w = `/dashboard/workspace/${riuna.workspaceId}`;
  const p = `${w}/project/${riuna.projectId}`;
  const routes = [
    `${w}/today`,
    `${w}/home`,
    `${w}/planner`,
    `${w}/schedule`,
    `${w}/my-tasks/list`,
    `${w}/my-tasks/board`,
    `${w}/my-tasks/table`,
    `${w}/my-tasks/waiting`,
    `${w}/time-sheet`,
    `${w}/inbox`,
    `${w}/team`,
    `${w}/goals`,
    `${w}/rituals/plan-day`,
    `${w}/rituals/close-day`,
    `${w}/rituals/weekly-review`,
    `${p}/board`,
    `${p}/backlog`,
    `${p}/table`,
    `${p}/calendar`,
    `${p}/gantt`,
    `${p}/cycles`,
    `${p}/task/${taskIds[0]}`,
    `${w}/admin/projects`,
    `${w}/admin/members`,
    `${w}/admin/workspace/general`,
    "/dashboard/settings/account/preferences",
  ];

  const broken: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle").catch(() => {});
    const result = await offenders(page);
    if (result.page > 0 || result.elements.length > 0) {
      broken.push(
        `${route.replace(w, "")}: página +${result.page} px; ${result.elements.join(" · ")}`,
      );
    }
  }

  expect(broken).toEqual([]);
});
