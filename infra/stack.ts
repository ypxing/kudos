import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { OUTPUTS } from "./outputs";

export { OUTPUTS };

export interface KudosStackProps extends StackProps {
  /** Directory holding the bundled Lambda handler (`index.mjs`). */
  apiCodeDir: string;
}

export class KudosStack extends Stack {
  constructor(scope: Construct, id: string, props: KudosStackProps) {
    super(scope, id, props);

    const table = new Table(this, "KudosTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new Function(this, "KudosFunction", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromAsset(props.apiCodeDir),
      timeout: Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(fn);

    // The page is served from the bucket's origin, so the API answers CORS preflights itself.
    const api = new HttpApi(this, "KudosApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ["content-type"],
      },
    });
    const integration = new HttpLambdaIntegration("KudosIntegration", fn);
    api.addRoutes({
      path: "/kudos",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration,
    });

    // The deploy script uploads the page and config.json; anyone may read them.
    const webBucket = new Bucket(this, "WebBucket", {
      publicReadAccess: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS_ONLY,
      websiteIndexDocument: "index.html",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, OUTPUTS.webBucket, { value: webBucket.bucketName });
    new CfnOutput(this, OUTPUTS.apiId, { value: api.apiId });
    new CfnOutput(this, OUTPUTS.apiEndpoint, { value: api.apiEndpoint });
    new CfnOutput(this, OUTPUTS.tableName, { value: table.tableName });
  }
}
