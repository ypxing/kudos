import type { Kudos } from "../api/handler";

export type NewKudos = Pick<Kudos, "from" | "to" | "message">;

export interface KudosApi {
  list(): Promise<Kudos[]>;
  post(input: NewKudos): Promise<Kudos>;
}

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `request failed with ${res.status}`;
}

export function createApi(apiUrl: string, fetchFn: typeof fetch = fetch.bind(globalThis)): KudosApi {
  return {
    async list() {
      const res = await fetchFn(`${apiUrl}/kudos`);
      if (!res.ok) throw new Error(await errorOf(res));
      return (await res.json()) as Kudos[];
    },
    async post(input) {
      const res = await fetchFn(`${apiUrl}/kudos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      return (await res.json()) as Kudos;
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function field(name: keyof NewKudos, label: string, multiline = false): HTMLLabelElement {
  const input = multiline
    ? el("textarea", { name, rows: 3 })
    : el("input", { name, type: "text", autocomplete: "off" });
  return el("label", {}, label, input);
}

function renderItem(k: Kudos): HTMLLIElement {
  const when = new Date(k.createdAt);
  return el(
    "li",
    { className: "kudos" },
    el("p", { className: "kudos-message" }, k.message),
    el(
      "p",
      { className: "kudos-meta" },
      `${k.from} → ${k.to}`,
      el("time", { dateTime: k.createdAt }, Number.isNaN(when.getTime()) ? k.createdAt : when.toLocaleString()),
    ),
  );
}

export async function mountBoard(root: HTMLElement, api: KudosApi): Promise<void> {
  const status = el("p", { className: "status" });
  status.setAttribute("role", "alert");
  const count = el("p", { className: "kudos-count" });
  const list = el("ul", { className: "kudos-list" });
  const submit = el("button", { type: "submit" }, "Send kudos");
  const form = el(
    "form",
    { className: "kudos-form" },
    field("from", "From"),
    field("to", "To"),
    field("message", "Message", true),
    submit,
  );

  root.replaceChildren(el("h1", {}, "Kudos board"), form, status, count, list);

  const refresh = async () => {
    const items = await api.list();
    count.textContent = `${items.length} kudos so far`;
    list.replaceChildren(
      ...(items.length ? items.map(renderItem) : [el("li", { className: "empty" }, "No kudos yet. Send the first one!")]),
    );
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const input: NewKudos = {
      from: String(data.get("from") ?? ""),
      to: String(data.get("to") ?? ""),
      message: String(data.get("message") ?? ""),
    };
    submit.disabled = true;
    status.textContent = "";
    try {
      await api.post(input);
      (form.elements.namedItem("message") as HTMLTextAreaElement).value = "";
      await refresh();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      submit.disabled = false;
    }
  });

  try {
    await refresh();
  } catch (err) {
    status.textContent = `Could not load kudos: ${err instanceof Error ? err.message : String(err)}`;
  }
}
