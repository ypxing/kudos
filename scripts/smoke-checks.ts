import { loadConfig } from "../web/config";

export const CHECKS = ["page-loads", "list-kudos", "post-kudos"] as const;
export type CheckName = (typeof CHECKS)[number];

export interface CheckResult {
  check: CheckName;
  ok: boolean;
  reason?: string;
}

class CheckFailed extends Error {}

function describe(err: unknown): string {
  if (err instanceof CheckFailed) return err.message;
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
    return `${err.message}${cause}`;
  }
  return String(err);
}

async function run(check: CheckName, body: () => Promise<void>): Promise<CheckResult> {
  try {
    await body();
    return { check, ok: true };
  } catch (err) {
    return { check, ok: false, reason: describe(err) };
  }
}

async function listKudos(apiUrl: string, fetchFn: typeof fetch): Promise<unknown[]> {
  const res = await fetchFn(`${apiUrl}/kudos`);
  if (res.status !== 200) throw new CheckFailed(`GET ${apiUrl}/kudos returned ${res.status}`);
  const body: unknown = await res.json().catch(() => undefined);
  if (!Array.isArray(body)) throw new CheckFailed(`GET ${apiUrl}/kudos did not return a JSON array`);
  return body;
}

export async function runSmoke(webUrl: string, fetchFn: typeof fetch = fetch): Promise<CheckResult[]> {
  const pageLoads = await run("page-loads", async () => {
    const res = await fetchFn(webUrl);
    if (res.status !== 200) throw new CheckFailed(`GET ${webUrl} returned ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) throw new CheckFailed(`GET ${webUrl} returned ${type || "no content-type"}, not text/html`);
  });

  let apiUrl: string | undefined;
  let configError = "";
  try {
    apiUrl = (await loadConfig(webUrl, fetchFn)).apiUrl;
  } catch (err) {
    configError = `cannot read the API URL from config.json: ${describe(err)}`;
  }
  const api = async (): Promise<string> => {
    if (!apiUrl) throw new CheckFailed(configError);
    return apiUrl;
  };

  const list = await run("list-kudos", async () => {
    await listKudos(await api(), fetchFn);
  });

  const post = await run("post-kudos", async () => {
    const url = await api();
    const kudos = { from: "smoke", to: "smoke", message: `smoke test ${new Date().toISOString()}` };
    const res = await fetchFn(`${url}/kudos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kudos),
    });
    if (res.status !== 201) throw new CheckFailed(`POST ${url}/kudos returned ${res.status}`);
    const created = (await res.json()) as { id?: unknown };
    const items = await listKudos(url, fetchFn);
    if (!items.some((k) => (k as { id?: unknown }).id === created.id)) {
      throw new CheckFailed(`the posted kudos ${String(created.id)} was not returned by GET ${url}/kudos`);
    }
  });

  return [pageLoads, list, post];
}

export function formatResults(results: CheckResult[]): string {
  return results.map((r) => (r.ok ? `PASS ${r.check}` : `FAIL ${r.check}: ${r.reason}`)).join("\n");
}
