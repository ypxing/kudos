import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { OUTPUTS } from "../infra/outputs";
import { apiUrlFor, assertReachable, configKeys, contentTypeFor, endpointFrom, listFiles, webUrlFor } from "./deploy-lib";

const root = resolve(import.meta.dirname, "..");
const apiDir = join(root, "dist", "api");
const webDir = join(root, "dist", "web");
const outputsFile = join(root, "cdk.out", "outputs.json");
const STACK = "KudosStack";

// MiniStack accepts any credentials; real values in the environment still win.
const env: NodeJS.ProcessEnv = {
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
  AWS_REGION: "us-east-1",
  ...process.env,
};
env.AWS_ENDPOINT_URL = endpointFrom(process.env);
env.AWS_DEFAULT_REGION ??= env.AWS_REGION;
const endpoint = env.AWS_ENDPOINT_URL;

function log(message: string) {
  console.error(`deploy:local: ${message}`);
}

function cdk(...args: string[]) {
  const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "cdk.cmd" : "cdk");
  // CDK's own output goes to stderr so stdout carries only the two URLs.
  const result = spawnSync(bin, [...args, "--no-notices"], { cwd: root, env, stdio: ["ignore", 2, 2] });
  if (result.status !== 0) {
    throw new Error(`cdk ${args[0]} failed with exit code ${result.status ?? result.signal}`);
  }
}

async function main() {
  await assertReachable(endpoint);
  // Loaded only once MiniStack answers, so an unreachable endpoint fails fast.
  const [{ build: esbuild }, { build: viteBuild }, { PutObjectCommand, S3Client }] = await Promise.all([
    import("esbuild"),
    import("vite"),
    import("@aws-sdk/client-s3"),
  ]);

  log("bundling the API handler");
  await esbuild({
    entryPoints: [join(root, "api", "index.ts")],
    outfile: join(apiDir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // Bundled CommonJS dependencies call require(), which ESM output lacks.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "warning",
  });

  log("building the web page");
  await viteBuild({ configFile: join(root, "vite.config.ts"), logLevel: "warn" });

  log(`deploying ${STACK} to ${endpoint}`);
  cdk("bootstrap");
  cdk("deploy", STACK, "--require-approval", "never", "--outputs-file", outputsFile, "--context", `apiCodeDir=${apiDir}`);

  const outputs = JSON.parse(readFileSync(outputsFile, "utf8"))[STACK] as Record<string, string>;
  const bucket = outputs[OUTPUTS.webBucket];
  const apiUrl = apiUrlFor(endpoint, outputs[OUTPUTS.apiId]);
  const webUrl = webUrlFor(endpoint, bucket);

  log(`uploading the web page to s3://${bucket}`);
  const s3 = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
      sessionToken: env.AWS_SESSION_TOKEN,
    },
  });
  const put = (key: string, body: Buffer | string) =>
    s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentTypeFor(key) }));
  for (const key of listFiles(webDir)) {
    await put(key, readFileSync(join(webDir, key)));
  }
  for (const key of configKeys()) {
    await put(key, JSON.stringify({ apiUrl }));
  }

  console.log(`Web URL: ${webUrl}`);
  console.log(`API URL: ${apiUrl}`);
}

main().catch((err: unknown) => {
  console.error(`deploy:local failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
