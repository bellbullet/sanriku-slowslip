import { useState, useEffect, useRef, useCallback } from "react";

const EVENTS = [
  { date: "2025年11月9日", mag: 6.9, label: "三陸沖 M6.9", color: "#f59e0b", detail: "スロースリップ活発化のトリガーとなった地震" },
  { date: "2025年12月8日", mag: 7.5, label: "青森県東方沖 M7.5", color: "#ef4444", detail: "後発地震注意情報（1回目）発令" },
  { date: "2026年4月20日", mag: 7.7, label: "三陸沖 M7.7", color: "#dc2626", detail: "後発地震注意情報（2回目）。震源東側でスロースリップ加速が確認された" },
];

function PlateSimulation() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    stress: 0,
    slipProgress: 0,
    mode: "loading", // loading | slowslip | earthquake | afterslip
    modeTimer: 0,
    particles: [],
    wave: null,
    waveAge: 0,
  });
  const [displayMode, setDisplayMode] = useState("loading");
  const [stressLevel, setStressLevel] = useState(0);
  const [isManual, setIsManual] = useState(false);
  const manualMode = useRef(null);

  const W = 700, H = 320;
  const OCEAN_Y = 100, PLATE_Y = 170;

  const initParticles = () => {
    const ps = [];
    for (let i = 0; i < 18; i++) {
      ps.push({ x: 80 + Math.random() * 540, y: 195 + Math.random() * 60, vx: 0, vy: 0, size: 2.5 + Math.random() * 2 });
    }
    return ps;
  };

  useEffect(() => {
    stateRef.current.particles = initParticles();
  }, []);

  const setMode = useCallback((m) => {
    manualMode.current = m;
    setIsManual(true);
    stateRef.current.mode = m;
    stateRef.current.modeTimer = 0;
    if (m === "loading") stateRef.current.stress = 0.1;
    if (m === "slowslip") stateRef.current.slipProgress = 0;
    if (m === "earthquake") { stateRef.current.slipProgress = 0; stateRef.current.wave = null; }
    if (m === "afterslip") stateRef.current.slipProgress = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const lerp = (a, b, t) => a + (b - a) * t;

    const draw = (ts) => {
      const s = stateRef.current;
      s.modeTimer += 0.016;

      // Auto mode progression
      if (!isManual) {
        if (s.mode === "loading" && s.stress >= 0.95) { s.mode = "slowslip"; s.modeTimer = 0; s.slipProgress = 0; }
        else if (s.mode === "slowslip" && s.modeTimer > 5) { s.mode = "earthquake"; s.modeTimer = 0; s.slipProgress = 0; }
        else if (s.mode === "earthquake" && s.modeTimer > 3) { s.mode = "afterslip"; s.modeTimer = 0; }
        else if (s.mode === "afterslip" && s.modeTimer > 4) { s.mode = "loading"; s.modeTimer = 0; s.stress = 0.15; }
      }

      // Stress logic
      if (s.mode === "loading") s.stress = Math.min(1, s.stress + 0.0018);
      else if (s.mode === "slowslip") s.stress = Math.max(0.3, s.stress - 0.003);
      else if (s.mode === "earthquake") s.stress = Math.max(0, s.stress - 0.06);
      else if (s.mode === "afterslip") s.stress = Math.max(0.1, s.stress - 0.008);

      setStressLevel(Math.round(s.stress * 100));
      setDisplayMode(s.mode);

      // Slip progress
      if (s.mode === "slowslip") s.slipProgress = Math.min(1, s.slipProgress + 0.004);
      if (s.mode === "earthquake") s.slipProgress = Math.min(1, s.slipProgress + 0.06);
      if (s.mode === "afterslip") s.slipProgress = Math.min(1, s.slipProgress + 0.006);

      // Wave
      if (s.mode === "earthquake" && s.slipProgress > 0.3 && !s.wave) {
        s.wave = { x: 350, r: 0 };
        s.waveAge = 0;
      }
      if (s.wave) {
        s.wave.r += 4;
        s.waveAge++;
        if (s.wave.r > 400) s.wave = null;
      }

      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0a1628");
      bg.addColorStop(0.35, "#0d2045");
      bg.addColorStop(1, "#1a0a2e");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Seafloor topography
      ctx.beginPath();
      ctx.moveTo(0, PLATE_Y + 5);
      for (let x = 0; x <= W; x += 10) {
        const noise = Math.sin(x * 0.04) * 4 + Math.sin(x * 0.09) * 2;
        ctx.lineTo(x, PLATE_Y + 5 + noise);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const seafloorGrad = ctx.createLinearGradient(0, PLATE_Y, 0, H);
      seafloorGrad.addColorStop(0, "#2d4a1e");
      seafloorGrad.addColorStop(1, "#1a2f10");
      ctx.fillStyle = seafloorGrad;
      ctx.fill();

      // Ocean water layer
      ctx.beginPath();
      ctx.moveTo(0, OCEAN_Y);
      for (let x = 0; x <= W; x += 8) {
        const wave = Math.sin(x * 0.05 + ts * 0.001) * 2;
        ctx.lineTo(x, OCEAN_Y + wave);
      }
      ctx.lineTo(W, PLATE_Y); ctx.lineTo(0, PLATE_Y); ctx.closePath();
      const oceanGrad = ctx.createLinearGradient(0, OCEAN_Y, 0, PLATE_Y);
      oceanGrad.addColorStop(0, "rgba(20,80,160,0.6)");
      oceanGrad.addColorStop(1, "rgba(10,30,80,0.8)");
      ctx.fillStyle = oceanGrad;
      ctx.fill();

      // ---- Plates ----
      // Pacific plate (subducting) - moves right to left
      const pacificOffset = s.mode === "loading" ? s.stress * 8 : 0;
      const slipOffset = s.mode === "earthquake" ? s.slipProgress * 30 :
                         s.mode === "slowslip" ? s.slipProgress * 8 :
                         s.mode === "afterslip" ? s.slipProgress * 5 : 0;

      // Subducting slab
      ctx.save();
      ctx.beginPath();
      const slabX1 = 350 + pacificOffset - slipOffset;
      ctx.moveTo(slabX1, PLATE_Y - 5);
      ctx.lineTo(W + 20, PLATE_Y - 5);
      ctx.lineTo(W + 20, PLATE_Y + 20);
      ctx.lineTo(slabX1 + 60, PLATE_Y + 20);
      ctx.bezierCurveTo(slabX1 + 100, PLATE_Y + 50, slabX1 + 80, H - 30, slabX1 - 60, H - 10);
      ctx.lineTo(slabX1 - 80, H + 10); ctx.lineTo(W + 20, H + 10);
      ctx.closePath();
      const slabGrad = ctx.createLinearGradient(350, PLATE_Y, 350, H);
      slabGrad.addColorStop(0, "#3a5c2a");
      slabGrad.addColorStop(1, "#1e3516");
      ctx.fillStyle = slabGrad;
      ctx.fill();
      ctx.strokeStyle = "#5a8a40";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // North American plate (overriding)
      ctx.beginPath();
      ctx.moveTo(0, PLATE_Y - 25);
      ctx.lineTo(slabX1 + 5, PLATE_Y - 25);
      ctx.lineTo(slabX1 + 5, PLATE_Y + 5);
      ctx.lineTo(0, PLATE_Y + 5);
      ctx.closePath();
      const naGrad = ctx.createLinearGradient(0, PLATE_Y - 25, 0, PLATE_Y + 5);
      naGrad.addColorStop(0, "#4a3020");
      naGrad.addColorStop(1, "#2a1a0e");
      ctx.fillStyle = naGrad;
      ctx.fill();
      ctx.strokeStyle = "#7a5030";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Plate boundary zone / coupling area
      const bdX = slabX1 + 5;
      const coupling = s.mode === "loading" ? s.stress : s.mode === "slowslip" ? 0.4 : 0.1;
      const bdColor = `rgba(${Math.round(200 * coupling)}, ${Math.round(100 * (1 - coupling))}, 0, 0.8)`;
      ctx.beginPath();
      ctx.arc(bdX, PLATE_Y, 12, 0, Math.PI * 2);
      ctx.fillStyle = bdColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bdX, PLATE_Y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,200,100,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Stress arrows (loading mode)
      if (s.mode === "loading") {
        const arrowCount = Math.floor(s.stress * 5) + 1;
        for (let i = 0; i < arrowCount; i++) {
          const ax = 500 + i * 40;
          if (ax > W - 20) break;
          ctx.beginPath();
          ctx.moveTo(ax, PLATE_Y - 2);
          ctx.lineTo(ax - 18 - s.stress * 8, PLATE_Y - 2);
          ctx.strokeStyle = `rgba(255,200,50,${0.3 + s.stress * 0.7})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(ax - 18 - s.stress * 8, PLATE_Y - 5);
          ctx.lineTo(ax - 24 - s.stress * 8, PLATE_Y - 2);
          ctx.lineTo(ax - 18 - s.stress * 8, PLATE_Y + 1);
          ctx.fillStyle = `rgba(255,200,50,${0.3 + s.stress * 0.7})`;
          ctx.fill();
        }
      }

      // Slow slip arrows (slowslip mode)
      if (s.mode === "slowslip" || s.mode === "afterslip") {
        const count = s.mode === "slowslip" ? 6 : 4;
        for (let i = 0; i < count; i++) {
          const ax = bdX + 30 + i * 35;
          const alpha = s.slipProgress * (1 - i / (count + 1));
          ctx.beginPath();
          ctx.moveTo(ax, PLATE_Y - 2);
          ctx.lineTo(ax + 20, PLATE_Y - 2);
          ctx.strokeStyle = `rgba(100,255,150,${alpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ax + 20, PLATE_Y - 5);
          ctx.lineTo(ax + 26, PLATE_Y - 2);
          ctx.lineTo(ax + 20, PLATE_Y + 1);
          ctx.fillStyle = `rgba(100,255,150,${alpha})`;
          ctx.fill();
        }
      }

      // Earthquake rupture
      if (s.mode === "earthquake") {
        const rupX = bdX;
        const rupLen = s.slipProgress * 300;
        ctx.beginPath();
        ctx.moveTo(rupX, PLATE_Y);
        ctx.lineTo(rupX + rupLen, PLATE_Y);
        ctx.strokeStyle = `rgba(255,80,30,${0.4 + s.slipProgress * 0.6})`;
        ctx.lineWidth = 4 + s.slipProgress * 4;
        ctx.stroke();

        // Shake particles
        s.particles.forEach(p => {
          p.vx += (Math.random() - 0.5) * 3 * s.slipProgress;
          p.vy += (Math.random() - 0.5) * 3 * s.slipProgress;
          p.vx *= 0.85; p.vy *= 0.85;
          p.x += p.vx; p.y += p.vy;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,150,50,0.8)`;
          ctx.fill();
        });
      } else {
        s.particles.forEach(p => {
          p.x += (80 + Math.random() * 540 - p.x) * 0.01;
          p.y += (195 + Math.random() * 60 - p.y) * 0.01;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(100,200,100,0.4)`;
          ctx.fill();
        });
      }

      // Tsunami wave
      if (s.wave) {
        const alpha = Math.max(0, 1 - s.wave.r / 300);
        ctx.beginPath();
        ctx.arc(350, PLATE_Y, s.wave.r, Math.PI, 2 * Math.PI);
        ctx.strokeStyle = `rgba(100,200,255,${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        if (s.wave.r > 80) {
          ctx.beginPath();
          ctx.arc(350, PLATE_Y, s.wave.r - 60, Math.PI, 2 * Math.PI);
          ctx.strokeStyle = `rgba(100,200,255,${alpha * 0.4})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Labels
      ctx.font = "bold 11px 'Noto Sans JP', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("北米プレート", 20, PLATE_Y - 10);
      ctx.fillText("太平洋プレート", W - 100, PLATE_Y + 35);
      ctx.fillStyle = "rgba(100,200,255,0.6)";
      ctx.fillText("▲日本海溝方向", bdX - 40, PLATE_Y - 35);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isManual]);

  const modeInfo = {
    loading: { label: "固着蓄積中", color: "#f59e0b", desc: "プレート境界が固着し、ひずみが蓄積されている状態。年間約8cm太平洋プレートが沈み込み続ける。" },
    slowslip: { label: "スロースリップ発生中", color: "#10b981", desc: "断層がゆっくり滑る。体に感じない低速のすべりが数日〜数か月続く。ひずみを一部解消するが、隣接域に応力を転送する場合も。" },
    earthquake: { label: "地震（急激なすべり）", color: "#ef4444", desc: "固着が限界を超え断層が一気に破壊。M7〜9級地震として解放。津波が発生する可能性がある。" },
    afterslip: { label: "余効すべり（アフタースリップ）", color: "#8b5cf6", desc: "本震後も断層がゆっくりすべり続ける現象。余震活動とともに数週間〜数か月継続することがある。" },
  };
  const info = modeInfo[displayMode];

  return (
    <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 16, padding: "16px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(modeInfo).map(([key, val]) => (
          <button key={key} onClick={() => setMode(key)}
            style={{
              padding: "5px 12px", borderRadius: 20, border: `1px solid ${val.color}`,
              background: displayMode === key ? val.color : "transparent",
              color: displayMode === key ? "#000" : val.color,
              fontSize: 11, cursor: "pointer", fontWeight: 700, transition: "all 0.2s"
            }}>
            {val.label}
          </button>
        ))}
        <button onClick={() => { setIsManual(false); manualMode.current = null; stateRef.current.mode = "loading"; stateRef.current.stress = 0.05; }}
          style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>
          ▶ 自動再生
        </button>
      </div>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", borderRadius: 10, display: "block" }} />
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>ひずみ蓄積レベル</div>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4, transition: "width 0.1s",
              width: `${stressLevel}%`,
              background: stressLevel > 80 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : stressLevel > 50 ? "#f59e0b" : "#10b981"
            }} />
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{stressLevel}%</div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 12, color: info.color, fontWeight: 700 }}>{info.label}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginTop: 3 }}>{info.desc}</div>
        </div>
      </div>
    </div>
  );
}

