// The gate's one open folder (U8b): the gate page's figure, its posters and fonts under /gate-assets/
// load without the cookie, and nothing else under public/ does.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, test } from "node:test";

// The app's modules import each other without extensions, as the bundlers want; Node needs them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { gateRequest, isOpenPath } = await import("../lib/gate/handlers.ts");

const ORIGIN = "https://try.example.test";
const DEMO_ENV = { NODE_ENV: "production", AB_DEMO: "1", EVE_CHAT_PASSWORD: "k3Jv9QpX2rTz8LmW5nB7cD1f" } as NodeJS.ProcessEnv;

function page(path: string) {
  return new Request(`${ORIGIN}${path}`, { headers: { accept: "text/html" } });
}

describe("the gate page's assets", () => {
  test("a file under /gate-assets/ loads without the cookie", () => {
    for (const path of [
      "/gate-assets/loop-request-to-pr.mp4",
      "/gate-assets/loop-request-to-pr.jpg",
      "/gate-assets/loop-request-to-pr-1200.avif",
      "/gate-assets/loop-request-to-pr-portrait.mp4",
      "/gate-assets/loop-request-to-pr-portrait-720.avif",
      "/gate-assets/fonts/archivo-latin-var.woff2",
      "/gate-assets/fonts/azeret-mono-latin-var.woff2",
      "/gate-assets/fonts/LICENSE-Archivo.txt",
    ]) {
      assert.equal(gateRequest(page(path), { env: DEMO_ENV }), null, path);
    }
  });

  test("any other public/ path without the cookie still gets the 401 gate page", async () => {
    for (const path of ["/eve.svg", "/eve-chat-template-og.png", "/apple-icon", "/gate-assets", "/gate-assets/", "/gate-assetsx/loop.mp4"]) {
      const response = gateRequest(page(path), { env: DEMO_ENV });
      assert.equal(response?.status, 401, path);
      assert.match(await response!.text(), /data-gate-state="no-cookie"/, path);
    }
  });

  test("a path that leaves the folder, or only mentions it, is still gated", () => {
    for (const path of [
      "/gate-assets/../anything",
      "/gate-assets/%2e%2e/api/bootstrap",
      "/gate-assets/..%2fapi/bootstrap",
      "/gate-assets/fonts/..%2F..%2Fchat/abc",
      "/chat/gate-assets/x.mp4",
      "/api/gate-assets/x.mp4",
      "/eve/v1/gate-assets/x.mp4",
      "/x/gate-assets/loop-request-to-pr.mp4",
    ]) {
      assert.notEqual(gateRequest(page(path), { env: DEMO_ENV }), null, path);
    }
    // The pathname as given, before any URL parser has resolved the dot segments.
    for (const pathname of ["/gate-assets/../anything", "/gate-assets/./x.mp4", "/gate-assets/..\\chat", "/gate-assets/%2e%2e/x.js", "/gate-assets/fonts/"]) {
      assert.equal(isOpenPath(pathname), false, pathname);
    }
  });
});
