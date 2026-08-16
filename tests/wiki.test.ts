import assert from "node:assert/strict";
import test from "node:test";
import type { Article } from "../lib/types";
import { parseWiki } from "../lib/wiki";

const now = new Date(0).toISOString();
const page = (title: string, source = ""): Article => ({ id: title, title, normalizedTitle: title.toLocaleLowerCase(), description: "", source, createdAt: now, modifiedAt: now, categories: [], aliases: [] });

test("renders formatting and distinguishes existing and missing wiki links", () => {
  const rendered = parseWiki("'''Bold''' and ''italic'' with [[Existing]] and [[Missing page]].", [page("Existing")], []);
  assert.match(rendered.html, /<b>Bold<\/b>/);
  assert.match(rendered.html, /<i>italic<\/i>/);
  assert.match(rendered.html, /data-wiki-link="Existing" class="internal-link"/);
  assert.match(rendered.html, /data-wiki-link="Missing page" class="internal-link new"/);
});

test("numbers named references once and reuses the marker", () => {
  const rendered = parseWiki("Claim.<ref name=\"source\">Reference text</ref> Repeated.<ref name=\"source\" />\n\n<references />", [], []);
  assert.equal(rendered.references.length, 1);
  assert.equal((rendered.html.match(/href="#ref-1"/g) ?? []).length, 2);
  assert.match(rendered.html, /Reference text/);
});

test("expands a reusable local template with parameters", () => {
  const template = page("Template:Label", "'''{{{name|Unknown}}}''' — {{{value|None}}}");
  const rendered = parseWiki("{{Label|name=Field|value=Answer}}", [template], []);
  assert.match(rendered.html, /<b>Field<\/b> — Answer/);
  assert.deepEqual(rendered.templatesUsed, ["Label"]);
});

test("escapes imported HTML instead of executing it", () => {
  const rendered = parseWiki("<script>alert('unsafe')</script><img src=x onerror=alert(1)>", [], []);
  assert.doesNotMatch(rendered.html, /<script|<img/i);
  assert.match(rendered.html, /&lt;script&gt;/);
});
