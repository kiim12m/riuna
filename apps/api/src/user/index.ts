import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { MAX_AVATAR_BYTES } from "./avatar";
import createLocalUser from "./controllers/create-local-user";
import deleteAvatar from "./controllers/delete-avatar";
import saveAvatar from "./controllers/save-avatar";

const httpErrorSchema = v.object({ message: v.string() });

const localUserResponseSchema = v.object({
  id: v.string(),
  username: v.string(),
  name: v.string(),
  role: v.string(),
});

const avatarResponseSchema = v.object({
  id: v.string(),
  url: v.string(),
  size: v.number(),
});

const user = new Hono<{
  Variables: {
    userId: string;
    userEmail: string;
  };
}>()
  .put(
    "/avatar",
    describeRoute({
      operationId: "uploadUserAvatar",
      tags: ["User"],
      description: `Store a base64 encoded avatar (PNG, JPEG, or WebP, up to ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB) for the current user and return its public URL`,
      responses: {
        200: {
          description: "Avatar stored",
          content: {
            "application/json": { schema: resolver(avatarResponseSchema) },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        contentType: v.string(),
        data: v.string(),
      }),
    ),
    async (c) => {
      const userId = c.get("userId");
      const { contentType, data } = c.req.valid("json");

      try {
        return c.json(await saveAvatar({ userId, contentType, data }));
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error ? error.message : "Invalid avatar upload",
        });
      }
    },
  )
  .delete(
    "/avatar",
    describeRoute({
      operationId: "deleteUserAvatar",
      tags: ["User"],
      description: "Remove the uploaded avatar of the current user",
      responses: {
        200: {
          description: "Avatar removed",
          content: {
            "application/json": {
              schema: resolver(v.object({ deleted: v.boolean() })),
            },
          },
        },
        401: {
          description: "Unauthorized",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
      },
    }),
    async (c) => {
      return c.json(await deleteAvatar(c.get("userId")));
    },
  )
  .post(
    "/local",
    describeRoute({
      operationId: "createLocalUser",
      tags: ["User"],
      description:
        "Create a local account with a username and password, with no email address, and add it to a workspace. Restricted to the instance admin",
      responses: {
        200: {
          description: "Local account created",
          content: {
            "application/json": { schema: resolver(localUserResponseSchema) },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
        403: {
          description: "Not the instance admin",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
        409: {
          description: "Username already taken",
          content: {
            "application/json": { schema: resolver(httpErrorSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        username: v.string(),
        displayName: v.string(),
        password: v.string(),
        workspaceId: v.string(),
        role: v.optional(v.string()),
      }),
    ),
    async (c) => {
      const { username, displayName, password, workspaceId, role } =
        c.req.valid("json");

      return c.json(
        await createLocalUser({
          actorId: c.get("userId"),
          username,
          displayName,
          password,
          workspaceId,
          role: role ?? "member",
          headers: c.req.raw.headers,
        }),
      );
    },
  );

export default user;
