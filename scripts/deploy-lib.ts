import { readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export const DEFAULT_ENDPOINT = "http://localhost:4566";

export function endpointFrom(env: NodeJS.ProcessEnv): string {
  return (env.AWS_ENDPOINT_URL || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

/** MiniStack serves HTTP APIs by path, which browsers reach without `*.localhost` DNS. */
export function apiUrlFor(endpoint: string, apiId: string): string {
  return `${endpoint}/_aws/execute-api/${apiId}/$default`;
}

/** MiniStack does not serve a bucket's index document, so the URL names the page itself. */
export function webUrlFor(endpoint: string, bucket: string): string {
  return `${endpoint}/${bucket}/index.html`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

export async function assertReachable(endpoint: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await fetchFn(endpoint, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(
      `MiniStack is not reachable at AWS_ENDPOINT_URL=${endpoint} (${why}). ` +
        "Start MiniStack, or set AWS_ENDPOINT_URL to where it listens.",
      { cause: err },
    );
  }
}

/** Every file under `dir`, as S3 keys relative to it. */
export function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}
