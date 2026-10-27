// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createApi, mountBoard, type KudosApi } from "./board";
import type { Kudos } from "../api/handler";

const sample = (id: string, message: string, createdAt: string): Kudos => ({
  id,
  from: "Ana",
  to: "Bo",
  message,
  createdAt,
});

function fakeApi(initial: Kudos[] = []): KudosApi & { items: Kudos[] } {
  const items = [...initial];
  return {
    items,
    async list() {
      return [...items];
    },
    async post(input) {
      if (!input.message) throw new Error("message is required and must be a non-empty string");
      const item = sample(`id-${items.length}`, input.message, new Date().toISOString());
      item.from = input.from;
      item.to = input.to;
      items.unshift(item);
      return item;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fill(root: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    (root.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
  }
}

describe("mountBoard", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("main");
    document.body.append(root);
  });

  it("lists kudos in the order the API returns them", async () => {
    await mountBoard(root, fakeApi([sample("2", "newer", "2026-01-02"), sample("1", "older", "2026-01-01")]));
    const items = [...root.querySelectorAll("li")].map((li) => li.textContent);
    expect(items[0]).toContain("newer");
    expect(items[0]).toContain("Ana");
    expect(items[0]).toContain("Bo");
    expect(items[1]).toContain("older");
  });

  it("shows an empty state when there are no kudos", async () => {
    await mountBoard(root, fakeApi());
    expect(root.textContent).toContain("No kudos yet");
  });

  it("posts a kudos through the form and shows it in the list", async () => {
    const api = fakeApi();
    await mountBoard(root, api);
    fill(root, { from: "Cy", to: "Di", message: "Great demo" });
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(api.items).toHaveLength(1);
    expect(root.querySelector("li")!.textContent).toContain("Great demo");
    expect((root.querySelector('[name="message"]') as HTMLInputElement).value).toBe("");
  });

  it("shows the API's error when posting fails", async () => {
    await mountBoard(root, fakeApi());
    fill(root, { from: "Cy", to: "Di", message: "" });
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(root.querySelector('[role="alert"]')!.textContent).toContain("message is required");
  });

  it("shows the number of kudos above the list", async () => {
    await mountBoard(root, fakeApi([sample("2", "newer", "2026-01-02"), sample("1", "older", "2026-01-01")]));
    const count = root.querySelector(".kudos-count");
    expect(count?.textContent).toBe("2 kudos so far");
    expect(count?.nextElementSibling).toBe(root.querySelector(".kudos-list"));
  });

  it("shows a zero count when there are no kudos", async () => {
    await mountBoard(root, fakeApi());
    expect(root.querySelector(".kudos-count")?.textContent).toBe("0 kudos so far");
  });

  it("raises the count by one after a successful post", async () => {
    await mountBoard(root, fakeApi([sample("1", "older", "2026-01-01")]));
    fill(root, { from: "Cy", to: "Di", message: "Great demo" });
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(root.querySelector(".kudos-count")?.textContent).toBe("2 kudos so far");
  });

  it("leaves the count unchanged when a post fails", async () => {
    await mountBoard(root, fakeApi([sample("1", "older", "2026-01-01")]));
    fill(root, { from: "Cy", to: "Di", message: "" });
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(root.querySelector('[role="alert"]')!.textContent).toContain("message is required");
    expect(root.querySelector(".kudos-count")?.textContent).toBe("1 kudos so far");
  });

  it("shows no count number when the initial load fails", async () => {
    const api = fakeApi();
    api.list = async () => {
      throw new Error("network down");
    };
    await mountBoard(root, api);
    expect(root.querySelector(".kudos-count")?.textContent).not.toMatch(/\d/);
    expect(root.querySelector('[role="alert"]')!.textContent).toBe("Could not load kudos: network down");
  });

  it("clears the count when the reload after a successful post fails", async () => {
    const api = fakeApi([sample("1", "older", "2026-01-01")]);
    await mountBoard(root, api);
    api.list = async () => {
      throw new Error("network down");
    };
    fill(root, { from: "Cy", to: "Di", message: "Great demo" });
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(root.querySelector(".kudos-count")?.textContent).not.toMatch(/\d/);
  });

  it("renders kudos text as text, not HTML", async () => {
    await mountBoard(root, fakeApi([sample("1", "<img src=x onerror=alert(1)>", "2026-01-01")]));
    expect(root.querySelector("li img")).toBeNull();
    expect(root.querySelector("li")!.textContent).toContain("<img");
  });
});

describe("createApi", () => {
  it("lists from and posts to <apiUrl>/kudos", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return init?.method === "POST"
        ? Response.json({ id: "1", ...JSON.parse(String(init.body)) }, { status: 201 })
        : Response.json([]);
    }) as typeof fetch;
    const api = createApi("http://api", fetchFn);
    expect(await api.list()).toEqual([]);
    expect(await api.post({ from: "a", to: "b", message: "c" })).toMatchObject({ id: "1", message: "c" });
    expect(calls).toEqual(["GET http://api/kudos", "POST http://api/kudos"]);
  });

  it("throws the API's error message on a failed post", async () => {
    const fetchFn = (async () => Response.json({ error: "to is required" }, { status: 400 })) as unknown as typeof fetch;
    await expect(createApi("http://api", fetchFn).post({ from: "a", to: "", message: "c" })).rejects.toThrow(
      "to is required",
    );
  });
});
