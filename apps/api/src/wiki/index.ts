import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { assetTable } from "../database/schema";
import {
  assertWikiImageKeyMatchesContext,
  createWikiImageUploadUrl,
  isImageContentType,
  validateTaskAssetUploadInput,
} from "../storage/s3";
import { normalizeApiServerUrl } from "../utils/openapi-spec";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createWikiPage from "./controllers/create-page";
import deleteWikiPage from "./controllers/delete-page";
import getWikiPage from "./controllers/get-page";
import listWikiPages from "./controllers/list-pages";
import moveWikiPage from "./controllers/move-page";
import saveWikiPage, { restoreWikiVersion } from "./controllers/save-page";
import listTaskWikiLinks from "./controllers/task-links";
import { getWikiVersion, listWikiVersions } from "./controllers/versions";
import { loadPage, MAX_CONTENT_LENGTH, MAX_TITLE_LENGTH } from "./scope";

// La wiki de paginas (ADR 092). Leer pide estar en el espacio; escribir, lo
// mismo que editar tareas (`task:update`), sin permiso propio: lo decidio el
// usuario el 2026-10-14.

type Variables = { userId: string; workspaceId: string };

const READ = requireApiKeyScope({ task: ["read"] });
const WRITE = requireWorkspacePermission({ task: ["update"] });

const json = (description: string) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(v.any()) } },
  },
});

const title = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH));
const content = v.pipe(v.string(), v.maxLength(MAX_CONTENT_LENGTH));

const uploadInput = v.object({
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
});

function badUpload(error: unknown): never {
  throw new HTTPException(400, {
    message:
      error instanceof Error ? error.message : "Invalid image upload request",
  });
}

