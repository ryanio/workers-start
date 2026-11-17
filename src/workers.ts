/**
 * Lazy access to `cloudflare:workers` (env bindings and `waitUntil`) from code
 * that also runs in vitest, Node scripts and the client bundle.
 *
 * The module is imported through a variable specifier, so neither Vite nor
 * vitest tries to resolve it, and only on first use. Outside workerd the
 * import fails and every helper here degrades: bindings are null, env reads
 * fall back to `process.env`, and `afterResponse` awaits the work in place.
 */

export interface WorkersModule {
  env: Record<string, unknown>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

const WORKERS_MODULE = "cloudflare:workers";

let modulePromise: Promise<WorkersModule | null> | null = null;
let override: WorkersModule | null | undefined;

function processEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function isTestRuntime(): boolean {
  const env = processEnv();
  return Boolean(env.VITEST) || env.NODE_ENV === "test";
}

/** The `cloudflare:workers` module, or null outside workerd. */
export function loadWorkers(): Promise<WorkersModule | null> {
  if (override !== undefined) {
    return Promise.resolve(override);
  }
  if (isTestRuntime()) {
    return Promise.resolve(null);
  }
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ WORKERS_MODULE)
      .then((mod) => mod as unknown as WorkersModule)
      .catch(() => null);
  }
  return modulePromise;
}

/**
 * Test hook: make `loadWorkers` return this module (or null). Pass `undefined`
 * to go back to the real import.
 */
export function setWorkersModule(mod: WorkersModule | null | undefined): void {
  override = mod;
  modulePromise = null;
}

/** A binding by name, or null when it is missing or fails the guard. */
export async function getBinding<T>(name: string, guard?: (value: unknown) => value is T): Promise<T | null> {
  const mod = await loadWorkers();
  const value = mod?.env[name];
  if (value === undefined || value === null) {
    return null;
  }
  if (guard && !guard(value)) {
    return null;
  }
  return value as T;
}

/** A secret or var from the Worker env, falling back to `process.env`. Empty strings count as unset. */
export async function getEnvString(name: string): Promise<string | undefined> {
  const mod = await loadWorkers();
  const fromBinding = mod?.env[name];
  if (typeof fromBinding === "string" && fromBinding.length > 0) {
    return fromBinding;
  }
  return processEnv()[name] || undefined;
}

/**
 * Hand work to the runtime to finish after the response is sent. Outside
 * workerd there is nobody to hand it to, so this awaits it instead.
 */
export async function afterResponse(work: Promise<unknown>): Promise<void> {
  const mod = await loadWorkers();
  if (mod?.waitUntil) {
    mod.waitUntil(work);
    return;
  }
  await work;
}

/** True for anything with KV's `get` and `put`. Use as a `getBinding` guard. */
export function isKvNamespace(value: unknown): value is {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { get?: unknown; put?: unknown };
  return typeof candidate.get === "function" && typeof candidate.put === "function";
}
