"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, MediaItem, Revision, WikiSettings } from "../lib/types";
import { createArticle, deleteRecord, getAll, normalizeTitle, putRecord, renameArticle, replaceProject, saveArticle, seedWiki } from "../lib/db";
import { parseWiki, sourceToPlainText } from "../lib/wiki";
import { Editor } from "./Editor";
import { Field, Modal } from "./Modal";
import { AllArticles, CategoryBrowser, HistoryView, ImportExportPage, MediaLibrary, PageHeader, SettingsPage, formatDate } from "./WikiPages";

type View = { kind: "article"; id: string } | { kind: "edit"; id: string; mode: "visual" | "source" } | { kind: "history"; id: string } | { kind: "all" | "recent" | "categories" | "templates" | "media" | "import" | "export" | "settings" | "search" | "backlinks" | "info"; value?: string };
type Dialog = { kind: "create"; title?: string } | { kind: "rename" | "delete"; article: Article } | { kind: "preview"; source: string; article: Article } | null;

const DEFAULT_SETTINGS: WikiSettings = { id: "appearance", theme: "light", textSize: "standard", width: "standard" };
const starterSources: Record<string, string> = {
  blank: "",
  biography: `{{Infobox\n|title=Person's name\n|Born=\n|Occupation=\n|Known for=\n}}\n'''Person's name''' is...\n\n== Early life ==\n\n== Career ==\n\n== References ==\n<references />\n\n[[Category:People]]`,
  topic: `'''Article topic''' is...\n\n== Background ==\n\n== History ==\n\n== Characteristics ==\n\n== See also ==\n* [[Related page]]\n\n== References ==\n<references />`,
  event: `{{Infobox\n|title=Event name\n|Date=\n|Location=\n|Participants=\n}}\nThe '''event name''' took place...\n\n== Background ==\n\n== Event ==\n\n== Aftermath ==\n\n== References ==\n<references />`,
};

