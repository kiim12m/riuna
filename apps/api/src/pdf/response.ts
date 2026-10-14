import type { Context } from "hono";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { buildContentDisposition } from "../utils/content-disposition";
import { PDF_CONTENT_TYPE, renderPdf } from "./render";

/**
 * Un PDF como descarga, con las mismas cabeceras que el Excel. Sin
 * `Content-Length`: el `compress()` global puede recodificar el cuerpo.
 */
export async function pdfResponse(
  c: Context,
  pdf: { document: TDocumentDefinitions; filename: string },
) {
  const buffer = await renderPdf(pdf.document);
  return c.body(new Uint8Array(buffer), 200, {
    "Content-Disposition": buildContentDisposition(pdf.filename, false),
    "Content-Type": PDF_CONTENT_TYPE,
    "X-Content-Type-Options": "nosniff",
  });
}
