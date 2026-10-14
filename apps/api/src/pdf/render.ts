import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import pdfmake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

// pdfmake (MIT) maqueta tablas que saltan de pagina repitiendo la cabecera, que
// es lo que necesitan los tres documentos (ADR 091). Trae Roboto, que cubre el
// castellano, el catalan, el euro y los signos de las formulas.

const require = createRequire(import.meta.url);
const fontsDir = join(
  dirname(require.resolve("pdfmake/package.json")),
  "fonts",
  "Roboto",
);

let ready = false;

function setup() {
  if (ready) return;
  pdfmake.addFonts({
    Roboto: {
      normal: join(fontsDir, "Roboto-Regular.ttf"),
      bold: join(fontsDir, "Roboto-Medium.ttf"),
      italics: join(fontsDir, "Roboto-Italic.ttf"),
      bolditalics: join(fontsDir, "Roboto-MediumItalic.ttf"),
    },
  });
  // Un documento nunca pide nada a la red ni lee otro fichero que sus fuentes:
  // todo lo que lleva es texto de la base. Cerrado por si algun dia alguien le
  // pasa una imagen con una URL que escribio un usuario.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontsDir));
  ready = true;
}

export async function renderPdf(document: TDocumentDefinitions) {
  setup();
  return pdfmake.createPdf(document).getBuffer();
}

export const PDF_CONTENT_TYPE = "application/pdf";
