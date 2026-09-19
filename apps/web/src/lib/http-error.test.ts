import { describe, expect, it } from "vitest";
import { HttpError, isClientError } from "./http-error";

describe("isClientError", () => {
  // El caso que motiva la clase: un filtro con un campo inexistente devuelve
  // 400 y reintentarlo dos veces solo retrasa que el error llegue a la vista.
  it("recognises a rejected request", () => {
    expect(isClientError(new HttpError('Unknown field "x"', 400))).toBe(true);
    expect(isClientError(new HttpError("Forbidden", 403))).toBe(true);
    expect(isClientError(new HttpError("Not found", 404))).toBe(true);
    expect(isClientError(new HttpError("Conflict", 409))).toBe(true);
  });

  // Un fallo del servidor si puede ser pasajero, asi que se sigue reintentando.
  it("leaves server errors retryable", () => {
    expect(isClientError(new HttpError("Boom", 500))).toBe(false);
    expect(isClientError(new HttpError("Unavailable", 503))).toBe(false);
  });

  it("ignores errors that carry no status", () => {
    expect(isClientError(new Error("Failed to fetch"))).toBe(false);
    expect(isClientError("400")).toBe(false);
    expect(isClientError(null)).toBe(false);
  });

  it("keeps the server's message, which is what the view shows", () => {
    const error = new HttpError('Unknown field "custom.inventado"', 400);

    expect(error.message).toBe('Unknown field "custom.inventado"');
    expect(error).toBeInstanceOf(Error);
  });
});
