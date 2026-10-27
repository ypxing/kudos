import { describe, expect, it } from "vitest";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoStore } from "./dynamo-store";
import type { Kudos } from "./handler";

const kudos = (id: string): Kudos => ({ id, from: "a", to: "b", message: "m", createdAt: "2026-01-01T00:00:00.000Z" });

describe("dynamoStore", () => {
  it("scans every page of the table", async () => {
    const calls: ScanCommand[] = [];
    const client = {
      async send(command: ScanCommand) {
        calls.push(command);
        return calls.length === 1
          ? { Items: [kudos("1")], LastEvaluatedKey: { id: "1" } }
          : { Items: [kudos("2")] };
      },
    };
    const items = await dynamoStore(client as never, "Kudos").list();
    expect(items.map((k) => k.id)).toEqual(["1", "2"]);
    expect(calls[0].input).toMatchObject({ TableName: "Kudos" });
    expect(calls[1].input.ExclusiveStartKey).toEqual({ id: "1" });
  });

  it("puts an item into the table", async () => {
    const sent: PutCommand[] = [];
    const client = {
      async send(command: PutCommand) {
        sent.push(command);
        return {};
      },
    };
    await dynamoStore(client as never, "Kudos").put(kudos("9"));
    expect(sent[0]).toBeInstanceOf(PutCommand);
    expect(sent[0].input).toEqual({ TableName: "Kudos", Item: kudos("9") });
  });
});
