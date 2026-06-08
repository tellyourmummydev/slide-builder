import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const makeJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const POLL_PALETTE = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];

// Popular Google Fonts grouped
const GOOGLE_FONTS = [
  "Inter","Roboto","Open Sans","Lato","Montserrat","Poppins","Raleway","Nunito",
  "Oswald","Merriweather","Playfair Display","Lora","Source Sans 3","Ubuntu",
  "Work Sans","Mulish","Quicksand","DM Sans","Space Grotesk","Outfit",
  "Josefin Sans","Cabin","Karla","Jost","Barlow","Exo 2","Rubik","Manrope",
  "Fira Sans","Noto Sans","PT Sans","Crimson Text","EB Garamond","Libre Baskerville",
  "Cormorant Garamond","Spectral","Arvo","Bitter","Zilla Slab","Cardo",
  "Dancing Script","Pacifico","Lobster","Caveat","Satisfy","Great Vibes",
  "Bebas Neue","Anton","Black Han Sans","Righteous","Alfa Slab One",
];

const defaultTheme = () => ({
  bgColor: "#ffffff",
  textColor: "#1e1b4b",
  accentColor: "#6366f1",
  secondaryBg: "#f5f3ff",
  pollBarBg: "#e5e7eb",
  font: "DM Sans",
});

const defaultBlock = (type) => {
  if (type === "text") return { id: uid(), type, content: "Votre texte ici...", fontSize: 24, align: "left", bold: false, italic: false, color: null, font: null };
  if (type === "image") return { id: uid(), type, src: null, caption: "" };
  if (type === "poll") return { id: uid(), type, question: "Quelle est votre réponse ?", options: [{ id: uid(), label: "Option A" }, { id: uid(), label: "Option B" }], correctOptionId: null, color: "#6366f1" };
  return null;
};

// Layouts: how columns are arranged on a slide
const LAYOUTS = [
  { id: "single",   label: "1 colonne",   icon: "▬", cols: 1, split: null },
  { id: "left-60",  label: "Image ← | Contenu →", icon: "◧", cols: 2, split: [40, 60] },
  { id: "right-60", label: "Contenu ← | Image →",  icon: "◨", cols: 2, split: [60, 40] },
  { id: "half",     label: "50 / 50",     icon: "◫", cols: 2, split: [50, 50] },
];

const defaultColumn = () => ({ id: uid(), blocks: [] });

