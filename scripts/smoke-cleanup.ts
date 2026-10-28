import { type CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { DeleteCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { OUTPUTS, STACK_NAME } from "../infra/outputs";
import type { PrepareDelete } from "./smoke-checks";

/**
 * Deletes smoke's kudos straight from the table, by the key the POST returned. The table is found from the
 * deployed stack rather than cdk.out, which exists only in the checkout that ran the deploy.
 */
export function tableCleanup(cfn: CloudFormationClient, ddb: DynamoDBDocumentClient): PrepareDelete {
  return async () => {
    const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
    const tableName = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === OUTPUTS.tableName)?.OutputValue;
    if (!tableName) throw new Error(`stack ${STACK_NAME} has no ${OUTPUTS.tableName} output`);
    return async (id) => {
      await ddb.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
    };
  };
}
