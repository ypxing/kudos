import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsClientConfig, awsEnvFrom } from "./deploy-lib";
import { formatResults, runSmoke } from "./smoke-checks";
import { tableCleanup } from "./smoke-cleanup";

const url = process.argv.slice(2).find((arg) => arg !== "--");
if (!url) {
  console.error("usage: pnpm smoke <web url>");
  process.exit(2);
}

// The web URL is served by the MiniStack under test, so its origin is where smoke cleans up,
// unless AWS_ENDPOINT_URL says otherwise.
let origin: string | undefined;
try {
  origin = new URL(url).origin;
} catch {
  // An unparsable URL already fails every check before anything is posted.
}
const aws = awsClientConfig(awsEnvFrom(process.env, origin));
const cleanup = tableCleanup(new CloudFormationClient(aws), DynamoDBDocumentClient.from(new DynamoDBClient(aws)));

const results = await runSmoke(url, fetch, cleanup);
console.log(formatResults(results));
process.exit(results.every((r) => r.ok) ? 0 : 1);
