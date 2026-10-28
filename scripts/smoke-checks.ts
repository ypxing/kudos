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

function lists(items: unknown[], id: string): boolean {
  return items.some((k) => (k as { id?: unknown }).id === id);
}

export type DeleteKudos = (id: string) => Promise<void>;
/** Finds where the posted kudos will be deleted from; run before posting, so a cleanup that can't run posts nothing. */
export type PrepareDelete = () => Promise<DeleteKudos>;

export async function runSmoke(webUrl: string, fetchFn: typeof fetch, prepareDelete: PrepareDelete): Promise<CheckResult[]> {
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
    let deleteKudos: DeleteKudos;
    try {
      deleteKudos = await prepareDelete();
    } catch (err) {
      throw new CheckFailed(`cannot read the kudos table name, so nothing was posted: ${describe(err)}`);
    }
    const kudos = { from: "smoke", to: "smoke", message: `smoke test ${new Date().toISOString()}` };
    const res = await fetchFn(`${url}/kudos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kudos),
    });
    if (res.status !== 201) throw new CheckFailed(`POST ${url}/kudos returned ${res.status}`);
    const created = (await res.json().catch(() => ({}))) as { id?: unknown };
    if (typeof created.id !== "string" || !created.id) {
      throw new CheckFailed(`POST ${url}/kudos returned no id, so the posted kudos cannot be deleted`);
    }
    const id = created.id;

    let readBackError: unknown;
    try {
      if (!lists(await listKudos(url, fetchFn), id)) {
        throw new CheckFailed(`the posted kudos ${id} was not returned by GET ${url}/kudos`);
      }
    } catch (err) {
      readBackError = err;
    }
    try {
      await deleteKudos(id);
    } catch (err) {
      const why = `cannot delete the posted kudos ${id}: ${describe(err)}`;
      throw new CheckFailed(readBackError ? `${describe(readBackError)}; ${why}` : why);
    }
    if (readBackError) throw readBackError;

    if (lists(await listKudos(url, fetchFn), id)) {
      throw new CheckFailed(`the posted kudos ${id} is still returned by GET ${url}/kudos after it was deleted`);
    }
  });

  return [pageLoads, list, post];
}

export function formatResults(results: CheckResult[]): string {
  return results.map((r) => (r.ok ? `PASS ${r.check}` : `FAIL ${r.check}: ${r.reason}`)).join("\n");
}
