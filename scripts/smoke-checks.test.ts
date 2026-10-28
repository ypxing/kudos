import { describe, expect, it } from "vitest";
import { formatResults, type PrepareDelete, runSmoke as runSmokeWith } from "./smoke-checks";

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

interface Board {
  items: { id: string }[];
  deleted: string[];
  prepareDelete: PrepareDelete;
}

/** A fake table behind the fake API: deleting by id removes the item from what GET /kudos lists. */
function board(): Board {
  const b: Board = {
    items: [],
    deleted: [],
    prepareDelete: async () => async (id) => {
      b.deleted.push(id);
      b.items = b.items.filter((k) => k.id !== id);
    },
  };
  return b;
}

let current: Board;

function runSmoke(webUrl: string, fetchFn: typeof fetch, prepareDelete = current.prepareDelete) {
  return runSmokeWith(webUrl, fetchFn, prepareDelete);
}

function healthyApp(b: Board = (current = board())): Record<string, Route> {
  return {
    [`GET ${WEB}`]: () => new Response("<!doctype html><title>Kudos</title>", { headers: { "content-type": "text/html" } }),
    [`GET ${CONFIG}`]: () => Response.json({ apiUrl: API }),
    [`GET ${API}/kudos`]: () => Response.json(b.items),
    [`POST ${API}/kudos`]: (init) => {
      const item = { id: `id-${b.items.length}`, ...JSON.parse(String(init?.body)) };
      b.items.unshift(item);
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

  it("deletes the kudos it posted by its id, and only that one", async () => {
    const routes = healthyApp();
    const someoneElse = { id: "real", from: "smoke", to: "smoke", message: "a real kudos" };
    current.items.push(someoneElse);
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[2]).toEqual({ check: "post-kudos", ok: true });
    expect(current.deleted).toEqual(["id-1"]);
    expect(current.items).toEqual([someoneElse]);
  });

  it("still deletes the posted kudos when the read-back fails, reporting the read-back", async () => {
    const routes = healthyApp();
    routes[`GET ${API}/kudos`] = () => Response.json([]);
    const results = await runSmoke(WEB, fakeFetch(routes));
    expect(results[2]).toMatchObject({ check: "post-kudos", ok: false });
    expect(results[2].reason).toContain("not returned");
    expect(current.deleted).toEqual(["id-0"]);
  });

  it("fails post-kudos naming the delete when the delete fails", async () => {
    const routes = healthyApp();
    const results = await runSmoke(WEB, fakeFetch(routes), async () => async () => {
      throw new Error("ResourceNotFoundException");
    });
    expect(results[2]).toMatchObject({ check: "post-kudos", ok: false });
    expect(results[2].reason).toMatch(/cannot delete the posted kudos id-0.*ResourceNotFoundException/);
  });

  it("fails post-kudos when the posted kudos is still listed after the delete", async () => {
    const routes = healthyApp();
    const results = await runSmoke(WEB, fakeFetch(routes), async () => async () => {});
    expect(results[2]).toMatchObject({ check: "post-kudos", ok: false });
    expect(results[2].reason).toContain("still returned");
  });

  it("fails post-kudos without posting when the table name cannot be read", async () => {
    const routes = healthyApp();
    let posted = false;
    const post = routes[`POST ${API}/kudos`];
    routes[`POST ${API}/kudos`] = (init) => {
      posted = true;
      return post(init);
    };
    const results = await runSmoke(WEB, fakeFetch(routes), async () => {
      throw new Error("stack KudosStack has no TableName output");
    });
    expect(results[2]).toMatchObject({ check: "post-kudos", ok: false });
    expect(results[2].reason).toMatch(/table name.*TableName/);
    expect(posted).toBe(false);
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
    current = board();
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
