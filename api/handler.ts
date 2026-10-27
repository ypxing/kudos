import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export interface Kudos {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: string;
}

export interface KudosStore {
  list(): Promise<Kudos[]>;
  put(item: Kudos): Promise<void>;
}

export interface HandlerOptions {
  now?: () => Date;
  newId?: () => string;
}

export type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

const FIELDS = ["from", "to", "message"] as const;

export const MESSAGE_MAX_LENGTH = 280;

function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (event.body === undefined || event.body === null) {
    throw new SyntaxError("missing body");
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(raw);
}

type Validated = { ok: true; value: Pick<Kudos, "from" | "to" | "message"> } | { ok: false; error: string };

function validate(input: unknown): Validated {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "body must be a JSON object with from, to and message" };
  }
  const record = input as Record<string, unknown>;
  for (const field of FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, error: `${field} is required and must be a non-empty string` };
    }
  }
  const message = (record.message as string).trim();
  // Count code points, not UTF-16 units, so an emoji such as 😀 counts as one character.
  if ([...message].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `message must be at most ${MESSAGE_MAX_LENGTH} characters` };
  }
  return {
    ok: true,
    value: {
      from: (record.from as string).trim(),
      to: (record.to as string).trim(),
      message,
    },
  };
}

export function createHandler(store: KudosStore, options: HandlerOptions = {}): Handler {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;

  return async (event) => {
    const method = event.requestContext?.http?.method ?? "GET";
    try {
      if (method === "GET") {
        const items = await store.list();
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json(200, items);
      }
      if (method === "POST") {
        let input: unknown;
        try {
          input = parseBody(event);
        } catch {
          return json(400, { error: "body must be valid JSON" });
        }
        const result = validate(input);
        if (!result.ok) {
          return json(400, { error: result.error });
        }
        const item: Kudos = { id: newId(), ...result.value, createdAt: now().toISOString() };
        await store.put(item);
        return json(201, item);
      }
      return json(405, { error: `method ${method} not allowed` });
    } catch (err) {
      console.error(err);
      return json(500, { error: "internal error" });
    }
  };
}
