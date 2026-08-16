import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the Cockipedia application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Cockipedia[^<]*<\/title>/i);
  assert.match(html, /Opening Cockipedia/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships local persistence, editing, and safe rendering modules", async () => {
  const [database, parser, app, editor, packageJson] = await Promise.all([
    readFile(new URL("../lib/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/wiki.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/CockipediaApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(database, /indexedDB\.open/);
  assert.match(database, /articles.*revisions.*media.*settings/s);
  assert.match(parser, /escapeHtml/);
  assert.match(parser, /data-wiki-link/);
  assert.match(parser, /namedReferences/);
  assert.match(app, /What links here/);
  assert.match(editor, /Publish changes|Insert a table|Add a citation/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../public/favicon.svg", import.meta.url)));
});
