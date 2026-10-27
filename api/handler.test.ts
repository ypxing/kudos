import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler, type Kudos, type KudosStore } from "./handler";

function memoryStore(initial: Kudos[] = []): KudosStore & { items: Kudos[] } {
  const items = [...initial];
  return {
    items,
    async list() {
      return [...items];
    },
    async put(item) {
      items.push(item);
    },
  };
}

function event(method: string, body?: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} /kudos`,
    rawPath: "/kudos",
    rawQueryString: "",
    headers: {},
    body,
    isBase64Encoded: false,
    requestContext: { http: { method, path: "/kudos" } },
  } as unknown as APIGatewayProxyEventV2;
}

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
const ids = () => `id-${tick}`;

describe("GET /kudos", () => {
  it("returns 200 with a JSON array, newest first", async () => {
    const store = memoryStore([
      { id: "a", from: "x", to: "y", message: "old", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "c", from: "x", to: "y", message: "newest", createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "b", from: "x", to: "y", message: "mid", createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const res = await createHandler(store)(event("GET"));
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body as string).map((k: Kudos) => k.id)).toEqual(["c", "b", "a"]);
  });

  it("returns an empty array when there are no kudos", async () => {
    const res = await createHandler(memoryStore())(event("GET"));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual([]);
  });
});

describe("POST /kudos", () => {
  it("stores a valid kudos and returns 201 with the item, which the next GET includes", async () => {
    const store = memoryStore();
    const handler = createHandler(store, { now: clock, newId: ids });
    const res = await handler(
      event("POST", JSON.stringify({ from: "Ana", to: "Bo", message: "Thanks!" })),
    );
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body as string);
    expect(created).toMatchObject({ from: "Ana", to: "Bo", message: "Thanks!" });
    expect(typeof created.id).toBe("string");
    expect(typeof created.createdAt).toBe("string");

    const list = JSON.parse((await handler(event("GET"))).body as string);
    expect(list).toContainEqual(created);
  });

  it("decodes a base64-encoded body", async () => {
    const body = Buffer.from(JSON.stringify({ from: "a", to: "b", message: "c" })).toString("base64");
    const res = await createHandler(memoryStore())({ ...event("POST", body), isBase64Encoded: true });
    expect(res.statusCode).toBe(201);
  });

  it.each(["from", "to", "message"])("returns 400 naming %s when it is missing", async (field) => {
    const body: Record<string, string> = { from: "a", to: "b", message: "c" };
    delete body[field];
    const store = memoryStore();
    const res = await createHandler(store)(event("POST", JSON.stringify(body)));
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain(field);
    expect(store.items).toHaveLength(0);
  });

  it.each(["from", "to", "message"])("returns 400 naming %s when it is empty", async (field) => {
    const body: Record<string, string> = { from: "a", to: "b", message: "c", [field]: "   " };
    const res = await createHandler(memoryStore())(event("POST", JSON.stringify(body)));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).error).toContain(field);
  });

  it("returns 400 when a field is not a string", async () => {
    const res = await createHandler(memoryStore())(
      event("POST", JSON.stringify({ from: "a", to: 5, message: "c" })),
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("to");
  });

  it.each([["not json"], [""], ["[1,2]"], ["null"]])("returns 400 for invalid JSON body %j", async (body) => {
    const res = await createHandler(memoryStore())(event("POST", body));
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when there is no body", async () => {
    const res = await createHandler(memoryStore())(event("POST"));
    expect(res.statusCode).toBe(400);
  });
});

describe("other requests", () => {
  it("answers CORS preflight", async () => {
    const res = await createHandler(memoryStore())(event("OPTIONS"));
    expect(res.statusCode).toBe(204);
    expect(res.headers?.["access-control-allow-origin"]).toBe("*");
  });

  it("returns 405 for an unsupported method", async () => {
    const res = await createHandler(memoryStore())(event("DELETE"));
    expect(res.statusCode).toBe(405);
  });

  it("returns 500 with a JSON error when the store fails", async () => {
    const store: KudosStore = {
      list: async () => {
        throw new Error("boom");
      },
      put: async () => {},
    };
    const res = await createHandler(store)(event("GET"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body as string)).toHaveProperty("error");
  });
});
