import { App } from "aws-cdk-lib";
import { STACK_NAME } from "./outputs";
import { KudosStack } from "./stack";

const app = new App();
new KudosStack(app, STACK_NAME, {
  apiCodeDir: app.node.tryGetContext("apiCodeDir") ?? "dist/api",
});
app.synth();
