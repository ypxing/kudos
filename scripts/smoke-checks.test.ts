import { describe, expect, it } from "vitest";
import { formatResults, runSmoke } from "./smoke-checks";

type Route = (init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) throw new TypeError(`fetch failed: ${key}`);
    return route(init);
  }) as typeof fetch;
}

const WEB = "http://host/bucket/index.html";
const CONFIG = "http://host/bucket/config.json";
const API = "http://host/api";

function healthyApp(): Record<string, Route> {
  const items: unknown[] = [];
  return {
    [`GET ${WEB}`]: () => new Response("<!doctype html><title>Kudos</title>", { headers: { "content-type": "text/html" } }),
    [`GET ${CONFIG}`]: () => Response.json({ apiUrl: API }),
    [`GET ${API}/kudos`]: () => Response.json(items),
    [`POST ${API}/kudos`]: (init) => {
      const item = { id: `id-${items.length}`, ...JSON.parse(String(init?.body)) };
      items.unshift(item);
      return Response.json(item, { status: 201 });
    },
  };
}

describe("runSmoke", () => {
  it("passes every check against a healthy app", async () => {
    const results = await runSmoke(WEB, fakeFetch(healthyApp()));
    expect(results).toEqual([
      { check: "page-loads", ok: true },
      { check: "list-kudos", ok: true },
      { check: "post-kudos", ok: true },
    ]);
  });

  it("fails page-loads when the page is not HTML", async () => {
    const routes = healthyApp();
    routes[`GET ${WEB}`] = () => Response.json({});
    const [page] = await runSmoke(WEB, fakeFetch(routes));
    expect(page).toMatchObject({ check: "page-loads", ok: false });
    expect(page.reason).toContain("text/html");
  });

  it("fails page-loads with the status when the page is not 200", async () => {
    const routes = healthyApp();
    routes[`GET ${WEB}`] = () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
    const [page] = await runSmoke(WEB, fakeFetch(routes));
    expect(page.reason).toContain("404");
  });

  it("fails list-kudos when GET /kudos is not an array", async () => {
    const routes = healthyApp();
    routes[`GET ${API}/kudos`] = () => Response.json({ items: [] });
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[1]).toMatchObject({ check: "list-kudos", ok: false });
    expect(results[1].reason).toContain("array");
  });

  it("fails post-kudos when the posted kudos is not returned by GET", async () => {
    const routes = healthyApp();
    routes[`GET ${API}/kudos`] = () => Response.json([]);
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[2]).toMatchObject({ check: "post-kudos", ok: false });
    expect(results[2].reason).toContain("not returned");
  });

  it("fails post-kudos when POST does not return 201", async () => {
    const routes = healthyApp();
    routes[`POST ${API}/kudos`] = () => Response.json({ error: "x" }, { status: 500 });
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[2].reason).toContain("500");
  });

  it("fails both API checks, naming config.json, when the config cannot be read", async () => {
    const routes = healthyApp();
    delete routes[`GET ${CONFIG}`];
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[0].ok).toBe(true);
    for (const r of results.slice(1)) {
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("config.json");
    }
  });

  it("reads config.json beside a directory-style URL", async () => {
    const routes = healthyApp();
    routes[`GET http://host/bucket/`] = routes[`GET ${WEB}`];
    const results = await runSmoke("http://host/bucket/", fakeFetch(routes));
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("fails every check when the host is unreachable", async () => {
    const results = await runSmoke(WEB, fakeFetch({}));
    expect(results.map((r) => r.ok)).toEqual([false, false, false]);
  });
});

describe("formatResults", () => {
  it("prints one PASS or FAIL line per check", () => {
    expect(
      formatResults([
        { check: "page-loads", ok: true },
        { check: "list-kudos", ok: false, reason: "boom" },
      ]),
    ).toBe("PASS page-loads\nFAIL list-kudos: boom");
  });
});
