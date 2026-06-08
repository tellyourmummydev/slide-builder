import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 9);
const PALETTE = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];
const makeJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const defaultBlock = (type) => {
  if (type === "text") return { id: uid(), type, content: "Votre texte ici...", fontSize: 24, align: "left", bold: false };
  if (type === "image") return { id: uid(), type, src: null, caption: "" };
  if (type === "poll") return { id: uid(), type, question: "Quelle est votre réponse ?", options: [{ id: uid(), label: "Option A" }, { id: uid(), label: "Option B" }], correctOptionId: null, color: "#6366f1" };
};
const defaultSlide = () => ({ id: uid(), title: "Nouvelle slide", blocks: [] });

function QRCode({ value, size = 120 }) {
  return <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1e1b4b&margin=2`} alt="QR" style={{ width: size, height: size, borderRadius: 8, display: "block" }} />;
}

// ---------------------------------------------------------------------------
// Poll display (presenter + participant results)
// ---------------------------------------------------------------------------
function PollDisplay({ block, voteCounts = {}, totalVotes = 0, showCorrect = false, myVoteId = null }) {
  return (
    <div style={{ width: "100%" }}>
      <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 20, color: "#1e1b4b", lineHeight: 1.3 }}>{block.question}</p>
      {block.options.map((opt) => {
        const votes = voteCounts[opt.id] || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isCorrect = block.correctOptionId === opt.id;
        const isMyVote = myVoteId === opt.id;
        let barColor = block.color;
        if (showCorrect && isCorrect) barColor = "#10b981";
        if (showCorrect && isMyVote && !isCorrect && block.correctOptionId) barColor = "#ef4444";
        return (
          <div key={opt.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 14, fontWeight: 600, color: "#374151", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {showCorrect && isCorrect && <span style={{ color: "#10b981" }}>✓</span>}
                {showCorrect && isMyVote && !isCorrect && block.correctOptionId && <span style={{ color: "#ef4444" }}>✗</span>}
                {isMyVote && <span style={{ fontSize: 10, background: block.color, color: "#fff", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>Ton choix</span>}
                {opt.label}
              </span>
              <span style={{ color: barColor, fontWeight: 800 }}>{pct}%</span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: 8, height: 30, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 8, background: barColor, width: `${pct}%`, minWidth: pct > 0 ? 4 : 0, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", paddingLeft: pct > 10 ? 12 : 0 }}>
                {pct > 10 && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{votes}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {totalVotes > 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block editor
// ---------------------------------------------------------------------------
function BlockEditor({ block, onChange, onDelete }) {
  const fileRef = useRef();
  if (block.type === "text") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Texte</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <textarea value={block.content} onChange={e => onChange({ content: e.target.value })} style={s.textarea} rows={3} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <label style={s.label}>Taille<input type="number" value={block.fontSize} min={12} max={80} onChange={e => onChange({ fontSize: Number(e.target.value) })} style={{ ...s.input, width: 70 }} /></label>
        <label style={s.label}>Alignement<select value={block.align} onChange={e => onChange({ align: e.target.value })} style={s.select}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label>
        <label style={{ ...s.label, flexDirection: "row", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={block.bold} onChange={e => onChange({ bold: e.target.checked })} />Gras</label>
      </div>
    </div>
  );
  if (block.type === "image") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Image</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onChange({ src: ev.target.result }); r.readAsDataURL(f); }} />
      {block.src
        ? <div style={{ position: "relative" }}><img src={block.src} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 140, objectFit: "cover" }} /><button onClick={() => onChange({ src: null })} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 7px", fontSize: 12 }}>✕</button></div>
        : <button onClick={() => fileRef.current.click()} style={s.uploadBtn}>+ Choisir une image</button>}
      <input value={block.caption} onChange={e => onChange({ caption: e.target.value })} placeholder="Légende (optionnel)" style={{ ...s.input, marginTop: 8, width: "100%", boxSizing: "border-box" }} />
    </div>
  );
  if (block.type === "poll") return (
    <div style={s.blockEditor}>
      <div style={s.blockEditorHeader}><span style={s.blockBadge}>Vote</span><button onClick={onDelete} style={s.deleteBtn}>✕</button></div>
      <input value={block.question} onChange={e => onChange({ question: e.target.value })} placeholder="Question..." style={{ ...s.input, width: "100%", boxSizing: "border-box", fontWeight: 600, marginBottom: 12 }} />
      <p style={s.sectionLabel}>Options de vote</p>
      {block.options.map((opt, i) => (
        <div key={opt.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 18, fontWeight: 700 }}>{i + 1}.</span>
          <input value={opt.label} onChange={e => onChange({ options: block.options.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o) })} style={{ ...s.input, flex: 1 }} placeholder={`Option ${i + 1}`} />
          <button onClick={() => onChange({ correctOptionId: block.correctOptionId === opt.id ? null : opt.id })} title="Bonne réponse" style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid", borderColor: block.correctOptionId === opt.id ? "#10b981" : "#d1d5db", background: block.correctOptionId === opt.id ? "#10b981" : "transparent", color: block.correctOptionId === opt.id ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>✓</button>
          {block.options.length > 2 && <button onClick={() => onChange({ options: block.options.filter(o => o.id !== opt.id) })} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>}
        </div>
      ))}
      <p style={{ margin: "2px 0 8px", fontSize: 11, color: "#10b981" }}>Clique ✓ pour marquer la bonne réponse</p>
      <button onClick={() => onChange({ options: [...block.options, { id: uid(), label: `Option ${block.options.length + 1}` }] })} style={s.addOptionBtn}>+ Ajouter une option</button>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Couleur :</span>
        {PALETTE.map(c => <div key={c} onClick={() => onChange({ color: c })} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: block.color === c ? "3px solid #1e1b4b" : "2px solid transparent" }} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide canvas preview
// ---------------------------------------------------------------------------
function SlideCanvasPreview({ slide }) {
  return (
    <div style={s.slideCanvas}>
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.1em" }}>{slide.title}</p>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {slide.blocks.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#c7d2fe", fontSize: 13, opacity: 0.6, textAlign: "center" }}>Ajoutez des blocs<br />depuis le panneau gauche</div>}
        {slide.blocks.map(block => (
          <div key={block.id}>
            {block.type === "text" && <p style={{ margin: 0, fontSize: block.fontSize * 0.7, textAlign: block.align, fontWeight: block.bold ? 700 : 400, color: "#1e1b4b", lineHeight: 1.4 }}>{block.content}</p>}
            {block.type === "image" && (block.src ? <div><img src={block.src} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 160, objectFit: "cover" }} />{block.caption && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280", textAlign: "center" }}>{block.caption}</p>}</div> : <div style={{ background: "#f3f4f6", borderRadius: 8, height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>📷 Aucune image</div>)}
            {block.type === "poll" && <PollDisplay block={block} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRESENTATION MODE
// ---------------------------------------------------------------------------
function PresentationMode({ slides, sessionCode, sessionId, onExit }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [voteCounts, setVoteCounts] = useState({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [showCorrect, setShowCorrect] = useState(false);
  const currentSlide = slides[currentIdx];
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=${sessionCode}`;

  useEffect(() => {
    if (!sessionId) return;
    setVoteCounts({}); setTotalVotes(0); setShowCorrect(false);
    supabase.from("sessions").update({ current_slide_index: currentIdx }).eq("id", sessionId).then(({ error }) => { if (error) console.error("update slide index:", error); });
  }, [currentIdx, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`pres-votes-${sessionId}-${currentIdx}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.new.slide_index !== currentIdx) return;
        setVoteCounts(prev => ({ ...prev, [payload.new.option_id]: (prev[payload.new.option_id] || 0) + 1 }));
        setTotalVotes(prev => prev + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [sessionId, currentIdx]);

  const pollBlock = currentSlide?.blocks?.find(b => b.type === "poll");
  const go = (dir) => { const n = currentIdx + dir; if (n >= 0 && n < slides.length) setCurrentIdx(n); };

  return (
    <div style={s.presentationRoot}>
      <div style={s.presentationBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <QRCode value={joinUrl} size={72} />
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#a5b4fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rejoindre</p>
            <p style={{ margin: "3px 0 2px", fontSize: 12, color: "#e0e7ff" }}>{joinUrl}</p>
            <span style={{ background: "#312e81", color: "#a5b4fc", padding: "2px 10px", borderRadius: 99, fontSize: 14, fontWeight: 800, letterSpacing: "0.15em" }}>{sessionCode}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {pollBlock && <button onClick={() => setShowCorrect(v => !v)} style={{ ...s.presBtn, background: showCorrect ? "#10b981" : "rgba(16,185,129,0.15)", borderColor: "#10b981", color: showCorrect ? "#fff" : "#10b981" }}>{showCorrect ? "✓ Réponse visible" : "Révéler la réponse"}</button>}
          <span style={{ color: "#818cf8", fontSize: 14, fontWeight: 700 }}>{currentIdx + 1}/{slides.length}</span>
          <button onClick={() => go(-1)} disabled={currentIdx === 0} style={{ ...s.presBtn, opacity: currentIdx === 0 ? 0.3 : 1 }}>← Préc.</button>
          <button onClick={() => go(1)} disabled={currentIdx === slides.length - 1} style={{ ...s.presBtn, opacity: currentIdx === slides.length - 1 ? 0.3 : 1 }}>Suiv. →</button>
          <button onClick={onExit} style={{ ...s.presBtn, borderColor: "#f87171", color: "#f87171" }}>✕ Quitter</button>
        </div>
      </div>
      <div style={s.presentationSlide}>
        <p style={{ margin: "0 0 24px", fontSize: 13, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>{currentSlide.title}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 800, width: "100%", margin: "0 auto" }}>
          {currentSlide.blocks.map(block => (
            <div key={block.id}>
              {block.type === "text" && <p style={{ margin: 0, fontSize: block.fontSize * 1.3, textAlign: block.align, fontWeight: block.bold ? 700 : 400, color: "#1e1b4b", lineHeight: 1.4 }}>{block.content}</p>}
              {block.type === "image" && block.src && <div><img src={block.src} alt={block.caption} style={{ width: "100%", borderRadius: 16, objectFit: "contain", maxHeight: 360 }} />{block.caption && <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280", textAlign: "center" }}>{block.caption}</p>}</div>}
              {block.type === "poll" && <PollDisplay block={block} voteCounts={voteCounts} totalVotes={totalVotes} showCorrect={showCorrect} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PARTICIPANT VIEW
// ---------------------------------------------------------------------------
function ParticipantView({ joinCode }) {
  const [sessionData, setSessionData] = useState(null); // { sessionId, presentationId }
  const [slides, setSlides] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [voted, setVoted] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token] = useState(() => {
    let t = localStorage.getItem("ptk");
    if (!t) { t = uid(); localStorage.setItem("ptk", t); }
    return t;
  });

  useEffect(() => {
    if (!joinCode) return;
    (async () => {
      setLoading(true);
      // 1. Fetch session by join_code
      const { data: sess, error: e1 } = await supabase
        .from("sessions")
        .select("id, presentation_id, current_slide_index, is_active")
        .eq("join_code", joinCode.toUpperCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (e1) { console.error("session error:", e1); setError("Erreur de connexion."); setLoading(false); return; }
      if (!sess) { setError(`Session "${joinCode.toUpperCase()}" introuvable ou terminée.`); setLoading(false); return; }

      // 2. Fetch slides for this presentation
      const { data: slidesData, error: e2 } = await supabase
        .from("slides")
        .select("id, position, title, blocks")
        .eq("presentation_id", sess.presentation_id)
        .order("position", { ascending: true });

      if (e2) { setError("Impossible de charger les slides."); setLoading(false); return; }

      setSessionData({ sessionId: sess.id, presentationId: sess.presentation_id });
      setSlides(slidesData || []);
      setCurrentIdx(sess.current_slide_index || 0);
      setLoading(false);
    })();
  }, [joinCode]);

  // Realtime: follow presenter slide changes
  useEffect(() => {
    if (!sessionData) return;
    const channel = supabase.channel(`part-session-${sessionData.sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionData.sessionId}` },
        (payload) => { setCurrentIdx(payload.new.current_slide_index || 0); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [sessionData]);

  const currentSlide = slides[currentIdx];
  const blocks = currentSlide
    ? (Array.isArray(currentSlide.blocks) ? currentSlide.blocks : (() => { try { return JSON.parse(currentSlide.blocks); } catch { return []; } })())
    : [];
  const poll = blocks.find(b => b.type === "poll");
  const myVote = voted[currentIdx];
  const hasVoted = !!myVote;
  const correctId = poll?.correctOptionId;

  const handleVote = async (optionId) => {
    if (hasVoted || !sessionData) return;
    const { error } = await supabase.from("votes").insert({
      session_id: sessionData.sessionId,
      slide_id: currentSlide.id,
      slide_index: currentIdx,
      option_id: optionId,
      participant_token: token,
    });
    if (!error) setVoted(prev => ({ ...prev, [currentIdx]: optionId }));
    else console.error("vote error:", error);
  };

  if (loading) return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={s.mobileLoader}><div style={s.spinner} /><p style={{ color: "#818cf8", marginTop: 16 }}>Connexion…</p></div>
    </div>
  );
  if (error) return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={s.mobileLoader}><p style={{ color: "#f87171", textAlign: "center", fontSize: 15, lineHeight: 1.6 }}>{error}</p></div>
    </div>
  );
  if (!currentSlide) return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={s.mobileLoader}><p style={{ color: "#818cf8" }}>En attente…</p></div>
    </div>
  );

  const gotItRight = hasVoted && correctId && myVote === correctId;
  const gotItWrong = hasVoted && correctId && myVote !== correctId;

  return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div>
        <span style={{ fontSize: 12, color: "#a5b4fc", background: "rgba(165,180,252,0.15)", padding: "3px 10px", borderRadius: 99, fontWeight: 700 }}>{currentIdx + 1}/{slides.length}</span>
      </div>
      <div style={s.mobileContent}>
        <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{currentSlide.title}</p>
        {blocks.map(block => (
          <div key={block.id} style={{ marginBottom: 20 }}>
            {block.type === "text" && <p style={{ margin: 0, fontSize: Math.min(block.fontSize, 28), textAlign: block.align, fontWeight: block.bold ? 700 : 400, color: "#1e1b4b", lineHeight: 1.4 }}>{block.content}</p>}
            {block.type === "image" && block.src && <div><img src={block.src} alt={block.caption} style={{ width: "100%", borderRadius: 12, objectFit: "cover" }} />{block.caption && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", textAlign: "center" }}>{block.caption}</p>}</div>}
            {block.type === "poll" && (
              <div>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 18, color: "#1e1b4b", lineHeight: 1.3 }}>{block.question}</p>
                {!hasVoted ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {block.options.map(opt => (
                      <button key={opt.id} onClick={() => handleVote(opt.id)} style={s.voteBtn}>{opt.label}</button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {correctId && (
                      <div style={{ background: gotItRight ? "#d1fae5" : "#fee2e2", border: `2px solid ${gotItRight ? "#10b981" : "#ef4444"}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 28 }}>{gotItRight ? "🎉" : "😅"}</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: gotItRight ? "#065f46" : "#991b1b" }}>{gotItRight ? "Bonne réponse !" : "Pas tout à fait…"}</p>
                          {gotItWrong && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#b91c1c" }}>Bonne réponse : <strong>{block.options.find(o => o.id === correctId)?.label}</strong></p>}
                        </div>
                      </div>
                    )}
                    {block.options.map(opt => {
                      const isMyV = myVote === opt.id;
                      const isCor = correctId === opt.id;
                      let bg = block.color;
                      if (isCor && correctId) bg = "#10b981";
                      if (isMyV && !isCor && correctId) bg = "#ef4444";
                      return (
                        <div key={opt.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 13, fontWeight: isMyV ? 700 : 400, color: "#374151" }}>
                            {isCor && correctId && <span style={{ color: "#10b981" }}>✓</span>}
                            {isMyV && <span style={{ fontSize: 10, background: block.color, color: "#fff", padding: "1px 6px", borderRadius: 99 }}>Ton choix</span>}
                            {opt.label}
                          </div>
                          <div style={{ background: "#e5e7eb", borderRadius: 8, height: 10, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 8, background: bg, width: isMyV ? "100%" : "0%", transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                    <p style={{ margin: "14px 0 0", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>Vote enregistré ✓ — en attente de la suite…</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JOIN SCREEN
// ---------------------------------------------------------------------------
function JoinScreen({ initialCode = "" }) {
  const [code, setCode] = useState(initialCode);
  const [submitted, setSubmitted] = useState(!!initialCode);
  if (submitted) return <ParticipantView joinCode={code} />;
  return (
    <div style={s.mobileRoot}>
      <div style={s.mobileHeader}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={s.logo}>◈</div><span style={{ fontWeight: 800, color: "#fff" }}>SlideBuilder</span></div></div>
      <div style={{ ...s.mobileLoader, flexDirection: "column", gap: 20, padding: 32 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 22, color: "#1e1b4b" }}>Rejoindre une session</p>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Code de session" maxLength={6}
          style={{ ...s.input, fontSize: 22, textAlign: "center", letterSpacing: "0.2em", fontWeight: 800, width: "100%", boxSizing: "border-box", padding: "14px" }} />
        <button onClick={() => setSubmitted(true)} disabled={code.length < 4}
          style={{ ...s.voteBtn, fontSize: 16, padding: "14px", opacity: code.length < 4 ? 0.4 : 1, textAlign: "center" }}>Rejoindre →</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SAVE / LOAD MODAL
// ---------------------------------------------------------------------------
function SaveLoadModal({ slides, onLoad, onClose }) {
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState("Ma présentation");
  const [tab, setTab] = useState("save"); // "save" | "load"

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sb_presentations");
      setSaved(raw ? JSON.parse(raw) : []);
    } catch { setSaved([]); }
  }, []);

  const handleSave = () => {
    const entry = { id: uid(), name: saveName, date: new Date().toISOString(), slides };
    const updated = [entry, ...saved].slice(0, 20); // keep max 20
    localStorage.setItem("sb_presentations", JSON.stringify(updated));
    setSaved(updated);
    setSaveName("Ma présentation");
    setTab("load");
  };

  const handleDelete = (id) => {
    const updated = saved.filter(p => p.id !== id);
    localStorage.setItem("sb_presentations", JSON.stringify(updated));
    setSaved(updated);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,27,75,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: 480, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(30,27,75,0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1e1b4b" }}>Sauvegarder / Charger</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
          {["save","load"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", background: tab === t ? "#fff" : "transparent", color: tab === t ? "#6366f1" : "#6b7280", boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
              {t === "save" ? "💾 Sauvegarder" : "📂 Charger"}
            </button>
          ))}
        </div>

        {tab === "save" && (
          <div>
            <label style={{ ...s.sectionLabel, marginBottom: 8 }}>Nom de la présentation</label>
            <input value={saveName} onChange={e => setSaveName(e.target.value)} style={{ ...s.input, width: "100%", boxSizing: "border-box", fontSize: 16, marginBottom: 16 }} />
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>{slides.length} slide{slides.length !== 1 ? "s" : ""} · Sauvegarde locale dans votre navigateur</p>
            <button onClick={handleSave} disabled={!saveName.trim()} style={{ background: "#6366f1", border: "none", color: "#fff", padding: "12px 24px", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 800, width: "100%", fontFamily: "inherit", opacity: !saveName.trim() ? 0.4 : 1 }}>
              💾 Sauvegarder maintenant
            </button>
          </div>
        )}

        {tab === "load" && (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {saved.length === 0 && <p style={{ color: "#9ca3af", textAlign: "center", fontSize: 14, padding: "32px 0" }}>Aucune présentation sauvegardée</p>}
            {saved.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#1e1b4b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>{p.slides.length} slides · {new Date(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button onClick={() => { onLoad(p.slides); onClose(); }} style={{ background: "#ede9fe", border: "none", color: "#6366f1", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>Charger</button>
                <button onClick={() => handleDelete(p.id)} style={{ background: "#fef2f2", border: "none", color: "#ef4444", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BUILDER
// ---------------------------------------------------------------------------
function Builder({ onPresent }) {
  const [slides, setSlides] = useState(() => {
    try {
      const raw = localStorage.getItem("sb_autosave");
      if (raw) { const parsed = JSON.parse(raw); if (parsed?.length) return parsed; }
    } catch {}
    return [defaultSlide()];
  });
  const [activeSlideId, setActiveSlideId] = useState(() => slides[0]?.id);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  // Autosave on every change
  useEffect(() => {
    try { localStorage.setItem("sb_autosave", JSON.stringify(slides)); } catch {}
  }, [slides]);

  const activeSlide = slides.find(s => s.id === activeSlideId) || slides[0];

  const updateSlide = useCallback((id, patch) => setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)), []);
  const updateBlock = useCallback((slideId, blockId, patch) => setSlides(prev => prev.map(s => s.id === slideId ? { ...s, blocks: s.blocks.map(b => b.id === blockId ? { ...b, ...patch } : b) } : s)), []);
  const addBlock = (type) => { const b = defaultBlock(type); updateSlide(activeSlide.id, { blocks: [...activeSlide.blocks, b] }); setActiveBlockId(b.id); };
  const deleteBlock = (id) => { updateSlide(activeSlide.id, { blocks: activeSlide.blocks.filter(b => b.id !== id) }); setActiveBlockId(null); };
  const addSlide = () => { const sl = defaultSlide(); setSlides(p => [...p, sl]); setActiveSlideId(sl.id); setActiveBlockId(null); };
  const deleteSlide = (id) => { if (slides.length === 1) return; const r = slides.filter(s => s.id !== id); setSlides(r); if (activeSlideId === id) setActiveSlideId(r[0].id); };
  const moveBlock = (blockId, dir) => {
    const blocks = [...activeSlide.blocks]; const i = blocks.findIndex(b => b.id === blockId);
    if (i + dir < 0 || i + dir >= blocks.length) return;
    [blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]]; updateSlide(activeSlide.id, { blocks });
  };

  const quickSave = () => {
    try {
      const raw = localStorage.getItem("sb_presentations");
      const saved = raw ? JSON.parse(raw) : [];
      const entry = { id: uid(), name: `Sauvegarde ${new Date().toLocaleTimeString("fr-FR")}`, date: new Date().toISOString(), slides };
      localStorage.setItem("sb_presentations", JSON.stringify([entry, ...saved].slice(0, 20)));
      setSaveFlash(true); setTimeout(() => setSaveFlash(false), 2000);
    } catch {}
  };

  const handlePresent = async () => {
    try {
      const { data: pres, error: e1 } = await supabase.from("presentations").insert({ title: "Session " + new Date().toLocaleTimeString("fr-FR") }).select().single();
      if (e1) throw e1;
      for (let i = 0; i < slides.length; i++) {
        const { error: e2 } = await supabase.from("slides").insert({ presentation_id: pres.id, position: i, title: slides[i].title, blocks: JSON.stringify(slides[i].blocks) });
        if (e2) console.error("slide insert error:", e2);
      }
      const joinCode = makeJoinCode();
      const { data: sess, error: e3 } = await supabase.from("sessions").insert({ presentation_id: pres.id, join_code: joinCode, current_slide_index: 0, is_active: true }).select().single();
      if (e3) throw e3;
      onPresent({ slides, sessionCode: joinCode, sessionId: sess.id });
    } catch (err) {
      console.error("Launch error:", err);
      alert("Erreur Supabase : " + (err.message || JSON.stringify(err)) + "\n\nVérifie ta connexion et les variables d'environnement.");
    }
  };

  return (
    <>
      {showModal && <SaveLoadModal slides={slides} onLoad={(sl) => { setSlides(sl); setActiveSlideId(sl[0]?.id); setActiveBlockId(null); }} onClose={() => setShowModal(false)} />}
      <div style={s.root}>
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={s.logo}>◈</div>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", letterSpacing: "-0.02em" }}>SlideBuilder</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={quickSave} style={{ ...s.headerBtn, background: saveFlash ? "rgba(16,185,129,0.2)" : undefined, borderColor: saveFlash ? "#10b981" : undefined, color: saveFlash ? "#10b981" : undefined }}>
              {saveFlash ? "✓ Sauvegardé !" : "💾 Sauvegarder"}
            </button>
            <button onClick={() => setShowModal(true)} style={s.headerBtn}>📂 Gérer</button>
            <button onClick={handlePresent} style={s.presentBtn}>▶ Présenter</button>
          </div>
        </div>
        <div style={s.workspace}>
          {/* Slides list */}
          <div style={s.sidebarLeft}>
            <p style={s.sidebarTitle}>Slides</p>
            {slides.map((sl, i) => (
              <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }} style={{ ...s.slideThumb, ...(sl.id === activeSlide.id ? s.slideThumbActive : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700 }}>#{i + 1}</span>
                  {slides.length > 1 && <button onClick={e => { e.stopPropagation(); deleteSlide(sl.id); }} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}>✕</button>}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#e0e7ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#818cf8" }}>{sl.blocks.length} bloc{sl.blocks.length !== 1 ? "s" : ""}</p>
              </div>
            ))}
            <button onClick={addSlide} style={s.addSlideBtn}>+ Nouvelle slide</button>
          </div>

          {/* Editor */}
          <div style={s.editorCenter}>
            <div style={s.slideTitleRow}>
              <input value={activeSlide.title} onChange={e => updateSlide(activeSlide.id, { title: e.target.value })} style={s.slideTitleInput} placeholder="Titre de la slide" />
            </div>
            <div style={s.addBlockRow}>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Ajouter</span>
              {[["text","T","Texte"],["image","⬜","Image"],["poll","▦","Vote"]].map(([type,icon,label]) => (
                <button key={type} onClick={() => addBlock(type)} style={s.addBlockBtn}><span style={{ fontWeight: 700 }}>{icon}</span> {label}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 0 20px" }}>
              {activeSlide.blocks.length === 0 && (
                <div style={s.emptyState}><div style={{ fontSize: 32, marginBottom: 12 }}>✦</div><p style={{ margin: 0, color: "#9ca3af", fontSize: 14 }}>Cliquez sur un bouton ci-dessus<br />pour ajouter votre premier bloc</p></div>
              )}
              {activeSlide.blocks.map((block, i) => (
                <div key={block.id} onClick={() => setActiveBlockId(block.id)} style={{ ...s.blockRow, ...(block.id === activeBlockId ? s.blockRowActive : {}) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: block.id === activeBlockId ? 12 : 0 }}>
                    <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                      {block.type === "text" ? "T Texte" : block.type === "image" ? "⬜ Image" : "▦ Vote"}
                      {block.type === "text" && <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>{block.content.slice(0, 25)}…</span>}
                      {block.type === "poll" && <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>{block.options.length} options{block.correctOptionId ? " ✓" : ""}</span>}
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} style={s.moveBtn}>↑</button>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} style={s.moveBtn}>↓</button>
                    </div>
                  </div>
                  {block.id === activeBlockId && <BlockEditor block={block} onChange={patch => updateBlock(activeSlide.id, block.id, patch)} onDelete={() => deleteBlock(block.id)} />}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={s.previewPanel}>
            <p style={s.sidebarTitle}>Aperçu</p>
            <SlideCanvasPreview slide={activeSlide} />
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8 }}>
              {slides.map(sl => <div key={sl.id} onClick={() => { setActiveSlideId(sl.id); setActiveBlockId(null); }} style={{ width: 8, height: 8, borderRadius: "50%", cursor: "pointer", background: sl.id === activeSlide.id ? "#818cf8" : "#d1d5db" }} />)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ROOT APP
// ---------------------------------------------------------------------------
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get("join");
  if (joinParam) return <JoinScreen initialCode={joinParam} />;

  const [mode, setMode] = useState("builder");
  const [presData, setPresData] = useState(null);

  if (mode === "present" && presData) {
    return <PresentationMode slides={presData.slides} sessionCode={presData.sessionCode} sessionId={presData.sessionId} onExit={() => setMode("builder")} />;
  }
  return <Builder onPresent={(data) => { setPresData(data); setMode("present"); }} />;
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const s = {
  root: { fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", height: "100vh", background: "#f8f9ff", color: "#1e1b4b", overflow: "hidden" },
  header: { background: "#1e1b4b", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0 },
  logo: { width: 32, height: 32, background: "#818cf8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", fontWeight: 900 },
  headerBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  presentBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "8px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit" },
  workspace: { display: "flex", flex: 1, overflow: "hidden" },
  sidebarLeft: { width: 160, background: "#1e1b4b", borderRight: "1px solid #312e81", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flexShrink: 0 },
  sidebarTitle: { margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.08em" },
  slideThumb: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 8, padding: "10px", cursor: "pointer" },
  slideThumbActive: { background: "rgba(129,140,248,0.15)", borderColor: "#818cf8" },
  addSlideBtn: { background: "none", border: "1px dashed rgba(129,140,248,0.4)", color: "#818cf8", borderRadius: 8, padding: "8px", cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%", marginTop: 4, fontFamily: "inherit" },
  editorCenter: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" },
  slideTitleRow: { padding: "16px 20px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 },
  slideTitleInput: { width: "100%", boxSizing: "border-box", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: "#1e1b4b", fontFamily: "inherit", background: "transparent" },
  addBlockRow: { padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f3f4f6", flexShrink: 0, flexWrap: "wrap" },
  addBlockBtn: { background: "#f5f3ff", border: "1px solid #e0e7ff", color: "#6366f1", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" },
  blockRow: { margin: "8px 20px", borderRadius: 10, border: "1px solid #f3f4f6", padding: "10px 14px", cursor: "pointer", background: "#fff" },
  blockRowActive: { borderColor: "#818cf8", background: "#fafafe", boxShadow: "0 0 0 3px rgba(129,140,248,0.12)" },
  emptyState: { margin: "60px 20px", textAlign: "center", padding: "40px", background: "#f9fafb", borderRadius: 16, border: "2px dashed #e5e7eb" },
  blockEditor: { marginTop: 4 },
  blockEditorHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  blockBadge: { fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#ede9fe", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" },
  deleteBtn: { background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 6, cursor: "pointer", padding: "2px 8px", fontSize: 12, fontWeight: 700 },
  textarea: { width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.5 },
  input: { padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  select: { padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", color: "#1e1b4b", background: "#fff" },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  sectionLabel: { margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" },
  uploadBtn: { width: "100%", padding: "24px", background: "#f9fafb", border: "2px dashed #d1d5db", borderRadius: 8, cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 600, fontFamily: "inherit" },
  addOptionBtn: { background: "none", border: "1px dashed #6366f1", color: "#6366f1", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%", marginTop: 4, fontFamily: "inherit" },
  moveBtn: { background: "#f3f4f6", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 6px", fontSize: 12, color: "#6b7280" },
  previewPanel: { width: 320, background: "#f5f3ff", borderLeft: "1px solid #e0e7ff", padding: "16px", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" },
  slideCanvas: { background: "#fff", borderRadius: 16, border: "1px solid #e0e7ff", padding: "20px", flex: 1, display: "flex", flexDirection: "column", boxShadow: "0 4px 24px rgba(99,102,241,0.08)", minHeight: 300 },
  presentationRoot: { fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex", flexDirection: "column", height: "100vh", background: "#f8f9ff", overflow: "hidden" },
  presentationBar: { background: "#1e1b4b", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #312e81", flexShrink: 0 },
  presentationSlide: { flex: 1, overflowY: "auto", padding: "40px 48px", display: "flex", flexDirection: "column" },
  presBtn: { background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", color: "#a5b4fc", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" },
  mobileRoot: { fontFamily: "'DM Sans','Segoe UI',sans-serif", minHeight: "100vh", background: "#f8f9ff", display: "flex", flexDirection: "column" },
  mobileHeader: { background: "#1e1b4b", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  mobileContent: { flex: 1, padding: "24px 20px", overflowY: "auto" },
  mobileLoader: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 32 },
  voteBtn: { width: "100%", padding: "16px 20px", background: "#fff", border: "2px solid #e0e7ff", borderRadius: 14, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#1e1b4b", textAlign: "left", fontFamily: "inherit" },
  spinner: { width: 36, height: 36, border: "3px solid #e0e7ff", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