function Timeline() {
  const [active, setActive] = useState(null);
  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg, #f59e0b, #ef4444, #dc2626)", opacity: 0.4 }} />
      {EVENTS.map((ev, i) => (
        <div key={i} onClick={() => setActive(active === i ? null : i)}
          style={{ position: "relative", marginBottom: 20, cursor: "pointer" }}>
          <div style={{
            position: "absolute", left: -20, top: 4, width: 14, height: 14, borderRadius: "50%",
            background: ev.color, border: "2px solid rgba(0,0,0,0.5)", zIndex: 1,
            boxShadow: active === i ? `0 0 12px ${ev.color}` : "none", transition: "box-shadow 0.3s"
          }} />
          <div style={{ paddingLeft: 8 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{ev.date}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: ev.color, fontFamily: "monospace" }}>
              {ev.label}
            </div>
            {active === i && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 6, padding: "8px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 8, borderLeft: `3px solid ${ev.color}` }}>
                {ev.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MagBar({ mag, max = 9 }) {
  const pct = ((mag - 5) / (max - 5)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "#f59e0b" }}>M{mag}</div>
      <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius: 4, transition: "width 1s" }} />
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  const tabs = ["🌊 シミュレーション", "📅 時系列", "🔬 仕組み", "⚠️ リスク評価"];

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #060d1f 0%, #0d1a35 50%, #0a0d20 100%)",
      fontFamily: "'Noto Sans JP', 'Hiragino Kaku Gothic Pro', sans-serif", color: "#e8eaf0",
      padding: "0 0 40px"
    }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(90deg, rgba(220,38,38,0.15), rgba(245,158,11,0.1))", borderBottom: "1px solid rgba(220,38,38,0.2)", padding: "24px 32px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ padding: "3px 10px", borderRadius: 4, background: "rgba(220,38,38,0.3)", border: "1px solid #dc2626", fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: 2 }}>
            速報 2026.05.15
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>地震調査委員会発表</div>
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.5 }}>
          三陸沖スロースリップ<br />
          <span style={{ color: "#f59e0b" }}>加速</span>——大地震への連鎖を読む
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
          2025年11月以降の地震群とスロースリップの関係、東日本大震災との類似点を解説
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, padding: "0 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 0 }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: "12px 18px", fontSize: 12, fontWeight: tab === i ? 700 : 400,
            background: "none", border: "none", borderBottom: tab === i ? "2px solid #f59e0b" : "2px solid transparent",
            color: tab === i ? "#f59e0b" : "rgba(255,255,255,0.4)", cursor: "pointer", transition: "all 0.2s"
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "24px 32px" }}>
        {/* Tab 0: Simulation */}
        {tab === 0 && (
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16, lineHeight: 1.7 }}>
              プレート境界のダイナミクスをリアルタイムで再現。ボタンで各フェーズを切り替えるか、自動再生で連続的な変化を観察できます。
            </p>
            <PlateSimulation />
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "プレート沈み込み速度", val: "年間 約8cm", note: "固着がなければ等速で滑り続ける" },
                { label: "M7.7のすべり量", val: "数m", note: "数十年分の固着が一気に解放" },
                { label: "東日本大震災すべり量", val: "数十m", note: "数百年分のひずみ蓄積の解放" },
                { label: "スロースリップ速度", val: "通常の1/1000以下", note: "地震波を発生させないほどゆっくり" },
              ].map((c, i) => (
                <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, borderLeft: "3px solid rgba(245,158,11,0.4)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "#f59e0b" }}>{c.val}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{c.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 1: Timeline */}
        {tab === 1 && (
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 20, lineHeight: 1.7 }}>
              2025年秋以降の地震活動とスロースリップの時系列。タップで詳細を表示。
            </p>
            <Timeline />
            <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 6 }}>📍 現状（2026年5月15日）</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>
                地震調査委員会は5月14日、4月20日M7.7地震後も<strong style={{color:"#f59e0b"}}>震源東側でスロースリップが加速継続</strong>していると発表。
                微動の発生場所が徐々に移動しており、プレート境界のゆっくりすべりが続いていると専門家は分析。
              </div>
            </div>
            <div style={{ marginTop: 12, padding: "14px 16px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 6 }}>🕰 1994年 三陸はるか沖地震との位置関係</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>
                今回の活動域は1994年M7.6の震源域南側と、2025年12月M7.5の震源域の間に位置。
                この空白域で30年以上ひずみが蓄積している可能性がある。
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Mechanism */}
        {tab === 2 && (
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16, lineHeight: 1.7 }}>
              スロースリップの基本メカニズムと、なぜ大地震の前触れになりうるのかを解説。
            </p>
            {[
              {
                title: "① 通常の固着（カップリング）",
                color: "#f59e0b",
                body: "太平洋プレートが年間8cm北米プレートの下へ沈み込む。プレート境界面が固着（カップリング）している部分ではひずみが蓄積し続ける。固着が強い領域ほど大地震のポテンシャルが高い。"
              },
              {
                title: "② スロースリップとは",
                color: "#10b981",
                body: "固着しているはずのプレート境界が、地震を起こさずゆっくり滑る現象（非地震性すべり）。通常の地震の1/1000以下の速度で滑るため地震波は発生しない。GNSSや繰り返し地震、微動の観測によって検出される。"
              },
              {
                title: "③ なぜ危険か——応力転送",
                color: "#ef4444",
                body: "スロースリップは自身のひずみを解消する一方で、隣接する固着域に応力（ストレス）を転送する。2011年東北地方太平洋沖地震では、本震2日前のM7.3の後にスロースリップが発生し、それが本震の破壊開始点に向かって移動したことで断層破壊を促進した可能性が指摘されている。"
              },
              {
                title: "④ 今回の特徴——加速",
                color: "#8b5cf6",
                body: "2026年4月20日のM7.7地震後、震源東側のスロースリップが「加速」している。地震調査委の小原委員長は「長期的にはスロースリップが最終的に大きな地震のきっかけになるものもある」と指摘。加速はプレート境界の緊張状態の高まりを示す可能性がある。"
              },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: `1px solid ${item.color}22`, borderLeft: `3px solid ${item.color}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>{item.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Risk */}
        {tab === 3 && (
          <div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16, lineHeight: 1.7 }}>
              地震調査委・東北大の評価に基づくリスク整理。
            </p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>直近の主要地震規模比較</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <MagBar mag={6.9} /> 
                <MagBar mag={7.5} />
                <MagBar mag={7.7} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 60, fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "rgba(220,38,38,0.5)" }}>M9.0</div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 10, overflow: "hidden" }}>
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg,#ef4444,#7f1d1d)", borderRadius: 4, opacity: 0.4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>2011年東日本（参考）</div>
                </div>
              </div>
            </div>
            {[
              { label: "スロースリップが加速した場合", level: "要警戒", color: "#ef4444", detail: "M7〜8以上の地震が周辺で発生する可能性。地震調査委が公式に警告。" },
              { label: "1994年三陸はるか沖震源域（空白域）", level: "長期リスク", color: "#f59e0b", detail: "30年以上のひずみ蓄積。今回の活動域の北側と南側に挟まれた空白。" },
              { label: "後発地震注意情報の現状", level: "発令中", color: "#8b5cf6", detail: "「北海道・三陸沖後発地震注意情報」が2回発令。通常より大規模地震の誘発リスクが高い期間。" },
              { label: "東日本大震災との類似性", level: "前例あり", color: "#10b981", detail: "東日本大震災前にも同じ海域でスロースリップが観測されていた。直接の前兆とは断言できないが、警戒は必要。" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ minWidth: 60 }}>
                  <div style={{ fontSize: 9, padding: "3px 6px", borderRadius: 4, background: r.color + "33", color: r.color, fontWeight: 700, textAlign: "center" }}>{r.level}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{r.detail}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
              ⚠️ 秋田県は「北海道・三陸沖後発地震注意情報」の対象エリアに近接。津波到達時間は沿岸で地震発生から数十分〜1時間程度。日頃からの避難経路・防災備蓄の確認を。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
