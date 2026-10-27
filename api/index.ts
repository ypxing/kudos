import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { dynamoStore } from "./dynamo-store";
import { createHandler } from "./handler";

const tableName = process.env.TABLE_NAME;
if (!tableName) {
  throw new Error("TABLE_NAME is not set");
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createHandler(dynamoStore(client, tableName));
