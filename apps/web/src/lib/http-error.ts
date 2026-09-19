/**
 * Un error de API que conserva su codigo de estado.
 *
 * Sin el, la politica de reintentos no puede distinguir "el servidor dice que
 * la peticion esta mal" de "no se pudo llegar al servidor", y acaba
 * reintentando dos veces un 400 que va a fallar exactamente igual las tres.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Un error que el servidor atribuye a quien llama, y que reintentar no arregla. */
export function isClientError(error: unknown): boolean {
  return (
    error instanceof HttpError && error.status >= 400 && error.status < 500
  );
}
