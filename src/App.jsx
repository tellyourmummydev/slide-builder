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
const HEARTS_LOTTIE = {"v":"5.5.8","fr":29.9700012207031,"ip":0,"op":362.000014744562,"w":1000,"h":1000,"nm":"HEART FRAME","ddd":0,"assets":[{"id":"comp_0","layers":[{"ddd":0,"ind":1,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[196.126,788.709,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":2,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[728,850,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":3,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[738,498,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":4,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[318,632,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":5,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[446,228,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":6,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[158,252,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":7,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[340,802,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":8,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[816,736,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":9,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[826,384,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":10,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[406,518,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":11,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[534,114,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":12,"ty":0,"nm":"HEART 4","refId":"comp_1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-31,"ix":10},"p":{"a":0,"k":[246,138,0],"ix":2},"a":{"a":0,"k":[100,367.5,0],"ix":1},"s":{"a":0,"k":[40,40,100],"ix":6}},"ao":0,"w":200,"h":735,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":13,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[181.055,641.26,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":14,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[746,712,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":15,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[746.551,371.024,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":16,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[336,494,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":17,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[464,90,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":18,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[176,114,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[46.951,46.951,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":19,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[586.063,778.504,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":20,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[906,780,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":21,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[916,428,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":22,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[543.449,397.559,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":23,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[816,158,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":24,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":14,"ix":10},"p":{"a":0,"k":[660,102,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":25,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[54.961,804.598,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":26,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[538.961,914.441,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":27,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[554.126,575.717,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":28,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[231.953,452.614,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":29,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[890,278,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":30,"ty":0,"nm":"HEART 5","refId":"comp_2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-8,"ix":10},"p":{"a":0,"k":[94,186,0],"ix":2},"a":{"a":0,"k":[100,320,0],"ix":1},"s":{"a":0,"k":[78,78,100],"ix":6}},"ao":0,"w":200,"h":640,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":31,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[194,936,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":32,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[706.976,946.898,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":33,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[806.74,618.52,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":34,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[402.488,765.118,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":35,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[868,66,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":36,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[377.071,358.173,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":37,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[70.803,592.409,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":38,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[620,660,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":39,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[686,216,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":40,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[76.142,442,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":41,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[338,38,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":42,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":-11,"ix":10},"p":{"a":0,"k":[50,62,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[86,86,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":43,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[344,882,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":44,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[868,874,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":45,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[878,522,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":46,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[458,656,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":47,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[618,294,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0},{"ddd":0,"ind":48,"ty":0,"nm":"HEART 6","refId":"comp_3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":17,"ix":10},"p":{"a":0,"k":[298,276,0],"ix":2},"a":{"a":0,"k":[100,363,0],"ix":1},"s":{"a":0,"k":[52,52,100],"ix":6}},"ao":0,"w":200,"h":726,"ip":0,"op":362.000014744562,"st":0,"bm":0}]},{"id":"comp_1","layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Element01","sr":1,"ks":{"o":{"a":1,"k":[{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":2,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":15,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":30,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":42,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":54,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":67,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":82,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":94,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":103,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":116,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":131,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":143,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":155,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":168,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":183,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":195,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":203,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":216,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":231,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":243,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":255,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":268,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":283,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":295,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":303,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":316,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":331,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":343,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":355,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":368,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":383,"s":[100]},{"t":394.99976608867,"s":[0]}],"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":1,"s":[101.5,370.047,0],"to":[0,-51,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":45,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":53,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":97,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":102,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":146,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":154,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":198,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":202,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":246,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":254,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":298,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":302,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":346,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":354,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,51,0]},{"t":397.999766210862,"s":[101.5,64.047,0]}],"ix":2},"a":{"a":0,"k":[-704.087,0,0],"ix":1},"s":{"a":0,"k":[6.768,5.654,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[374,300],[165.994,-333.229],[120.29,-99.411],[-457.169,-331]],"o":[[-126,-98],[-182.006,-333.229],[-359.958,297.479],[470.831,-333]],"v":[[72.696,-558.406],[-703.994,-420.771],[-1181.287,-520.507],[-713.605,785.226]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"tm","s":{"a":0,"k":0,"ix":1},"e":{"a":0,"k":100,"ix":2},"o":{"a":0,"k":-181,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false}],"ip":-5.00000020365417,"op":595.404024251302,"st":3.99600016276042,"bm":0}]},{"id":"comp_2","layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Element01","sr":1,"ks":{"o":{"a":1,"k":[{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":1,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":14,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":29,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":41,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":53,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":66,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":81,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":93,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":102,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":115,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":130,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":142,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":154,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":167,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":182,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":194,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":202,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":215,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":230,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":242,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":254,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":267,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":282,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":294,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":302,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":315,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":330,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":342,"s":[0]},{"t":353.999764418705,"s":[0]}],"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[101.5,370.047,0],"to":[0,-51,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":44,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":52,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":96,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":101,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":145,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":153,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":197,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":201,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":245,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":253,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":297,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":301,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":345,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,-51,0]},{"t":352.999764377975,"s":[101.5,370.047,0]}],"ix":2},"a":{"a":0,"k":[-704.087,0,0],"ix":1},"s":{"a":0,"k":[3,3.43,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[374,300],[165.994,-333.229],[120.29,-99.411],[-457.169,-331]],"o":[[-126,-98],[-182.006,-333.229],[-359.958,297.479],[470.831,-333]],"v":[[-118,-594],[-703.994,-420.771],[-1510.527,-490.039],[-706.218,555.302]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[1,0.426989626417,0.29411761714,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"tm","s":{"a":0,"k":0,"ix":1},"e":{"a":0,"k":100,"ix":2},"o":{"a":0,"k":-181,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false}],"ip":-15.0000006109625,"op":595.404024251302,"st":3.99600016276042,"bm":0}]},{"id":"comp_3","layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Element01","sr":1,"ks":{"o":{"a":1,"k":[{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":1,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":14,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":29,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":41,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":53,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":66,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":81,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":93,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":102,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":115,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":130,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":142,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":154,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":167,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":182,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":194,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":202,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":215,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":230,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":242,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":254,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":267,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":282,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":294,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":302,"s":[0]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":315,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":330,"s":[100]},{"i":{"x":[0.833],"y":[0.833]},"o":{"x":[0.167],"y":[0.167]},"t":342,"s":[0]},{"t":353.999764418705,"s":[0]}],"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[101.5,370.047,0],"to":[0,-51,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":44,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":52,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":96,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":101,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":145,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":153,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":197,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":201,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":245,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":253,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.167,"y":0},"t":297,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":301,"s":[101.5,370.047,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":345,"s":[101.5,64.047,0],"to":[0,0,0],"ti":[0,-51,0]},{"t":352.999764377975,"s":[101.5,370.047,0]}],"ix":2},"a":{"a":0,"k":[-704.087,0,0],"ix":1},"s":{"a":0,"k":[3.983,4.163,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[374,300],[165.993,-333.229],[120.29,-99.411],[-457.169,-331]],"o":[[-126,-98],[-182.007,-333.229],[-359.958,297.479],[470.831,-333]],"v":[[202.096,-587.995],[-703.994,-420.771],[-1298.29,-590.589],[-706.218,555.302]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"tm","s":{"a":0,"k":0,"ix":1},"e":{"a":0,"k":100,"ix":2},"o":{"a":0,"k":-181,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false}],"ip":-29.0000011811942,"op":595.404024251302,"st":3.99600016276042,"bm":0}]}],"layers":[{"ddd":0,"ind":1,"ty":0,"nm":"1","refId":"comp_0","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[500,500,0],"ix":2},"a":{"a":0,"k":[500,500,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":1000,"h":1000,"ip":27.0000010997325,"op":389.000015844295,"st":27.0000010997325,"bm":0},{"ddd":0,"ind":2,"ty":0,"nm":"1","refId":"comp_0","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[500,500,0],"ix":2},"a":{"a":0,"k":[500,500,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"w":1000,"h":1000,"ip":0,"op":362.000014744562,"st":0,"bm":0}],"markers":[]}
