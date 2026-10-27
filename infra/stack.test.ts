import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { KudosStack, OUTPUTS } from "./stack";

function synth(): Template {
  const codeDir = mkdtempSync(join(tmpdir(), "kudos-api-"));
  writeFileSync(join(codeDir, "index.mjs"), "export const handler = async () => ({});");
  const app = new App();
  return Template.fromStack(new KudosStack(app, "TestStack", { apiCodeDir: codeDir }));
}

describe("KudosStack", () => {
  const template = synth();

  it("has a DynamoDB table keyed by id", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    });
  });

  it("runs the handler on Node.js 22 with the table name in its environment", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Environment: { Variables: { TABLE_NAME: Match.anyValue() } },
    });
  });

  it("routes GET and POST /kudos through an HTTP API", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", { ProtocolType: "HTTP" });
    const routes = Object.values(template.findResources("AWS::ApiGatewayV2::Route")).map(
      (r) => r.Properties.RouteKey,
    );
    expect(routes.sort()).toEqual(["GET /kudos", "POST /kudos"]);
  });

  it("has a bucket for the web page and exports what the deploy needs", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    for (const name of Object.values(OUTPUTS)) {
      template.hasOutput(name, {});
    }
  });
});
