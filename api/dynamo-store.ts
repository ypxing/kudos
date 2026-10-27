import { PutCommand, ScanCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Kudos, KudosStore } from "./handler";

export function dynamoStore(client: DynamoDBDocumentClient, tableName: string): KudosStore {
  return {
    async list() {
      const items: Kudos[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const page = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: startKey }));
        items.push(...((page.Items ?? []) as Kudos[]));
        startKey = page.LastEvaluatedKey;
      } while (startKey);
      return items;
    },
    async put(item) {
      await client.send(new PutCommand({ TableName: tableName, Item: item }));
    },
  };
}
