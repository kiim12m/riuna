import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleUncaughtException,
  handleUnhandledRejection,
  installProcessErrorHandlers,
} from "../../apps/api/src/process-errors";
import { log } from "../../apps/api/src/utils/log";

// Auditoria 1.5: sin estos manejadores, en Node 24 un rechazo sin capturar
// tumba la API sin dejar mas rastro que la traza en la salida de error.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("process error handlers", () => {
  it("logs an unhandled rejection and keeps the process alive", () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const exit = vi.fn();

    handleUnhandledRejection(new Error("se olvido un await"));

    expect(error).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs an uncaught exception and exits with 1", () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const exit = vi.fn();

    handleUncaughtException(new Error("estado roto"), exit);

    expect(error).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("registers both handlers on the process", () => {
    const before = {
      rejection: process.listenerCount("unhandledRejection"),
      exception: process.listenerCount("uncaughtException"),
    };

    const uninstall = installProcessErrorHandlers();
    try {
      expect(process.listenerCount("unhandledRejection")).toBe(
        before.rejection + 1,
      );
      expect(process.listenerCount("uncaughtException")).toBe(
        before.exception + 1,
      );
    } finally {
      uninstall();
    }
    expect(process.listenerCount("unhandledRejection")).toBe(before.rejection);
  });
});
