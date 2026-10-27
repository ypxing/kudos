import { App } from "aws-cdk-lib";
import { KudosStack } from "./stack";

const app = new App();
new KudosStack(app, "KudosStack", {
  apiCodeDir: app.node.tryGetContext("apiCodeDir") ?? "dist/api",
});
app.synth();
