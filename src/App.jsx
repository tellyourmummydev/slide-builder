import { useState, useRef, useCallback } from "react";

const uid = () => Math.random().toString(36).slice(2, 9);

const BLOCK_TYPES = {
  text: { label: "Texte", icon: "T" },
  image: { label: "Image", icon: "⬜" },
  poll: { label: "Vote", icon: "▦" },
};

const defaultSlide = () => ({
  id: uid(),
  title: "Nouvelle slide",
  blocks: [],
});

const defaultBlock = (type) => {
  if (type === "text") return { id: uid(), type, content: "Votre texte ici...", fontSize: 24, align: "left", bold: false };
  if (type === "image") return { id: uid(), type, src: null, caption: "" };
  if (type === "poll") return {
    id: uid(), type,
    question: "Quelle est votre réponse ?",
    options: [
      { id: uid(), label: "Option A", votes: 0 },
      { id: uid(), label: "Option B", votes: 0 },
    ],
    showResults: true,
    color: "#6366f1",
  };
};

const PALETTE = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];

function PollPreview({ block, isPreview }) {
  const total = block.options.reduce((s, o) => s + (o.votes || 0), 0);
  return (
    <div style={{ width: "100%" }}>
      <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 18, color: "#1e1b4b" }}>{block.question}</p>
      {block.options.map((opt) => {
        const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
        return (
          <div key={opt.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 14, fontWeight: 600, color: "#374151" }}>
              <span>{opt.label}</span>
              <span style={{ color: block.color }}>{pct}%</span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: 8, height: 28, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 8,
                background: block.color,
                width: `${pct}%`,
                transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                display: "flex", alignItems: "center", paddingLeft: pct > 10 ? 10 : 0,
              }}>
                {pct > 8 && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{pct}%</span>}
              </div>
            </div>
          </div>
        );
      })}
      {total > 0 && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{total} vote{total > 1 ? "s" : ""}</p>}
    </div>
  );
}

