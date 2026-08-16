import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds a self-contained static GitHub Pages site", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Cockipedia/);
  assert.match(html, /\.\/assets\/[^"']+\.js/);
  assert.match(html, /\.\/assets\/[^"']+\.css/);
  assert.doesNotMatch(html, /chatgpt\.site|codex-preview|cloudflare|vinext/i);
  await access(new URL("../dist/.nojekyll", import.meta.url));
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  assert.ok(assets.some((name) => name.endsWith(".js")));
  assert.ok(assets.some((name) => name.endsWith(".css")));
});

test("contains no ChatGPT Sites or server runtime configuration", async () => {
  const [packageJson, viteConfig] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|openai\/sites/i);
  assert.doesNotMatch(viteConfig, /sites\(|cloudflare|worker/i);
  await assert.rejects(access(new URL("../.openai/hosting.json", import.meta.url)));
  await assert.rejects(access(new URL("../worker/index.ts", import.meta.url)));
});
