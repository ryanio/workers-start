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
  vi.restoreAllMocks();
});

const kv = { get: async () => null, put: async () => undefined, getWithMetadata: async () => null };
const r2 = { get: async () => null, put: async () => undefined, list: async () => ({}) };

describe("outside workerd", () => {
  it("finds no module even under vitest, so bindings are null", async () => {
    expect(await loadWorkers()).toBeNull();
    expect(await getBinding("GAS_KV")).toBeNull();
  });

  it("awaits background work in place and logs a failure instead of throwing", async () => {
    let done = false;
    await afterResponse(
      Promise.resolve().then(() => {
        done = true;
      }),
    );
    expect(done).toBe(true);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(afterResponse(Promise.reject(new Error("kv write failed")))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
  });

  it("reads env from process.env", async () => {
    vi.stubEnv("API_KEY", "from-process");
    expect(await getEnvString("API_KEY")).toBe("from-process");
  });
});

describe("inside workerd", () => {
  it("prefers the Worker env and hands work to waitUntil", async () => {
    const waitUntil = vi.fn();
    setWorkersModule({ env: { API_KEY: "from-worker", GAS_KV: kv, BUCKET: r2, EMPTY: "" }, waitUntil });
    vi.stubEnv("API_KEY", "from-process");
    vi.stubEnv("EMPTY", "fallback");

    expect(await getEnvString("API_KEY")).toBe("from-worker");
    expect(await getEnvString("EMPTY")).toBe("fallback");
    expect(await getBinding("GAS_KV", isKvNamespace)).toBe(kv);
    expect(await getBinding("BUCKET", isKvNamespace)).toBeNull();
    expect(await getBinding("API_KEY", isKvNamespace)).toBeNull();

    const work = Promise.resolve();
    await afterResponse(work);
    expect(waitUntil).toHaveBeenCalledWith(work);
  });
});
