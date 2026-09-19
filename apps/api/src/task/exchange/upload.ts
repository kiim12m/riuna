import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { fieldTypeSchema } from "../../field/field-types";
import { EXCHANGE_FIELDS } from "./format";
import type { ColumnMapping } from "./map-rows";

// Lectura del fichero que llega por multipart. Es superficie nueva en este
// repositorio: hasta ahora la unica subida iba por URL prefirmada de S3, y la
// importacion la parseaba el navegador.
//
// El limite de tamano se aplica **antes** de llegar aqui, con `bodyLimit` en la
// ruta: `Xlsx.load()` carga el libro entero en memoria, asi que descubrir que
// el fichero es enorme despues de parsearlo no sirve de nada.

/** 10 MB. Un `.xlsx` de 20.000 filas ronda 1,5 MB, asi que sobra de largo. */
export const MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024;

export type Upload = {
  buffer: Buffer;
  filename: string;
  source: string;
  mapping: string | null;
  dryRun: boolean;
};

export function rejectOversized(): never {
  throw new HTTPException(413, {
    message: `The file is larger than ${Math.round(MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024)} MB`,
  });
}

export async function readUpload(c: Context): Promise<Upload> {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    throw new HTTPException(400, {
      message: 'The request must carry the spreadsheet in a "file" field',
    });
  }

  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name || "import",
    source: typeof body.source === "string" ? body.source.trim() : "",
    mapping: typeof body.mapping === "string" ? body.mapping : null,
    dryRun: body.dryRun === "true",
  };
}

const columnTargetSchema = v.variant("kind", [
  v.object({
    kind: v.literal("field"),
    field: v.picklist(EXCHANGE_FIELDS),
  }),
  v.object({
    kind: v.literal("custom"),
    key: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
    create: v.optional(
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        type: fieldTypeSchema,
        options: v.optional(v.array(v.pipe(v.string(), v.maxLength(120)))),
      }),
    ),
  }),
  v.object({ kind: v.literal("ignore") }),
]);

const mappingSchema = v.pipe(
  v.array(
    v.object({
      index: v.pipe(v.number(), v.integer(), v.minValue(0)),
      target: columnTargetSchema,
    }),
  ),
  v.maxLength(200),
);

/**
 * El mapeo viaja como JSON dentro del multipart. Se valida con Valibot igual
 * que cualquier otro cuerpo: que llegue pegado a un fichero no lo hace menos
 * entrada de usuario.
 */
export function parseMapping(raw: string | null): ColumnMapping[] {
  if (!raw) {
    throw new HTTPException(400, {
      message: 'The request must carry the column mapping in a "mapping" field',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HTTPException(400, { message: "The mapping is not valid JSON" });
  }

  const result = v.safeParse(mappingSchema, parsed);
  if (!result.success) {
    throw new HTTPException(400, {
      message: `The mapping is not valid: ${result.issues[0]?.message ?? "unknown error"}`,
    });
  }

  return result.output as ColumnMapping[];
}
