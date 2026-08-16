import type { Article, MediaItem } from "./types";
import { normalizeTitle } from "./db";

export type Heading = { level: number; text: string; id: string };
export type RenderResult = { html: string; headings: Heading[]; categories: string[]; links: string[]; templatesUsed: string[]; references: string[] };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
const escapeAttr = escapeHtml;
const slug = (value: string) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "") || "section";

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function splitTemplate(raw: string) {
  const parts = raw.split("|");
  const name = parts.shift()?.trim() ?? "";
  const params: Record<string, string> = {};
  let positional = 1;
  for (const part of parts) {
    const equals = part.indexOf("=");
    if (equals > 0) params[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
    else params[String(positional++)] = part.trim();
  }
  return { name, params };
}

export function parseWiki(source: string, articles: Article[], media: MediaItem[]): RenderResult {
  const articleMap = new Map(articles.filter((item) => !item.trashedAt).map((item) => [item.normalizedTitle, item]));
  const templateMap = new Map(articles.filter((item) => item.normalizedTitle.startsWith("template:") && !item.trashedAt).map((item) => [item.normalizedTitle, item]));
  const mediaMap = new Map(media.map((item) => [item.name.toLocaleLowerCase(), item]));
  const headings: Heading[] = [];
  const categories: string[] = [];
  const links: string[] = [];
  const templatesUsed: string[] = [];
  const references: string[] = [];
  const namedReferences = new Map<string, number>();

  let working = source.replace(/<!--[\s\S]*?-->/g, "");
  working = working.replace(/<ref\s+name=["']([^"']+)["']\s*\/\s*>/gi, (_, name: string) => {
    return `@@REFNAME:${encodeURIComponent(name)}@@`;
  });
  working = working.replace(/<ref(?:\s+name=["']([^"']+)["'])?\s*>([\s\S]*?)<\/ref>/gi, (_, name: string | undefined, content: string) => {
    let number = name ? namedReferences.get(name) : undefined;
    if (!number) {
      references.push(content.trim());
      number = references.length;
      if (name) namedReferences.set(name, number);
    }
    return `@@REF:${number}@@`;
  });
  working = working.replace(/@@REFNAME:([^@]+)@@/g, (_, encodedName: string) => {
    const number = namedReferences.get(decodeURIComponent(encodedName));
    return number ? `@@REF:${number}@@` : "<sup class=\"reference error\">[?]</sup>";
  });
  working = working.replace(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi, (_, category: string) => { categories.push(category.trim()); return ""; });
  working = working.replace(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i, (_, title: string) => `<div class="redirect-page">Redirect to [[${title}]]</div>`);

  function inline(raw: string, depth = 0): string {
    if (depth > 4) return escapeHtml(raw);
    const tokens: string[] = [];
    const hold = (html: string) => { const index = tokens.push(html) - 1; return `@@HTML:${index}@@`; };
    let text = raw;

    text = text.replace(/@@REF:(\d+)@@/g, (_, value: string) => {
      const number = Number(value);
      return hold(`<sup class="reference"><a href="#ref-${number}" id="cite-${number}">[${number}]</a></sup>`);
    });
    text = text.replace(/\{\{([^{}]+)\}\}/g, (_, rawTemplate: string) => {
      const { name, params } = splitTemplate(rawTemplate);
      templatesUsed.push(name);
      const lower = name.toLocaleLowerCase();
      const template = templateMap.get(normalizeTitle(`Template:${name.replace(/^Template:/i, "")}`));
      if (template) {
        const expanded = template.source.replace(/\{\{\{([^{}|]+)(?:\|([^{}]*))?\}\}\}/g, (_match, key: string, fallback: string) => params[key.trim()] ?? fallback ?? "");
        return hold(`<span class="template transclusion" data-template="${escapeAttr(name)}">${inline(expanded, depth + 1)}</span>`);
      }
      if (lower === "code") return hold(`<code>${escapeHtml(params["1"] ?? "")}</code>`);
      if (lower === "hatnote") return hold(`<div class="hatnote">${inline(params["1"] ?? "", depth + 1)}</div>`);
      if (lower === "notice") return hold(`<div class="notice"><span class="notice-icon">i</span><div>${inline(params["1"] ?? "", depth + 1)}</div></div>`);
      if (lower === "quote") return hold(`<blockquote>${inline(params.text ?? params["1"] ?? "", depth + 1)}${params.author ? `<footer>— ${inline(params.author, depth + 1)}</footer>` : ""}</blockquote>`);
      if (lower === "infobox") {
        const reserved = new Set(["title", "subtitle", "image", "caption", "footer"]);
        const image = params.image ? mediaMap.get(params.image.toLocaleLowerCase()) : undefined;
        const rows = Object.entries(params).filter(([key]) => !reserved.has(key.toLocaleLowerCase())).map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${inline(value, depth + 1)}</td></tr>`).join("");
        return hold(`<aside class="infobox"><div class="infobox-title">${inline(params.title ?? "Infobox", depth + 1)}</div>${params.subtitle ? `<div class="infobox-subtitle">${inline(params.subtitle, depth + 1)}</div>` : ""}${image ? `<img src="${escapeAttr(image.dataUrl)}" alt="${escapeAttr(image.alt)}" />` : ""}${params.caption ? `<div class="infobox-caption">${inline(params.caption, depth + 1)}</div>` : ""}<table><tbody>${rows}</tbody></table>${params.footer ? `<div class="infobox-footer">${inline(params.footer, depth + 1)}</div>` : ""}</aside>`);
      }
      return hold(`<span class="template-missing" title="Template not found">${escapeHtml(`{{${name}}}`)}</span>`);
    });
    text = text.replace(/\[\[(?:File|Image):([^\]|]+)((?:\|[^\]]*)*)\]\]/gi, (_, name: string, optionsRaw: string) => {
      const options = optionsRaw.split("|").map((item) => item.trim()).filter(Boolean);
      const item = mediaMap.get(name.trim().toLocaleLowerCase());
      if (!item) return hold(`<span class="media-missing">Missing file: ${escapeHtml(name.trim())}</span>`);
      const alignment = options.find((option) => ["left", "right", "center"].includes(option)) ?? "right";
      const width = Math.min(1200, Math.max(80, Number(options.find((option) => /^\d+px$/.test(option))?.replace("px", "")) || 260));
      const caption = options.find((option) => !["thumb", "thumbnail", "frame", "border", "left", "right", "center"].includes(option) && !/^\d+px$/.test(option) && !option.startsWith("alt=")) ?? "";
      const alt = options.find((option) => option.startsWith("alt="))?.slice(4) || item.alt || caption;
      return hold(`<figure class="wiki-image ${escapeAttr(alignment)}" style="max-width:${width}px"><img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(alt)}" />${caption ? `<figcaption>${inline(caption, depth + 1)}</figcaption>` : ""}</figure>`);
    });
    text = text.replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, title: string, section: string | undefined, label: string | undefined) => {
      const cleanTitle = title.trim();
      links.push(cleanTitle);
      const exists = articleMap.has(normalizeTitle(cleanTitle));
      const display = label?.trim() || cleanTitle;
      return hold(`<a href="#" data-wiki-link="${escapeAttr(cleanTitle)}"${section ? ` data-wiki-section="${escapeAttr(section)}"` : ""} class="internal-link${exists ? "" : " new"}">${escapeHtml(display)}</a>`);
    });
    text = text.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g, (_, url: string, label: string | undefined) => {
      const safe = safeUrl(url);
      return safe ? hold(`<a class="external-link" href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || safe)}</a>`) : escapeHtml(label || url);
    });
    text = escapeHtml(text);
    text = text.replace(/(?:&#039;){5}(.+?)(?:&#039;){5}/g, "<b><i>$1</i></b>")
      .replace(/(?:&#039;){3}(.+?)(?:&#039;){3}/g, "<b>$1</b>")
      .replace(/(?:&#039;){2}(.+?)(?:&#039;){2}/g, "<i>$1</i>");
    text = text.replace(/@@HTML:(\d+)@@/g, (_, index: string) => tokens[Number(index)] ?? "");
    return text;
  }

  working = working.replace(/<gallery>([\s\S]*?)<\/gallery>/gi, (_, content: string) => {
    const figures = content.split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, caption = ""] = line.replace(/^(?:File|Image):/i, "").split("|");
      const item = mediaMap.get(name.trim().toLocaleLowerCase());
      return item ? `<figure><img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.alt || caption)}"><figcaption>${inline(caption)}</figcaption></figure>` : "";
    }).join("");
    return `<div class="gallery">${figures}</div>`;
  });
  working = working.replace(/<math>([\s\S]*?)<\/math>/gi, (_, math: string) => `<span class="math" aria-label="Mathematical expression">${escapeHtml(math)}</span>`);
  working = working.replace(/<(?:syntaxhighlight|pre)(?:\s+lang=["']?([^"'> ]+)["']?)?>([\s\S]*?)<\/(?:syntaxhighlight|pre)>/gi, (_, lang: string, code: string) => `<pre data-language="${escapeAttr(lang || "text")}"><code>${escapeHtml(code.trim())}</code></pre>`);

  const lines = working.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | "dl" | null = null;
  let inTable = false;
  let tableRows: string[] = [];
  let tableCaption = "";
  let sortable = false;

  const flushParagraph = () => { if (paragraph.length) { html.push(`<p>${inline(paragraph.join(" "))}</p>`); paragraph = []; } };
  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
  const flushTable = () => {
    if (!inTable) return;
    html.push(`<div class="table-scroll"><table class="wikitable${sortable ? " sortable" : ""}">${tableCaption ? `<caption>${inline(tableCaption)}</caption>` : ""}<tbody>${tableRows.join("")}</tbody></table></div>`);
    inTable = false; tableRows = []; tableCaption = ""; sortable = false;
  };

  for (const line of lines) {
    const heading = line.match(/^(={2,6})\s*(.*?)\s*\1$/);
    if (heading) {
      flushParagraph(); closeList(); flushTable();
      const level = heading[1].length;
      const plainText = heading[2].replace(/'{2,5}/g, "").trim();
      const id = slug(plainText);
      headings.push({ level, text: plainText, id });
      html.push(`<h${level} id="${escapeAttr(id)}">${inline(heading[2])}<button class="section-edit" data-edit-section="${escapeAttr(plainText)}">[ edit ]</button></h${level}>`);
      continue;
    }
    if (/^\{\|/.test(line)) { flushParagraph(); closeList(); inTable = true; sortable = /sortable/.test(line); continue; }
    if (inTable) {
      if (/^\|\}/.test(line)) { flushTable(); continue; }
      if (/^\|\+/.test(line)) { tableCaption = line.slice(2).trim(); continue; }
      if (/^\|-/.test(line)) continue;
      if (/^!/.test(line)) { tableRows.push(`<tr>${line.slice(1).split("!!").map((cell) => `<th>${inline(cell.trim())}</th>`).join("")}</tr>`); continue; }
      if (/^\|/.test(line)) { tableRows.push(`<tr>${line.slice(1).split("||").map((cell) => `<td>${inline(cell.trim())}</td>`).join("")}</tr>`); continue; }
    }
    const list = line.match(/^([*#;:]+)\s*(.*)$/);
    if (list) {
      flushParagraph();
      const desired: "ul" | "ol" | "dl" = list[1][0] === "*" ? "ul" : list[1][0] === "#" ? "ol" : "dl";
      if (listType !== desired) { closeList(); listType = desired; html.push(`<${desired}>`); }
      const tag = desired === "dl" ? (list[1][0] === ";" ? "dt" : "dd") : "li";
      html.push(`<${tag} class="list-depth-${Math.min(4, list[1].length)}">${inline(list[2])}</${tag}>`);
      continue;
    }
    if (/^-{4,}$/.test(line.trim())) { flushParagraph(); closeList(); html.push("<hr>"); continue; }
    if (/^<references\s*\/\s*>$/i.test(line.trim())) { flushParagraph(); closeList(); html.push("<references />"); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (/^<(div class="(?:gallery|redirect-page)|span class="math"|pre\b)/.test(line)) { flushParagraph(); closeList(); html.push(line); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList(); flushTable();
  const referencesPlaceholder = /<references\s*\/\s*>/i;
  let rendered = html.join("\n");
  const referencesHtml = references.length ? `<ol class="references">${references.map((reference, index) => `<li id="ref-${index + 1}">${inline(reference)} <a href="#cite-${index + 1}" aria-label="Back to citation">↑</a></li>`).join("")}</ol>` : "<p class=\"muted\">No references have been added.</p>";
  rendered = rendered.replace(referencesPlaceholder, referencesHtml);
  if (references.length && !rendered.includes('class="references"')) rendered += `<h2 id="references">References</h2>${referencesHtml}`;
  return { html: rendered, headings, categories: [...new Set(categories)], links, templatesUsed: [...new Set(templatesUsed)], references };
}

export function sourceToPlainText(source: string) {
  return source.replace(/<ref[\s\S]*?<\/ref>/gi, " ").replace(/\{\{[^{}]+\}\}/g, " ").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1").replace(/'{2,5}/g, "").replace(/[=*#|{}<>]/g, " ").replace(/\s+/g, " ").trim();
}

export function sourceToVisualHtml(source: string) {
  return source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^====\s*(.*?)\s*====$/gm, "<h4>$1</h4>").replace(/^===\s*(.*?)\s*===$/gm, "<h3>$1</h3>").replace(/^==\s*(.*?)\s*==$/gm, "<h2>$1</h2>")
    .replace(/'''(.*?)'''/g, "<strong>$1</strong>").replace(/''(.*?)''/g, "<em>$1</em>")
    .replace(/\n\n+/g, "</p><p>").replace(/^/, "<p>").replace(/$/, "</p>");
}

export function visualHtmlToSource(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const content = Array.from(node.childNodes).map(walk).join("");
    const tag = node.tagName.toLocaleLowerCase();
    if (tag === "strong" || tag === "b") return `'''${content}'''`;
    if (tag === "em" || tag === "i") return `''${content}''`;
    if (tag === "h1" || tag === "h2") return `\n== ${content} ==\n`;
    if (tag === "h3") return `\n=== ${content} ===\n`;
    if (tag === "h4") return `\n==== ${content} ====\n`;
    if (tag === "blockquote") return `\n{{Quote|${content}}}\n`;
    if (tag === "code") return `{{Code|${content}}}`;
    if (tag === "li") return `\n* ${content}`;
    if (tag === "a") return node.getAttribute("href")?.startsWith("http") ? `[${node.getAttribute("href")} ${content}]` : `[[${content}]]`;
    if (["p", "div"].includes(tag)) return `${content}\n\n`;
    if (tag === "br") return "\n";
    return content;
  };
  return Array.from(doc.body.childNodes).map(walk).join("").replace(/\n{3,}/g, "\n\n").trim();
}
