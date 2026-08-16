"use client";

import { useEffect, useRef, useState } from "react";
import type { Article, MediaItem } from "../lib/types";
import { sourceToVisualHtml, visualHtmlToSource } from "../lib/wiki";
import { Field, Modal } from "./Modal";

type InsertKind = "link" | "citation" | "image" | "table" | "infobox" | "template" | "special" | null;

export function Editor({ article, media, initialMode, onSave, onCancel, onPreview }: {
  article: Article; media: MediaItem[]; initialMode: "visual" | "source";
  onSave: (source: string, description: string, summary: string, minor: boolean) => Promise<void>;
  onCancel: () => void; onPreview: (source: string) => void;
}) {
  const [mode, setMode] = useState<"visual" | "source">(initialMode);
  const [source, setSource] = useState(article.source);
  const [description, setDescription] = useState(article.description);
  const [dirty, setDirty] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [insert, setInsert] = useState<InsertKind>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [minor, setMinor] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const switchMode = (next: "visual" | "source") => {
    if (next === "source" && visualRef.current) setSource(visualHtmlToSource(visualRef.current.innerHTML));
    setMode(next);
    requestAnimationFrame(() => { if (next === "visual" && visualRef.current) visualRef.current.innerHTML = sourceToVisualHtml(source); });
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    visualRef.current?.focus();
    if (visualRef.current) setSource(visualHtmlToSource(visualRef.current.innerHTML));
    setDirty(true);
  };

  const insertSource = (text: string) => {
    const textarea = sourceRef.current;
    if (mode === "source" && textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setSource(source.slice(0, start) + text + source.slice(end));
      requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(start + text.length, start + text.length); });
    } else {
      setSource(`${visualHtmlToSource(visualRef.current?.innerHTML ?? "")}\n\n${text}`.trim());
      setMode("source");
    }
    setDirty(true);
    setInsert(null);
  };

  const cancel = () => {
    if (!dirty || confirm("Discard your unsaved changes?")) onCancel();
  };

  const publish = async () => {
    const finalSource = mode === "visual" && visualRef.current ? visualHtmlToSource(visualRef.current.innerHTML) : source;
    await onSave(finalSource, description, summary, minor);
    setDirty(false);
    setSaveOpen(false);
  };

  return (
    <div className="editor-page">
      <div className="editor-heading"><div><div className="article-kicker">Editing Cockipedia</div><h1>{article.title}</h1></div><div className="editor-mode-tabs"><button className={mode === "visual" ? "selected" : ""} onClick={() => switchMode("visual")}>Visual</button><button className={mode === "source" ? "selected" : ""} onClick={() => switchMode("source")}>Source</button></div></div>
      <Field label="Short description"><input value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} placeholder="A brief description of this page" /></Field>
      <div className="editor-toolbar" role="toolbar" aria-label="Article formatting">
        {mode === "visual" && <>
          <select aria-label="Paragraph style" defaultValue="p" onChange={(event) => exec("formatBlock", event.target.value)}><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="h4">Heading 4</option><option value="pre">Preformatted</option></select>
          <button title="Bold (Ctrl+B)" onClick={() => exec("bold")}><b>B</b></button><button title="Italic (Ctrl+I)" onClick={() => exec("italic")}><i>I</i></button>
          <button title="Strikethrough" onClick={() => exec("strikeThrough")}><s>S</s></button><button title="Superscript" onClick={() => exec("superscript")}>x²</button><button title="Subscript" onClick={() => exec("subscript")}>x₂</button>
          <button title="Bulleted list" onClick={() => exec("insertUnorderedList")}>• List</button><button title="Numbered list" onClick={() => exec("insertOrderedList")}>1. List</button>
          <button title="Indent" onClick={() => exec("indent")}>→</button><button title="Outdent" onClick={() => exec("outdent")}>←</button><button title="Block quote" onClick={() => exec("formatBlock", "blockquote")}>❝</button><button title="Clear formatting" onClick={() => exec("removeFormat")}>Clear</button>
        </>}
        <div className="toolbar-separator" />
        <button onClick={() => setInsert("link")}>🔗 Link</button><button onClick={() => setInsert("citation")}>Cite</button><button onClick={() => setInsert("image")}>Image</button><button onClick={() => setInsert("table")}>Table</button><button onClick={() => setInsert("infobox")}>Infobox</button><button onClick={() => setInsert("template")}>Template</button><button onClick={() => setInsert("special")}>Ω</button>
        {mode === "source" && <><div className="toolbar-separator" /><button onClick={() => setFindOpen((value) => !value)}>Find / replace</button><button onClick={() => { setSource(article.source); setDirty(false); }}>Undo all</button></>}
      </div>
      {findOpen && <div className="findbar"><input aria-label="Find" value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find" /><input aria-label="Replace" value={replace} onChange={(event) => setReplace(event.target.value)} placeholder="Replace with" /><button onClick={() => { if (find) { setSource(source.replace(find, replace)); setDirty(true); } }}>Replace</button><button onClick={() => { if (find) { setSource(source.split(find).join(replace)); setDirty(true); } }}>Replace all</button></div>}
      {mode === "visual" ? <div className="visual-editor" ref={visualRef} contentEditable suppressContentEditableWarning onInput={() => { if (visualRef.current) setSource(visualHtmlToSource(visualRef.current.innerHTML)); setDirty(true); }} dangerouslySetInnerHTML={{ __html: sourceToVisualHtml(source) }} aria-label="Visual article editor" />
        : <div className="source-editor-wrap"><div className="line-gutter" aria-hidden="true">{source.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea ref={sourceRef} className="source-editor" value={source} onChange={(event) => { setSource(event.target.value); setDirty(true); }} spellCheck aria-label="Wikitext source editor" /></div>}
      <div className="editor-status"><span>{dirty ? "Unsaved changes" : "No unsaved changes"}</span><span>{source.length.toLocaleString()} characters</span></div>
      <div className="editor-actions"><button className="primary" onClick={() => setSaveOpen(true)}>Publish changes…</button><button onClick={() => onPreview(mode === "visual" && visualRef.current ? visualHtmlToSource(visualRef.current.innerHTML) : source)}>Preview</button><button onClick={cancel}>Cancel</button></div>

      {saveOpen && <Modal title="Publish changes" onClose={() => setSaveOpen(false)}><p>Your change will be saved locally as a new revision.</p><Field label="Edit summary"><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Briefly describe what you changed" /></Field><label className="check-row"><input type="checkbox" checked={minor} onChange={(event) => setMinor(event.target.checked)} /> This is a minor edit</label><div className="modal-actions"><button onClick={() => setSaveOpen(false)}>Continue editing</button><button className="primary" onClick={publish}>Publish changes</button></div></Modal>}
      {insert === "link" && <LinkDialog onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "citation" && <CitationDialog onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "image" && <ImageDialog media={media} onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "table" && <TableDialog onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "infobox" && <InfoboxDialog onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "template" && <TemplateDialog onInsert={insertSource} onClose={() => setInsert(null)} />}
      {insert === "special" && <Modal title="Insert a special character" onClose={() => setInsert(null)}><div className="special-grid">{"ÀÁÄÆÇÈÉÊËÍÑÓÖØÚÜßαβγδεθλμπσφψω≤≥±×÷→←©®™°".split("").map((character) => <button key={character} onClick={() => insertSource(character)}>{character}</button>)}</div></Modal>}
    </div>
  );
}

function LinkDialog({ onInsert, onClose }: { onInsert: (value: string) => void; onClose: () => void }) {
  const [target, setTarget] = useState(""); const [label, setLabel] = useState("");
  return <Modal title="Insert a link" onClose={onClose}><Field label="Page title or URL"><input autoFocus value={target} onChange={(event) => setTarget(event.target.value)} placeholder="History of music or https://example.com" /></Field><Field label="Display text"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional" /></Field><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!target.trim()} onClick={() => onInsert(/^https?:\/\//.test(target) ? `[${target} ${label || target}]` : `[[${target}${label ? `|${label}` : ""}]]`)}>Insert link</button></div></Modal>;
}

function CitationDialog({ onInsert, onClose }: { onInsert: (value: string) => void; onClose: () => void }) {
  const [type, setType] = useState("website"); const [title, setTitle] = useState(""); const [author, setAuthor] = useState(""); const [publication, setPublication] = useState(""); const [date, setDate] = useState(""); const [url, setUrl] = useState(""); const [access, setAccess] = useState(new Date().toISOString().slice(0, 10)); const [identifier, setIdentifier] = useState(""); const [name, setName] = useState("");
  const citation = [author, title && `''${title}''`, publication, date, url && `[${url} ${url}]`, access && `accessed ${access}`, identifier].filter(Boolean).join(". ");
  return <Modal title="Add a citation" onClose={onClose} wide><div className="form-grid"><Field label="Source type"><select value={type} onChange={(event) => setType(event.target.value)}><option>website</option><option>book</option><option>journal</option><option>news</option><option>generic</option></select></Field><Field label="Reference name" hint="Use the same name later with <ref name=&quot;name&quot; />"><input value={name} onChange={(event) => setName(event.target.value.replace(/\s/g, "-"))} /></Field><Field label="Title"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="Author"><input value={author} onChange={(event) => setAuthor(event.target.value)} /></Field><Field label="Website / publication"><input value={publication} onChange={(event) => setPublication(event.target.value)} /></Field><Field label="Publication date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="URL"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></Field><Field label="Access date"><input type="date" value={access} onChange={(event) => setAccess(event.target.value)} /></Field><Field label={type === "book" ? "ISBN / page" : type === "journal" ? "DOI / page" : "Additional details"}><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></Field></div><div className="citation-preview"><b>Preview:</b> {citation || "Complete at least one field."}</div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!citation} onClick={() => onInsert(`<ref${name ? ` name="${name}"` : ""}>${citation}</ref>`)}>Insert citation</button></div></Modal>;
}

function ImageDialog({ media, onInsert, onClose }: { media: MediaItem[]; onInsert: (value: string) => void; onClose: () => void }) {
  const [name, setName] = useState(media[0]?.name ?? ""); const [caption, setCaption] = useState(""); const [alt, setAlt] = useState(""); const [align, setAlign] = useState("right"); const [width, setWidth] = useState(260);
  return <Modal title="Insert an image" onClose={onClose}><Field label="Media file"><select value={name} onChange={(event) => setName(event.target.value)}><option value="">Choose a file from Media Library</option>{media.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>{!media.length && <p className="warning">Upload an image in the Media Library first.</p>}<Field label="Caption"><input value={caption} onChange={(event) => setCaption(event.target.value)} /></Field><Field label="Alternative text"><input value={alt} onChange={(event) => setAlt(event.target.value)} /></Field><div className="form-grid"><Field label="Alignment"><select value={align} onChange={(event) => setAlign(event.target.value)}><option>right</option><option>left</option><option>center</option></select></Field><Field label="Width (pixels)"><input type="number" min="80" max="1200" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></Field></div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!name} onClick={() => onInsert(`[[File:${name}|thumb|${align}|${width}px|${alt ? `alt=${alt}|` : ""}${caption}]]`)}>Insert image</button></div></Modal>;
}

function TableDialog({ onInsert, onClose }: { onInsert: (value: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState(3); const [cols, setCols] = useState(3); const [caption, setCaption] = useState(""); const [sortable, setSortable] = useState(true);
  const make = () => `{| class="wikitable${sortable ? " sortable" : ""}"\n${caption ? `|+ ${caption}\n` : ""}! ${Array.from({ length: cols }, (_, index) => `Heading ${index + 1}`).join(" !! ")}\n${Array.from({ length: rows }, (_, row) => `|-\n| ${Array.from({ length: cols }, (_, col) => `Row ${row + 1}, cell ${col + 1}`).join(" || ")}`).join("\n")}\n|}`;
  return <Modal title="Insert a table" onClose={onClose}><div className="form-grid"><Field label="Data rows"><input type="number" min="1" max="30" value={rows} onChange={(event) => setRows(Number(event.target.value))} /></Field><Field label="Columns"><input type="number" min="1" max="12" value={cols} onChange={(event) => setCols(Number(event.target.value))} /></Field></div><Field label="Caption"><input value={caption} onChange={(event) => setCaption(event.target.value)} /></Field><label className="check-row"><input type="checkbox" checked={sortable} onChange={(event) => setSortable(event.target.checked)} /> Allow readers to sort columns</label><div className="table-mini-preview">{Array.from({ length: Math.min(rows + 1, 6) }, (_, row) => <div key={row}>{Array.from({ length: cols }, (_, col) => <span className={row === 0 ? "head" : ""} key={col} />)}</div>)}</div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={() => onInsert(make())}>Insert table</button></div></Modal>;
}

function InfoboxDialog({ onInsert, onClose }: { onInsert: (value: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(""); const [subtitle, setSubtitle] = useState(""); const [rows, setRows] = useState([{ key: "Born", value: "" }, { key: "Occupation", value: "" }, { key: "Known for", value: "" }]); const [footer, setFooter] = useState("");
  const source = `{{Infobox\n|title=${title}\n|subtitle=${subtitle}\n${rows.filter((row) => row.key).map((row) => `|${row.key}=${row.value}`).join("\n")}\n|footer=${footer}\n}}`;
  return <Modal title="Build an infobox" onClose={onClose} wide><div className="form-grid"><Field label="Title"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="Subtitle"><input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></Field></div><div className="key-value-editor"><div className="key-value-head"><b>Field</b><b>Value</b></div>{rows.map((row, index) => <div key={index}><input value={row.key} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} /><input value={row.value} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /><button aria-label="Remove row" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}<button onClick={() => setRows([...rows, { key: "", value: "" }])}>＋ Add row</button></div><Field label="Footer"><input value={footer} onChange={(event) => setFooter(event.target.value)} /></Field><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!title} onClick={() => onInsert(source)}>Insert infobox</button></div></Modal>;
}

function TemplateDialog({ onInsert, onClose }: { onInsert: (value: string) => void; onClose: () => void }) {
  const [name, setName] = useState(""); const [params, setParams] = useState([{ key: "", value: "" }]);
  return <Modal title="Insert a template" onClose={onClose}><Field label="Template name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Quote" /></Field><div className="key-value-editor">{params.map((param, index) => <div key={index}><input value={param.key} onChange={(event) => setParams(params.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder="Parameter" /><input value={param.value} onChange={(event) => setParams(params.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Value" /><button aria-label="Remove parameter" onClick={() => setParams(params.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}<button onClick={() => setParams([...params, { key: "", value: "" }])}>＋ Add parameter</button></div><pre className="template-preview">{`{{${name || "Template"}${params.filter((item) => item.key).map((item) => `\n|${item.key}=${item.value}`).join("")}\n}}`}</pre><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!name} onClick={() => onInsert(`{{${name}${params.filter((item) => item.key).map((item) => `\n|${item.key}=${item.value}`).join("")}\n}}`)}>Insert template</button></div></Modal>;
}
