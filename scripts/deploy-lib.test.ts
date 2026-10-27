import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  apiUrlFor,
  assertReachable,
  configKeys,
  contentTypeFor,
  DEFAULT_ENDPOINT,
  endpointFrom,
  webUrlFor,
} from "./deploy-lib";

describe("endpointFrom", () => {
  it("defaults to MiniStack on localhost:4566", () => {
    expect(endpointFrom({})).toBe(DEFAULT_ENDPOINT);
    expect(DEFAULT_ENDPOINT).toBe("http://localhost:4566");
  });

  it("uses AWS_ENDPOINT_URL without a trailing slash", () => {
    expect(endpointFrom({ AWS_ENDPOINT_URL: "http://ministack:4566/" })).toBe("http://ministack:4566");
  });
});

describe("URLs", () => {
  it("addresses the HTTP API's default stage by path on the endpoint", () => {
    expect(apiUrlFor("http://localhost:4566", "abc123")).toBe(
      "http://localhost:4566/_aws/execute-api/abc123/$default",
    );
  });

  it("addresses the page by path in the web bucket", () => {
    expect(webUrlFor("http://localhost:4566", "web-bucket")).toBe("http://localhost:4566/web-bucket/index.html");
  });
});

describe("configKeys", () => {
  it("serves config.json both beside the page and at <web url>/config.json", () => {
    const webUrl = webUrlFor("http://localhost:4566", "b");
    const urls = configKeys().map((key) => `http://localhost:4566/b/${key}`);
    expect(urls).toContain(new URL("config.json", webUrl).toString());
    expect(urls).toContain(`${webUrl}/config.json`);
  });
});

describe("contentTypeFor", () => {
  it.each([
    ["index.html", "text/html; charset=utf-8"],
    ["assets/app.js", "text/javascript; charset=utf-8"],
    ["assets/app.css", "text/css; charset=utf-8"],
    ["config.json", "application/json"],
    ["logo.svg", "image/svg+xml"],
    ["blob.bin", "application/octet-stream"],
  ])("%s is %s", (file, type) => {
    expect(contentTypeFor(file)).toBe(type);
  });
});

describe("assertReachable", () => {
  it("resolves when the endpoint answers", async () => {
    const fetchFn = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(assertReachable("http://x", fetchFn)).resolves.toBeUndefined();
  });

  it("names AWS_ENDPOINT_URL when the endpoint is unreachable", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(assertReachable("http://x", fetchFn)).rejects.toThrow(/AWS_ENDPOINT_URL/);
  });
});

describe("pnpm deploy:local", () => {
  it("exits non-zero naming AWS_ENDPOINT_URL when MiniStack is unreachable", async () => {
    const run = promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/deploy-local.ts"], {
      env: { ...process.env, AWS_ENDPOINT_URL: "http://127.0.0.1:9" },
    });
    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/AWS_ENDPOINT_URL=http:\/\/127\.0\.0\.1:9/),
    });
  });
});
