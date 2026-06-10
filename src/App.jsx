import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const makeJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const POLL_PALETTE = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];
const GOOGLE_FONTS = ["Inter","Roboto","Open Sans","Lato","Montserrat","Poppins","Raleway","Nunito","Oswald","Merriweather","Playfair Display","Lora","Source Sans 3","Ubuntu","Work Sans","Mulish","Quicksand","DM Sans","Space Grotesk","Outfit","Josefin Sans","Cabin","Karla","Jost","Barlow","Exo 2","Rubik","Manrope","Fira Sans","Noto Sans","PT Sans","Crimson Text","EB Garamond","Libre Baskerville","Cormorant Garamond","Spectral","Arvo","Bitter","Zilla Slab","Cardo","Dancing Script","Pacifico","Lobster","Caveat","Satisfy","Great Vibes","Bebas Neue","Anton","Righteous","Alfa Slab One"];

const defaultTheme = () => ({ bgColor: "#ffffff", textColor: "#1e1b4b", accentColor: "#6366f1", secondaryBg: "#f5f3ff", pollBarBg: "#e5e7eb", font: "DM Sans" });

// ─── IMAGE UPLOAD TO SUPABASE STORAGE ────────────────────────────────────────
// Returns { url, error }. onProgress(0-100) called during upload.
async function uploadImageToStorage(file, onProgress) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `slides/${uid()}.${ext}`;
  onProgress(10);
  // Supabase JS v2 doesn't expose upload progress natively,
  // so we fake smooth progress while the XHR runs via fetch with a timer trick
  let fakeProgress = 10;
  const progressInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 8, 85);
    onProgress(fakeProgress);
  }, 200);
  try {
    const { data, error } = await supabase.storage
      .from("slide-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    clearInterval(progressInterval);
    if (error) { onProgress(0); return { url: null, error }; }
    const { data: { publicUrl } } = supabase.storage.from("slide-images").getPublicUrl(path);
    onProgress(100);
    return { url: publicUrl, error: null };
  } catch (err) {
    clearInterval(progressInterval);
    onProgress(0);
    return { url: null, error: err };
  }
}

