import HEARTS_LOTTIE from './hearts.js';
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

  // Measure actual container height so we can compute pixel-accurate sizes
  const containerRef = useRef(null);
  const [containerH, setContainerH] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerH(e.contentRect.height);
    });
    ro.observe(containerRef.current);
    setContainerH(containerRef.current.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  // Compute sizes from real available height
  // Layout per option: [label] + [bar+avatar] + gap between items
  // Fixed overhead: question + small bottom margin
  const GAP = 16; // fixed gap between option rows
  const LABEL_TO_BAR = 4; // margin between label and bar
  const questionH = qFontSize * 1.4 + 12; // approx question height + margin below
  const availH = containerH > 0 ? Math.max(100, containerH - questionH) : 0;
  const rowTotalH = availH > 0 ? Math.floor((availH - GAP * (n - 1)) / n) : 60;

  // Within each row: bar takes a fixed ratio, label the rest
  // imgSize ≤ rowTotalH - LABEL_TO_BAR - labelLineH
  const labelLineH = Math.min(28, Math.max(14, Math.floor(rowTotalH * 0.28)));
  const barAreaH = rowTotalH - labelLineH - LABEL_TO_BAR;
  const imgSize = hasImages ? Math.min(Math.floor(barAreaH * 0.95), Math.floor(rowTotalH * 0.75)) : 0;
  const barHeight = hasImages ? Math.max(16, Math.floor(imgSize * 0.55)) : Math.max(16, Math.floor(barAreaH * 0.85));
  const labelFs = Math.min(22, Math.max(11, labelLineH - 4));
  const halfImg = imgSize / 2;

  // Reveal animation
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

  // Winner reveal screen
  if (revealPhase === 2 && hasImages && correctOpt) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, animation: "fadeIn 0.5s ease" }}>
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
    <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", opacity: revealPhase === 1 ? 0 : 1, transition: "opacity 0.5s ease" }}>
      {/* Question */}
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: qFontSize, color: theme?.textColor || "#1e1b4b", lineHeight: 1.4, fontFamily: font, flexShrink: 0 }}>{block.question}</p>

      {/* Options — each is a fixed pixel height computed from containerH */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: GAP, minHeight: 0, overflow: "hidden" }}>
        {block.options.map((opt) => {
          const votes = voteCounts[opt.id] || 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isCorrect = block.correctOptionId === opt.id;
          const isMyVote = myVoteId === opt.id;
          let barColor = block.color || theme?.accentColor || "#6366f1";
          if (showCorrect && isCorrect) barColor = "#10b981";
          if (showCorrect && isMyVote && !isCorrect && block.correctOptionId) barColor = "#ef4444";
          const barPct = showBars ? Math.max(pct, pct > 0 ? 1 : 0) : 0;
          const avatarLeft = hasImages ? `calc(${halfImg}px + ${barPct / 100} * (100% - ${imgSize}px))` : "0%";

          return (
            <div key={opt.id} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0, overflow: "hidden" }}>
              {/* Label */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: LABEL_TO_BAR, fontSize: labelFs, fontWeight: 600, color: theme?.textColor || "#374151", alignItems: "center", fontFamily: font, flexShrink: 0, lineHeight: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: Math.max(4, Math.round(labelFs * 0.3)), overflow: "hidden" }}>
                  {showCorrect && isCorrect && <span style={{ color: "#10b981", flexShrink: 0 }}>✓</span>}
                  {showCorrect && isMyVote && !isCorrect && block.correctOptionId && <span style={{ color: "#ef4444", flexShrink: 0 }}>✗</span>}
                  {isMyVote && <span style={{ fontSize: Math.max(10, Math.round(labelFs * 0.7)), background: barColor, color: "#fff", padding: "1px 6px", borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>Ton choix</span>}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                </span>
                {showBars && <span style={{ color: barColor, fontWeight: 800, flexShrink: 0, marginLeft: 8 }}>{pct}%</span>}
              </div>

              {/* Bar + avatar */}
              <div style={{ position: "relative", height: hasImages ? imgSize + 4 : barHeight, flexShrink: 0 }}>
                <div style={{ position: "absolute", left: hasImages ? halfImg : 0, right: hasImages ? halfImg : 0, top: "50%", transform: "translateY(-50%)", height: barHeight, background: theme?.pollBarBg || "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: barColor, width: `${barPct}%`, transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", paddingLeft: !hasImages && showBars && pct > 10 ? 10 : 0, boxSizing: "border-box" }}>
                    {!hasImages && showBars && pct > 10 && <span style={{ color: "#fff", fontSize: Math.max(10, Math.round(labelFs * 0.75)), fontWeight: 700 }}>{votes}</span>}
                  </div>
                </div>
                {hasImages && (opt.image ? (
                  <div style={{ position: "absolute", left: avatarLeft, top: "50%", transform: "translate(-50%,-50%)", transition: "left 0.7s cubic-bezier(0.4,0,0.2,1)", width: imgSize, height: imgSize, borderRadius: "50%", overflow: "hidden", border: `${Math.max(2, Math.round(imgSize * 0.06))}px solid ${barColor}`, background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", zIndex: 2 }}>
                    <img src={opt.image} alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ) : (
                  <div style={{ position: "absolute", left: avatarLeft, top: "50%", transform: "translate(-50%,-50%)", transition: "left 0.7s cubic-bezier(0.4,0,0.2,1)", width: imgSize, height: imgSize, borderRadius: "50%", border: `${Math.max(2, Math.round(imgSize * 0.06))}px solid ${barColor}`, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(imgSize * 0.3), color: "#9ca3af", zIndex: 2 }}>?</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {totalVotes > 0 && <p style={{ margin: "4px 0 0", fontSize: Math.max(10, Math.round(labelFs * 0.65)), color: "#9ca3af", textAlign: "right", fontFamily: font, flexShrink: 0 }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>}
    </div>
  );
}

// ─── LOTTIE HEARTS OVERLAY ───────────────────────────────────────────────────
// Lottie animation data embedded directly — no file serving needed