const defaultSlide = () => ({
  id: uid(),
  title: "Nouvelle slide",
  layout: "single",
  columns: [defaultColumn()],
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE FONTS LOADER
// ─────────────────────────────────────────────────────────────────────────────
function loadGoogleFont(font) {
  if (!font || font === "DM Sans") return;
  const id = `gf-${font.replace(/\s/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800&display=swap`;
  document.head.appendChild(link);
}

function FontPicker({ value, onChange, label = "Police" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = GOOGLE_FONTS.filter(f => f.toLowerCase().includes(search.toLowerCase()));
  const current = value || "DM Sans";

  useEffect(() => { if (open) loadGoogleFont(current); }, [open, current]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && <p style={s.sectionLabel}>{label}</p>}
      <button onClick={() => setOpen(v => !v)} style={{ ...s.input, width: "100%", boxSizing: "border-box", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: current, fontSize: 13 }}>
        <span>{current}</span><span style={{ color: "#9ca3af" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 999, maxHeight: 260, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ ...s.input, width: "100%", boxSizing: "border-box", fontSize: 12 }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map(f => {
              loadGoogleFont(f);
              return (
                <div key={f} onClick={() => { onChange(f); loadGoogleFont(f); setOpen(false); setSearch(""); }}
                  style={{ padding: "9px 12px", cursor: "pointer", fontSize: 14, fontFamily: f, background: f === current ? "#f5f3ff" : "transparent", color: f === current ? "#6366f1" : "#1e1b4b", fontWeight: f === current ? 700 : 400 }}>
                  {f}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR CODE
// ─────────────────────────────────────────────────────────────────────────────
function QRCode({ value, size = 120 }) {
  return <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1e1b4b&margin=2`} alt="QR" style={{ width: size, height: size, borderRadius: 8, display: "block" }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// POLL DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function PollDisplay({ block, theme, voteCounts = {}, totalVotes = 0, showCorrect = false, myVoteId = null, revealed = false }) {
  const showBars = showCorrect || revealed;
  return (
    <div style={{ width: "100%" }}>
      <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 18, color: theme?.textColor || "#1e1b4b", lineHeight: 1.3, fontFamily: theme?.font || "DM Sans" }}>{block.question}</p>
      {block.options.map((opt) => {
        const votes = voteCounts[opt.id] || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isCorrect = block.correctOptionId === opt.id;
        const isMyVote = myVoteId === opt.id;
        let barColor = block.color || theme?.accentColor || "#6366f1";
        if (showCorrect && isCorrect) barColor = "#10b981";
        if (showCorrect && isMyVote && !isCorrect && block.correctOptionId) barColor = "#ef4444";
        return (
          <div key={opt.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14, fontWeight: 600, color: theme?.textColor || "#374151", alignItems: "center", fontFamily: theme?.font || "DM Sans" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {showCorrect && isCorrect && <span style={{ color: "#10b981" }}>✓</span>}
                {showCorrect && isMyVote && !isCorrect && block.correctOptionId && <span style={{ color: "#ef4444" }}>✗</span>}
                {isMyVote && <span style={{ fontSize: 10, background: barColor, color: "#fff", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>Ton choix</span>}
                {opt.label}
              </span>
              {showBars && <span style={{ color: barColor, fontWeight: 800 }}>{pct}%</span>}
            </div>
            <div style={{ background: theme?.pollBarBg || "#e5e7eb", borderRadius: 8, height: 28, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 8, background: barColor, width: showBars ? `${pct}%` : "0%", minWidth: showBars && pct > 0 ? 4 : 0, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", paddingLeft: showBars && pct > 10 ? 10 : 0 }}>
                {showBars && pct > 10 && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{votes}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {totalVotes > 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af", textAlign: "right", fontFamily: theme?.font || "DM Sans" }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK RENDERER (shared preview + presentation)
// ─────────────────────────────────────────────────────────────────────────────
function BlockRenderer({ block, theme, scale = 1, voteCounts, totalVotes, showCorrect, myVoteId, revealed }) {
  const font = block.font || theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);
  if (block.type === "text") return (
    <p style={{ margin: 0, fontSize: block.fontSize * scale, textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal", color: block.color || theme?.textColor || "#1e1b4b", lineHeight: 1.45, fontFamily: font, wordBreak: "break-word" }}>{block.content}</p>
  );
  if (block.type === "image") return block.src
    ? <div><img src={block.src} alt={block.caption || ""} style={{ width: "100%", borderRadius: 10 * scale, objectFit: "cover", display: "block", maxHeight: 300 * scale }} />{block.caption && <p style={{ margin: "6px 0 0", fontSize: 12 * scale, color: "#6b7280", textAlign: "center", fontFamily: font }}>{block.caption}</p>}</div>
    : <div style={{ background: "#f3f4f6", borderRadius: 8, height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>📷 Aucune image</div>;
  if (block.type === "poll") return <PollDisplay block={block} theme={theme} voteCounts={voteCounts} totalVotes={totalVotes} showCorrect={showCorrect} myVoteId={myVoteId} revealed={revealed} />;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK EDITOR
// ─────────────────────────────────────────────────────────────────────────────
function BlockEditor({ block, theme, onChange, onDelete }) {
  const fileRef = useRef();

  if (block.type === "text") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Texte</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <textarea value={block.content} onChange={e => onChange({ content: e.target.value })} style={{ ...s.textarea, fontFamily: block.font || theme?.font || "DM Sans" }} rows={3} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "flex-end" }}>
        <label style={s.label}>Taille<input type="number" value={block.fontSize} min={10} max={100} onChange={e => onChange({ fontSize: Number(e.target.value) })} style={{ ...s.input, width: 64 }} /></label>
        <label style={s.label}>Alignement
          <select value={block.align} onChange={e => onChange({ align: e.target.value })} style={s.select}>
            <option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option>
          </select>
        </label>
        <label style={{ ...s.label, flexDirection: "row", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={block.bold} onChange={e => onChange({ bold: e.target.checked })} />Gras</label>
        <label style={{ ...s.label, flexDirection: "row", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={!!block.italic} onChange={e => onChange({ italic: e.target.checked })} />Italique</label>
        <label style={s.label}>Couleur
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" value={block.color || theme?.textColor || "#1e1b4b"} onChange={e => onChange({ color: e.target.value })} style={{ width: 32, height: 28, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }} />
            {block.color && <button onClick={() => onChange({ color: null })} style={{ fontSize: 10, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>↩ thème</button>}
          </div>
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <FontPicker value={block.font || theme?.font || "DM Sans"} onChange={f => onChange({ font: f })} label="Police du bloc" />
        {block.font && <button onClick={() => onChange({ font: null })} style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>↩ Police du thème</button>}
      </div>
    </div>
  );

  if (block.type === "image") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Image</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onChange({ src: ev.target.result }); r.readAsDataURL(f); }} />
      {block.src
        ? <div style={{ position: "relative" }}><img src={block.src} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 120, objectFit: "cover" }} /><button onClick={() => onChange({ src: null })} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", padding: "1px 6px", fontSize: 11 }}>✕</button></div>
        : <button onClick={() => fileRef.current.click()} style={s.uploadBtn}>+ Choisir une image</button>}
      <input value={block.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Légende (optionnel)" style={{ ...s.input, marginTop: 8, width: "100%", boxSizing: "border-box" }} />
    </div>
  );

  if (block.type === "poll") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Vote</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input value={block.question} onChange={e => onChange({ question: e.target.value })} placeholder="Question..." style={{ ...s.input, width: "100%", boxSizing: "border-box", fontWeight: 600, marginBottom: 10 }} />
      <p style={s.sectionLabel}>Options</p>
      {block.options.map((opt, i) => (
        <div key={opt.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 7 }}>
          <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 16, fontWeight: 700 }}>{i + 1}.</span>
          <input value={opt.label} onChange={e => onChange({ options: block.options.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o) })} style={{ ...s.input, flex: 1 }} placeholder={`Option ${i + 1}`} />
          <button onClick={() => onChange({ correctOptionId: block.correctOptionId === opt.id ? null : opt.id })} title="Bonne réponse"
            style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid", borderColor: block.correctOptionId === opt.id ? "#10b981" : "#d1d5db", background: block.correctOptionId === opt.id ? "#10b981" : "transparent", color: block.correctOptionId === opt.id ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</button>
          {block.options.length > 2 && <button onClick={() => onChange({ options: block.options.filter(o => o.id !== opt.id) })} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 15 }}>✕</button>}
        </div>
      ))}
      <p style={{ margin: "2px 0 8px", fontSize: 10, color: "#10b981" }}>✓ = bonne réponse</p>
      <button onClick={() => onChange({ options: [...block.options, { id: uid(), label: `Option ${block.options.length + 1}` }] })} style={s.addOptionBtn}>+ Option</button>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Couleur :</span>
        {POLL_PALETTE.map(c => <div key={c} onClick={() => onChange({ color: c })} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: block.color === c ? "3px solid #1e1b4b" : "2px solid transparent" }} />)}
        <input type="color" value={block.color || "#6366f1"} onChange={e => onChange({ color: e.target.value })} style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: "50%", cursor: "pointer", padding: 2 }} title="Couleur personnalisée" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN EDITOR — editor panel for one column
// ─────────────────────────────────────────────────────────────────────────────
function ColumnEditor({ column, colIndex, theme, onChange, activeBlockId, setActiveBlockId }) {
  const addBlock = (type) => {
    const b = defaultBlock(type);
    onChange({ blocks: [...column.blocks, b] });
    setActiveBlockId(b.id);
  };
  const updateBlock = (blockId, patch) => onChange({ blocks: column.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b) });
  const deleteBlock = (blockId) => { onChange({ blocks: column.blocks.filter(b => b.id !== blockId) }); setActiveBlockId(null); };
  const moveBlock = (blockId, dir) => {
    const blocks = [...column.blocks]; const i = blocks.findIndex(b => b.id === blockId);
    if (i + dir < 0 || i + dir >= blocks.length) return;
    [blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]]; onChange({ blocks });
  };

  return (
    <div style={{ borderLeft: colIndex > 0 ? "2px dashed #e0e7ff" : "none", paddingLeft: colIndex > 0 ? 12 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Colonne {colIndex + 1}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["text","T","Texte"],["image","⬜","Image"],["poll","▦","Vote"]].map(([type, icon, label]) => (
          <button key={type} onClick={() => addBlock(type)} style={{ ...s.addBlockBtn, padding: "4px 10px", fontSize: 11 }}>
            <span style={{ fontWeight: 700 }}>{icon}</span> {label}
          </button>
        ))}
      </div>
      {column.blocks.length === 0 && <p style={{ fontSize: 12, color: "#c7d2fe", textAlign: "center", padding: "16px 0" }}>Colonne vide</p>}
      {column.blocks.map((block, i) => (
        <div key={block.id} onClick={() => setActiveBlockId(block.id)}
          style={{ ...s.blockRow, ...(block.id === activeBlockId ? s.blockRowActive : {}), margin: "0 0 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: block.id === activeBlockId ? 10 : 0 }}>
            <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, minWidth: 16 }}>{i + 1}.</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {block.type === "text" ? `T — ${block.content.slice(0, 20)}…` : block.type === "image" ? "⬜ Image" : `▦ ${block.question?.slice(0, 18)}…`}
            </span>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} style={s.moveBtn}>↑</button>
              <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} style={s.moveBtn}>↓</button>
            </div>
          </div>
          {block.id === activeBlockId && <BlockEditor block={block} theme={theme} onChange={p => updateBlock(block.id, p)} onDelete={() => deleteBlock(block.id)} />}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE CANVAS (preview + presentation rendering)
// ─────────────────────────────────────────────────────────────────────────────
function SlideCanvas({ slide, theme, scale = 1, voteCounts = {}, totalVotes = 0, showCorrect = false, myVoteId = null, revealed = false, compact = false }) {
  const layout = LAYOUTS.find(l => l.id === slide.layout) || LAYOUTS[0];
  const font = theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);

  const colStyle = (i) => ({
    flex: layout.split ? layout.split[i] : 100,
    display: "flex", flexDirection: "column", gap: 12 * scale,
    minWidth: 0,
  });

  return (
    <div style={{ background: theme?.bgColor || "#fff", borderRadius: compact ? 12 : 16, padding: compact ? 16 : 32 * scale, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", fontFamily: font, overflow: "hidden" }}>
      {!compact && slide.title && <p style={{ margin: "0 0 16px", fontSize: 12 * scale, fontWeight: 700, color: theme?.accentColor || "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: font }}>{slide.title}</p>}
      <div style={{ display: "flex", gap: 24 * scale, flex: 1, overflow: "hidden" }}>
        {slide.columns.map((col, i) => (
          <div key={col.id} style={colStyle(i)}>
            {col.blocks.map(block => (
              <BlockRenderer key={block.id} block={block} theme={theme} scale={scale} voteCounts={block.type === "poll" ? voteCounts : {}} totalVotes={block.type === "poll" ? totalVotes : 0} showCorrect={showCorrect} myVoteId={myVoteId} revealed={revealed} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME EDITOR PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ThemeEditor({ theme, onChange }) {
  useEffect(() => { loadGoogleFont(theme.font); }, [theme.font]);

  const field = (label, key, type = "color") => (
    <div style={{ marginBottom: 14 }}>
      <p style={s.sectionLabel}>{label}</p>
      {type === "color" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={theme[key]} onChange={e => onChange({ ...theme, [key]: e.target.value })}
            style={{ width: 40, height: 32, border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer", padding: 2 }} />
          <input value={theme[key]} onChange={e => onChange({ ...theme, [key]: e.target.value })}
            style={{ ...s.input, width: 90, fontFamily: "monospace", fontSize: 12 }} maxLength={7} />
        </div>
      )}
    </div>
  );

  return (
    <div>
      <p style={{ margin: "0 0 18px", fontWeight: 800, fontSize: 15, color: "#1e1b4b" }}>🎨 Thème de la présentation</p>
      <FontPicker value={theme.font} onChange={f => onChange({ ...theme, font: f })} label="Police globale" />
      <div style={{ marginTop: 16 }}>
        {field("Fond des slides", "bgColor")}
        {field("Couleur du texte", "textColor")}
        {field("Couleur d'accent", "accentColor")}
        {field("Fond secondaire", "secondaryBg")}
        {field("Fond des barres de vote", "pollBarBg")}
      </div>
      <button onClick={() => onChange(defaultTheme())} style={{ ...s.addOptionBtn, marginTop: 8, width: "100%", fontSize: 12 }}>↩ Réinitialiser le thème</button>

      {/* Live preview swatch */}
      <div style={{ marginTop: 20, borderRadius: 12, overflow: "hidden", border: "1px solid #e0e7ff" }}>
        <div style={{ background: theme.bgColor, padding: 16 }}>
          <p style={{ margin: "0 0 6px", fontFamily: theme.font, fontWeight: 800, fontSize: 16, color: theme.textColor }}>{theme.font || "DM Sans"}</p>
          <p style={{ margin: "0 0 10px", fontFamily: theme.font, fontSize: 13, color: theme.textColor, opacity: 0.7 }}>Aperçu des couleurs</p>
          <div style={{ height: 8, borderRadius: 4, background: theme.pollBarBg, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "60%", background: theme.accentColor, borderRadius: 4 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENTATION MODE
// ─────────────────────────────────────────────────────────────────────────────
function PresentationMode({ slides, theme, sessionCode, sessionId, onExit }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [voteCounts, setVoteCounts] = useState({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [revealResults, setRevealResults] = useState(false);
  const currentSlide = slides[currentIdx];
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=${sessionCode}`;

  useEffect(() => {
    if (!sessionId) return;
    setVoteCounts({}); setTotalVotes(0); setRevealCorrect(false); setRevealResults(false);
    supabase.from("sessions")
      .update({ current_slide_index: currentIdx, reveal_results: false, reveal_correct: false })
      .eq("id", sessionId).then(({ error }) => { if (error) console.error(error); });
  }, [currentIdx, sessionId]);

  // Sync reveal states to Supabase so participants see them
  const syncReveal = useCallback(async (results, correct) => {
    if (!sessionId) return;
    await supabase.from("sessions").update({ reveal_results: results, reveal_correct: correct }).eq("id", sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const ch = supabase.channel(`pres-votes-${sessionId}-${currentIdx}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.new.slide_index !== currentIdx) return;
        setVoteCounts(prev => ({ ...prev, [payload.new.option_id]: (prev[payload.new.option_id] || 0) + 1 }));
        setTotalVotes(prev => prev + 1);
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [sessionId, currentIdx]);

  const pollBlock = currentSlide?.columns?.flatMap(c => c.blocks).find(b => b.type === "poll");
  const go = (dir) => { const n = currentIdx + dir; if (n >= 0 && n < slides.length) setCurrentIdx(n); };

  const handleRevealResults = () => {
    const next = !revealResults;
    setRevealResults(next);
    syncReveal(next, revealCorrect);
  };
  const handleRevealCorrect = () => {
    const next = !revealCorrect;
    setRevealCorrect(next);
    syncReveal(revealResults, next);
  };

  return (
    <div style={{ fontFamily: theme?.font || "DM Sans", display: "flex", flexDirection: "column", height: "100vh", background: "#0f0e1a", overflow: "hidden" }}>
      {/* TOP BAR */}
      <div style={{ background: "#1e1b4b", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <QRCode value={joinUrl} size={64} />
          <div>
            <p style={{ margin: 0, fontSize: 10, color: "#a5b4fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rejoindre</p>
            <p style={{ margin: "2px 0", fontSize: 11, color: "#e0e7ff" }}>{joinUrl}</p>
            <span style={{ background: "#312e81", color: "#a5b4fc", padding: "2px 10px", borderRadius: 99, fontSize: 14, fontWeight: 800, letterSpacing: "0.15em" }}>{sessionCode}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {pollBlock && <>
            <button onClick={handleRevealResults} style={{ ...s.presBtn, background: revealResults ? "rgba(99,102,241,0.3)" : undefined, borderColor: revealResults ? "#818cf8" : undefined, color: revealResults ? "#fff" : undefined }}>
              {revealResults ? "📊 Résultats visibles" : "📊 Afficher résultats"}
            </button>
            <button onClick={handleRevealCorrect} style={{ ...s.presBtn, background: revealCorrect ? "#10b981" : "rgba(16,185,129,0.15)", borderColor: "#10b981", color: revealCorrect ? "#fff" : "#10b981" }}>
              {revealCorrect ? "✓ Réponse visible" : "✓ Révéler réponse"}
            </button>
          </>}
          <span style={{ color: "#818cf8", fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: "center" }}>{currentIdx + 1}/{slides.length}</span>
          <button onClick={() => go(-1)} disabled={currentIdx === 0} style={{ ...s.presBtn, opacity: currentIdx === 0 ? 0.3 : 1 }}>← Préc.</button>
          <button onClick={() => go(1)} disabled={currentIdx === slides.length - 1} style={{ ...s.presBtn, opacity: currentIdx === slides.length - 1 ? 0.3 : 1 }}>Suiv. →</button>
          <button onClick={onExit} style={{ ...s.presBtn, borderColor: "#f87171", color: "#f87171" }}>✕ Quitter</button>
        </div>
      </div>

      {/* SLIDE */}
      <div style={{ flex: 1, overflow: "hidden", padding: "32px 48px", display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 48px rgba(0,0,0,0.4)" }}>
          <SlideCanvas slide={currentSlide} theme={theme} scale={1.2} voteCounts={voteCounts} totalVotes={totalVotes} showCorrect={revealCorrect} revealed={revealResults} />
        </div>
      </div>

      {/* Slide dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "10px 0 16px" }}>
        {slides.map((sl, i) => <div key={sl.id} onClick={() => setCurrentIdx(i)} style={{ width: i === currentIdx ? 20 : 8, height: 8, borderRadius: 99, background: i === currentIdx ? "#818cf8" : "#312e81", cursor: "pointer", transition: "all 0.2s" }} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICIPANT VIEW
// ─────────────────────────────────────────────────────────────────────────────
function ParticipantView({ joinCode }) {
  const [sessionData, setSessionData] = useState(null);
  const [slides, setSlides] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealResults, setRevealResults] = useState(false);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [voted, setVoted] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token] = useState(() => { let t = localStorage.getItem("ptk"); if (!t) { t = uid(); localStorage.setItem("ptk", t); } return t; });
  const [theme, setTheme] = useState(defaultTheme());

  useEffect(() => {
    if (!joinCode) return;
    (async () => {
      setLoading(true);
      const { data: sess, error: e1 } = await supabase.from("sessions").select("id, presentation_id, current_slide_index, is_active, reveal_results, reveal_correct").eq("join_code", joinCode.toUpperCase().trim()).eq("is_active", true).maybeSingle();
      if (e1 || !sess) { setError(`Session "${joinCode.toUpperCase()}" introuvable ou terminée.`); setLoading(false); return; }
      const { data: slidesData, error: e2 } = await supabase.from("slides").select("id, position, title, blocks, layout, columns").eq("presentation_id", sess.presentation_id).order("position", { ascending: true });
      if (e2) { setError("Impossible de charger les slides."); setLoading(false); return; }
      // Load theme from presentation
      const { data: pres } = await supabase.from("presentations").select("theme").eq("id", sess.presentation_id).single();
      if (pres?.theme) setTheme(pres.theme);
      setSessionData({ sessionId: sess.id, presentationId: sess.presentation_id });
      setSlides(slidesData || []);
      setCurrentIdx(sess.current_slide_index || 0);
      setRevealResults(!!sess.reveal_results);
      setRevealCorrect(!!sess.reveal_correct);
      setLoading(false);
    })();
  }, [joinCode]);

  useEffect(() => {
    if (!sessionData) return;
    const ch = supabase.channel(`part-${sessionData.sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionData.sessionId}` }, (payload) => {
        setCurrentIdx(payload.new.current_slide_index || 0);
        setRevealResults(!!payload.new.reveal_results);
        setRevealCorrect(!!payload.new.reveal_correct);
        // Reset reveal on slide change
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [sessionData]);

  const currentSlide = slides[currentIdx];
  const parseBlocks = (raw) => Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();

  // Normalize slide to columns format (backwards compat)
  const normalizeSlide = (sl) => {
    if (!sl) return null;
    if (sl.columns) {
      const cols = Array.isArray(sl.columns) ? sl.columns : (() => { try { return JSON.parse(sl.columns); } catch { return null; } })();
      if (cols) return { ...sl, columns: cols.map(c => ({ ...c, blocks: parseBlocks(c.blocks) })), layout: sl.layout || "single" };
    }
    // Legacy: flat blocks
    return { ...sl, layout: "single", columns: [{ id: "c1", blocks: parseBlocks(sl.blocks) }] };
  };

  const slide = normalizeSlide(currentSlide);
  const allBlocks = slide ? slide.columns.flatMap(c => c.blocks) : [];
  const poll = allBlocks.find(b => b.type === "poll");
  const myVote = voted[currentIdx];
  const hasVoted = !!myVote;
  const correctId = poll?.correctOptionId;
  const gotItRight = hasVoted && correctId && myVote === correctId;
  const gotItWrong = hasVoted && correctId && myVote !== correctId;

  const handleVote = async (optionId) => {
    if (hasVoted || !sessionData || !currentSlide) return;
    const { error } = await supabase.from("votes").insert({ session_id: sessionData.sessionId, slide_id: currentSlide.id, slide_index: currentIdx, option_id: optionId, participant_token: token });
    if (!error) setVoted(prev => ({ ...prev, [currentIdx]: optionId }));
    else console.error("vote error:", error);
  };

  const font = theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);

  if (loading) return (
    <div style={{ ...s.mobileRoot, fontFamily: font }}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={s.mobileLoader}><div style={s.spinner} /><p style={{ color: "#818cf8", marginTop: 16 }}>Connexion…</p></div>
    </div>
  );
  if (error) return (
    <div style={{ ...s.mobileRoot, fontFamily: font }}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={s.mobileLoader}><p style={{ color: "#f87171", textAlign: "center", fontSize: 15, lineHeight: 1.6 }}>{error}</p></div>
    </div>
  );

  return (
    <div style={{ ...s.mobileRoot, background: theme?.bgColor || "#f8f9ff", fontFamily: font }}>
      <div style={{ ...s.mobileHeader, background: "#1e1b4b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div>
        <span style={{ fontSize: 12, color: "#a5b4fc", background: "rgba(165,180,252,0.15)", padding: "3px 10px", borderRadius: 99, fontWeight: 700 }}>{currentIdx + 1}/{slides.length}</span>
      </div>
      <div style={s.mobileContent}>
        {!slide && <p style={{ color: "#818cf8", textAlign: "center" }}>En attente…</p>}
        {slide && (
          <>
            <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: theme?.accentColor || "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{slide.title}</p>
            {/* Non-poll blocks */}
            {allBlocks.filter(b => b.type !== "poll").map(block => (
              <div key={block.id} style={{ marginBottom: 16 }}>
                <BlockRenderer block={block} theme={theme} scale={0.9} />
              </div>
            ))}
            {/* Poll block */}
            {poll && (
              <div>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 17, color: theme?.textColor || "#1e1b4b", lineHeight: 1.3, fontFamily: font }}>{poll.question}</p>
                {!hasVoted ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {poll.options.map(opt => (
                      <button key={opt.id} onClick={() => handleVote(opt.id)} style={{ ...s.voteBtn, background: theme?.bgColor || "#fff", color: theme?.textColor || "#1e1b4b", borderColor: theme?.accentColor + "44" || "#e0e7ff", fontFamily: font }}>{opt.label}</button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {/* Feedback banner — only shown when host reveals correct answer */}
                    {revealCorrect && correctId && (
                      <div style={{ background: gotItRight ? "#d1fae5" : "#fee2e2", border: `2px solid ${gotItRight ? "#10b981" : "#ef4444"}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 26 }}>{gotItRight ? "🎉" : "😅"}</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: gotItRight ? "#065f46" : "#991b1b", fontFamily: font }}>{gotItRight ? "Bonne réponse !" : "Pas tout à fait…"}</p>
                          {gotItWrong && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#b91c1c", fontFamily: font }}>Réponse : <strong>{poll.options.find(o => o.id === correctId)?.label}</strong></p>}
                        </div>
                      </div>
                    )}
                    {/* Results bars — only shown when host reveals results */}
                    {revealResults ? (
                      poll.options.map(opt => {
                        const isMyV = myVote === opt.id;
                        const isCor = correctId === opt.id;
                        let bg = poll.color || theme?.accentColor || "#6366f1";
                        if (revealCorrect && isCor) bg = "#10b981";
                        if (revealCorrect && isMyV && !isCor && correctId) bg = "#ef4444";
                        return (
                          <div key={opt.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 13, fontWeight: isMyV ? 700 : 400, color: theme?.textColor || "#374151", fontFamily: font }}>
                              {revealCorrect && isCor && <span style={{ color: "#10b981" }}>✓</span>}
                              {isMyV && <span style={{ fontSize: 10, background: poll.color || theme?.accentColor, color: "#fff", padding: "1px 6px", borderRadius: 99 }}>Ton choix</span>}
                              {opt.label}
                            </div>
                            <div style={{ background: theme?.pollBarBg || "#e5e7eb", borderRadius: 8, height: 10 }}>
                              <div style={{ height: "100%", borderRadius: 8, background: bg, width: isMyV ? "100%" : "20%", transition: "width 0.5s" }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: "center", padding: "20px 0" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                        <p style={{ color: "#9ca3af", fontSize: 14, margin: 0, fontFamily: font }}>Vote enregistré !</p>
                        <p style={{ color: "#c7d2fe", fontSize: 12, margin: "4px 0 0", fontFamily: font }}>En attente des résultats…</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JoinScreen({ initialCode = "" }) {
  const [code, setCode] = useState(initialCode);
  const [submitted, setSubmitted] = useState(!!initialCode);
  if (submitted) return <ParticipantView joinCode={code} />;
  return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={{ ...s.mobileLoader, flexDirection: "column", gap: 18, padding: 32 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 22, color: "#1e1b4b" }}>Rejoindre une session</p>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Code de session" maxLength={6} style={{ ...s.input, fontSize: 22, textAlign: "center", letterSpacing: "0.2em", fontWeight: 800, width: "100%", boxSizing: "border-box", padding: "14px" }} />
        <button onClick={() => setSubmitted(true)} disabled={code.length < 4} style={{ ...s.voteBtn, fontSize: 16, padding: "14px", opacity: code.length < 4 ? 0.4 : 1, textAlign: "center" }}>Rejoindre →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE / LOAD MODAL
// ─────────────────────────────────────────────────────────────────────────────
function SaveLoadModal({ slides, theme, onLoad, onClose }) {
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState("Ma présentation");
  const [tab, setTab] = useState("save");
  useEffect(() => { try { const r = localStorage.getItem("sb_presentations"); setSaved(r ? JSON.parse(r) : []); } catch { setSaved([]); } }, []);
  const handleSave = () => {
    const entry = { id: uid(), name: saveName, date: new Date().toISOString(), slides, theme };
    const updated = [entry, ...saved].slice(0, 20);
    localStorage.setItem("sb_presentations", JSON.stringify(updated));
    setSaved(updated); setTab("load");
  };
  const handleDelete = (id) => { const u = saved.filter(p => p.id !== id); localStorage.setItem("sb_presentations", JSON.stringify(u)); setSaved(u); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,27,75,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: 460, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(30,27,75,0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e1b4b" }}>Sauvegarder / Charger</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
          {["save","load"].map(t => <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", background: tab === t ? "#fff" : "transparent", color: tab === t ? "#6366f1" : "#6b7280", boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{t === "save" ? "💾 Sauvegarder" : "📂 Charger"}</button>)}
        </div>
        {tab === "save" && (
          <div>
            <label style={s.sectionLabel}>Nom</label>
            <input value={saveName} onChange={e => setSaveName(e.target.value)} style={{ ...s.input, width: "100%", boxSizing: "border-box", fontSize: 15, marginBottom: 14, marginTop: 6 }} />
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#9ca3af" }}>{slides.length} slide{slides.length !== 1 ? "s" : ""} · Sauvegarde locale (navigateur)</p>
            <button onClick={handleSave} disabled={!saveName.trim()} style={{ background: "#6366f1", border: "none", color: "#fff", padding: "12px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 800, width: "100%", fontFamily: "inherit", opacity: !saveName.trim() ? 0.4 : 1 }}>💾 Sauvegarder</button>
          </div>
        )}
        {tab === "load" && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {saved.length === 0 && <p style={{ color: "#9ca3af", textAlign: "center", fontSize: 13, padding: "24px 0" }}>Aucune sauvegarde</p>}
            {saved.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#1e1b4b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>{p.slides?.length || 0} slides · {new Date(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button onClick={() => { onLoad(p.slides, p.theme); onClose(); }} style={{ background: "#ede9fe", border: "none", color: "#6366f1", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>Charger</button>
                <button onClick={() => handleDelete(p.id)} style={{ background: "#fef2f2", border: "none", color: "#ef4444", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function Builder({ onPresent }) {
  const [slides, setSlides] = useState(() => { try { const r = localStorage.getItem("sb_autosave"); if (r) { const p = JSON.parse(r); if (p?.length) return p; } } catch {} return [defaultSlide()]; });
  const [theme, setTheme] = useState(() => { try { const r = localStorage.getItem("sb_autosave_theme"); if (r) return JSON.parse(r); } catch {} return defaultTheme(); });
  const [activeSlideId, setActiveSlideId] = useState(() => slides[0]?.id);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [rightPanel, setRightPanel] = useState("preview"); // "preview" | "theme"
  const [showModal, setShowModal] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => { loadGoogleFont(theme.font); }, [theme.font]);
  useEffect(() => { try { localStorage.setItem("sb_autosave", JSON.stringify(slides)); } catch {} }, [slides]);
  useEffect(() => { try { localStorage.setItem("sb_autosave_theme", JSON.stringify(theme)); } catch {} }, [theme]);

  const activeSlide = slides.find(s => s.id === activeSlideId) || slides[0];

  // Ensure slide has columns structure
  const normalizeSlide = (sl) => {
    if (sl.columns) return sl;
    return { ...sl, layout: "single", columns: [{ id: uid(), blocks: sl.blocks || [] }] };
  };
  const normActive = normalizeSlide(activeSlide);

  const updateSlide = useCallback((id, patch) => setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)), []);
  const updateColumn = useCallback((slideId, colId, patch) => setSlides(prev => prev.map(s => s.id === slideId ? { ...s, columns: s.columns.map(c => c.id === colId ? { ...c, ...patch } : c) } : s)), []);

  const setLayout = (layoutId) => {
    const layout = LAYOUTS.find(l => l.id === layoutId);
    if (!layout) return;
    const cur = normalizeSlide(activeSlide);
    let columns;
    if (layout.cols === 1) {
      // Merge all blocks into one column
      const allBlocks = cur.columns.flatMap(c => c.blocks);
      columns = [{ id: cur.columns[0]?.id || uid(), blocks: allBlocks }];
    } else {
      // Ensure 2 columns
      if (cur.columns.length >= 2) {
        columns = [cur.columns[0], cur.columns[1]];
      } else {
        columns = [cur.columns[0] || { id: uid(), blocks: [] }, { id: uid(), blocks: [] }];
      }
    }
    updateSlide(activeSlide.id, { layout: layoutId, columns });
  };

  const addSlide = () => { const sl = defaultSlide(); setSlides(p => [...p, sl]); setActiveSlideId(sl.id); setActiveBlockId(null); };
  const deleteSlide = (id) => { if (slides.length === 1) return; const r = slides.filter(s => s.id !== id); setSlides(r); if (activeSlideId === id) setActiveSlideId(r[0].id); };
  const duplicateSlide = (sl) => { const newSl = { ...JSON.parse(JSON.stringify(sl)), id: uid() }; setSlides(prev => { const i = prev.findIndex(s => s.id === sl.id); const next = [...prev]; next.splice(i + 1, 0, newSl); return next; }); setActiveSlideId(newSl.id); };

  const quickSave = () => {
    try {
      const r = localStorage.getItem("sb_presentations");
      const saved = r ? JSON.parse(r) : [];
      const entry = { id: uid(), name: `Sauvegarde ${new Date().toLocaleTimeString("fr-FR")}`, date: new Date().toISOString(), slides, theme };
      localStorage.setItem("sb_presentations", JSON.stringify([entry, ...saved].slice(0, 20)));
      setSaveFlash(true); setTimeout(() => setSaveFlash(false), 2000);
    } catch {}
  };

  const handlePresent = async () => {
    try {
      const { data: pres, error: e1 } = await supabase.from("presentations").insert({ title: "Session " + new Date().toLocaleTimeString("fr-FR"), theme }).select().single();
      if (e1) throw e1;
      for (let i = 0; i < slides.length; i++) {
        const sl = normalizeSlide(slides[i]);
        const { error: e2 } = await supabase.from("slides").insert({ presentation_id: pres.id, position: i, title: sl.title, layout: sl.layout, columns: JSON.stringify(sl.columns), blocks: JSON.stringify([]) });
        if (e2) console.error("slide insert:", e2);
      }
      const joinCode = makeJoinCode();
      const { data: sess, error: e3 } = await supabase.from("sessions").insert({ presentation_id: pres.id, join_code: joinCode, current_slide_index: 0, is_active: true, reveal_results: false, reveal_correct: false }).select().single();
      if (e3) throw e3;
      onPresent({ slides: slides.map(normalizeSlide), theme, sessionCode: joinCode, sessionId: sess.id });
    } catch (err) {
      console.error("Launch error:", err);
      alert("Erreur Supabase : " + (err.message || JSON.stringify(err)));
    }
  };

  return (
    <>
      {showModal && <SaveLoadModal slides={slides} theme={theme} onLoad={(sl, th) => { setSlides(sl); if (th) setTheme(th); setActiveSlideId(sl[0]?.id); setActiveBlockId(null); }} onClose={() => setShowModal(false)} />}
      <div style={s.root}>
        {/* HEADER */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={s.logo}>◈</div>
            <span style={{ fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: "-0.02em" }}>SlideBuilder</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={quickSave} style={{ ...s.headerBtn, background: saveFlash ? "rgba(16,185,129,0.2)" : undefined, borderColor: saveFlash ? "#10b981" : undefined, color: saveFlash ? "#10b981" : undefined }}>{saveFlash ? "✓ Sauvegardé !" : "💾 Sauvegarder"}</button>
            <button onClick={() => setShowModal(true)} style={s.headerBtn}>📂 Gérer</button>
            <button onClick={handlePresent} style={s.presentBtn}>▶ Présenter</button>
          </div>
        </div>

        <div style={s.workspace}>
          {/* SLIDES SIDEBAR */}
          <div style={s.sidebarLeft}>
            <p style={s.sidebarTitle}>Slides</p>
            {slides.map((sl, i) => {
              const nsl = normalizeSlide(sl);
              return (
                <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }} style={{ ...s.slideThumb, ...(sl.id === activeSlide.id ? s.slideThumbActive : {}) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700 }}>#{i + 1}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); duplicateSlide(sl); }} style={{ background: "none", border: "none", color: "#a5b4fc", cursor: "pointer", fontSize: 11 }} title="Dupliquer">⎘</button>
                      {slides.length > 1 && <button onClick={e => { e.stopPropagation(); deleteSlide(sl.id); }} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}>✕</button>}
                    </div>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#e0e7ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.title}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 9, color: "#818cf8" }}>{nsl.columns?.flatMap(c => c.blocks).length || 0} blocs · {LAYOUTS.find(l => l.id === nsl.layout)?.icon || "▬"}</p>
                </div>
              );
            })}
            <button onClick={addSlide} style={s.addSlideBtn}>+ Nouvelle slide</button>
          </div>

          {/* EDITOR CENTER */}
          <div style={s.editorCenter}>
            {/* Slide title + layout picker */}
            <div style={{ padding: "12px 20px 10px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
              <input value={normActive.title} onChange={e => updateSlide(activeSlide.id, { title: e.target.value })} style={s.slideTitleInput} placeholder="Titre de la slide" />
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", alignSelf: "center" }}>Layout :</span>
                {LAYOUTS.map(layout => (
                  <button key={layout.id} onClick={() => setLayout(layout.id)}
                    style={{ ...s.addBlockBtn, padding: "4px 10px", fontSize: 11, background: normActive.layout === layout.id ? "#ede9fe" : "#f9f9f9", borderColor: normActive.layout === layout.id ? "#818cf8" : "#e0e7ff", color: normActive.layout === layout.id ? "#6366f1" : "#6b7280", fontWeight: normActive.layout === layout.id ? 700 : 400 }}>
                    {layout.icon} {layout.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Columns editors */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 20px" }}>
              <div style={{ display: "flex", gap: 16 }}>
                {normActive.columns.map((col, colIndex) => (
                  <div key={col.id} style={{ flex: normActive.layout !== "single" && LAYOUTS.find(l => l.id === normActive.layout)?.split ? LAYOUTS.find(l => l.id === normActive.layout).split[colIndex] : 1, minWidth: 0 }}>
                    <ColumnEditor column={col} colIndex={colIndex} theme={theme} onChange={patch => updateColumn(activeSlide.id, col.id, patch)} activeBlockId={activeBlockId} setActiveBlockId={setActiveBlockId} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: preview or theme */}
          <div style={s.previewPanel}>
            <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#ede9fe", borderRadius: 10, padding: 4 }}>
              {["preview","theme"].map(t => (
                <button key={t} onClick={() => setRightPanel(t)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", background: rightPanel === t ? "#fff" : "transparent", color: rightPanel === t ? "#6366f1" : "#7c6aab" }}>
                  {t === "preview" ? "👁 Aperçu" : "🎨 Thème"}
                </button>
              ))}
            </div>

            {rightPanel === "preview" && (
              <>
                <div style={{ ...s.slideCanvas, flex: 1, minHeight: 300, overflow: "hidden" }}>
                  <SlideCanvas slide={normActive} theme={theme} scale={0.75} compact />
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 6 }}>
                  {slides.map(sl => <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }} style={{ width: 8, height: 8, borderRadius: "50%", cursor: "pointer", background: sl.id === activeSlide.id ? "#818cf8" : "#d1d5db" }} />)}
                </div>
              </>
            )}
            {rightPanel === "theme" && <ThemeEditor theme={theme} onChange={setTheme} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get("join");
  if (joinParam) return <JoinScreen initialCode={joinParam} />;
  const [mode, setMode] = useState("builder");
  const [presData, setPresData] = useState(null);
  if (mode === "present" && presData) {
    return <PresentationMode slides={presData.slides} theme={presData.theme} sessionCode={presData.sessionCode} sessionId={presData.sessionId} onExit={() => setMode("builder")} />;
  }
  return <Builder onPresent={(data) => { setPresData(data); setMode("present"); }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const s = {
  root: { fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", height: "100vh", background: "#f8f9ff", color: "#1e1b4b", overflow: "hidden" },
  header: { background: "#1e1b4b", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0 },
  logo: { width: 30, height: 30, background: "#818cf8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: 900 },
  headerBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  presentBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" },
  workspace: { display: "flex", flex: 1, overflow: "hidden" },
  sidebarLeft: { width: 155, background: "#1e1b4b", borderRight: "1px solid #312e81", padding: "14px 10px", display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", flexShrink: 0 },
  sidebarTitle: { margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" },
  slideThumb: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 8, padding: "8px", cursor: "pointer" },
  slideThumbActive: { background: "rgba(129,140,248,0.15)", borderColor: "#818cf8" },
  addSlideBtn: { background: "none", border: "1px dashed rgba(129,140,248,0.4)", color: "#818cf8", borderRadius: 8, padding: "7px", cursor: "pointer", fontSize: 11, fontWeight: 700, width: "100%", marginTop: 4, fontFamily: "inherit" },
  editorCenter: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" },
  slideTitleInput: { width: "100%", boxSizing: "border-box", border: "none", outline: "none", fontSize: 18, fontWeight: 800, color: "#1e1b4b", fontFamily: "inherit", background: "transparent" },
  addBlockBtn: { background: "#f5f3ff", border: "1px solid #e0e7ff", color: "#6366f1", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" },
  blockRow: { borderRadius: 8, border: "1px solid #f3f4f6", padding: "8px 10px", cursor: "pointer", background: "#fff", marginBottom: 4 },
  blockRowActive: { borderColor: "#818cf8", background: "#fafafe", boxShadow: "0 0 0 3px rgba(129,140,248,0.1)" },
  blockEditor: { marginTop: 6 },
  blockEditorHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  blockBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#ede9fe", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" },
  deleteBtn: { background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 6, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontWeight: 700 },
  textarea: { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.5 },
  input: { padding: "5px 9px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  select: { padding: "5px 9px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  sectionLabel: { margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  uploadBtn: { width: "100%", padding: "20px", background: "#f9fafb", border: "2px dashed #d1d5db", borderRadius: 8, cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 600, fontFamily: "inherit" },
  addOptionBtn: { background: "none", border: "1px dashed #6366f1", color: "#6366f1", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%", marginTop: 4, fontFamily: "inherit" },
  moveBtn: { background: "#f3f4f6", border: "none", borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11, color: "#6b7280" },
  previewPanel: { width: 300, background: "#f5f3ff", borderLeft: "1px solid #e0e7ff", padding: "14px", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" },
  slideCanvas: { background: "#fff", borderRadius: 12, border: "1px solid #e0e7ff", overflow: "hidden", boxShadow: "0 2px 16px rgba(99,102,241,0.07)" },
  presBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  mobileRoot: { fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#f8f9ff", display: "flex", flexDirection: "column" },
  mobileHeader: { background: "#1e1b4b", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  mobileContent: { flex: 1, padding: "22px 18px", overflowY: "auto" },
  mobileLoader: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 32 },
  voteBtn: { width: "100%", padding: "15px 18px", background: "#fff", border: "2px solid #e0e7ff", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, color: "#1e1b4b", textAlign: "left", fontFamily: "inherit" },
  spinner: { width: 34, height: 34, border: "3px solid #e0e7ff", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
