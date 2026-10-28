// Kept apart from the stack so the deploy and smoke scripts can read these without loading aws-cdk-lib.
export const STACK_NAME = "KudosStack";

export const OUTPUTS = {
  webBucket: "WebBucketName",
  apiId: "HttpApiId",
  apiEndpoint: "HttpApiEndpoint",
  tableName: "TableName",
} as const;
