import { DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { tableCleanup } from "./smoke-cleanup";

function cloudFormation(outputs: { OutputKey: string; OutputValue: string }[]) {
  const sent: DescribeStacksCommand[] = [];
  return {
    sent,
    client: {
      async send(command: DescribeStacksCommand) {
        sent.push(command);
        return { Stacks: [{ StackName: "KudosStack", Outputs: outputs }] };
      },
    },
  };
}

function dynamo() {
  const sent: DeleteCommand[] = [];
  return {
    sent,
    client: {
      async send(command: DeleteCommand) {
        sent.push(command);
        return {};
      },
    },
  };
}

describe("tableCleanup", () => {
  it("reads TableName from the KudosStack outputs and deletes the item by id", async () => {
    const cfn = cloudFormation([
      { OutputKey: "WebBucketName", OutputValue: "web" },
      { OutputKey: "TableName", OutputValue: "kudos-table" },
    ]);
    const ddb = dynamo();
    const deleteKudos = await tableCleanup(cfn.client as never, ddb.client as never)();
    expect(cfn.sent[0]).toBeInstanceOf(DescribeStacksCommand);
    expect(cfn.sent[0].input).toEqual({ StackName: "KudosStack" });
    expect(ddb.sent).toEqual([]);

    await deleteKudos("abc");
    expect(ddb.sent[0]).toBeInstanceOf(DeleteCommand);
    expect(ddb.sent[0].input).toEqual({ TableName: "kudos-table", Key: { id: "abc" } });
  });

  it("fails naming TableName when the stack has no such output", async () => {
    const cfn = cloudFormation([{ OutputKey: "WebBucketName", OutputValue: "web" }]);
    await expect(tableCleanup(cfn.client as never, dynamo().client as never)()).rejects.toThrow(
      /KudosStack has no TableName output/,
    );
  });
});