export default function CockipediaApp() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [settings, setSettings] = useState<WikiSettings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<View | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [category, setCategory] = useState<string>();
  const [lastArticleId, setLastArticleId] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [nextArticles, nextRevisions, nextMedia, storedSettings] = await Promise.all([getAll<Article>("articles"), getAll<Revision>("revisions"), getAll<MediaItem>("media"), getAll<WikiSettings>("settings")]);
    setArticles(nextArticles); setRevisions(nextRevisions); setMedia(nextMedia); setSettings(storedSettings.find((item) => item.id === "appearance") ?? DEFAULT_SETTINGS);
    return nextArticles;
  }, []);

  useEffect(() => { (async () => { await seedWiki(); const nextArticles = await refresh(); const requested = decodeURIComponent(location.hash.replace(/^#\/wiki\//, "")); const article = nextArticles.find((item) => item.normalizedTitle === normalizeTitle(requested || "Cockipedia") && !item.trashedAt) ?? nextArticles.find((item) => !item.trashedAt); if (article) { setView({ kind: "article", id: article.id }); setLastArticleId(article.id); } setLoading(false); })().catch((error) => { console.error(error); setLoading(false); }); }, [refresh]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); } }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; document.documentElement.dataset.textSize = settings.textSize; document.documentElement.dataset.width = settings.width; }, [settings]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);

  const activeId = view && "id" in view ? view.id : view?.kind === "info" ? view.value : lastArticleId;
  const active = articles.find((article) => article.id === activeId);
  const liveArticles = articles.filter((article) => !article.trashedAt);
  const rendered = useMemo(() => active ? parseWiki(active.source, liveArticles, media) : null, [active, liveArticles, media]);
  const suggestions = useMemo(() => search.trim() ? liveArticles.filter((article) => `${article.title} ${article.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => (a.normalizedTitle === normalizeTitle(search) ? -1 : b.normalizedTitle === normalizeTitle(search) ? 1 : a.title.localeCompare(b.title))).slice(0, 6) : [], [liveArticles, search]);

  const announce = (message: string) => setToast(message);
  const openArticle = (target: Article | string, section?: string) => {
    const article = typeof target === "string" ? liveArticles.find((item) => item.normalizedTitle === normalizeTitle(target) || item.aliases.some((alias) => normalizeTitle(alias) === normalizeTitle(target))) : target;
    if (!article) { setDialog({ kind: "create", title: typeof target === "string" ? target : "" }); return; }
    if (article.redirectTo) { const redirectTitle = article.redirectTo; const destination = liveArticles.find((item) => item.normalizedTitle === normalizeTitle(redirectTitle)); if (destination) { setView({ kind: "article", id: destination.id }); history.pushState(null, "", `#/wiki/${encodeURIComponent(destination.title)}`); announce(`Redirected from ${article.title}`); return; } }
    setView({ kind: "article", id: article.id }); setLastArticleId(article.id); setToolsOpen(false); setNavOpen(false); history.pushState(null, "", `#/wiki/${encodeURIComponent(article.title)}`); document.title = `${article.title} - Cockipedia`;
    window.scrollTo({ top: 0 }); if (section) setTimeout(() => document.getElementById(section.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-"))?.scrollIntoView(), 80);
  };
  const go = (next: View) => { setView(next); setToolsOpen(false); setNavOpen(false); window.scrollTo({ top: 0 }); };
  const runSearch = () => { const exact = liveArticles.find((article) => article.normalizedTitle === normalizeTitle(search)); if (exact) openArticle(exact); else go({ kind: "search", value: search }); };

  const create = async (title: string, description: string, starter: string, mode: "visual" | "source") => {
    if (liveArticles.some((article) => article.normalizedTitle === normalizeTitle(title))) throw new Error("An article with this title already exists.");
    const article = await createArticle({ title, description, source: starterSources[starter] ?? "" }); await refresh(); setDialog(null); setView({ kind: "edit", id: article.id, mode }); announce("Article created. Start writing, then publish your changes.");
  };
  const save = async (article: Article, source: string, description: string, summary: string, minor: boolean) => { const parsed = parseWiki(source, articles, media); const updated = await saveArticle(article, source, description, summary, minor, parsed.categories); await refresh(); openArticle(updated); announce("Changes published locally."); };
  const duplicate = async (article: Article) => { let title = `${article.title} (copy)`; let index = 2; while (liveArticles.some((item) => item.normalizedTitle === normalizeTitle(title))) title = `${article.title} (copy ${index++})`; const copy = await createArticle({ title, description: article.description, source: article.source }, `Duplicated from ${article.title}`); await refresh(); openArticle(copy); announce("Article duplicated."); };
  const softDelete = async (article: Article) => { await putRecord("articles", { ...article, trashedAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }); await refresh(); setDialog(null); go({ kind: "all" }); announce("Article moved to Recently deleted."); };
  const saveSettings = async (value: WikiSettings) => { setSettings(value); await putRecord("settings", value); };
  const currentHistory = active ? revisions.filter((revision) => revision.articleId === active.id) : [];

  if (loading) return <div className="loading-page"><div className="brand-mark">C</div><b>Opening Cockipedia…</b></div>;
  if (!view) return <div className="loading-page"><p>No articles could be opened.</p><button onClick={() => setDialog({ kind: "create" })}>Create the first article</button></div>;

  return <div className="wiki-shell">
    <header className="topbar">
      <button className="icon-button" aria-label="Open main navigation" aria-expanded={navOpen} onClick={() => setNavOpen((value) => !value)}>☰</button>
      <button className="brand-button" onClick={() => openArticle("Cockipedia")} aria-label="Cockipedia main page"><span className="brand-mark">C</span><span className="wordmark"><strong>Cockipedia</strong><small>The personal encyclopedia</small></span></button>
      <div className="search-container"><div className="search"><span aria-hidden="true">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }} aria-label="Search Cockipedia" placeholder="Search Cockipedia" /><button onClick={runSearch}>Search</button></div>{search && <div className="suggestions">{suggestions.map((article) => <button key={article.id} onClick={() => { setSearch(""); openArticle(article); }}><b>{article.title}</b><span>{article.description || sourceToPlainText(article.source).slice(0, 80)}</span></button>)}{!suggestions.some((article) => article.normalizedTitle === normalizeTitle(search)) && <button className="new-suggestion" onClick={() => setDialog({ kind: "create", title: search })}><b>Create the page “{search}”</b><span>This title does not exist yet</span></button>}</div>}</div>
      <button className="top-link" onClick={() => setAppearanceOpen((value) => !value)}>◐ Appearance</button><button className="top-link backup-link" onClick={() => go({ kind: "export" })}>⇩ Backup</button>
    </header>

    <nav className={`main-menu ${navOpen ? "open" : ""}`} aria-label="Main navigation"><button onClick={() => openArticle("Cockipedia")}>Main page</button><button onClick={() => go({ kind: "all" })}>All articles</button><button onClick={() => { const options = liveArticles.filter((article) => !article.normalizedTitle.startsWith("template:")); if (options.length) openArticle(options[Math.floor(Math.random() * options.length)]); }}>Random article</button><button onClick={() => go({ kind: "categories" })}>Categories</button><button onClick={() => go({ kind: "templates" })}>Templates</button><button onClick={() => go({ kind: "media" })}>Media Library</button><hr /><button onClick={() => go({ kind: "recent" })}>Recently edited</button><button onClick={() => go({ kind: "import" })}>Import</button><button onClick={() => go({ kind: "export" })}>Export / backup</button><button onClick={() => go({ kind: "settings" })}>Settings</button><hr /><button className="primary menu-create" onClick={() => setDialog({ kind: "create" })}>＋ Create article</button></nav>

    <div className={`page-grid ${appearanceOpen ? "" : "no-appearance"}`}>
      <aside className="sidebar">{view.kind === "article" && rendered ? <><h2>Contents <button onClick={() => document.querySelector(".article-body")?.classList.toggle("toc-collapsed")}>hide</button></h2><nav aria-label="Article contents"><a className="active" href="#top">Beginning</a>{rendered.headings.map((heading) => <a key={heading.id} className={`toc-level-${heading.level}`} href={`#${heading.id}`}>{heading.text}</a>)}</nav></> : <><h2>Navigation</h2><nav><button onClick={() => openArticle("Cockipedia")}>Main page</button><button onClick={() => go({ kind: "all" })}>All articles</button><button onClick={() => go({ kind: "categories" })}>Categories</button><button onClick={() => go({ kind: "recent" })}>Recently edited</button></nav></>}</aside>

      <main className="article" id="top">
        {view.kind === "article" && active && rendered && <ArticleView article={active} rendered={rendered} currentHistory={currentHistory} toolsOpen={toolsOpen} setToolsOpen={setToolsOpen} onEdit={(mode) => go({ kind: "edit", id: active.id, mode })} onHistory={() => go({ kind: "history", id: active.id })} onLink={openArticle} onCategory={(value) => { setCategory(value); go({ kind: "categories" }); }} onCreate={() => setDialog({ kind: "create" })} onBacklinks={() => go({ kind: "backlinks", value: active.title })} onInfo={() => go({ kind: "info", value: active.id })} onExport={() => go({ kind: "export" })} onDuplicate={() => duplicate(active)} onRename={() => setDialog({ kind: "rename", article: active })} onDelete={() => setDialog({ kind: "delete", article: active })} />}
        {view.kind === "edit" && active && <Editor article={active} media={media} initialMode={view.mode} onCancel={() => openArticle(active)} onSave={(source, description, summary, minor) => save(active, source, description, summary, minor)} onPreview={(source) => setDialog({ kind: "preview", source, article: active })} />}
        {view.kind === "history" && active && <HistoryView article={active} revisions={revisions} onBack={() => openArticle(active)} onRestore={async (revision) => { if (!confirm(`Restore revision ${revision.number}? A new revision will preserve this restoration.`)) return; await save(active, revision.source, revision.description, `Restored revision ${revision.number}`, false); }} />}
        {view.kind === "all" && <AllArticles articles={articles} onOpen={openArticle} onCreate={() => setDialog({ kind: "create" })} onRename={(article) => setDialog({ kind: "rename", article })} onDuplicate={duplicate} onDelete={(article) => setDialog({ kind: "delete", article })} />}
        {view.kind === "recent" && <RecentPage articles={liveArticles} revisions={revisions} onOpen={openArticle} />}
        {view.kind === "categories" && <CategoryBrowser articles={articles} selectedCategory={category} onSelectCategory={setCategory} onOpen={openArticle} />}
        {view.kind === "templates" && <TemplatesPage articles={liveArticles} onOpen={openArticle} onCreate={() => setDialog({ kind: "create", title: "Template:" })} />}
        {view.kind === "media" && <MediaLibrary media={media} articles={liveArticles} onChanged={async () => { await refresh(); }} />}
        {(view.kind === "import" || view.kind === "export") && <ImportExportPage mode={view.kind} current={active ?? liveArticles.find((article) => article.normalizedTitle === normalizeTitle("Cockipedia"))} articles={liveArticles} media={media} onChanged={async () => { await refresh(); }} />}
        {view.kind === "settings" && <SettingsPage settings={settings} trash={articles.filter((article) => article.trashedAt)} onSettings={saveSettings} onRestore={async (article) => { await putRecord("articles", { ...article, trashedAt: undefined, modifiedAt: new Date().toISOString() }); await refresh(); announce("Article restored."); }} onRemove={async (article) => { if (!confirm(`Permanently delete “${article.title}” and its revision history? This cannot be undone.`)) return; for (const revision of revisions.filter((item) => item.articleId === article.id)) await deleteRecord("revisions", revision.id); await deleteRecord("articles", article.id); await refresh(); }} onClear={async () => { if (!confirm("Clear all Cockipedia data from this browser? Export a backup first. This cannot be undone.")) return; if (!confirm("Final confirmation: permanently clear every article, revision, image, and setting?")) return; await replaceProject({ format: "cockipedia-project", version: 1, exportedAt: new Date().toISOString(), articles: [], revisions: [], media: [], settings: [] }); await seedWiki(); await refresh(); setView(null); announce("Cockipedia was reset to its starter pages."); }} />}
        {view.kind === "search" && <SearchResults query={view.value ?? ""} articles={liveArticles} onOpen={openArticle} onCreate={() => setDialog({ kind: "create", title: view.value })} />}
        {view.kind === "backlinks" && <BacklinksPage title={view.value ?? ""} articles={liveArticles} onOpen={openArticle} />}
        {view.kind === "info" && active && <InfoPage article={active} rendered={rendered!} revisions={currentHistory} media={media} onBack={() => openArticle(active)} />}
      </main>

      {appearanceOpen && <aside className="appearance"><h2>Appearance <button onClick={() => setAppearanceOpen(false)}>hide</button></h2><div><b>Text</b>{(["small", "standard", "large"] as const).map((value) => <label key={value}><input type="radio" name="text" checked={settings.textSize === value} onChange={() => saveSettings({ ...settings, textSize: value })} /> {value[0].toUpperCase() + value.slice(1)}</label>)}</div><div><b>Width</b>{(["standard", "wide"] as const).map((value) => <label key={value}><input type="radio" name="width" checked={settings.width === value} onChange={() => saveSettings({ ...settings, width: value })} /> {value[0].toUpperCase() + value.slice(1)}</label>)}</div><div><b>Color</b>{(["light", "dark", "auto"] as const).map((value) => <label key={value}><input type="radio" name="color" checked={settings.theme === value} onChange={() => saveSettings({ ...settings, theme: value })} /> {value[0].toUpperCase() + value.slice(1)}</label>)}</div></aside>}
    </div>

    {dialog?.kind === "create" && <CreateDialog initialTitle={dialog.title} onClose={() => setDialog(null)} onCreate={create} />}
    {dialog?.kind === "rename" && <RenameDialog article={dialog.article} articles={liveArticles} onClose={() => setDialog(null)} onRename={async (title, redirect) => { const updated = await renameArticle(dialog.article, title, redirect); await refresh(); setDialog(null); openArticle(updated); announce("Page renamed."); }} />}
    {dialog?.kind === "delete" && <Modal title={`Delete “${dialog.article.title}”?`} onClose={() => setDialog(null)}><div className="warning-box"><b>The page will move to Recently deleted.</b><p>You can restore it from Settings. Existing links to this title will become red links.</p></div><div className="modal-actions"><button onClick={() => setDialog(null)}>Cancel</button><button className="danger" onClick={() => softDelete(dialog.article)}>Delete article</button></div></Modal>}
    {dialog?.kind === "preview" && <Modal title={`Preview: ${dialog.article.title}`} wide onClose={() => setDialog(null)}><div className="preview-banner">This preview is not saved.</div><div className="article-body preview-body" dangerouslySetInnerHTML={{ __html: parseWiki(dialog.source, liveArticles, media).html }} /><div className="modal-actions"><button className="primary" onClick={() => setDialog(null)}>Return to editing</button></div></Modal>}
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </div>;
}

function ArticleView({ article, rendered, currentHistory, toolsOpen, setToolsOpen, onEdit, onHistory, onLink, onCategory, onCreate, onBacklinks, onInfo, onExport, onDuplicate, onRename, onDelete }: { article: Article; rendered: ReturnType<typeof parseWiki>; currentHistory: Revision[]; toolsOpen: boolean; setToolsOpen: (value: boolean) => void; onEdit: (mode: "visual" | "source") => void; onHistory: () => void; onLink: (value: string, section?: string) => void; onCategory: (value: string) => void; onCreate: () => void; onBacklinks: () => void; onInfo: () => void; onExport: () => void; onDuplicate: () => void; onRename: () => void; onDelete: () => void }) {
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const body = articleRef.current;
    const onBodyClick = (event: MouseEvent) => {
      const element = event.target as HTMLElement;
      const sectionButton = element.closest<HTMLButtonElement>("button[data-edit-section]");
      if (sectionButton) { onEdit("visual"); return; }
      const header = element.closest<HTMLTableCellElement>("table.sortable th");
      if (header) {
        const table = header.closest("table"); const tableBody = table?.tBodies[0]; const row = header.parentElement;
        if (table && tableBody && row) { const index = [...row.children].indexOf(header); const direction = header.dataset.sortDirection === "asc" ? "desc" : "asc"; const rows = [...tableBody.rows].filter((item) => item !== row); rows.sort((a, b) => (a.cells[index]?.innerText ?? "").localeCompare(b.cells[index]?.innerText ?? "", undefined, { numeric: true }) * (direction === "asc" ? 1 : -1)); for (const item of rows) tableBody.appendChild(item); header.dataset.sortDirection = direction; }
        return;
      }
      const target = element.closest<HTMLAnchorElement>("a[data-wiki-link]"); if (!target) return; event.preventDefault(); onLink(target.dataset.wikiLink ?? "", target.dataset.wikiSection);
    };
    body?.addEventListener("click", onBodyClick);
    return () => body?.removeEventListener("click", onBodyClick);
  }, [onEdit, onLink]);
  return <><div className="article-kicker">From Cockipedia, your personal encyclopedia</div><div className="article-title-row"><div><h1>{article.title}</h1>{article.description && <p className="description">{article.description}</p>}</div><button className="create-button" onClick={onCreate}>＋ Create article</button></div><div className="tabs" role="tablist"><button className="selected" role="tab">Article</button><button role="tab" onClick={() => onEdit("visual")}>Edit</button><button role="tab" onClick={() => onEdit("source")}>Edit source</button><button role="tab" onClick={onHistory}>View history <span className="tab-count">{currentHistory.length}</span></button><div className="tools-wrap"><button role="tab" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>Tools ▾</button>{toolsOpen && <div className="tools-menu"><button onClick={onBacklinks}>What links here</button><button onClick={onInfo}>Page information</button><button onClick={() => { const citation = `${article.title}. Cockipedia. Revision ${currentHistory.length}. Retrieved ${new Date().toLocaleDateString()}.`; navigator.clipboard.writeText(citation); alert("Page citation copied to the clipboard."); }}>Cite this page</button><button onClick={onExport}>Export article</button><button onClick={() => window.print()}>Print</button><hr /><button onClick={onDuplicate}>Duplicate</button><button onClick={onRename}>Rename</button><button className="danger-text" onClick={onDelete}>Delete</button></div>}</div></div><article ref={articleRef} className="article-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />{rendered.categories.length > 0 && <div className="categories"><b>Categories:</b> {rendered.categories.map((category, index) => <span key={category}>{index > 0 && " · "}<button className="link-button" onClick={() => onCategory(category)}>{category}</button></span>)}</div>}<footer className="article-footer">This page was last edited on {formatDate(article.modifiedAt)}. Content is stored locally in this browser.</footer></>;
}

function CreateDialog({ initialTitle = "", onClose, onCreate }: { initialTitle?: string; onClose: () => void; onCreate: (title: string, description: string, starter: string, mode: "visual" | "source") => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle); const [description, setDescription] = useState(""); const [starter, setStarter] = useState("blank"); const [mode, setMode] = useState<"visual" | "source">("visual"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { if (!title.trim()) return; setBusy(true); try { await onCreate(title, description, starter, mode); } catch (reason) { setError(reason instanceof Error ? reason.message : "The article could not be created."); setBusy(false); } };
  return <Modal title="Create an article" onClose={onClose} wide><div className="create-layout"><div><Field label="Article title"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. History of electronic music" /></Field><Field label="Short description"><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional one-line description" /></Field><fieldset className="choice-group"><legend>Start with</legend>{[{ id: "blank", label: "Blank article", desc: "A clean page" }, { id: "topic", label: "General topic", desc: "Background, history, and references" }, { id: "biography", label: "Biography", desc: "Infobox and life sections" }, { id: "event", label: "Event", desc: "Infobox and timeline sections" }].map((choice) => <label key={choice.id} className={starter === choice.id ? "selected" : ""}><input type="radio" checked={starter === choice.id} onChange={() => setStarter(choice.id)} /><b>{choice.label}</b><span>{choice.desc}</span></label>)}</fieldset><fieldset className="inline-choice"><legend>Editing mode</legend><label><input type="radio" checked={mode === "visual"} onChange={() => setMode("visual")} /> Visual editor</label><label><input type="radio" checked={mode === "source"} onChange={() => setMode("source")} /> Source editor</label></fieldset>{error && <div className="error-box">{error}</div>}</div><aside><h3>Article title tips</h3><ul><li>Use the name readers would expect.</li><li>Sentence case usually works best.</li><li>Use a namespace for special pages, such as <code>Template:Person</code>.</li></ul><p>Titles are unique, but can be renamed later with an optional redirect.</p></aside></div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim() || busy} onClick={submit}>{busy ? "Creating…" : "Create article"}</button></div></Modal>;
}

function RenameDialog({ article, articles, onClose, onRename }: { article: Article; articles: Article[]; onClose: () => void; onRename: (title: string, redirect: boolean) => Promise<void> }) {
  const [title, setTitle] = useState(article.title); const [redirect, setRedirect] = useState(true); const duplicate = articles.some((item) => item.id !== article.id && item.normalizedTitle === normalizeTitle(title));
  return <Modal title="Rename page" onClose={onClose}><Field label="New title"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></Field><label className="check-row"><input type="checkbox" checked={redirect} onChange={(event) => setRedirect(event.target.checked)} /> Leave a redirect from “{article.title}”</label>{duplicate && <div className="error-box">That title is already in use.</div>}<div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim() || title === article.title || duplicate} onClick={() => onRename(title, redirect)}>Rename page</button></div></Modal>;
}

function RecentPage({ articles, revisions, onOpen }: { articles: Article[]; revisions: Revision[]; onOpen: (article: Article) => void }) {
  const recent = [...revisions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 60);
  return <div><PageHeader title="Recently edited" description="The latest saved changes across Cockipedia" /><div className="recent-list">{recent.map((revision) => { const article = articles.find((item) => item.id === revision.articleId); if (!article) return null; return <div key={revision.id}><span className="recent-time">{formatDate(revision.timestamp)}</span><button className="link-button" onClick={() => onOpen(article)}>{article.title}</button><span>— {revision.summary}</span><small>{revision.source.length.toLocaleString()} bytes · revision {revision.number}</small></div>; })}</div></div>;
}

function TemplatesPage({ articles, onOpen, onCreate }: { articles: Article[]; onOpen: (article: Article) => void; onCreate: () => void }) {
  const templates = articles.filter((article) => article.normalizedTitle.startsWith("template:"));
  return <div><PageHeader title="Templates" description="Reusable page fragments with named parameters" actions={<button className="primary" onClick={onCreate}>＋ Create template</button>} /><div className="notice"><span className="notice-icon">i</span><div>Use a template with <code>{"{{Template name|parameter=value}}"}</code>. In template source, read a value with <code>{"{{{parameter|default}}}"}</code>.</div></div><div className="alphabet-list">{templates.map((article) => <button key={article.id} onClick={() => onOpen(article)}><b>{article.title}</b><span>{article.description || "Reusable template"}</span></button>)}</div></div>;
}

function SearchResults({ query, articles, onOpen, onCreate }: { query: string; articles: Article[]; onOpen: (article: Article) => void; onCreate: () => void }) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean); const results = articles.map((article) => ({ article, score: (article.normalizedTitle === normalizeTitle(query) ? 100 : 0) + terms.reduce((score, term) => score + (article.normalizedTitle.includes(term) ? 20 : 0) + (article.description.toLocaleLowerCase().includes(term) ? 8 : 0) + (sourceToPlainText(article.source).toLocaleLowerCase().includes(term) ? 3 : 0) + (article.categories.join(" ").toLocaleLowerCase().includes(term) ? 4 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return <div><PageHeader title={`Search results for “${query}”`} description={`${results.length} matching page${results.length === 1 ? "" : "s"}`} />{results.map(({ article }) => <button className="search-result" key={article.id} onClick={() => onOpen(article)}><b>{article.title}</b><span>{article.description}</span><p>{sourceToPlainText(article.source).slice(0, 220)}…</p></button>)}{!articles.some((article) => article.normalizedTitle === normalizeTitle(query)) && <button className="create-search-result" onClick={onCreate}>Create the page “{query}”</button>}{!results.length && <div className="empty-state"><h2>No results found</h2><p>Try fewer words, check the spelling, or create this page.</p></div>}</div>;
}

function BacklinksPage({ title, articles, onOpen }: { title: string; articles: Article[]; onOpen: (article: Article) => void }) {
  const pattern = new RegExp(`\\[\\[${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[#|\\]])`, "i"); const backlinks = articles.filter((article) => pattern.test(article.source));
  return <div><PageHeader title="What links here" description={`Pages that link to “${title}”`} /><div className="alphabet-list">{backlinks.map((article) => <button key={article.id} onClick={() => onOpen(article)}><b>{article.title}</b><span>{article.description}</span></button>)}</div>{!backlinks.length && <div className="empty-state"><h2>No pages link here yet</h2><p>Add <code>[[{title}]]</code> to another article to create a backlink.</p></div>}</div>;
}

function InfoPage({ article, rendered, revisions, media, onBack }: { article: Article; rendered: ReturnType<typeof parseWiki>; revisions: Revision[]; media: MediaItem[]; onBack: () => void }) {
  const usedMedia = media.filter((item) => article.source.toLocaleLowerCase().includes(`file:${item.name.toLocaleLowerCase()}`));
  return <div><PageHeader title="Page information" description={article.title} /><button className="back-link" onClick={onBack}>← Return to article</button><table className="wikitable info-table"><tbody><tr><th>Page ID</th><td><code>{article.id}</code></td></tr><tr><th>Created</th><td>{formatDate(article.createdAt)}</td></tr><tr><th>Last modified</th><td>{formatDate(article.modifiedAt)}</td></tr><tr><th>Revision count</th><td>{revisions.length}</td></tr><tr><th>Page size</th><td>{article.source.length.toLocaleString()} bytes</td></tr><tr><th>Categories</th><td>{rendered.categories.join(", ") || "None"}</td></tr><tr><th>Outgoing links</th><td>{[...new Set(rendered.links)].join(", ") || "None"}</td></tr><tr><th>Templates used</th><td>{rendered.templatesUsed.join(", ") || "None"}</td></tr><tr><th>Media used</th><td>{usedMedia.map((item) => item.name).join(", ") || "None"}</td></tr><tr><th>References</th><td>{rendered.references.length}</td></tr></tbody></table></div>;
}
