import { beforeEach, describe, expect, it } from "vitest";
import {
  recordRequest,
  resetRouteMetrics,
  serverErrorCount,
  slowestRoutes,
} from "../../../apps/api/src/utils/route-metrics";

beforeEach(() => {
  resetRouteMetrics();
});

describe("route metrics (ADR 075)", () => {
  it("gives p50 and p95 per route, slowest first", () => {
    for (let ms = 1; ms <= 100; ms += 1) {
      recordRequest("GET", "/api/task/:id", 200, ms);
    }
    for (let i = 0; i < 10; i += 1)
      recordRequest("GET", "/api/today", 200, 500);

    const [slowest, next] = slowestRoutes();

    expect(slowest).toMatchObject({ route: "/api/today", p50: 500, p95: 500 });
    expect(next).toMatchObject({
      route: "/api/task/:id",
      count: 100,
      p50: 50,
      p95: 95,
    });
  });

  it("leaves out routes with too few requests to have a p95", () => {
    recordRequest("GET", "/api/rara", 200, 9000);

    expect(slowestRoutes()).toEqual([]);
  });

  it("keeps only the latest samples but counts everything", () => {
    for (let i = 0; i < 300; i += 1) recordRequest("GET", "/api/x", 200, 1000);
    for (let i = 0; i < 200; i += 1) recordRequest("GET", "/api/x", 200, 10);

    const [route] = slowestRoutes();

    expect(route).toMatchObject({ count: 500, p95: 10 });
  });

  it("counts server errors", () => {
    recordRequest("POST", "/api/a", 500, 1);
    recordRequest("POST", "/api/a", 503, 1);
    recordRequest("POST", "/api/a", 404, 1);

    expect(serverErrorCount()).toBe(2);
  });
});
