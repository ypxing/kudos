export interface WebConfig {
  apiUrl: string;
}

/**
 * config.json sits beside the page, so it resolves against the page's URL:
 * `<web url>/config.json` for a directory URL, or a sibling of `index.html`.
 */
export function configUrl(webUrl: string): string {
  return new URL("config.json", webUrl).toString();
}

export async function loadConfig(webUrl: string, fetchFn: typeof fetch = fetch): Promise<WebConfig> {
  const url = configUrl(webUrl);
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  const body = (await res.json()) as Partial<WebConfig>;
  if (typeof body.apiUrl !== "string" || body.apiUrl === "") {
    throw new Error(`${url} has no apiUrl`);
  }
  // A path apiUrl resolves against the host that served the page (localhost, or a tunnel such as ngrok).
  return { apiUrl: new URL(body.apiUrl, url).toString().replace(/\/+$/, "") };
}
