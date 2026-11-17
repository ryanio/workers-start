import { afterEach, describe, expect, it, vi } from "vitest";
import {
  afterResponse,
  getBinding,
  getEnvString,
  isKvNamespace,
  loadWorkers,
  setWorkersModule,
} from "../src/workers.js";

afterEach(() => {
  setWorkersModule(undefined);
  vi.unstubAllEnvs();
});

const kv = { get: async () => null, put: async () => undefined };

describe("outside workerd", () => {
  it("has no module, so bindings are null and work is awaited in place", async () => {
    expect(await loadWorkers()).toBeNull();
    expect(await getBinding("GAS_KV")).toBeNull();
    let done = false;
    await afterResponse(
      Promise.resolve().then(() => {
        done = true;
      }),
    );
    expect(done).toBe(true);
  });

  it("reads env from process.env", async () => {
    vi.stubEnv("API_KEY", "from-process");
    expect(await getEnvString("API_KEY")).toBe("from-process");
  });
});

describe("inside workerd", () => {
  it("prefers the Worker env and hands work to waitUntil", async () => {
    const waitUntil = vi.fn();
    setWorkersModule({ env: { API_KEY: "from-worker", GAS_KV: kv, EMPTY: "" }, waitUntil });
    vi.stubEnv("API_KEY", "from-process");
    vi.stubEnv("EMPTY", "fallback");

    expect(await getEnvString("API_KEY")).toBe("from-worker");
    expect(await getEnvString("EMPTY")).toBe("fallback");
    expect(await getBinding("GAS_KV", isKvNamespace)).toBe(kv);
    expect(await getBinding("API_KEY", isKvNamespace)).toBeNull();

    const work = Promise.resolve();
    await afterResponse(work);
    expect(waitUntil).toHaveBeenCalledWith(work);
  });
});
