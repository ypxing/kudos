import { readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export const DEFAULT_ENDPOINT = "http://localhost:4566";

export function endpointFrom(env: NodeJS.ProcessEnv, fallback = DEFAULT_ENDPOINT): string {
  return (env.AWS_ENDPOINT_URL || fallback).replace(/\/+$/, "");
}

/** The AWS settings deploy and smoke share. MiniStack accepts any credentials; real values in `env` still win. */
export function awsEnvFrom(env: NodeJS.ProcessEnv, fallbackEndpoint = DEFAULT_ENDPOINT): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "us-east-1",
    ...env,
  };
  out.AWS_ENDPOINT_URL = endpointFrom(env, fallbackEndpoint);
  out.AWS_DEFAULT_REGION ??= out.AWS_REGION;
  return out;
}

/** Client options for an AWS SDK client from `awsEnvFrom`'s settings. */
export function awsClientConfig(env: NodeJS.ProcessEnv) {
  return {
    endpoint: env.AWS_ENDPOINT_URL,
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
      sessionToken: env.AWS_SESSION_TOKEN,
    },
  };
}

/** MiniStack serves HTTP APIs by path, which browsers reach without `*.localhost` DNS. */
export function apiPathFor(apiId: string): string {
  return `/_aws/execute-api/${apiId}/$default`;
}

export function apiUrlFor(endpoint: string, apiId: string): string {
  return `${endpoint}${apiPathFor(apiId)}`;
}

/** MiniStack does not serve a bucket's index document, so the URL names the page itself. */
export function webUrlFor(endpoint: string, bucket: string): string {
  return `${endpoint}/${bucket}/index.html`;
}

/**
 * Bucket keys for config.json. The page and smoke read it beside index.html; the copy under
 * `index.html/` makes the literal `<web url>/config.json` resolve too.
 */
export function configKeys(): string[] {
  return ["config.json", "index.html/config.json"];
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