// ─── UPLOAD PROGRESS BAR ─────────────────────────────────────────────────────
function UploadProgress({ progress, label = "Upload en cours…" }) {
  if (progress <= 0 || progress >= 100) return null;
  return (
    <div style={{ margin: "8px 0", background: "#f3f4f6", borderRadius: 8, overflow: "hidden", height: 28, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #6366f1, #818cf8)", transition: "width 0.2s ease", borderRadius: 8 }} />
      <span style={{ position: "relative", fontSize: 11, fontWeight: 700, color: "#6366f1", zIndex: 1 }}>{label}</span>
      <span style={{ position: "relative", fontSize: 11, fontWeight: 800, color: "#6366f1", zIndex: 1, marginLeft: "auto" }}>{Math.round(progress)}%</span>
    </div>
  );
}
const defaultBlock = (type) => {
  if (type === "text") return { id: uid(), type, content: "Votre texte ici...", fontSize: 24, align: "left", bold: false, italic: false, color: null, font: null };
  if (type === "image") return { id: uid(), type, src: null, caption: "" };
  if (type === "poll") return { id: uid(), type, question: "Quelle est votre réponse ?", questionFontSize: 20, options: [{ id: uid(), label: "Option A" }, { id: uid(), label: "Option B" }], correctOptionId: null, color: "#6366f1" };
  return null;
};
const defaultColumn = () => ({ id: uid(), blocks: [] });
const defaultSlide = () => ({ id: uid(), title: "Nouvelle slide", layout: "single", columns: [defaultColumn()] });

// ─── LAYOUTS ─────────────────────────────────────────────────────────────────
const LAYOUTS = [
  { id: "single",   label: "1 colonne",        icon: "▬",  cols: 1, split: null },
  { id: "left-40",  label: "Img ← | Contenu →",icon: "◧",  cols: 2, split: [40, 60] },
  { id: "right-40", label: "Contenu ← | Img →", icon: "◨",  cols: 2, split: [60, 40] },
  { id: "half",     label: "50 / 50",           icon: "◫",  cols: 2, split: [50, 50] },
  { id: "bento",    label: "Bento",             icon: "⊞",  cols: 0, split: null },
];

// ─── BENTO LAYOUT ENGINE ─────────────────────────────────────────────────────
// Real bento: cells have variable spans — some big (2×2, 2×1, 1×2), some small (1×1)
// No photo limit: for n > 8, we generate rows of 4 with a rhythmic big/small pattern
// Returns { gridTemplateColumns, gridTemplateRows, cellAreas[] }
// Each cellArea: { gridColumn, gridRow }

function buildBentoLayout(n) {
  if (n === 0) return { cols: "1fr", rows: "200px", cells: [] };

  const GAP = 8; // visual only, not in calc
  // Fixed templates for small counts (hand-crafted for best look)
  const TEMPLATES = {
    1: {
      cols: "1fr",
      rows: "1fr",
      cells: [{ col:"1/2", row:"1/2" }],
    },
    2: {
      cols: "3fr 2fr",
      rows: "1fr",
      cells: [{ col:"1/2", row:"1/2" }, { col:"2/3", row:"1/2" }],
    },
    3: {
      cols: "2fr 1fr",
      rows: "1fr 1fr",
      cells: [{ col:"1/2", row:"1/3" }, { col:"2/3", row:"1/2" }, { col:"2/3", row:"2/3" }],
    },
    4: {
      cols: "2fr 1fr 1fr",
      rows: "1fr 1fr",
      cells: [
        { col:"1/2", row:"1/3" },
        { col:"2/3", row:"1/2" }, { col:"3/4", row:"1/2" },
        { col:"2/4", row:"2/3" },
      ],
    },
    5: {
      cols: "2fr 1fr 1fr",
      rows: "1fr 1fr",
      cells: [
        { col:"1/2", row:"1/3" },
        { col:"2/3", row:"1/2" }, { col:"3/4", row:"1/2" },
        { col:"2/3", row:"2/3" }, { col:"3/4", row:"2/3" },
      ],
    },
    6: {
      cols: "1fr 2fr 1fr",
      rows: "1fr 1fr",
      cells: [
        { col:"1/2", row:"1/2" }, { col:"2/3", row:"1/3" }, { col:"3/4", row:"1/2" },
        { col:"1/2", row:"2/3" },                           { col:"3/4", row:"2/3" },
        { col:"2/3", row:"2/3" },
      ],
    },
    7: {
      cols: "1fr 1fr 2fr",
      rows: "1fr 1fr 1fr",
      cells: [
        { col:"1/2", row:"1/2" }, { col:"2/3", row:"1/2" }, { col:"3/4", row:"1/3" },
        { col:"1/2", row:"2/3" }, { col:"2/3", row:"2/3" },
        { col:"1/3", row:"3/4" },                           { col:"3/4", row:"3/4" },
      ],
    },
    8: {
      cols: "1fr 2fr 1fr",
      rows: "1fr 1fr 1fr",
      cells: [
        { col:"1/2", row:"1/2" }, { col:"2/3", row:"1/3" }, { col:"3/4", row:"1/2" },
        { col:"1/2", row:"2/3" },                           { col:"3/4", row:"2/3" },
        { col:"1/2", row:"3/4" }, { col:"2/3", row:"3/4" }, { col:"3/4", row:"3/4" },
      ],
    },
    9: {
      cols: "1fr 1fr 1fr",
      rows: "2fr 1fr 1fr",
      cells: [
        { col:"1/2", row:"1/2" }, { col:"2/3", row:"1/2" }, { col:"3/4", row:"1/2" },
        { col:"1/2", row:"2/3" }, { col:"2/4", row:"2/3" },
        { col:"1/3", row:"3/4" },                           { col:"3/4", row:"3/4" },
        { col:"2/3", row:"3/4" },
        // reflow 9th
        { col:"1/2", row:"2/3" },
      ],
    },
  };

  if (n <= 9 && TEMPLATES[n]) {
    const t = TEMPLATES[n];
    return { cols: t.cols, rows: t.rows, cells: t.cells };
  }

  // For n > 9: generate rows of 3 columns, with a repeating bento rhythm
  // Rhythm per row-group of 3:
  // Pattern A: [big(2col×1row), small, small] + [small, small, small]  = 5 photos in 2 rows
  // We cycle this 3-col grid with big items every 5th slot
  const NCOLS = 3;
  // Build a flat list of cell sizes: 0=small(1×1), 1=wide(2×1), 2=tall(1×2)
  // Pattern: W S / S S S / T S S / S T S ...
  const cells = [];
  let row = 1;
  let colCursor = 1; // 1-indexed current column position
  let usedInRow = 0;

  const rowHeight = "160px";
  let maxRow = 1;

  // Simple approach: fill 3-col grid densely with occasional big cells
  // Big cell every 5 items: spans 2 cols (wide)
  let placed = 0;
  // Track a 2D occupied map
  const occupied = {}; // key: "col,row"
  const mark = (c, r, w, h) => {
    for (let dc = 0; dc < w; dc++)
      for (let dr = 0; dr < h; dr++)
        occupied[`${c+dc},${r+dr}`] = true;
  };
  const isFree = (c, r, w, h) => {
    for (let dc = 0; dc < w; dc++)
      for (let dr = 0; dr < h; dr++)
        if (occupied[`${c+dc},${r+dr}`]) return false;
    return true;
  };
  const findFree = (w, h) => {
    for (let r = 1; r <= 100; r++)
      for (let c = 1; c <= NCOLS - w + 1; c++)
        if (isFree(c, r, w, h)) return { c, r };
    return { c: 1, r: 1 };
  };

  for (let i = 0; i < n; i++) {
    // Every ~4th cell becomes a wide (2×1) cell
    const isWide = (i % 5 === 0) && (i > 0 || n > 3);
    const w = isWide ? 2 : 1;
    const h = 1;
    const { c, r } = findFree(w, h);
    mark(c, r, w, h);
    cells.push({ col: `${c}/${c+w}`, row: `${r}/${r+h}` });
    if (r + h - 1 > maxRow) maxRow = r + h - 1;
  }

  return {
    cols: `repeat(${NCOLS}, 1fr)`,
    rows: `repeat(${maxRow}, ${rowHeight})`,
    cells,
  };
}

// ─── FONT LOADER ─────────────────────────────────────────────────────────────
function loadGoogleFont(font) {
  if (!font || font === "DM Sans") return;
  const id = `gf-${font.replace(/\s/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id; link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap`;
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
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && <p style={s.sectionLabel}>{label}</p>}
      <button onClick={() => setOpen(v => !v)} style={{ ...s.input, width: "100%", boxSizing: "border-box", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: current }}>
        <span style={{ fontSize: 13 }}>{current}</span><span style={{ color: "#9ca3af", fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 999, maxHeight: 240, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "7px 9px", borderBottom: "1px solid #f3f4f6" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ ...s.input, width: "100%", boxSizing: "border-box", fontSize: 12 }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.map(f => { loadGoogleFont(f); return (
              <div key={f} onClick={() => { onChange(f); loadGoogleFont(f); setOpen(false); setSearch(""); }}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: 14, fontFamily: f, background: f === current ? "#f5f3ff" : "transparent", color: f === current ? "#6366f1" : "#1e1b4b", fontWeight: f === current ? 700 : 400 }}>
                {f}
              </div>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR CODE ─────────────────────────────────────────────────────────────────
function QRCode({ value, size = 120 }) {
  return <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1e1b4b&margin=2`} alt="QR" style={{ width: size, height: size, borderRadius: 8, display: "block", flexShrink: 0 }} />;
}

// ─── POLL DISPLAY ─────────────────────────────────────────────────────────────
function PollDisplay({ block, theme, voteCounts = {}, totalVotes = 0, showCorrect = false, myVoteId = null, revealed = false }) {
  const showBars = showCorrect || revealed;
  const font = theme?.font || "DM Sans";
  const qFontSize = block.questionFontSize || 20;
  const hasImages = block.options.some(o => o.image);
  const n = block.options.length;

  // Reveal animation: fade out bars, fade in winner
  const [revealPhase, setRevealPhase] = useState(0);
  const prevShowCorrect = useRef(false);
  useEffect(() => {
    if (showCorrect && !prevShowCorrect.current && hasImages && block.correctOptionId) {
      setRevealPhase(1);
      setTimeout(() => setRevealPhase(2), 600);
    }
    if (!showCorrect && prevShowCorrect.current) setRevealPhase(0);
    prevShowCorrect.current = showCorrect;
  }, [showCorrect, hasImages, block.correctOptionId]);

  const correctOpt = block.options.find(o => o.id === block.correctOptionId);

  // --- Fluid sizing: scale everything to fill vertical space ---
  // We use CSS flex to distribute space evenly.
  // Fixed elements per option: label row + bar row.
  // We size them proportionally: fewer options → bigger elements.
  // Base sizes at n=4. Scale = clamp(4/n, 0.45, 1.8)
  const scale = Math.min(1.8, Math.max(0.45, 4 / n));
  const imgSize   = Math.round(68 * scale);
  const barHeight = Math.round(52 * scale);
  const labelFs   = Math.round(18 * scale);
  const halfImg   = imgSize / 2;
  const rowGap    = Math.round(10 * scale);

  // Winner reveal screen
  if (revealPhase === 2 && hasImages && correctOpt) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, animation: "fadeIn 0.5s ease" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: qFontSize, color: theme?.textColor || "#1e1b4b", textAlign: "center", fontFamily: font }}>{block.question}</p>
        {correctOpt.image && (
          <div style={{ width: 180, height: 180, borderRadius: "50%", overflow: "hidden", border: "5px solid #10b981", boxShadow: "0 0 0 8px rgba(16,185,129,0.15)", animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <img src={correctOpt.image} alt={correctOpt.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#10b981", fontSize: 28, fontWeight: 900 }}>✓</span>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 22, color: theme?.textColor || "#1e1b4b", textAlign: "center", fontFamily: font }}>{correctOpt.label}</p>
        </div>
        {totalVotes > 0 && <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", fontFamily: font }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", opacity: revealPhase === 1 ? 0 : 1, transition: "opacity 0.5s ease" }}>
      {/* Question */}
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: qFontSize, color: theme?.textColor || "#1e1b4b", lineHeight: 1.3, fontFamily: font, flexShrink: 0 }}>{block.question}</p>

      {/* Options — each gets equal share of remaining vertical space, gap capped at 20px */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "min(20px, 2vh)", minHeight: 0 }}>
        {block.options.map((opt) => {
          const votes = voteCounts[opt.id] || 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isCorrect = block.correctOptionId === opt.id;
          const isMyVote = myVoteId === opt.id;
          let barColor = block.color || theme?.accentColor || "#6366f1";
          if (showCorrect && isCorrect) barColor = "#10b981";
          if (showCorrect && isMyVote && !isCorrect && block.correctOptionId) barColor = "#ef4444";
          const barPct = showBars ? Math.max(pct, pct > 0 ? 1 : 0) : 0;
          const avatarLeft = `calc(${halfImg}px + ${barPct / 100} * (100% - ${imgSize}px))`;

          return (
            <div key={opt.id} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
              {/* Label */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: labelFs, fontWeight: 600, color: theme?.textColor || "#374151", alignItems: "center", fontFamily: font, flexShrink: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: Math.round(labelFs * 0.3) }}>
                  {showCorrect && isCorrect && <span style={{ color: "#10b981" }}>✓</span>}
                  {showCorrect && isMyVote && !isCorrect && block.correctOptionId && <span style={{ color: "#ef4444" }}>✗</span>}
                  {isMyVote && <span style={{ fontSize: Math.round(labelFs * 0.65), background: barColor, color: "#fff", padding: "2px 7px", borderRadius: 99, fontWeight: 700 }}>Ton choix</span>}
                  {opt.label}
                </span>
                {showBars && <span style={{ color: barColor, fontWeight: 800 }}>{pct}%</span>}
              </div>

              {/* Bar + avatar */}
              <div style={{ position: "relative", height: hasImages ? imgSize + 8 : barHeight, flexShrink: 0 }}>
                <div style={{ position: "absolute", left: hasImages ? halfImg : 0, right: hasImages ? halfImg : 0, top: "50%", transform: "translateY(-50%)", height: barHeight, background: theme?.pollBarBg || "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: barColor, width: `${barPct}%`, transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", paddingLeft: !hasImages && showBars && pct > 10 ? 12 : 0, boxSizing: "border-box" }}>
                    {!hasImages && showBars && pct > 10 && <span style={{ color: "#fff", fontSize: Math.round(labelFs * 0.75), fontWeight: 700 }}>{votes}</span>}
                  </div>
                </div>
                {hasImages && (opt.image ? (
                  <div style={{ position: "absolute", left: avatarLeft, top: "50%", transform: "translate(-50%,-50%)", transition: "left 0.7s cubic-bezier(0.4,0,0.2,1)", width: imgSize, height: imgSize, borderRadius: "50%", overflow: "hidden", border: `${Math.max(2, Math.round(imgSize * 0.06))}px solid ${barColor}`, background: "#fff", boxShadow: "0 3px 14px rgba(0,0,0,0.22)", zIndex: 2 }}>
                    <img src={opt.image} alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ) : (
                  <div style={{ position: "absolute", left: avatarLeft, top: "50%", transform: "translate(-50%,-50%)", transition: "left 0.7s cubic-bezier(0.4,0,0.2,1)", width: imgSize, height: imgSize, borderRadius: "50%", border: `${Math.max(2, Math.round(imgSize * 0.06))}px solid ${barColor}`, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(imgSize * 0.3), color: "#9ca3af", boxShadow: "0 2px 10px rgba(0,0,0,0.1)", zIndex: 2 }}>?</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {totalVotes > 0 && <p style={{ margin: "6px 0 0", fontSize: Math.round(labelFs * 0.65), color: "#9ca3af", textAlign: "right", fontFamily: font, flexShrink: 0 }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>}
    </div>
  );
}

// ─── BLOCK RENDERER (shared) ─────────────────────────────────────────────────
function BlockRenderer({ block, theme, scale = 1, fill = false, voteCounts, totalVotes, showCorrect, myVoteId, revealed }) {
  const font = block.font || theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);
  if (block.type === "text") return (
    <p style={{ margin: 0, fontSize: block.fontSize * scale, textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal", color: block.color || theme?.textColor || "#1e1b4b", lineHeight: 1.45, fontFamily: font, wordBreak: "break-word" }}>{block.content}</p>
  );
  if (block.type === "image") return block.src
    ? <div style={{ ...(fill ? { position: "absolute", inset: 0 } : {}), display: "flex", alignItems: "stretch" }}>
        <img src={block.src} alt={block.caption || ""} style={{ width: "100%", height: fill ? "100%" : "auto", ...(fill ? { objectFit: "cover", position: "absolute", inset: 0 } : { objectFit: "cover", borderRadius: 10 * scale, display: "block", maxHeight: fill ? "none" : 300 * scale }) }} />
        {block.caption && !fill && <p style={{ margin: "5px 0 0", fontSize: 11 * scale, color: "#6b7280", textAlign: "center", fontFamily: font }}>{block.caption}</p>}
      </div>
    : <div style={{ background: "#f3f4f6", borderRadius: 8, height: fill ? "100%" : 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>📷 Aucune image</div>;
  if (block.type === "poll") return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <PollDisplay block={block} theme={theme} voteCounts={voteCounts} totalVotes={totalVotes} showCorrect={showCorrect} myVoteId={myVoteId} revealed={revealed} />
    </div>
  );
  return null;
}

// ─── BENTO CANVAS ─────────────────────────────────────────────────────────────
function BentoCanvas({ slide, theme, scale = 1 }) {
  const photos = slide.bentoPhotos || [];
  const font = theme?.font || "DM Sans";
  const n = photos.length;

  if (n === 0) return (
    <div style={{ background: theme?.bgColor || "#fff", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, boxSizing: "border-box" }}>
      <div style={{ fontSize: 40 }}>⊞</div>
      <p style={{ margin: 0, color: "#9ca3af", fontSize: 14, textAlign: "center", fontFamily: font }}>Ajoutez des photos dans le panneau de droite</p>
    </div>
  );

  const { cols, rows, cells } = buildBentoLayout(n);
  const gap = Math.max(4, 8 * scale);
  const radius = Math.max(6, 14 * scale);
  const titleFs = Math.max(14, 22 * scale);
  const pad = Math.max(10, 14 * scale);

  return (
    <div style={{ background: theme?.bgColor || "#fff", height: "100%", display: "flex", flexDirection: "column", padding: pad, gap: Math.max(6, 10 * scale), boxSizing: "border-box", overflow: "hidden" }}>
      {slide.title && !slide.hideTitle && (
        <p style={{ margin: 0, fontSize: titleFs, fontWeight: 800, textAlign: "center", color: theme?.textColor || "#1e1b4b", fontFamily: font, flexShrink: 0, lineHeight: 1.2 }}>{slide.title}</p>
      )}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: cols, gridTemplateRows: rows, gap, minHeight: 0, overflow: "hidden" }}>
        {photos.map((photo, i) => {
          const cell = cells[i];
          if (!cell) return null;
          return (
            <div key={photo.id} style={{ gridColumn: cell.col, gridRow: cell.row, overflow: "hidden", borderRadius: radius, background: "#e5e7eb", position: "relative" }}>
              {photo.src && (
                <img src={photo.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BENTO EDITOR ─────────────────────────────────────────────────────────────
function BentoEditor({ slide, onUpdateSlide, onUploadStart, onUploadEnd }) {
  const fileRef = useRef();
  const photos = slide.bentoPhotos || [];
  const [uploadProgresses, setUploadProgresses] = useState({});

  const addPhotos = async (files) => {
    const fileArr = Array.from(files);
    onUploadStart?.();
    const tempIds = fileArr.map(() => uid());
    setUploadProgresses(prev => { const n = { ...prev }; tempIds.forEach(id => { n[id] = 5; }); return n; });
    const results = await Promise.all(fileArr.map(async (file, i) => {
      const tempId = tempIds[i];
      const { url, error } = await uploadImageToStorage(file, (p) => {
        setUploadProgresses(prev => ({ ...prev, [tempId]: p }));
      });
      setUploadProgresses(prev => { const n = { ...prev }; delete n[tempId]; return n; });
      if (error || !url) {
        return new Promise(res => { const r = new FileReader(); r.onload = e => res({ id: uid(), src: e.target.result }); r.readAsDataURL(file); });
      }
      return { id: uid(), src: url };
    }));
    onUpdateSlide({ bentoPhotos: [...photos, ...results] });
    onUploadEnd?.();
  };

  const removePhoto = (id) => onUpdateSlide({ bentoPhotos: photos.filter(p => p.id !== id) });
  const movePhoto = (id, dir) => {
    const arr = [...photos]; const i = arr.findIndex(p => p.id === id);
    if (i + dir < 0 || i + dir >= arr.length) return;
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
    onUpdateSlide({ bentoPhotos: arr });
  };

  const pending = Object.entries(uploadProgresses);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={s.sectionLabel}>Photos bento ({photos.length})</p>
        <button onClick={() => fileRef.current.click()} style={{ ...s.addBlockBtn, fontSize: 11 }}>+ Ajouter</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={e => { addPhotos(e.target.files); e.target.value = ""; }} />
      {pending.map(([id, p]) => <UploadProgress key={id} progress={p} label="Upload photo…" />)}
      {photos.length === 0 && pending.length === 0 && (
        <div style={{ ...s.uploadBtn, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", height: 80, flexDirection: "column", gap: 6 }} onClick={() => fileRef.current.click()}>
          <span style={{ fontSize: 22 }}>📷</span><span>Importer des photos</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: photos.length ? 4 : 0 }}>
        {photos.map((photo, i) => (
          <div key={photo.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#f3f4f6" }}>
            <img src={photo.src} alt="" style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 3, gap: 2 }}>
              <button onClick={() => movePhoto(photo.id, -1)} style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11, lineHeight: 1.4 }}>↑</button>
              <button onClick={() => movePhoto(photo.id, 1)} style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11, lineHeight: 1.4 }}>↓</button>
              <button onClick={() => removePhoto(photo.id)} style={{ background: "rgba(200,0,0,0.7)", border: "none", color: "#fff", borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11, lineHeight: 1.4 }}>✕</button>
            </div>
            <div style={{ position: "absolute", bottom: 3, left: 5, fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{i + 1}</div>
          </div>
        ))}
      </div>
      {photos.length > 0 && <p style={{ margin: "6px 0 0", fontSize: 10, color: "#9ca3af" }}>La grille s'adapte automatiquement.</p>}
    </div>
  );
}

// ─── SLIDE CANVAS (preview + presentation) ───────────────────────────────────
function SlideCanvas({ slide, theme, scale = 1, voteCounts = {}, totalVotes = 0, showCorrect = false, myVoteId = null, revealed = false }) {
  const layout = LAYOUTS.find(l => l.id === slide.layout) || LAYOUTS[0];
  const font = theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);

  if (slide.layout === "bento") return <BentoCanvas slide={slide} theme={theme} scale={scale} />;

  // Check if a column is purely image (1 image block, no other content)
  const isImageOnlyCol = (col) => col.blocks.length === 1 && col.blocks[0].type === "image";
  // Check if column has an image AND other blocks
  const hasImage = (col) => col.blocks.some(b => b.type === "image");
  const otherBlocks = (col) => col.blocks.filter(b => b.type !== "image");

  return (
    <div style={{ background: theme?.bgColor || "#fff", height: "100%", display: "flex", flexDirection: "column", padding: 24 * scale, boxSizing: "border-box", fontFamily: font, overflow: "hidden" }}>
      {slide.title && !slide.hideTitle && (
        <p style={{ margin: "0 0 14px", fontSize: 11 * scale, fontWeight: 700, color: theme?.accentColor || "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: font, flexShrink: 0 }}>{slide.title}</p>
      )}
      <div style={{ display: "flex", gap: 20 * scale, flex: 1, overflow: "hidden", minHeight: 0 }}>
        {slide.columns.map((col, i) => {
          const flex = layout.split ? layout.split[i] : 100;
          const imageOnly = isImageOnlyCol(col);
          const imgBlock = imageOnly ? col.blocks[0] : col.blocks.find(b => b.type === "image");
          const rest = col.blocks.filter(b => b !== imgBlock);

          // Full-height image column: both single-column AND 2-column layouts
          if (imageOnly) return (
            <div key={col.id} style={{ flex, minWidth: 0, position: "relative", borderRadius: 12 * scale, overflow: "hidden" }}>
              {imgBlock?.src
                ? <img src={imgBlock.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>📷</div>
              }
            </div>
          );

          // Mixed column (image + other blocks)
          return (
            <div key={col.id} style={{ flex, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 * scale, overflow: "hidden", height: "100%" }}>
              {col.blocks.map(block => (
                <div key={block.id} style={{
                  flex: block.type === "poll" ? 1 : "none",
                  flexShrink: block.type === "poll" ? 1 : 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}>
                  <BlockRenderer block={block} theme={theme} scale={scale} fill={false}
                    voteCounts={block.type === "poll" ? voteCounts : {}} totalVotes={block.type === "poll" ? totalVotes : 0} showCorrect={showCorrect} revealed={revealed} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── IMAGE BLOCK EDITOR (with Supabase upload + progress) ────────────────────
function ImageBlockEditor({ block, onChange, onDelete, onUploadStart, onUploadEnd }) {
  const fileRef = useRef();
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setProgress(5);
    onUploadStart?.();
    const { url, error } = await uploadImageToStorage(file, (p) => setProgress(p));
    setUploading(false);
    if (error) {
      console.error("Upload error:", error);
      // Fallback to base64 if storage fails (e.g. bucket not configured yet)
      const reader = new FileReader();
      reader.onload = (ev) => { onChange({ src: ev.target.result }); setProgress(100); onUploadEnd?.(); };
      reader.readAsDataURL(file);
    } else {
      onChange({ src: url });
      setProgress(100);
      onUploadEnd?.();
    }
    setTimeout(() => setProgress(0), 1500);
  };

  return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Image</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
      {uploading && <UploadProgress progress={progress} label="Upload de l'image…" />}
      {!uploading && progress === 100 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#d1fae5", borderRadius: 8, marginBottom: 6 }}>
          <span style={{ color: "#10b981", fontWeight: 700, fontSize: 12 }}>✓ Image enregistrée</span>
        </div>
      )}
      {block.src && !uploading ? (
        <div style={{ position: "relative" }}>
          <img src={block.src} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 110, objectFit: "cover", display: "block" }} />
          <button onClick={() => onChange({ src: null })} style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", padding: "1px 6px", fontSize: 11 }}>✕</button>
        </div>
      ) : !uploading ? (
        <button onClick={() => fileRef.current.click()} style={s.uploadBtn}>+ Choisir une image</button>
      ) : null}
      {block.src && (
        <input value={block.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Légende (optionnel)" style={{ ...s.input, marginTop: 7, width: "100%", boxSizing: "border-box" }} />
      )}
    </div>
  );
}

// ─── POLL BLOCK EDITOR (with per-option image upload) ────────────────────────
function PollBlockEditor({ block, theme, onChange, onDelete, onUploadStart, onUploadEnd }) {
  const fileRefs = useRef({});
  const [optUploading, setOptUploading] = useState({});
  const [optProgress, setOptProgress] = useState({});

  const handleOptImage = async (optId, file) => {
    if (!file) return;
    setOptUploading(prev => ({ ...prev, [optId]: true }));
    setOptProgress(prev => ({ ...prev, [optId]: 5 }));
    onUploadStart?.();
    const { url, error } = await uploadImageToStorage(file, (p) => setOptProgress(prev => ({ ...prev, [optId]: p })));
    onUploadEnd?.();
    setOptUploading(prev => ({ ...prev, [optId]: false }));
    if (!error && url) {
      onChange({ options: block.options.map(o => o.id === optId ? { ...o, image: url } : o) });
    } else {
      // base64 fallback
      const reader = new FileReader();
      reader.onload = ev => onChange({ options: block.options.map(o => o.id === optId ? { ...o, image: ev.target.result } : o) });
      reader.readAsDataURL(file);
    }
    setTimeout(() => setOptProgress(prev => { const n = { ...prev }; delete n[optId]; return n; }), 1500);
  };

  return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Vote</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input value={block.question} onChange={e => onChange({ question: e.target.value })} placeholder="Question..." style={{ ...s.input, width: "100%", boxSizing: "border-box", fontWeight: 600, marginBottom: 8 }} />
      <label style={{ ...s.label, marginBottom: 10 }}>
        Taille de la question
        <input type="number" value={block.questionFontSize || 20} min={12} max={60} onChange={e => onChange({ questionFontSize: Number(e.target.value) })} style={{ ...s.input, width: 72, marginTop: 4 }} />
      </label>
      <p style={s.sectionLabel}>Options</p>
      {block.options.map((opt, i) => (
        <div key={opt.id} style={{ marginBottom: 10, background: "#f9fafb", borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 16, fontWeight: 700 }}>{i + 1}.</span>
            <input value={opt.label} onChange={e => onChange({ options: block.options.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o) })} style={{ ...s.input, flex: 1 }} placeholder={`Option ${i + 1}`} />
            <button onClick={() => onChange({ correctOptionId: block.correctOptionId === opt.id ? null : opt.id })} title="Bonne réponse"
              style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid", borderColor: block.correctOptionId === opt.id ? "#10b981" : "#d1d5db", background: block.correctOptionId === opt.id ? "#10b981" : "transparent", color: block.correctOptionId === opt.id ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</button>
            {block.options.length > 2 && <button onClick={() => onChange({ options: block.options.filter(o => o.id !== opt.id) })} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 15 }}>✕</button>}
          </div>
          {/* Image per option */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={el => fileRefs.current[opt.id] = el} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => { handleOptImage(opt.id, e.target.files[0]); e.target.value = ""; }} />
            {opt.image ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", border: "2px solid #e0e7ff", flexShrink: 0 }}>
                  <img src={opt.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <button onClick={() => fileRefs.current[opt.id]?.click()} style={{ fontSize: 11, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Changer</button>
                <button onClick={() => onChange({ options: block.options.map(o => o.id === opt.id ? { ...o, image: null } : o) })} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>✕</button>
              </div>
            ) : optUploading[opt.id] ? (
              <UploadProgress progress={optProgress[opt.id] || 0} label="Upload…" />
            ) : (
              <button onClick={() => fileRefs.current[opt.id]?.click()} style={{ fontSize: 11, color: "#818cf8", background: "#f0eeff", border: "1px dashed #c4b5fd", borderRadius: 99, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>
                + Photo ronde
              </button>
            )}
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ options: [...block.options, { id: uid(), label: `Option ${block.options.length + 1}`, image: null }] })} style={s.addOptionBtn}>+ Option</button>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Couleur :</span>
        {POLL_PALETTE.map(c => <div key={c} onClick={() => onChange({ color: c })} style={{ width: 19, height: 19, borderRadius: "50%", background: c, cursor: "pointer", border: block.color === c ? "3px solid #1e1b4b" : "2px solid transparent" }} />)}
        <input type="color" value={block.color || "#6366f1"} onChange={e => onChange({ color: e.target.value })} style={{ width: 24, height: 24, border: "1px solid #e5e7eb", borderRadius: "50%", cursor: "pointer", padding: 2 }} />
      </div>
    </div>
  );
}

// ─── BLOCK EDITOR ─────────────────────────────────────────────────────────────
function BlockEditor({ block, theme, onChange, onDelete, onUploadStart, onUploadEnd }) {
  const fileRef = useRef();
  if (block.type === "text") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Texte</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <textarea value={block.content} onChange={e => onChange({ content: e.target.value })} style={{ ...s.textarea, fontFamily: block.font || theme?.font || "DM Sans" }} rows={3} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "flex-end" }}>
        <label style={s.label}>Taille<input type="number" value={block.fontSize} min={10} max={100} onChange={e => onChange({ fontSize: Number(e.target.value) })} style={{ ...s.input, width: 62 }} /></label>
        <label style={s.label}>Align<select value={block.align} onChange={e => onChange({ align: e.target.value })} style={s.select}><option value="left">G</option><option value="center">C</option><option value="right">D</option></select></label>
        <label style={{ ...s.label, flexDirection: "row", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={block.bold} onChange={e => onChange({ bold: e.target.checked })} />Gras</label>
        <label style={{ ...s.label, flexDirection: "row", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={!!block.italic} onChange={e => onChange({ italic: e.target.checked })} />Ital.</label>
        <label style={s.label}>Couleur
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <input type="color" value={block.color || theme?.textColor || "#1e1b4b"} onChange={e => onChange({ color: e.target.value })} style={{ width: 30, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }} />
            {block.color && <button onClick={() => onChange({ color: null })} style={{ fontSize: 10, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>↩</button>}
          </div>
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <FontPicker value={block.font || theme?.font || "DM Sans"} onChange={f => onChange({ font: f })} label="Police du bloc" />
        {block.font && <button onClick={() => onChange({ font: null })} style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", marginTop: 3 }}>↩ Police du thème</button>}
      </div>
    </div>
  );
  if (block.type === "image") return (
    <ImageBlockEditor block={block} onChange={onChange} onDelete={onDelete} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
  );
  if (block.type === "poll") return (
    <PollBlockEditor block={block} theme={theme} onChange={onChange} onDelete={onDelete} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
  );
}

// ─── COLUMN EDITOR ────────────────────────────────────────────────────────────
function ColumnEditor({ column, colIndex, theme, onChange, activeBlockId, setActiveBlockId, onUploadStart, onUploadEnd }) {
  const addBlock = (type) => { const b = defaultBlock(type); onChange({ blocks: [...column.blocks, b] }); setActiveBlockId(b.id); };
  const updateBlock = (blockId, patch) => onChange({ blocks: column.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b) });
  const deleteBlock = (blockId) => { onChange({ blocks: column.blocks.filter(b => b.id !== blockId) }); setActiveBlockId(null); };
  const moveBlock = (blockId, dir) => {
    const blocks = [...column.blocks]; const i = blocks.findIndex(b => b.id === blockId);
    if (i + dir < 0 || i + dir >= blocks.length) return;
    [blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]]; onChange({ blocks });
  };
  return (
    <div style={{ borderLeft: colIndex > 0 ? "2px dashed #e0e7ff" : "none", paddingLeft: colIndex > 0 ? 12 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Col. {colIndex + 1}</span>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 9, flexWrap: "wrap" }}>
        {[["text","T","Texte"],["image","⬜","Image"],["poll","▦","Vote"]].map(([type, icon, label]) => (
          <button key={type} onClick={() => addBlock(type)} style={{ ...s.addBlockBtn, padding: "3px 9px", fontSize: 11 }}>{icon} {label}</button>
        ))}
      </div>
      {column.blocks.length === 0 && <p style={{ fontSize: 11, color: "#c7d2fe", textAlign: "center", padding: "12px 0" }}>Colonne vide</p>}
      {column.blocks.map((block, i) => (
        <div key={block.id} onClick={() => setActiveBlockId(block.id)}
          style={{ ...s.blockRow, ...(block.id === activeBlockId ? s.blockRowActive : {}), margin: "0 0 5px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: block.id === activeBlockId ? 10 : 0 }}>
            <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, minWidth: 14 }}>{i + 1}.</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {block.type === "text" ? `T — ${block.content.slice(0, 18)}…` : block.type === "image" ? "⬜ Image" : `▦ ${block.question?.slice(0, 16)}…`}
            </span>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} style={s.moveBtn}>↑</button>
              <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} style={s.moveBtn}>↓</button>
            </div>
          </div>
          {block.id === activeBlockId && <BlockEditor block={block} theme={theme} onChange={p => updateBlock(block.id, p)} onDelete={() => deleteBlock(block.id)} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />}
        </div>
      ))}
    </div>
  );
}

// ─── THEME EDITOR ─────────────────────────────────────────────────────────────
function ThemeEditor({ theme, onChange }) {
  useEffect(() => { loadGoogleFont(theme.font); }, [theme.font]);
  const field = (label, key) => (
    <div style={{ marginBottom: 13 }}>
      <p style={s.sectionLabel}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={theme[key]} onChange={e => onChange({ ...theme, [key]: e.target.value })} style={{ width: 36, height: 28, border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", padding: 2 }} />
        <input value={theme[key]} onChange={e => onChange({ ...theme, [key]: e.target.value })} style={{ ...s.input, width: 84, fontFamily: "monospace", fontSize: 12 }} maxLength={7} />
      </div>
    </div>
  );
  return (
    <div>
      <p style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 14, color: "#1e1b4b" }}>🎨 Thème de la présentation</p>
      <FontPicker value={theme.font} onChange={f => onChange({ ...theme, font: f })} label="Police globale" />
      <div style={{ marginTop: 14 }}>
        {field("Fond des slides", "bgColor")}
        {field("Couleur du texte", "textColor")}
        {field("Couleur d'accent", "accentColor")}
        {field("Fond secondaire", "secondaryBg")}
        {field("Fond barres de vote", "pollBarBg")}
      </div>
      <button onClick={() => onChange(defaultTheme())} style={{ ...s.addOptionBtn, marginTop: 6, width: "100%", fontSize: 11 }}>↩ Réinitialiser</button>
      <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #e0e7ff" }}>
        <div style={{ background: theme.bgColor, padding: 14 }}>
          <p style={{ margin: "0 0 4px", fontFamily: theme.font, fontWeight: 800, fontSize: 15, color: theme.textColor }}>{theme.font}</p>
          <p style={{ margin: "0 0 8px", fontFamily: theme.font, fontSize: 12, color: theme.textColor, opacity: 0.65 }}>Aperçu des couleurs</p>
          <div style={{ height: 7, borderRadius: 4, background: theme.pollBarBg, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "65%", background: theme.accentColor, borderRadius: 4 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SLIDE THUMBNAIL DRAG & DROP ──────────────────────────────────────────────
function SlideThumbnail({ slide, index, isActive, onClick, onDelete, onDuplicate, onDragStart, onDragOver, onDrop, isDragOver }) {
  const nCols = slide.layout === "bento" ? "⊞" : (LAYOUTS.find(l => l.id === slide.layout)?.icon || "▬");
  const blockCount = slide.layout === "bento"
    ? (slide.bentoPhotos?.length || 0) + " 📷"
    : (slide.columns?.flatMap(c => c.blocks).length || 0) + " blocs";
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      onClick={onClick}
      style={{ ...s.slideThumb, ...(isActive ? s.slideThumbActive : {}), ...(isDragOver ? { borderColor: "#f59e0b", background: "rgba(245,158,11,0.12)" } : {}), cursor: "grab", userSelect: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700 }}>#{index + 1}</span>
        <div style={{ display: "flex", gap: 3 }}>
          <button onClick={e => { e.stopPropagation(); onDuplicate(); }} style={{ background: "none", border: "none", color: "#a5b4fc", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "1px 3px" }} title="Dupliquer">⎘</button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11, lineHeight: 1 }}>✕</button>
        </div>
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#e0e7ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slide.title}</p>
      <p style={{ margin: "2px 0 0", fontSize: 9, color: "#818cf8" }}>{blockCount} · {nCols}</p>
    </div>
  );
}

// ─── PRESENTATION MODE ───────────────────────────────────────────────────────
function PresentationMode({ slides, theme, sessionCode, sessionId, onExit }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [voteCounts, setVoteCounts] = useState({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const currentSlide = slides[currentIdx];
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=${sessionCode}`;

  useEffect(() => {
    if (!sessionId) return;
    setVoteCounts({}); setTotalVotes(0); setRevealCorrect(false);
    // Results always visible — only correct answer is manually toggled
    supabase.from("sessions").update({ current_slide_index: currentIdx, reveal_results: true, reveal_correct: false }).eq("id", sessionId).then();
  }, [currentIdx, sessionId]);

  const syncReveal = useCallback(async (correct) => {
    if (!sessionId) return;
    await supabase.from("sessions").update({ reveal_results: true, reveal_correct: correct }).eq("id", sessionId);
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

  const pollBlock = currentSlide?.columns?.flatMap(c => c.blocks || []).find(b => b.type === "poll");
  const go = (dir) => { const n = currentIdx + dir; if (n >= 0 && n < slides.length) setCurrentIdx(n); };
  const handleRevealCorrect = () => { const next = !revealCorrect; setRevealCorrect(next); syncReveal(next); };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIdx, slides.length]);

  const [barHidden, setBarHidden] = useState(false);

  return (
    <div style={{ fontFamily: theme?.font || "DM Sans", display: "flex", flexDirection: "column", height: "100vh", background: theme?.bgColor || "#fff", overflow: "hidden", position: "relative" }}>

      {/* TOP BAR — collapsible */}
      {!barHidden && (
        <div style={{ background: "#1e1b4b", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <QRCode value={joinUrl} size={88} />
            <div>
              <p style={{ margin: 0, fontSize: 11, color: "#a5b4fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rejoindre la session</p>
              <p style={{ margin: "4px 0 5px", fontSize: 13, color: "#e0e7ff", fontFamily: "monospace" }}>{joinUrl}</p>
              <span style={{ background: "#312e81", color: "#c7d2fe", padding: "4px 14px", borderRadius: 99, fontSize: 18, fontWeight: 900, letterSpacing: "0.18em" }}>{sessionCode}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {pollBlock && (
              <button onClick={handleRevealCorrect} style={{ ...s.presBtn, background: revealCorrect ? "#10b981" : "rgba(16,185,129,0.15)", borderColor: "#10b981", color: revealCorrect ? "#fff" : "#10b981" }}>
                ✓ {revealCorrect ? "Réponse visible" : "Révéler réponse"}
              </button>
            )}
            <span style={{ color: "#818cf8", fontSize: 14, fontWeight: 700, minWidth: 44, textAlign: "center" }}>{currentIdx + 1}/{slides.length}</span>
            <button onClick={() => go(-1)} disabled={currentIdx === 0} style={{ ...s.presBtn, opacity: currentIdx === 0 ? 0.3 : 1 }}>← Préc.</button>
            <button onClick={() => go(1)} disabled={currentIdx === slides.length - 1} style={{ ...s.presBtn, opacity: currentIdx === slides.length - 1 ? 0.3 : 1 }}>Suiv. →</button>
            <button onClick={onExit} style={{ ...s.presBtn, borderColor: "#f87171", color: "#f87171" }}>✕ Quitter</button>
            <button onClick={() => setBarHidden(true)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "4px 6px", textDecoration: "underline" }}>
              Masquer la barre
            </button>
          </div>
        </div>
      )}

      {/* MINI BAR — shown when top bar is hidden */}
      {barHidden && (
        <div style={{ position: "absolute", top: 10, right: 14, zIndex: 50, display: "flex", alignItems: "center", gap: 8 }}>
          {pollBlock && (
            <button onClick={handleRevealCorrect} style={{ ...s.presBtn, background: revealCorrect ? "#10b981" : "rgba(30,27,75,0.75)", borderColor: "#10b981", color: revealCorrect ? "#fff" : "#10b981", backdropFilter: "blur(4px)" }}>
              ✓ {revealCorrect ? "Réponse visible" : "Réponse"}
            </button>
          )}
          <button onClick={() => go(-1)} disabled={currentIdx === 0} style={{ ...s.presBtn, background: "rgba(30,27,75,0.75)", backdropFilter: "blur(4px)", opacity: currentIdx === 0 ? 0.3 : 1 }}>←</button>
          <button onClick={() => go(1)} disabled={currentIdx === slides.length - 1} style={{ ...s.presBtn, background: "rgba(30,27,75,0.75)", backdropFilter: "blur(4px)", opacity: currentIdx === slides.length - 1 ? 0.3 : 1 }}>→</button>
          <button onClick={() => setBarHidden(false)} style={{ background: "rgba(30,27,75,0.75)", backdropFilter: "blur(4px)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "7px 12px", borderRadius: 8 }}>
            Afficher la barre
          </button>
        </div>
      )}

      {/* SLIDE — full screen, no border/shadow */}
      <div style={{ flex: 1, overflow: "hidden", padding: barHidden ? "0" : "0", display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <SlideCanvas slide={currentSlide} theme={theme} scale={1.2} voteCounts={voteCounts} totalVotes={totalVotes} showCorrect={revealCorrect} revealed={true} />
        </div>
      </div>

      {/* Dots */}
      <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, zIndex: 10 }}>
        {slides.map((sl, i) => <div key={sl.id} onClick={() => setCurrentIdx(i)} style={{ width: i === currentIdx ? 22 : 8, height: 8, borderRadius: 99, background: i === currentIdx ? "#818cf8" : "rgba(129,140,248,0.4)", cursor: "pointer", transition: "all 0.2s" }} />)}
      </div>
    </div>
  );
}

// ─── PARTICIPANT VIEW ─────────────────────────────────────────────────────────
function ParticipantView({ joinCode }) {
  const [sessionData, setSessionData] = useState(null);
  const [slides, setSlides] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealResults, setRevealResults] = useState(false);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const [voted, setVoted] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(defaultTheme());
  const [token] = useState(() => { let t = localStorage.getItem("ptk"); if (!t) { t = uid(); localStorage.setItem("ptk", t); } return t; });

  useEffect(() => {
    if (!joinCode) return;
    (async () => {
      setLoading(true);
      const { data: sess, error: e1 } = await supabase.from("sessions").select("id, presentation_id, current_slide_index, is_active, reveal_results, reveal_correct").eq("join_code", joinCode.toUpperCase().trim()).eq("is_active", true).maybeSingle();
      if (e1 || !sess) { setError(`Session "${joinCode.toUpperCase()}" introuvable ou terminée.`); setLoading(false); return; }
      const { data: slidesData } = await supabase.from("slides").select("id, position, title, blocks, layout, columns, bento_photos").eq("presentation_id", sess.presentation_id).order("position", { ascending: true });
      const { data: pres } = await supabase.from("presentations").select("theme").eq("id", sess.presentation_id).single();
      if (pres?.theme) setTheme(pres.theme);
      setSessionData({ sessionId: sess.id });
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionData.sessionId}` }, (p) => {
        setCurrentIdx(p.new.current_slide_index || 0);
        setRevealResults(!!p.new.reveal_results);
        setRevealCorrect(!!p.new.reveal_correct);
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [sessionData]);

  const parseJ = (v) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return []; } })();
  const normalizeSlide = (sl) => {
    if (!sl) return null;
    if (sl.columns) {
      const cols = parseJ(sl.columns);
      return { ...sl, layout: sl.layout || "single", columns: cols.map(c => ({ ...c, blocks: parseJ(c.blocks) })), bentoPhotos: parseJ(sl.bento_photos || "[]") };
    }
    return { ...sl, layout: "single", columns: [{ id: "c1", blocks: parseJ(sl.blocks) }], bentoPhotos: [] };
  };

  const currentSlide = normalizeSlide(slides[currentIdx]);
  const allBlocks = currentSlide ? currentSlide.columns.flatMap(c => c.blocks) : [];
  const poll = allBlocks.find(b => b.type === "poll");
  const myVote = voted[currentIdx];
  const hasVoted = !!myVote;
  const correctId = poll?.correctOptionId;
  const gotItRight = hasVoted && correctId && myVote === correctId;
  const gotItWrong = hasVoted && correctId && myVote !== correctId;
  const font = theme?.font || "DM Sans";
  useEffect(() => { loadGoogleFont(font); }, [font]);

  const handleVote = async (optionId) => {
    if (hasVoted || !sessionData || !slides[currentIdx]) return;
    const { error } = await supabase.from("votes").insert({ session_id: sessionData.sessionId, slide_id: slides[currentIdx].id, slide_index: currentIdx, option_id: optionId, participant_token: token });
    if (!error) setVoted(prev => ({ ...prev, [currentIdx]: optionId }));
  };

  const Header = () => (
    <div style={{ background: "#1e1b4b", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff", fontFamily: font }}>SlideBuilder</span></div>
      <span style={{ fontSize: 12, color: "#a5b4fc", background: "rgba(165,180,252,0.15)", padding: "3px 10px", borderRadius: 99, fontWeight: 700 }}>{currentIdx + 1}/{slides.length}</span>
    </div>
  );

  if (loading) return <div style={{ ...s.mobileRoot, fontFamily: font }}><Header /><div style={s.mobileLoader}><div style={s.spinner} /><p style={{ color: "#818cf8", marginTop: 14 }}>Connexion…</p></div></div>;
  if (error) return <div style={{ ...s.mobileRoot, fontFamily: font }}><Header /><div style={s.mobileLoader}><p style={{ color: "#f87171", textAlign: "center", fontSize: 14 }}>{error}</p></div></div>;

  return (
    <div style={{ ...s.mobileRoot, background: theme?.bgColor || "#f8f9ff", fontFamily: font }}>
      <Header />
      <div style={s.mobileContent}>
        {!currentSlide && <p style={{ color: "#818cf8", textAlign: "center", marginTop: 40 }}>En attente…</p>}
        {currentSlide && (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: theme?.accentColor || "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{currentSlide.title}</p>
            {allBlocks.filter(b => b.type !== "poll").map(block => (
              <div key={block.id} style={{ marginBottom: 14 }}><BlockRenderer block={block} theme={theme} scale={0.9} /></div>
            ))}
            {poll && (
              <div>
                <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: poll.questionFontSize || 18, color: theme?.textColor || "#1e1b4b", lineHeight: 1.3, fontFamily: font }}>{poll.question}</p>
                {!hasVoted ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {poll.options.map(opt => (
                      <button key={opt.id} onClick={() => handleVote(opt.id)} style={{ ...s.voteBtn, background: theme?.bgColor || "#fff", color: theme?.textColor || "#1e1b4b", borderColor: (theme?.accentColor || "#6366f1") + "44", fontFamily: font }}>{opt.label}</button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {revealCorrect && correctId && (
                      <div style={{ background: gotItRight ? "#d1fae5" : "#fee2e2", border: `2px solid ${gotItRight ? "#10b981" : "#ef4444"}`, borderRadius: 12, padding: "13px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{gotItRight ? "🎉" : "😅"}</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: gotItRight ? "#065f46" : "#991b1b", fontFamily: font }}>{gotItRight ? "Bonne réponse !" : "Pas tout à fait…"}</p>
                          {gotItWrong && <p style={{ margin: "3px 0 0", fontSize: 12, color: "#b91c1c", fontFamily: font }}>Réponse : <strong>{poll.options.find(o => o.id === correctId)?.label}</strong></p>}
                        </div>
                      </div>
                    )}
                    {revealResults ? poll.options.map(opt => {
                      const isMyV = myVote === opt.id; const isCor = correctId === opt.id;
                      let bg = poll.color || theme?.accentColor || "#6366f1";
                      if (revealCorrect && isCor) bg = "#10b981";
                      if (revealCorrect && isMyV && !isCor && correctId) bg = "#ef4444";
                      return (
                        <div key={opt.id} style={{ marginBottom: 9 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, fontSize: 13, fontWeight: isMyV ? 700 : 400, color: theme?.textColor || "#374151", fontFamily: font }}>
                            {revealCorrect && isCor && <span style={{ color: "#10b981" }}>✓</span>}
                            {isMyV && <span style={{ fontSize: 10, background: poll.color || theme?.accentColor, color: "#fff", padding: "1px 6px", borderRadius: 99 }}>Ton choix</span>}
                            {opt.label}
                          </div>
                          <div style={{ background: theme?.pollBarBg || "#e5e7eb", borderRadius: 8, height: 9 }}>
                            <div style={{ height: "100%", borderRadius: 8, background: bg, width: isMyV ? "100%" : "0%", transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ textAlign: "center", padding: "18px 0" }}>
                        <div style={{ fontSize: 30, marginBottom: 7 }}>⏳</div>
                        <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, fontFamily: font }}>Vote enregistré !</p>
                        <p style={{ color: "#c7d2fe", fontSize: 11, margin: "3px 0 0", fontFamily: font }}>En attente des résultats…</p>
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

// Strip base64 images from slides before storing — only keep Supabase URLs
function stripBase64(slides) {
  return slides.map(sl => ({
    ...sl,
    bentoPhotos: (sl.bentoPhotos || []).map(p => ({
      ...p,
      src: p.src?.startsWith("data:") ? null : p.src,
    })),
    columns: (sl.columns || []).map(col => ({
      ...col,
      blocks: (col.blocks || []).map(b =>
        b.type === "image" && b.src?.startsWith("data:") ? { ...b, src: null } : b
      ),
    })),
  }));
}

function safeSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Quota exceeded — try clearing old autosave and retry
    try {
      localStorage.removeItem("sb_autosave");
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ onOpen }) {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("draft_presentations").select("id, title, updated_at").order("updated_at", { ascending: false });
    setPresentations(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.from("draft_presentations")
      .insert({ title: newName.trim(), slides_data: JSON.stringify([defaultSlide()]), theme_data: JSON.stringify(defaultTheme()) })
      .select().single();
    setCreating(false);
    if (error) { alert("Erreur : " + error.message); return; }
    setShowNew(false); setNewName("");
    onOpen(data);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Supprimer cette présentation ?")) return;
    setDeleting(id);
    await supabase.from("draft_presentations").delete().eq("id", id);
    setPresentations(prev => prev.filter(p => p.id !== id));
    setDeleting(null);
  };

  const fmt = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#f8f9ff" }}>
      <div style={{ background: "#1e1b4b", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={s.logo}>◈</div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#fff", letterSpacing: "-0.02em" }}>SlideBuilder</span>
        </div>
        <button onClick={() => setShowNew(true)} style={{ background: "#6366f1", border: "none", color: "#fff", padding: "9px 22px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit" }}>
          + Nouvelle présentation
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#1e1b4b" }}>Mes présentations</h1>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: "#9ca3af" }}>Créez et gérez vos présentations interactives.</p>

        {loading && <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}><div style={s.spinner} /></div>}

        {!loading && presentations.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", background: "#fff", borderRadius: 20, border: "2px dashed #e0e7ff" }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>◈</div>
            <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1e1b4b" }}>Aucune présentation</p>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#9ca3af" }}>Créez votre première présentation interactive.</p>
            <button onClick={() => setShowNew(true)} style={{ background: "#6366f1", border: "none", color: "#fff", padding: "12px 28px", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit" }}>
              + Nouvelle présentation
            </button>
          </div>
        )}

        {!loading && presentations.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {presentations.map(p => (
              <div key={p.id} onClick={() => onOpen(p)} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e0e7ff", overflow: "hidden", boxShadow: "0 2px 12px rgba(99,102,241,0.06)", cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.16)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(99,102,241,0.06)"}>
                <div style={{ height: 130, background: "linear-gradient(135deg, #ede9fe 0%, #dbeafe 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 40, opacity: 0.25 }}>◈</span>
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 15, color: "#1e1b4b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                  <p style={{ margin: "0 0 14px", fontSize: 11, color: "#9ca3af" }}>Modifié le {fmt(p.updated_at)}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={e => { e.stopPropagation(); onOpen(p); }} style={{ flex: 1, background: "#6366f1", border: "none", color: "#fff", padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                      Ouvrir →
                    </button>
                    <button onClick={e => handleDelete(e, p.id)} disabled={deleting === p.id} style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: deleting === p.id ? 0.5 : 1 }}>
                      {deleting === p.id ? "…" : "✕"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,27,75,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowNew(false)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: 420, maxWidth: "95vw" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 800, color: "#1e1b4b" }}>Nouvelle présentation</h2>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && newName.trim() && handleCreate()}
              placeholder="Ex : Quiz Marketing Q2" style={{ ...s.input, width: "100%", boxSizing: "border-box", fontSize: 16, marginBottom: 20, padding: "10px 14px" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, background: "#f3f4f6", border: "none", color: "#6b7280", padding: "11px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Annuler</button>
              <button onClick={handleCreate} disabled={!newName.trim() || creating} style={{ flex: 2, background: "#6366f1", border: "none", color: "#fff", padding: "11px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit", opacity: !newName.trim() || creating ? 0.5 : 1 }}>
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BUILDER ─────────────────────────────────────────────────────────────────
function Builder({ draftId, initialTitle, onBack }) {
  const parseJ = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
  const [slides, setSlides] = useState([defaultSlide()]);
  const [theme, setTheme] = useState(defaultTheme());
  const [title, setTitle] = useState(initialTitle || "Sans titre");
  const [activeSlideId, setActiveSlideId] = useState(null);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [rightPanel, setRightPanel] = useState("preview");
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved"|"saving"|"error"
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const saveTimeout = useRef(null);

  const onUploadStart = useCallback(() => setUploadsInProgress(n => n + 1), []);
  const onUploadEnd = useCallback(() => setUploadsInProgress(n => Math.max(0, n - 1)), []);

  // Load from Supabase on mount
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      const { data } = await supabase.from("draft_presentations").select("title, slides_data, theme_data").eq("id", draftId).single();
      if (!data) return;
      const loadedSlides = parseJ(data.slides_data);
      const loadedTheme = parseJ(data.theme_data);
      if (loadedSlides?.length) { setSlides(loadedSlides); setActiveSlideId(loadedSlides[0].id); }
      if (loadedTheme) setTheme(loadedTheme);
      if (data.title) setTitle(data.title);
    })();
  }, [draftId]);

  useEffect(() => { loadGoogleFont(theme.font); }, [theme.font]);

  // Autosave debounced 1.5s
  const saveToSupabase = useCallback((sl, th, ttl) => {
    setSaveStatus("saving");
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const { error } = await supabase.from("draft_presentations").update({
        title: ttl, slides_data: JSON.stringify(stripBase64(sl)), theme_data: JSON.stringify(th), updated_at: new Date().toISOString(),
      }).eq("id", draftId);
      setSaveStatus(error ? "error" : "saved");
    }, 1500);
  }, [draftId]);

  useEffect(() => { if (draftId && slides.length) saveToSupabase(slides, theme, title); }, [slides, theme, title]);

  const normalizeSlide = useCallback((sl) => {
    if (sl.columns) return sl;
    return { ...sl, layout: "single", columns: [{ id: uid(), blocks: sl.blocks || [] }] };
  }, []);

  const activeSlide = slides.find(s => s.id === activeSlideId) || slides[0];
  const normActive = normalizeSlide(activeSlide);

  const updateSlide = useCallback((id, patch) => setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)), []);
  const updateColumn = useCallback((slideId, colId, patch) => setSlides(prev => prev.map(s => s.id === slideId ? { ...s, columns: s.columns.map(c => c.id === colId ? { ...c, ...patch } : c) } : s)), []);

  const setLayout = (layoutId) => {
    const layout = LAYOUTS.find(l => l.id === layoutId); if (!layout) return;
    const cur = normalizeSlide(activeSlide);
    if (layoutId === "bento") { updateSlide(activeSlide.id, { layout: "bento", columns: [], bentoPhotos: cur.bentoPhotos || [] }); return; }
    const columns = layout.cols === 1
      ? [{ id: cur.columns[0]?.id || uid(), blocks: cur.columns.flatMap(c => c.blocks) }]
      : cur.columns.length >= 2 ? [cur.columns[0], cur.columns[1]] : [cur.columns[0] || { id: uid(), blocks: [] }, { id: uid(), blocks: [] }];
    updateSlide(activeSlide.id, { layout: layoutId, columns });
  };

  const addSlide = () => { const sl = defaultSlide(); setSlides(p => [...p, sl]); setActiveSlideId(sl.id); setActiveBlockId(null); };
  const deleteSlide = (id) => { if (slides.length === 1) return; const r = slides.filter(s => s.id !== id); setSlides(r); if (activeSlideId === id) setActiveSlideId(r[0].id); };
  const duplicateSlide = (sl) => { const n = { ...JSON.parse(JSON.stringify(sl)), id: uid() }; setSlides(prev => { const i = prev.findIndex(s => s.id === sl.id); const next = [...prev]; next.splice(i + 1, 0, n); return next; }); setActiveSlideId(n.id); };

  const handleDrop = (dropIdx) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...slides]; const [moved] = next.splice(dragIdx, 1); next.splice(dropIdx, 0, moved);
    setSlides(next); setDragIdx(null); setDragOverIdx(null);
  };

  const handlePresent = async () => {
    if (uploadsInProgress > 0) return;
    try {
      const { data: pres, error: e1 } = await supabase.from("presentations").insert({ title, theme }).select().single();
      if (e1) throw e1;
      for (let i = 0; i < slides.length; i++) {
        const sl = normalizeSlide(slides[i]);
        const { error: e2 } = await supabase.from("slides").insert({ presentation_id: pres.id, position: i, title: sl.title, layout: sl.layout, hide_title: !!sl.hideTitle, columns: JSON.stringify(sl.columns || []), bento_photos: JSON.stringify(sl.bentoPhotos || []), blocks: "[]" });
        if (e2) console.error("slide insert:", e2);
      }
      const joinCode = makeJoinCode();
      const { data: sess, error: e3 } = await supabase.from("sessions").insert({ presentation_id: pres.id, join_code: joinCode, current_slide_index: 0, is_active: true, reveal_results: true, reveal_correct: false }).select().single();
      if (e3) throw e3;
      window.open(`${window.location.pathname}?present=${sess.id}`, "_blank");
    } catch (err) { alert("Erreur Supabase : " + (err.message || JSON.stringify(err))); }
  };

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#a5b4fc", padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>← Accueil</button>
          <div style={s.logo}>◈</div>
          <input value={title} onChange={e => setTitle(e.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "inherit", minWidth: 120, maxWidth: 280 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: saveStatus === "error" ? "#ef4444" : saveStatus === "saving" ? "#9ca3af" : "#10b981" }}>
            {saveStatus === "saving" ? "💾 Enregistrement…" : saveStatus === "error" ? "⚠ Erreur" : "✓ Sauvegardé"}
          </span>
          <button onClick={handlePresent} disabled={uploadsInProgress > 0}
            style={{ ...s.presentBtn, ...(uploadsInProgress > 0 ? { opacity: 0.5, cursor: "not-allowed", background: "#9ca3af" } : {}) }}>
            {uploadsInProgress > 0 ? `⏳ Upload (${uploadsInProgress})…` : "▶ Présenter"}
          </button>
        </div>
      </div>

      <div style={s.workspace}>
        <div style={s.sidebarLeft}>
          <p style={s.sidebarTitle}>Slides</p>
          {slides.map((sl, i) => (
            <SlideThumbnail key={sl.id} slide={sl} index={i} isActive={sl.id === activeSlide?.id}
              onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }}
              onDelete={() => deleteSlide(sl.id)} onDuplicate={() => duplicateSlide(sl)}
              onDragStart={() => setDragIdx(i)} onDragOver={() => setDragOverIdx(i)} onDrop={() => handleDrop(i)}
              isDragOver={dragOverIdx === i && dragIdx !== i} />
          ))}
          <button onClick={addSlide} style={s.addSlideBtn}>+ Nouvelle slide</button>
        </div>

        <div style={s.editorCenter}>
          <div style={{ padding: "12px 18px 10px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <input value={normActive.title} onChange={e => updateSlide(activeSlide.id, { title: e.target.value })}
                style={{ ...s.slideTitleInput, flex: 1, opacity: normActive.hideTitle ? 0.35 : 1 }} placeholder="Titre de la slide" />
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", flexShrink: 0, fontSize: 11, fontWeight: 700, color: normActive.hideTitle ? "#6366f1" : "#9ca3af", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!normActive.hideTitle} onChange={e => updateSlide(activeSlide.id, { hideTitle: e.target.checked })} style={{ cursor: "pointer" }} />
                Masquer
              </label>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", alignSelf: "center" }}>Layout :</span>
              {LAYOUTS.map(layout => (
                <button key={layout.id} onClick={() => setLayout(layout.id)}
                  style={{ ...s.addBlockBtn, padding: "3px 9px", fontSize: 11, background: normActive.layout === layout.id ? "#ede9fe" : "#f9f9f9", borderColor: normActive.layout === layout.id ? "#818cf8" : "#e0e7ff", color: normActive.layout === layout.id ? "#6366f1" : "#6b7280", fontWeight: normActive.layout === layout.id ? 700 : 400 }}>
                  {layout.icon} {layout.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 20px" }}>
            {normActive.layout === "bento" ? (
              <BentoEditor slide={normActive} onUpdateSlide={patch => updateSlide(activeSlide.id, patch)} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                {normActive.columns.map((col, ci) => {
                  const split = LAYOUTS.find(l => l.id === normActive.layout)?.split;
                  return (
                    <div key={col.id} style={{ flex: split ? split[ci] : 1, minWidth: 0 }}>
                      <ColumnEditor column={col} colIndex={ci} theme={theme} onChange={patch => updateColumn(activeSlide.id, col.id, patch)} activeBlockId={activeBlockId} setActiveBlockId={setActiveBlockId} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={s.previewPanel}>
          <div style={{ display: "flex", gap: 3, marginBottom: 12, background: "#ede9fe", borderRadius: 10, padding: 3 }}>
            {["preview","theme"].map(t => (
              <button key={t} onClick={() => setRightPanel(t)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", background: rightPanel === t ? "#fff" : "transparent", color: rightPanel === t ? "#6366f1" : "#7c6aab" }}>
                {t === "preview" ? "👁 Aperçu" : "🎨 Thème"}
              </button>
            ))}
          </div>
          {rightPanel === "preview" && (
            <>
              <div style={{ ...s.slideCanvas, aspectRatio: "16/9", overflow: "hidden" }}>
                <SlideCanvas slide={normActive} theme={theme} scale={0.6} />
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 5 }}>
                {slides.map(sl => <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }} style={{ width: 7, height: 7, borderRadius: "50%", cursor: "pointer", background: sl.id === activeSlide?.id ? "#818cf8" : "#d1d5db" }} />)}
              </div>
            </>
          )}
          {rightPanel === "theme" && <ThemeEditor theme={theme} onChange={setTheme} />}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get("join");
  const presentParam = params.get("present");
  if (joinParam) return <JoinScreen initialCode={joinParam} />;
  if (presentParam) return <PresentationLoader sessionId={presentParam} />;

  const [view, setView] = useState("dashboard");
  const [currentDraft, setCurrentDraft] = useState(null);
  const openPresentation = (draft) => { setCurrentDraft(draft); setView("builder"); };
  if (view === "builder" && currentDraft) {
    return <Builder draftId={currentDraft.id} initialTitle={currentDraft.title} onBack={() => { setView("dashboard"); setCurrentDraft(null); }} />;
  }
  return <Dashboard onOpen={openPresentation} />;
}

// ─── PRESENTATION LOADER (nouvel onglet) ─────────────────────────────────────
function PresentationLoader({ sessionId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      const { data: sess, error: e1 } = await supabase.from("sessions").select("id, join_code, presentation_id, current_slide_index, presentations(theme)").eq("id", sessionId).single();
      if (e1 || !sess) { setError("Session introuvable."); return; }
      const { data: slidesData, error: e2 } = await supabase.from("slides").select("id, position, title, layout, columns, bento_photos, blocks, hide_title").eq("presentation_id", sess.presentation_id).order("position", { ascending: true });
      if (e2) { setError("Impossible de charger les slides."); return; }
      const parseJ = (v) => Array.isArray(v) ? v : (() => { try { return JSON.parse(v); } catch { return []; } })();
      const normalize = (sl) => ({ ...sl, hideTitle: !!sl.hide_title, layout: sl.layout || "single", columns: parseJ(sl.columns).map(c => ({ ...c, blocks: parseJ(c.blocks) })), bentoPhotos: parseJ(sl.bento_photos || "[]") });
      setData({ slides: (slidesData || []).map(normalize), theme: sess.presentations?.theme || defaultTheme(), sessionCode: sess.join_code, sessionId: sess.id });
    })();
  }, [sessionId]);
  if (error) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#ef4444", fontFamily: "DM Sans,sans-serif", fontSize: 16 }}>{error}</div>;
  if (!data) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "DM Sans,sans-serif", flexDirection: "column", gap: 16 }}><div style={{ width: 40, height: 40, border: "4px solid #e0e7ff", borderTop: "4px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><p style={{ color: "#818cf8", margin: 0, fontSize: 14 }}>Chargement…</p></div>;
  return <PresentationMode slides={data.slides} theme={data.theme} sessionCode={data.sessionCode} sessionId={data.sessionId} onExit={() => window.close()} />;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = {
  root: { fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", height: "100vh", background: "#f8f9ff", color: "#1e1b4b", overflow: "hidden" },
  header: { background: "#1e1b4b", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0 },
  logo: { width: 30, height: 30, background: "#818cf8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: 900 },
  headerBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "6px 13px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  presentBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "7px 17px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" },
  workspace: { display: "flex", flex: 1, overflow: "hidden" },
  sidebarLeft: { width: 158, background: "#1e1b4b", borderRight: "1px solid #312e81", padding: "13px 10px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flexShrink: 0 },
  sidebarTitle: { margin: "0 0 7px", fontSize: 10, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" },
  slideThumb: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 8, padding: "8px", cursor: "pointer", transition: "all 0.12s" },
  slideThumbActive: { background: "rgba(129,140,248,0.15)", borderColor: "#818cf8" },
  addSlideBtn: { background: "none", border: "1px dashed rgba(129,140,248,0.4)", color: "#818cf8", borderRadius: 8, padding: "7px", cursor: "pointer", fontSize: 11, fontWeight: 700, width: "100%", marginTop: 3, fontFamily: "inherit" },
  editorCenter: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" },
  slideTitleInput: { width: "100%", boxSizing: "border-box", border: "none", outline: "none", fontSize: 18, fontWeight: 800, color: "#1e1b4b", fontFamily: "inherit", background: "transparent" },
  addBlockBtn: { background: "#f5f3ff", border: "1px solid #e0e7ff", color: "#6366f1", borderRadius: 8, padding: "4px 11px", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" },
  blockRow: { borderRadius: 8, border: "1px solid #f3f4f6", padding: "7px 9px", cursor: "pointer", background: "#fff" },
  blockRowActive: { borderColor: "#818cf8", background: "#fafafe", boxShadow: "0 0 0 3px rgba(129,140,248,0.1)" },
  blockEditor: { marginTop: 6 },
  blockEditorHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  blockBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#ede9fe", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" },
  deleteBtn: { background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 6, cursor: "pointer", padding: "2px 7px", fontSize: 11, fontWeight: 700 },
  textarea: { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.5 },
  input: { padding: "5px 9px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  select: { padding: "5px 9px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  label: { display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  sectionLabel: { margin: "0 0 5px", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  uploadBtn: { width: "100%", padding: "18px", background: "#f9fafb", border: "2px dashed #d1d5db", borderRadius: 8, cursor: "pointer", color: "#6b7280", fontSize: 12, fontWeight: 600, fontFamily: "inherit", textAlign: "center" },
  addOptionBtn: { background: "none", border: "1px dashed #6366f1", color: "#6366f1", borderRadius: 8, padding: "4px 11px", cursor: "pointer", fontSize: 11, fontWeight: 700, width: "100%", marginTop: 4, fontFamily: "inherit" },
  moveBtn: { background: "#f3f4f6", border: "none", borderRadius: 4, cursor: "pointer", padding: "1px 5px", fontSize: 11, color: "#6b7280" },
  previewPanel: { width: 296, background: "#f5f3ff", borderLeft: "1px solid #e0e7ff", padding: "13px", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" },
  slideCanvas: { background: "#fff", borderRadius: 12, border: "1px solid #e0e7ff", overflow: "hidden" },
  presBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  mobileRoot: { fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#f8f9ff", display: "flex", flexDirection: "column" },
  mobileHeader: { background: "#1e1b4b", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  mobileContent: { flex: 1, padding: "20px 18px", overflowY: "auto" },
  mobileLoader: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 32 },
  voteBtn: { width: "100%", padding: "14px 16px", background: "#fff", border: "2px solid #e0e7ff", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, color: "#1e1b4b", textAlign: "left", fontFamily: "inherit" },
  spinner: { width: 32, height: 32, border: "3px solid #e0e7ff", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
