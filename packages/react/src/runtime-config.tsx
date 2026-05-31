import * as React from "react";

/**
 * Runtime injection contract (ADR-004 contracts 3 & 4).
 *
 * deergraph holds no HTTP client and no backend address. The host supplies a
 * `fetcher` (e.g. a CSRF/credentials-aware fetch) and a `baseUrl`, either
 * globally via {@link configureDeergraph} or per-subtree via
 * {@link DeergraphProvider}.
 *
 * Resolution precedence: Context value > global config > defaults
 * (`globalThis.fetch`, same-origin `""`).
 */
export interface DeergraphRuntimeConfig {
  fetcher?: typeof fetch;
  baseUrl?: string;
}

type ResolvedRuntimeConfig = Required<DeergraphRuntimeConfig>;

function defaultFetcher(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

let globalConfig: DeergraphRuntimeConfig = {};

/** Set the process-wide default runtime config (vanilla / single-tenant). */
export function configureDeergraph(cfg: DeergraphRuntimeConfig): void {
  globalConfig = { ...globalConfig, ...cfg };
}

const RuntimeContext = React.createContext<DeergraphRuntimeConfig | null>(null);

/** Per-subtree override (SSR / multi-tenant / micro-frontend / test isolation). */
export function DeergraphProvider({
  value,
  children,
}: {
  value: DeergraphRuntimeConfig;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

function resolve(
  ...layers: (DeergraphRuntimeConfig | null | undefined)[]
): ResolvedRuntimeConfig {
  let fetcher: typeof fetch | undefined;
  let baseUrl: string | undefined;
  // Later layers win, so callers pass lower-precedence layers first.
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.fetcher !== undefined) fetcher = layer.fetcher;
    if (layer.baseUrl !== undefined) baseUrl = layer.baseUrl;
  }
  return {
    fetcher: fetcher ?? defaultFetcher(),
    baseUrl: baseUrl ?? "",
  };
}

/**
 * Non-React accessor for plain functions (e.g. the API client). Context is not
 * available here, so resolution is: global config > defaults.
 */
export function getDeergraphRuntime(): ResolvedRuntimeConfig {
  return resolve(globalConfig);
}

/**
 * React hook for components. Resolution: Context value > global config >
 * defaults.
 */
export function useDeergraphRuntime(): ResolvedRuntimeConfig {
  const ctx = React.useContext(RuntimeContext);
  return resolve(globalConfig, ctx);
}
