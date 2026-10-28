import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const serving = (apiUrl: string): typeof fetch => async () => Response.json({ apiUrl });

describe("loadConfig", () => {
  it("resolves a path apiUrl against the host that served the page", async () => {
    const config = await loadConfig(
      "https://abc.ngrok-free.app/bucket/index.html",
      serving("/_aws/execute-api/id/$default"),
    );
    expect(config.apiUrl).toBe("https://abc.ngrok-free.app/_aws/execute-api/id/$default");
  });

  it("keeps an absolute apiUrl, without a trailing slash", async () => {
    const config = await loadConfig("http://localhost:4566/bucket/index.html", serving("http://api.test/x/"));
    expect(config.apiUrl).toBe("http://api.test/x");
  });
});