const wiki = new Hono<{ Variables: Variables }>()
  .get(
    "/workspace/:workspaceId/pages",
    describeRoute({
      operationId: "listWikiPages",
      tags: ["Wiki"],
      description:
        "The wiki tree: the workspace pages and, with `projectId`, that project's pages. Without their content.",
      responses: json("Wiki pages ordered by position"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator("query", v.object({ projectId: v.optional(v.string()) })),
    workspaceAccess.fromParam("workspaceId"),
    READ,
    async (c) => {
      const { projectId } = c.req.valid("query");
      return c.json(
        await listWikiPages(c.get("workspaceId"), projectId ?? null),
      );
    },
  )
  .post(
    "/workspace/:workspaceId/pages",
    describeRoute({
      operationId: "createWikiPage",
      tags: ["Wiki"],
      description:
        "Create a wiki page in the workspace or, with `projectId`, in a project, optionally under `parentId` (a page of the same wiki). Content is Markdown, like a task description.",
      responses: json("The new page"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "json",
      v.object({
        title,
        content: v.optional(content, ""),
        projectId: v.optional(v.nullable(v.string())),
        parentId: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    WRITE,
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createWikiPage({
          workspaceId: c.get("workspaceId"),
          projectId: body.projectId ?? null,
          parentId: body.parentId ?? null,
          title: body.title,
          content: body.content,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .get(
    "/page/:id",
    describeRoute({
      operationId: "getWikiPage",
      tags: ["Wiki"],
      description:
        "A wiki page with its content, version, last editor, project and the tasks it links or that link it",
      responses: json("The page"),
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromWikiPage("id"),
    READ,
    async (c) => c.json(await getWikiPage(c.req.valid("param").id)),
  )
  .put(
    "/page/:id",
    describeRoute({
      operationId: "saveWikiPage",
      tags: ["Wiki"],
      description:
        "Save a wiki page. `baseVersion` is the version the editor started from: if someone saved a newer one meanwhile it is a 409, and saving over theirs means repeating with their version. Saving without changes keeps the version.",
      responses: {
        ...json("The saved page"),
        409: { description: "Someone saved a newer version meanwhile" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title,
        content,
        baseVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(300)))),
      }),
    ),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await saveWikiPage({
          id: c.req.valid("param").id,
          ...body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/page/:id/move",
    describeRoute({
      operationId: "moveWikiPage",
      tags: ["Wiki"],
      description:
        "Hang a page under another page of the same wiki, or at its root with a null `parentId`. Rejects cycles.",
      responses: json("The moved page"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ parentId: v.nullable(v.string()) })),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) =>
      c.json(
        await moveWikiPage({
          id: c.req.valid("param").id,
          parentId: c.req.valid("json").parentId,
          userId: c.get("userId"),
        }),
      ),
  )
  .delete(
    "/page/:id",
    describeRoute({
      operationId: "deleteWikiPage",
      tags: ["Wiki"],
      description:
        "Delete a page. With `children=delete` its subpages go with it; with `children=lift` (the default) they move up to its parent.",
      responses: json("How many pages were deleted"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.object({
        children: v.optional(v.picklist(["lift", "delete"]), "lift"),
      }),
    ),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) =>
      c.json(
        await deleteWikiPage({
          id: c.req.valid("param").id,
          children: c.req.valid("query").children,
          userId: c.get("userId"),
        }),
      ),
  )
  .get(
    "/page/:id/versions",
    describeRoute({
      operationId: "listWikiVersions",
      tags: ["Wiki"],
      description: "The history of a page, newest first, without content",
      responses: json("Versions"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.object({
        limit: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.integer(),
            v.minValue(1),
            v.maxValue(100),
          ),
        ),
        offset: v.optional(
          v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(0)),
        ),
      }),
    ),
    workspaceAccess.fromWikiPage("id"),
    READ,
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      return c.json(
        await listWikiVersions(c.req.valid("param").id, {
          limit: limit ?? 50,
          offset: offset ?? 0,
        }),
      );
    },
  )
  .get(
    "/page/:id/versions/:version",
    describeRoute({
      operationId: "getWikiVersion",
      tags: ["Wiki"],
      description: "One version of a page, with its content",
      responses: json("The version"),
    }),
    validator(
      "param",
      v.object({
        id: v.string(),
        version: v.pipe(v.string(), v.transform(Number), v.integer()),
      }),
    ),
    workspaceAccess.fromWikiPage("id"),
    READ,
    async (c) => {
      const { id, version } = c.req.valid("param");
      return c.json(await getWikiVersion(id, version));
    },
  )
  .post(
    "/page/:id/restore",
    describeRoute({
      operationId: "restoreWikiVersion",
      tags: ["Wiki"],
      description:
        "Go back to an earlier version: saves its title and content as a new version, with the same `baseVersion` check as saving",
      responses: {
        ...json("The page, at its new version"),
        409: { description: "Someone saved a newer version meanwhile" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        version: v.pipe(v.number(), v.integer(), v.minValue(1)),
        baseVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) =>
      c.json(
        await restoreWikiVersion({
          id: c.req.valid("param").id,
          ...c.req.valid("json"),
          userId: c.get("userId"),
        }),
      ),
  )
  .get(
    "/task/:taskId/links",
    describeRoute({
      operationId: "listTaskWikiLinks",
      tags: ["Wiki"],
      description:
        "The wiki pages a task is linked with, in either direction: the page links the task, or the task's description links the page",
      responses: json("Linked pages"),
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId("taskId"),
    READ,
    async (c) => c.json(await listTaskWikiLinks(c.req.valid("param").taskId)),
  )
  .put(
    "/page/:id/image-upload",
    describeRoute({
      operationId: "createWikiImageUpload",
      tags: ["Wiki"],
      description: "Create a presigned upload URL for a file in a wiki page",
      responses: json("Upload URL"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", uploadInput),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) => {
      const { filename, contentType, size } = c.req.valid("json");
      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        badUpload(error);
      }
      const page = await loadPage(c.req.valid("param").id);
      try {
        return c.json(
          await createWikiImageUploadUrl({
            workspaceId: page.workspaceId,
            pageId: page.id,
            filename,
            contentType,
          }),
        );
      } catch (error) {
        throw new HTTPException(503, {
          message:
            error instanceof Error
              ? error.message
              : "Image uploads are not configured",
        });
      }
    },
  )
  .post(
    "/page/:id/image-upload/finalize",
    describeRoute({
      operationId: "finalizeWikiImageUpload",
      tags: ["Wiki"],
      description: "Record an uploaded wiki file as a private asset",
      responses: json("The asset"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ key: v.string(), ...uploadInput.entries })),
    workspaceAccess.fromWikiPage("id"),
    WRITE,
    async (c) => {
      const { key, filename, contentType, size } = c.req.valid("json");
      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        badUpload(error);
      }
      const page = await loadPage(c.req.valid("param").id);
      const objectKey = key.trim();
      if (
        !assertWikiImageKeyMatchesContext(objectKey, {
          workspaceId: page.workspaceId,
          pageId: page.id,
        })
      ) {
        throw new HTTPException(400, {
          message: "Upload key does not match the wiki page.",
        });
      }

      const values = {
        workspaceId: page.workspaceId,
        projectId: page.projectId,
        wikiPageId: page.id,
        filename,
        mimeType: contentType,
        size,
        kind: isImageContentType(contentType) ? "image" : "attachment",
        surface: "wiki",
        createdBy: c.get("userId") || null,
      };
      const [existing] = await db
        .select({ id: assetTable.id })
        .from(assetTable)
        .where(eq(assetTable.objectKey, objectKey))
        .limit(1);
      const [asset] = existing
        ? await db
            .update(assetTable)
            .set(values)
            .where(eq(assetTable.id, existing.id))
            .returning({ id: assetTable.id })
        : await db
            .insert(assetTable)
            .values({ ...values, objectKey })
            .returning({ id: assetTable.id });
      if (!asset) throw new Error("The asset was not recorded");

      const apiBaseUrl = normalizeApiServerUrl(
        process.env.RIUNA_API_URL || new URL(c.req.url).origin,
      );
      return c.json({ id: asset.id, url: `${apiBaseUrl}/asset/${asset.id}` });
    },
  );

export default wiki;
