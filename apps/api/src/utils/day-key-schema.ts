import * as v from "valibot";

/** Un dia sin zona como `yyyy-mm-dd`, la clave de `serverDayKey`. */
export const dayKeySchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a yyyy-mm-dd day"),
);