function BlockEditor({ block, onChange, onDelete }) {
  const fileRef = useRef();

  if (block.type === "text") return (
    <div style={styles.blockEditor}>
      <div style={styles.blockEditorHeader}>
        <span style={styles.blockBadge}>Texte</span>
        <button onClick={onDelete} style={styles.deleteBtn}>✕</button>
      </div>
      <textarea
        value={block.content}
        onChange={e => onChange({ content: e.target.value })}
        style={styles.textarea}
        rows={4}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <label style={styles.label}>
          Taille
          <input type="number" value={block.fontSize} min={12} max={80}
            onChange={e => onChange({ fontSize: Number(e.target.value) })}
            style={{ ...styles.input, width: 70 }} />
        </label>
        <label style={styles.label}>
          Alignement
          <select value={block.align} onChange={e => onChange({ align: e.target.value })} style={styles.select}>
            <option value="left">Gauche</option>
            <option value="center">Centre</option>
            <option value="right">Droite</option>
          </select>
        </label>
        <label style={{ ...styles.label, flexDirection: "row", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={block.bold} onChange={e => onChange({ bold: e.target.checked })} />
          Gras
        </label>
      </div>
    </div>
  );

  if (block.type === "image") return (
    <div style={styles.blockEditor}>
      <div style={styles.blockEditorHeader}>
        <span style={styles.blockBadge}>Image</span>
        <button onClick={onDelete} style={styles.deleteBtn}>✕</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = ev => onChange({ src: ev.target.result });
          reader.readAsDataURL(f);
        }} />
      {block.src
        ? <div style={{ position: "relative" }}>
            <img src={block.src} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 140, objectFit: "cover" }} />
            <button onClick={() => onChange({ src: null })} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 7px", fontSize: 12 }}>✕</button>
          </div>
        : <button onClick={() => fileRef.current.click()} style={styles.uploadBtn}>
            + Choisir une image
          </button>
      }
      <input value={block.caption} onChange={e => onChange({ caption: e.target.value })}
        placeholder="Légende (optionnel)" style={{ ...styles.input, marginTop: 8, width: "100%", boxSizing: "border-box" }} />
    </div>
  );

  if (block.type === "poll") return (
    <div style={styles.blockEditor}>
      <div style={styles.blockEditorHeader}>
        <span style={styles.blockBadge}>Vote</span>
        <button onClick={onDelete} style={styles.deleteBtn}>✕</button>
      </div>
      <input value={block.question} onChange={e => onChange({ question: e.target.value })}
        placeholder="Question..." style={{ ...styles.input, width: "100%", boxSizing: "border-box", fontWeight: 600, marginBottom: 12 }} />

      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Options de vote</p>
      {block.options.map((opt, i) => (
        <div key={opt.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 18, fontWeight: 700 }}>{i + 1}.</span>
          <input value={opt.label} onChange={e => {
            const opts = block.options.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o);
            onChange({ options: opts });
          }} style={{ ...styles.input, flex: 1 }} placeholder={`Option ${i + 1}`} />
          <input type="number" value={opt.votes} min={0} onChange={e => {
            const opts = block.options.map(o => o.id === opt.id ? { ...o, votes: Number(e.target.value) } : o);
            onChange({ options: opts });
          }} style={{ ...styles.input, width: 60 }} title="Votes (simulation)" />
          {block.options.length > 2 && (
            <button onClick={() => onChange({ options: block.options.filter(o => o.id !== opt.id) })}
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={() => onChange({ options: [...block.options, { id: uid(), label: `Option ${block.options.length + 1}`, votes: 0 }] })}
        style={styles.addOptionBtn}>+ Ajouter une option</button>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Couleur :</span>
        {PALETTE.map(c => (
          <div key={c} onClick={() => onChange({ color: c })} style={{
            width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer",
            border: block.color === c ? "3px solid #1e1b4b" : "2px solid transparent",
            transition: "border 0.15s",
          }} />
        ))}
      </div>
    </div>
  );
}

function SlidePreview({ slide }) {
  return (
    <div style={styles.slideCanvas}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {slide.title}
      </p>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {slide.blocks.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#c7d2fe", fontSize: 14, opacity: 0.6, textAlign: "center" }}>
            Ajoutez des blocs<br />depuis le panneau gauche
          </div>
        )}
        {slide.blocks.map(block => (
          <div key={block.id}>
            {block.type === "text" && (
              <p style={{ margin: 0, fontSize: block.fontSize, textAlign: block.align, fontWeight: block.bold ? 700 : 400, color: "#1e1b4b", lineHeight: 1.4 }}>
                {block.content}
              </p>
            )}
            {block.type === "image" && block.src && (
              <div>
                <img src={block.src} alt={block.caption} style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 260 }} />
                {block.caption && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", textAlign: "center" }}>{block.caption}</p>}
              </div>
            )}
            {block.type === "image" && !block.src && (
              <div style={{ background: "#f3f4f6", borderRadius: 10, height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
                📷 Aucune image
              </div>
            )}
            {block.type === "poll" && <PollPreview block={block} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [slides, setSlides] = useState([defaultSlide()]);
  const [activeSlideId, setActiveSlideId] = useState(slides[0].id);
  const [activeBlockId, setActiveBlockId] = useState(null);

  const activeSlide = slides.find(s => s.id === activeSlideId);

  const updateSlide = useCallback((id, patch) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const updateBlock = useCallback((slideId, blockId, patch) => {
    setSlides(prev => prev.map(s => s.id === slideId
      ? { ...s, blocks: s.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b) }
      : s));
  }, []);

  const addBlock = (type) => {
    const block = defaultBlock(type);
    updateSlide(activeSlideId, { blocks: [...activeSlide.blocks, block] });
    setActiveBlockId(block.id);
  };

  const deleteBlock = (blockId) => {
    updateSlide(activeSlideId, { blocks: activeSlide.blocks.filter(b => b.id !== blockId) });
    setActiveBlockId(null);
  };

  const addSlide = () => {
    const s = defaultSlide();
    setSlides(prev => [...prev, s]);
    setActiveSlideId(s.id);
    setActiveBlockId(null);
  };

  const deleteSlide = (id) => {
    if (slides.length === 1) return;
    const remaining = slides.filter(s => s.id !== id);
    setSlides(remaining);
    if (activeSlideId === id) setActiveSlideId(remaining[0].id);
  };

  const moveBlock = (blockId, dir) => {
    const blocks = [...activeSlide.blocks];
    const i = blocks.findIndex(b => b.id === blockId);
    if (i + dir < 0 || i + dir >= blocks.length) return;
    [blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]];
    updateSlide(activeSlideId, { blocks });
  };

  return (
    <div style={styles.root}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logo}>◈</div>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.02em" }}>SlideBuilder</span>
          <span style={{ fontSize: 12, color: "#a5b4fc", background: "rgba(165,180,252,0.15)", padding: "2px 10px", borderRadius: 99 }}>MVP</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.headerBtn} onClick={() => {
            const json = JSON.stringify(slides, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "slides.json"; a.click();
          }}>Exporter JSON</button>
        </div>
      </div>

      <div style={styles.workspace}>
        {/* SIDEBAR LEFT: Slides list */}
        <div style={styles.sidebarLeft}>
          <p style={styles.sidebarTitle}>Slides</p>
          {slides.map((s, i) => (
            <div key={s.id}
              onClick={() => { setActiveSlideId(s.id); setActiveBlockId(null); }}
              style={{ ...styles.slideThumb, ...(s.id === activeSlideId ? styles.slideThumbActive : {}) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700 }}>#{i + 1}</span>
                {slides.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); deleteSlide(s.id); }}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0 }}>✕</button>
                )}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#e0e7ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#818cf8" }}>{s.blocks.length} bloc{s.blocks.length !== 1 ? "s" : ""}</p>
            </div>
          ))}
          <button onClick={addSlide} style={styles.addSlideBtn}>+ Nouvelle slide</button>
        </div>

        {/* EDITOR CENTER */}
        <div style={styles.editorCenter}>
          {/* Slide title */}
          <div style={styles.slideTitleRow}>
            <input
              value={activeSlide.title}
              onChange={e => updateSlide(activeSlideId, { title: e.target.value })}
              style={styles.slideTitleInput}
              placeholder="Titre de la slide"
            />
          </div>

          {/* Add block buttons */}
          <div style={styles.addBlockRow}>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 6 }}>Ajouter</span>
            {Object.entries(BLOCK_TYPES).map(([type, { label, icon }]) => (
              <button key={type} onClick={() => addBlock(type)} style={styles.addBlockBtn}>
                <span style={{ fontWeight: 700 }}>{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* Blocks list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 0 20px" }}>
            {activeSlide.blocks.length === 0 && (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <p style={{ margin: 0, color: "#9ca3af", fontSize: 14 }}>Cliquez sur un bouton ci-dessus<br />pour ajouter votre premier bloc</p>
              </div>
            )}
            {activeSlide.blocks.map((block, i) => (
              <div key={block.id}
                onClick={() => setActiveBlockId(block.id)}
                style={{ ...styles.blockRow, ...(block.id === activeBlockId ? styles.blockRowActive : {}) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: activeBlockId === block.id ? 12 : 0 }}>
                  <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                    {BLOCK_TYPES[block.type].icon} {BLOCK_TYPES[block.type].label}
                    {block.type === "text" && <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>{block.content.slice(0, 30)}…</span>}
                    {block.type === "poll" && <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>{block.options.length} options</span>}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} style={styles.moveBtn} title="Monter">↑</button>
                    <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} style={styles.moveBtn} title="Descendre">↓</button>
                  </div>
                </div>
                {activeBlockId === block.id && (
                  <BlockEditor
                    block={block}
                    onChange={patch => updateBlock(activeSlideId, block.id, patch)}
                    onDelete={() => deleteBlock(block.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* PREVIEW RIGHT */}
        <div style={styles.previewPanel}>
          <p style={styles.sidebarTitle}>Aperçu</p>
          <SlidePreview slide={activeSlide} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
            {slides.map((s, i) => (
              <div key={s.id}
                onClick={() => { setActiveSlideId(s.id); setActiveBlockId(null); }}
                style={{
                  width: 8, height: 8, borderRadius: "50%", cursor: "pointer",
                  background: s.id === activeSlideId ? "#818cf8" : "#d1d5db",
                  transition: "background 0.2s",
                }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    display: "flex", flexDirection: "column",
    height: "100vh", minHeight: 600,
    background: "#f8f9ff", color: "#1e1b4b",
    overflow: "hidden",
  },
  header: {
    background: "#1e1b4b",
    padding: "12px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderBottom: "1px solid #312e81",
    flexShrink: 0,
  },
  logo: {
    width: 32, height: 32, background: "#818cf8", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, color: "#fff", fontWeight: 900,
  },
  headerBtn: {
    background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.3)",
    color: "#a5b4fc", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  workspace: {
    display: "flex", flex: 1, overflow: "hidden",
  },
  sidebarLeft: {
    width: 160, background: "#1e1b4b", borderRight: "1px solid #312e81",
    padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8,
    overflowY: "auto", flexShrink: 0,
  },
  sidebarTitle: {
    margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#818cf8",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  slideThumb: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(129,140,248,0.15)",
    borderRadius: 8, padding: "10px 10px 10px", cursor: "pointer",
    transition: "all 0.15s",
  },
  slideThumbActive: {
    background: "rgba(129,140,248,0.15)", borderColor: "#818cf8",
  },
  addSlideBtn: {
    background: "none", border: "1px dashed rgba(129,140,248,0.4)",
    color: "#818cf8", borderRadius: 8, padding: "8px", cursor: "pointer",
    fontSize: 12, fontWeight: 700, width: "100%", marginTop: 4,
  },
  editorCenter: {
    flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
    padding: "0", background: "#fff",
  },
  slideTitleRow: {
    padding: "16px 20px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0,
  },
  slideTitleInput: {
    width: "100%", boxSizing: "border-box",
    border: "none", outline: "none",
    fontSize: 20, fontWeight: 800, color: "#1e1b4b",
    fontFamily: "inherit",
    background: "transparent",
  },
  addBlockRow: {
    padding: "10px 20px", display: "flex", alignItems: "center", gap: 8,
    borderBottom: "1px solid #f3f4f6", flexShrink: 0, flexWrap: "wrap",
  },
  addBlockBtn: {
    background: "#f5f3ff", border: "1px solid #e0e7ff",
    color: "#6366f1", borderRadius: 8, padding: "6px 14px",
    cursor: "pointer", fontSize: 12, fontWeight: 700,
    display: "flex", alignItems: "center", gap: 6,
    transition: "all 0.15s",
  },
  blockRow: {
    margin: "8px 20px", borderRadius: 10,
    border: "1px solid #f3f4f6", padding: "10px 14px",
    cursor: "pointer", transition: "all 0.15s", background: "#fff",
  },
  blockRowActive: {
    borderColor: "#818cf8", background: "#fafafe", boxShadow: "0 0 0 3px rgba(129,140,248,0.12)",
  },
  emptyState: {
    margin: "60px 20px", textAlign: "center", padding: "40px",
    background: "#f9fafb", borderRadius: 16, border: "2px dashed #e5e7eb",
  },
  blockEditor: {
    marginTop: 4,
  },
  blockEditorHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
  },
  blockBadge: {
    fontSize: 10, fontWeight: 700, color: "#6366f1",
    background: "#ede9fe", padding: "2px 8px", borderRadius: 99,
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  deleteBtn: {
    background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444",
    borderRadius: 6, cursor: "pointer", padding: "2px 8px", fontSize: 12, fontWeight: 700,
  },
  textarea: {
    width: "100%", boxSizing: "border-box", padding: "10px",
    border: "1px solid #e5e7eb", borderRadius: 8,
    fontFamily: "inherit", fontSize: 14, resize: "vertical",
    outline: "none", lineHeight: 1.5,
  },
  input: {
    padding: "6px 10px", border: "1px solid #e5e7eb",
    borderRadius: 8, fontFamily: "inherit", fontSize: 13,
    outline: "none", color: "#1e1b4b",
  },
  select: {
    padding: "6px 10px", border: "1px solid #e5e7eb",
    borderRadius: 8, fontFamily: "inherit", fontSize: 13,
    outline: "none", color: "#1e1b4b", background: "#fff",
  },
  label: {
    display: "flex", flexDirection: "column", gap: 4,
    fontSize: 11, fontWeight: 700, color: "#6b7280",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  uploadBtn: {
    width: "100%", padding: "24px", background: "#f9fafb",
    border: "2px dashed #d1d5db", borderRadius: 8, cursor: "pointer",
    color: "#6b7280", fontSize: 13, fontWeight: 600,
  },
  addOptionBtn: {
    background: "none", border: "1px dashed #6366f1",
    color: "#6366f1", borderRadius: 8, padding: "6px 14px",
    cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%",
    marginTop: 4,
  },
  moveBtn: {
    background: "#f3f4f6", border: "none", borderRadius: 4,
    cursor: "pointer", padding: "2px 6px", fontSize: 12, color: "#6b7280",
  },
  previewPanel: {
    width: 340, background: "#f5f3ff", borderLeft: "1px solid #e0e7ff",
    padding: "16px", display: "flex", flexDirection: "column", flexShrink: 0,
    overflowY: "auto",
  },
  slideCanvas: {
    background: "#fff", borderRadius: 16, border: "1px solid #e0e7ff",
    padding: "24px", flex: 1, display: "flex", flexDirection: "column",
    boxShadow: "0 4px 24px rgba(99,102,241,0.08)",
    minHeight: 380,
  },
};
