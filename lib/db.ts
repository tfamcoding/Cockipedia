import type { Article, MediaItem, Revision, WikiProject, WikiSettings } from "./types";

const DB_NAME = "cockipedia";
const DB_VERSION = 3;

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeTitle(title: string) {
  return title.trim().replace(/_/g, " ").replace(/\s+/g, " ").toLocaleLowerCase();
}

function extractCategories(source: string) {
  return [...source.matchAll(/\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi)].map((match) => match[1].trim()).filter((value, index, values) => values.indexOf(value) === index);
}

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openWikiDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("articles")) {
        const store = db.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("normalizedTitle", "normalizedTitle", { unique: true });
        store.createIndex("modifiedAt", "modifiedAt");
      }
      if (!db.objectStoreNames.contains("revisions")) {
        const store = db.createObjectStore("revisions", { keyPath: "id" });
        store.createIndex("articleId", "articleId");
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("media")) {
        const store = db.createObjectStore("media", { keyPath: "id" });
        store.createIndex("name", "name", { unique: true });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openWikiDB();
  return request(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function putRecord<T>(storeName: string, value: T) {
  const db = await openWikiDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await transactionDone(tx);
}

export async function deleteRecord(storeName: string, key: IDBValidKey) {
  const db = await openWikiDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
}

export async function createArticle(input: { title: string; description?: string; source?: string }, summary = "Created page") {
  const now = new Date().toISOString();
  const article: Article = {
    id: uid("page"), title: input.title.trim(), normalizedTitle: normalizeTitle(input.title),
    description: input.description?.trim() ?? "", source: input.source ?? "", createdAt: now,
    modifiedAt: now, categories: extractCategories(input.source ?? ""), aliases: [],
  };
  const revision: Revision = {
    id: uid("rev"), articleId: article.id, number: 1, title: article.title,
    description: article.description, source: article.source, timestamp: now, summary, minor: false,
  };
  const db = await openWikiDB();
  const tx = db.transaction(["articles", "revisions"], "readwrite");
  tx.objectStore("articles").add(article);
  tx.objectStore("revisions").add(revision);
  await transactionDone(tx);
  return article;
}

export async function saveArticle(article: Article, source: string, description: string, summary: string, minor: boolean, categories: string[]) {
  const revisions = (await getAll<Revision>("revisions")).filter((revision) => revision.articleId === article.id);
  const now = new Date().toISOString();
  const updated: Article = { ...article, source, description, categories, modifiedAt: now, redirectTo: undefined };
  const revision: Revision = {
    id: uid("rev"), articleId: article.id, number: Math.max(0, ...revisions.map((item) => item.number)) + 1,
    title: updated.title, description, source, timestamp: now, summary: summary || "Updated page", minor,
  };
  const db = await openWikiDB();
  const tx = db.transaction(["articles", "revisions"], "readwrite");
  tx.objectStore("articles").put(updated);
  tx.objectStore("revisions").add(revision);
  await transactionDone(tx);
  return updated;
}

export async function renameArticle(article: Article, title: string, createRedirect: boolean) {
  const oldTitle = article.title;
  const now = new Date().toISOString();
  const revisions = (await getAll<Revision>("revisions")).filter((revision) => revision.articleId === article.id);
  const updated = { ...article, title: title.trim(), normalizedTitle: normalizeTitle(title), modifiedAt: now };
  const db = await openWikiDB();
  const tx = db.transaction(["articles", "revisions"], "readwrite");
  tx.objectStore("articles").put(updated);
  tx.objectStore("revisions").add({ id: uid("rev"), articleId: article.id, number: Math.max(0, ...revisions.map((item) => item.number)) + 1, title: updated.title, description: updated.description, source: updated.source, timestamp: now, summary: `Renamed from ${oldTitle}`, minor: false } satisfies Revision);
  if (createRedirect) {
    const redirect: Article = { id: uid("page"), title: oldTitle, normalizedTitle: normalizeTitle(oldTitle), description: `Redirect to ${updated.title}`, source: `#REDIRECT [[${updated.title}]]`, createdAt: now, modifiedAt: now, categories: [], aliases: [], redirectTo: updated.title };
    tx.objectStore("articles").add(redirect);
    tx.objectStore("revisions").add({ id: uid("rev"), articleId: redirect.id, number: 1, title: redirect.title, description: redirect.description, source: redirect.source, timestamp: now, summary: `Created redirect to ${updated.title}`, minor: false } satisfies Revision);
  }
  await transactionDone(tx);
  return updated;
}

export async function exportProject(): Promise<WikiProject> {
  return {
    format: "cockipedia-project", version: 1, exportedAt: new Date().toISOString(),
    articles: await getAll<Article>("articles"), revisions: await getAll<Revision>("revisions"),
    media: await getAll<MediaItem>("media"), settings: await getAll<WikiSettings>("settings"),
  };
}

export function validateProject(value: unknown): value is WikiProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<WikiProject>;
  const validArticle = (article: unknown) => !!article && typeof article === "object" && typeof (article as Article).id === "string" && typeof (article as Article).title === "string" && typeof (article as Article).source === "string";
  const validRevision = (revision: unknown) => !!revision && typeof revision === "object" && typeof (revision as Revision).id === "string" && typeof (revision as Revision).articleId === "string" && typeof (revision as Revision).source === "string";
  const validMedia = (item: unknown) => !!item && typeof item === "object" && typeof (item as MediaItem).id === "string" && typeof (item as MediaItem).name === "string" && typeof (item as MediaItem).dataUrl === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test((item as MediaItem).dataUrl);
  return project.format === "cockipedia-project" && project.version === 1 && Array.isArray(project.articles) && project.articles.every(validArticle) && Array.isArray(project.revisions) && project.revisions.every(validRevision) && Array.isArray(project.media) && project.media.every(validMedia);
}

export async function importProject(project: WikiProject, strategy: "overwrite" | "keep" | "copy") {
  const db = await openWikiDB();
  const existing = await getAll<Article>("articles");
  const existingMedia = await getAll<MediaItem>("media");
  const existingTitles = new Set(existing.map((article) => article.normalizedTitle));
  const existingIds = new Set(existing.map((article) => article.id));
  const backup = await exportProject();
  const tx = db.transaction(["articles", "revisions", "media", "settings", "snapshots"], "readwrite");
  tx.objectStore("snapshots").put({ id: uid("snapshot"), createdAt: new Date().toISOString(), reason: "Before import", project: backup });
  const articleIds = new Map<string, string | null>();
  for (const incoming of project.articles) {
    const duplicate = existing.find((article) => article.normalizedTitle === incoming.normalizedTitle);
    if (duplicate && strategy === "keep") { articleIds.set(incoming.id, null); continue; }
    if (duplicate && strategy === "overwrite") tx.objectStore("articles").delete(duplicate.id);
    const needsCopy = strategy === "copy" && existingTitles.has(incoming.normalizedTitle);
    const needsNewId = needsCopy || (existingIds.has(incoming.id) && duplicate?.id !== incoming.id);
    const copiedTitle = needsCopy ? `${incoming.title} (imported copy)` : incoming.title;
    const article = { ...incoming, id: needsNewId ? uid("page") : incoming.id, title: copiedTitle, normalizedTitle: normalizeTitle(copiedTitle), categories: extractCategories(incoming.source) };
    articleIds.set(incoming.id, article.id);
    tx.objectStore("articles").put(article);
  }
  for (const revision of project.revisions) {
    const mappedId = articleIds.get(revision.articleId);
    if (!mappedId) continue;
    const copied = mappedId !== revision.articleId;
    tx.objectStore("revisions").put({ ...revision, id: copied ? uid("rev") : revision.id, articleId: mappedId });
  }
  const existingMediaNames = new Set(existingMedia.map((item) => item.name.toLocaleLowerCase()));
  for (const media of project.media) if (!existingMediaNames.has(media.name.toLocaleLowerCase())) tx.objectStore("media").put(media);
  for (const setting of project.settings ?? []) tx.objectStore("settings").put(setting);
  await transactionDone(tx);
}

export async function replaceProject(project: WikiProject) {
  const db = await openWikiDB();
  const tx = db.transaction(["articles", "revisions", "media", "settings"], "readwrite");
  for (const name of ["articles", "revisions", "media", "settings"]) tx.objectStore(name).clear();
  for (const article of project.articles) tx.objectStore("articles").put(article);
  for (const revision of project.revisions) tx.objectStore("revisions").put(revision);
  for (const media of project.media) tx.objectStore("media").put(media);
  for (const setting of project.settings ?? []) tx.objectStore("settings").put(setting);
  await transactionDone(tx);
}

export async function seedWiki() {
  const articles = await getAll<Article>("articles");
  if (articles.length) {
    for (const article of articles) {
      const categories = extractCategories(article.source);
      const migratedTemplate = article.normalizedTitle === "template:quote" && article.source.includes("template-quote")
        ? `''“{{{text|Quotation}}}”'' — {{{author|Unknown}}}`
        : article.source;
      if (categories.join("\u0000") !== article.categories.join("\u0000") || migratedTemplate !== article.source) await putRecord("articles", { ...article, source: migratedTemplate, categories, modifiedAt: migratedTemplate !== article.source ? new Date().toISOString() : article.modifiedAt });
    }
    return;
  }
  await createArticle({
    title: "Cockipedia", description: "A private, interconnected encyclopedia that lives in your browser",
    source: `{{Infobox\n|title=Cockipedia\n|subtitle=The personal encyclopedia\n|Type=Offline wiki\n|Storage=IndexedDB\n|Status=Ready to edit\n}}\n'''Cockipedia''' is a personal encyclopedia for creating, organizing, and connecting knowledge. Articles are saved locally on this device and can be exported whenever you choose.\n\n{{Notice|Welcome to your wiki. Start a new article, edit this page, or explore [[Getting started]].}}\n\n== Getting started ==\nUse the '''Create article''' button to begin with a blank page. You can write visually, switch to source editing, insert citations, and link to other pages in your encyclopedia.<ref name="storage">Cockipedia stores its primary database in your browser using IndexedDB.</ref>\n\n== Your personal wiki ==\nUnlike a public wiki, Cockipedia keeps your work under your control. The built-in library tracks revisions, categories, templates, media, and [[Special:Backlinks|backlinks]].\n\n{| class="wikitable sortable"\n|+ Included authoring tools\n! Feature !! Purpose\n|-\n| Visual editor || Write and format without markup\n|-\n| Source editor || Edit familiar wikitext directly\n|-\n| Revision history || Compare or restore earlier versions\n|}\n\n== References ==\n<references />\n\n[[Category:Personal knowledge]]\n[[Category:Encyclopedias]]`,
  });
  await createArticle({ title: "Getting started", description: "A short guide to writing your first Cockipedia article", source: `{{Hatnote|For a tour of the interface, return to [[Cockipedia]].}}\n'''Getting started''' is easy: create a page, write an introduction, add a heading, then publish your changes.\n\n== Create a page ==\nChoose '''Create article''' in the navigation. Titles work like wiki page titles, including namespaces such as {{Code|Template:Example}}.\n\n== Connect your knowledge ==\nSelect text in the visual editor and choose '''Link''', or type {{Code|[[Cockipedia]]}} in source mode. Missing pages appear as red links.\n\n== Keep your work safe ==\nUse [[Cockipedia:Backups]] to export a complete project file.\n\n[[Category:Help]]` });
  await createArticle({ title: "Cockipedia:Backups", description: "Exporting and restoring your personal encyclopedia", source: `'''Backups''' protect your work and make it portable. Open '''Export''' and choose '''Export backup''' to download articles, revisions, media, and preferences in one {{Code|.cockipedia}} file.\n\n== Restoring ==\nOpen '''Import''', select the backup, validate its contents, and choose how duplicate titles should be handled. Cockipedia creates a local safety snapshot before a large import.\n\n[[Category:Help]]` });
  await createArticle({ title: "Template:Quote", description: "Reusable quotation template", source: `''“{{{text|Quotation}}}”'' — {{{author|Unknown}}}` });
}

export { uid };
