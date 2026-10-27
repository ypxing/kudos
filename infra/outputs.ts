// Kept apart from the stack so the deploy script can read output names without loading aws-cdk-lib.
export const OUTPUTS = {
  webBucket: "WebBucketName",
  apiId: "HttpApiId",
  apiEndpoint: "HttpApiEndpoint",
} as const;
