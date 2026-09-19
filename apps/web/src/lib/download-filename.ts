// La API nombra el fichero en `Content-Disposition`; que el cliente no se lo
// invente es lo que impide que los dos nombres se separen con el tiempo.

export function filenameFromResponse(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition");
  if (!disposition) return fallback;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Una cabecera mal formada no es motivo para no descargar.
    }
  }

  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain?.[1] ?? fallback;
}
