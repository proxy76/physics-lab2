import { useState, useEffect, useRef, useCallback } from "react";

// ─── responsive hook ─────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 600) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [breakpoint]);
    return isMobile;
}

const LAMBDA = 0.6328; // µm = 632.8 nm He-Ne laser

// ─── helpers ──────────────────────────────────────────────────────────────────
const gaussian = (r, rho) => Math.exp(-(r * r) / (rho * rho));
const sinc2 = (beta) => (beta === 0 ? 1 : Math.pow(Math.sin(beta) / beta, 2));

// ─── colour utility ───────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const intensityToRGB = (v) => {
    // black → dark-red → laser-red → orange-white
    if (v < 0.33) {
        const t = v / 0.33;
        return `rgb(${Math.round(lerp(0, 180, t))},0,0)`;
    } else if (v < 0.66) {
        const t = (v - 0.33) / 0.33;
        return `rgb(${Math.round(lerp(180, 255, t))},${Math.round(lerp(0, 80, t))},0)`;
    } else {
        const t = (v - 0.66) / 0.34;
        return `rgb(255,${Math.round(lerp(80, 240, t))},${Math.round(lerp(0, 180, t))})`;
    }
};

// ─── shared canvas hook ───────────────────────────────────────────────────────
function useCanvas(draw, deps) {
    const ref = useRef(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        draw(ctx, canvas.width, canvas.height);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return ref;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 – Gaussian beam
// ══════════════════════════════════════════════════════════════════════════════
function GaussianSection() {
    const mobile = useIsMobile();
    const [rho, setRho] = useState(4); // mm

    // 2-D beam cross-section
    const beam2D = useCanvas((ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;
        for (let px = 0; px < W; px++) {
            for (let py = 0; py < H; py++) {
                const r = Math.sqrt(((px - cx) / 12) ** 2 + ((py - cy) / 12) ** 2);
                const v = gaussian(r, rho);
                ctx.fillStyle = intensityToRGB(v);
                ctx.fillRect(px, py, 1, 1);
            }
        }
        // draw rho circle
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, rho * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }, [rho]);

    // 1-D profile
    const profile = useCanvas((ctx, W, H) => {
        const PAD = 40;
        ctx.clearRect(0, 0, W, H);

        // axes
        ctx.strokeStyle = "#334";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD, 10); ctx.lineTo(PAD, H - PAD); ctx.lineTo(W - 10, H - PAD); ctx.stroke();
        ctx.fillStyle = "#667";
        ctx.font = "11px 'Courier New'";
        ctx.fillText("I/I₀", 4, 20);
        ctx.fillText("r (mm)", W - 40, H - 8);
        // gridlines
        [0.2, 0.4, 0.6, 0.8, 1.0].forEach(v => {
            const y = H - PAD - v * (H - PAD - 10);
            ctx.strokeStyle = "#1e2a3a";
            ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - 10, y); ctx.stroke();
            ctx.fillStyle = "#556";
            ctx.fillText(v.toFixed(1), 6, y + 4);
        });

        const maxR = 12;
        const toX = (r) => PAD + ((r + maxR) / (2 * maxR)) * (W - PAD - 10);
        const toY = (v) => H - PAD - v * (H - PAD - 10);

        // 1/e line
        ctx.strokeStyle = "rgba(255,200,0,0.4)";
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(PAD, toY(1 / Math.E)); ctx.lineTo(W - 10, toY(1 / Math.E)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,200,0,0.7)";
        ctx.fillText("1/e", W - 32, toY(1 / Math.E) - 4);

        // rho markers
        [-rho, rho].forEach(r => {
            const x = toX(r);
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(x, H - PAD); ctx.lineTo(x, toY(1 / Math.E)); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "#aaa";
            ctx.fillText(`${r > 0 ? "+" : ""}${r}`, x - 8, H - PAD + 14);
        });

        // curve
        ctx.beginPath();
        for (let px = PAD; px < W - 10; px++) {
            const r = ((px - PAD) / (W - PAD - 10)) * 2 * maxR - maxR;
            const v = gaussian(r, rho);
            const y = toY(v);
            px === PAD ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.strokeStyle = "#ff4422";
        ctx.lineWidth = 2;
        ctx.stroke();
    }, [rho]);

    return (
        <div style={{ display: "flex", gap: mobile ? 16 : 24, flexWrap: "wrap", alignItems: "flex-start", flexDirection: mobile ? "column" : "row" }}>
            <div style={{ width: mobile ? "100%" : "auto", display: "flex", flexDirection: "column", alignItems: mobile ? "center" : "flex-start" }}>
                <p style={labelStyle}>Beam Cross-Section (2D)</p>
                <canvas ref={beam2D} width={180} height={180} style={{ borderRadius: 8, border: "1px solid #1e3", maxWidth: "100%" }} />
                <p style={{ ...labelStyle, textAlign: "center", fontSize: 11 }}>
                    white circle = ρ boundary (I = I₀/e)
                </p>
            </div>
            <div style={{ flex: 1, minWidth: mobile ? 0 : 260, width: mobile ? "100%" : "auto" }}>
                <p style={labelStyle}>Intensity Profile I(r) = I₀ · e<sup>−r²/ρ²</sup></p>
                <canvas ref={profile} width={340} height={180} style={{ borderRadius: 8, border: "1px solid #1e3", width: "100%" }} />
                <div style={sliderRow}>
                    <label style={labelStyle}>ρ (beam radius) = <b style={{ color: "#ff6644" }}>{rho} mm</b></label>
                    <input type="range" min={1} max={10} step={0.5} value={rho}
                        onChange={e => setRho(+e.target.value)} style={sliderStyle} />
                </div>
                <div style={infoBox}>
                    <p>At r = ρ: I = I₀/e ≈ <b style={{ color: "#ff6644" }}>0.368 · I₀</b></p>
                    <p>At r = 0 (axis): I = I₀ (maximum)</p>
                    <p>Current ρ = {rho} mm &nbsp;→&nbsp; I(ρ) = {(gaussian(rho, rho)).toFixed(3)} · I₀ ✓</p>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 – Beam divergence
// ══════════════════════════════════════════════════════════════════════════════
function DivergenceSection() {
    const mobile = useIsMobile();
    const [rho1, setRho1] = useState(1.5);
    const [rho2, setRho2] = useState(2.8);
    const [d, setD] = useState(50);

    const tanTheta = (rho2 - rho1) / d;
    const theta_rad = Math.atan(tanTheta);
    const theta_mrad = theta_rad * 1000;

    const cvs = useCanvas((ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        const CY = H / 2;
        const x1 = 60, x2 = W - 60;
        const scale = 12; // pixels per mm

        // beam body
        const top1 = CY - rho1 * scale, bot1 = CY + rho1 * scale;
        const top2 = CY - rho2 * scale, bot2 = CY + rho2 * scale;

        // fill beam
        const grad = ctx.createLinearGradient(x1, 0, x2, 0);
        grad.addColorStop(0, "rgba(255,40,0,0.6)");
        grad.addColorStop(1, "rgba(255,40,0,0.25)");
        ctx.beginPath();
        ctx.moveTo(x1, top1); ctx.lineTo(x2, top2); ctx.lineTo(x2, bot2); ctx.lineTo(x1, bot1);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // beam edges
        ctx.strokeStyle = "#ff4422";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, top1); ctx.lineTo(x2, top2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, bot1); ctx.lineTo(x2, bot2); ctx.stroke();
        // centre axis
        ctx.strokeStyle = "#334";
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(40, CY); ctx.lineTo(W - 20, CY); ctx.stroke();
        ctx.setLineDash([]);

        // screen 1
        const drawScreen = (x, rho, label) => {
            ctx.strokeStyle = "#55aaff";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, CY - rho * scale - 10); ctx.lineTo(x, CY + rho * scale + 10); ctx.stroke();
            ctx.fillStyle = "#55aaff";
            ctx.font = "bold 12px 'Courier New'";
            ctx.fillText(label, x - 6, CY - rho * scale - 14);
            // rho arrow
            ctx.strokeStyle = "#55aaff88";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x + 6, CY); ctx.lineTo(x + 6, CY - rho * scale); ctx.stroke();
            ctx.fillStyle = "#55aaff";
            ctx.font = "10px 'Courier New'";
            ctx.fillText(`ρ=${rho}mm`, x + 9, CY - rho * scale / 2 + 4);
        };
        drawScreen(x1, rho1, "①");
        drawScreen(x2, rho2, "②");

        // d arrow
        ctx.strokeStyle = "#ffffffaa";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, H - 16); ctx.lineTo(x2, H - 16); ctx.stroke();
        [x1, x2].forEach(x => { ctx.beginPath(); ctx.moveTo(x, H - 20); ctx.lineTo(x, H - 12); ctx.stroke(); });
        ctx.fillStyle = "#aaa";
        ctx.font = "11px 'Courier New'";
        ctx.textAlign = "center";
        ctx.fillText(`d = ${d} cm`, (x1 + x2) / 2, H - 4);
        ctx.textAlign = "left";

        // laser label
        ctx.fillStyle = "#ff4422";
        ctx.font = "bold 13px 'Courier New'";
        ctx.fillText("LASER", 4, CY + 5);
    }, [rho1, rho2, d]);

    return (
        <div>
            <canvas ref={cvs} width={480} height={140} style={{ width: "100%", borderRadius: 8, border: "1px solid #1e3", display: "block", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flexDirection: mobile ? "column" : "row" }}>
                <div style={{ flex: 1, minWidth: mobile ? 0 : 200, width: mobile ? "100%" : "auto" }}>
                    {[
                        { label: "ρ₁ (mm)", val: rho1, set: setRho1, min: 0.5, max: 5, step: 0.1 },
                        { label: "ρ₂ (mm)", val: rho2, set: setRho2, min: 0.5, max: 5, step: 0.1 },
                        { label: "d (cm)", val: d, set: setD, min: 10, max: 200, step: 5 },
                    ].map(({ label, val, set, min, max, step }) => (
                        <div key={label} style={sliderRow}>
                            <label style={labelStyle}>{label} = <b style={{ color: "#55aaff" }}>{val}</b></label>
                            <input type="range" min={min} max={max} step={step} value={val}
                                onChange={e => set(+e.target.value)} style={sliderStyle} />
                        </div>
                    ))}
                </div>
                <div style={{ ...infoBox, flex: 1, minWidth: mobile ? 0 : 200, width: mobile ? "100%" : "auto" }}>
                    <p style={{ fontSize: 13, marginBottom: 8 }}>Formula: tan θ = (ρ₂ − ρ₁) / d</p>
                    <p>ρ₂ − ρ₁ = <b style={{ color: "#55aaff" }}>{(rho2 - rho1).toFixed(2)} mm</b></p>
                    <p>d = <b style={{ color: "#55aaff" }}>{d} cm = {d * 10} mm</b></p>
                    <p>tan θ = {tanTheta.toFixed(5)}</p>
                    <div style={{ marginTop: 10, padding: "8px 12px", background: "#0a1a0a", borderRadius: 6, border: "1px solid #2a5a2a" }}>
                        <p style={{ color: "#4ef", fontFamily: "monospace", fontSize: 15 }}>
                            θ = <b style={{ color: "#7fff00", fontSize: 18 }}>{theta_mrad.toFixed(3)} mrad</b>
                        </p>
                        <p style={{ color: "#888", fontSize: 11 }}>= {(theta_rad * 180 / Math.PI).toFixed(4)}°</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 – Diffraction pattern & wire thickness
// ══════════════════════════════════════════════════════════════════════════════
function DiffractionSection() {
    const mobile = useIsMobile();
    const [wireD, setWireD] = useState(0.15); // mm
    const [R, setR] = useState(1000); // mm
    const [showMinima, setShowMinima] = useState(true);
    const [xmData, setXmData] = useState([
        { m: 1, xm: "" }, { m: 2, xm: "" }, { m: 3, xm: "" }, { m: 4, xm: "" }
    ]);

    // theoretical xm
    const theoreticalXm = (m) => (2 * m * LAMBDA * 1e-3 * R) / wireD; // mm

    // diffraction pattern canvas
    const cvs = useCanvas((ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        const a = wireD * 1e3; // µm
        const maxAngle = 0.015; // rad

        for (let px = 0; px < W; px++) {
            const theta = ((px - W / 2) / (W / 2)) * maxAngle;
            const beta = (Math.PI * a * Math.sin(theta)) / LAMBDA;
            const I = sinc2(beta);
            const brightness = Math.round(I * 255);
            // red channel dominant
            const r = Math.min(255, brightness + 20);
            const g = Math.round(brightness * 0.3);
            const b = Math.round(brightness * 0.1);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(px, 0, 1, H);
        }

        // minima markers
        if (showMinima) {
            for (let m = 1; m <= 5; m++) {
                const sinTheta = (m * LAMBDA) / (a);
                if (sinTheta > maxAngle) break;
                const theta = Math.asin(sinTheta);
                const px_pos = W / 2 + (theta / maxAngle) * (W / 2);
                const px_neg = W / 2 - (theta / maxAngle) * (W / 2);
                [px_pos, px_neg].forEach(px => {
                    ctx.strokeStyle = "rgba(0,200,255,0.8)";
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
                    ctx.setLineDash([]);
                });
                ctx.fillStyle = "#0cf";
                ctx.font = "10px monospace";
                ctx.textAlign = "center";
                ctx.fillText(`m=${m}`, px_pos, H - 4);
                ctx.fillText(`m=${m}`, px_neg, H - 4);
            }
            ctx.textAlign = "left";
        }
        // centre label
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("m=0", W / 2, H - 4);
        ctx.textAlign = "left";
    }, [wireD, showMinima]);

    // xm vs m plot
    const plot = useCanvas((ctx, W, H) => {
        const PAD = 44;
        ctx.clearRect(0, 0, W, H);

        const maxM = 5;
        const maxXm = theoreticalXm(maxM) * 1.2;

        const toX = (m) => PAD + (m / maxM) * (W - PAD - 16);
        const toY = (x) => H - PAD - (x / maxXm) * (H - PAD - 16);

        // grid
        ctx.strokeStyle = "#1a2a3a";
        [1, 2, 3, 4, 5].forEach(m => {
            ctx.beginPath(); ctx.moveTo(toX(m), 10); ctx.lineTo(toX(m), H - PAD); ctx.stroke();
            ctx.fillStyle = "#556";
            ctx.font = "11px monospace";
            ctx.fillText(m, toX(m) - 4, H - PAD + 14);
        });
        [0.25, 0.5, 0.75, 1.0].forEach(f => {
            const y = toY(f * maxXm);
            ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - 16, y); ctx.stroke();
            ctx.fillStyle = "#556";
            ctx.fillText((f * maxXm).toFixed(1), 2, y + 4);
        });

        // axes
        ctx.strokeStyle = "#334";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(PAD, 10); ctx.lineTo(PAD, H - PAD); ctx.lineTo(W - 10, H - PAD); ctx.stroke();
        ctx.fillStyle = "#667";
        ctx.font = "11px monospace";
        ctx.fillText("xₘ(mm)", 2, 16);
        ctx.fillText("m", W - 16, H - PAD + 14);
        ctx.fillStyle = "#445";
        ctx.fillText("slope = 2λR/a", PAD + 8, 22);

        // theoretical line
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(0));
        ctx.lineTo(toX(maxM), toY(theoreticalXm(maxM)));
        ctx.strokeStyle = "rgba(255,100,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // theoretical dots
        for (let m = 1; m <= maxM; m++) {
            const xm = theoreticalXm(m);
            ctx.beginPath();
            ctx.arc(toX(m), toY(xm), 4, 0, Math.PI * 2);
            ctx.fillStyle = "#ff6622";
            ctx.fill();
        }

        // user data points
        const validData = xmData.filter(d => d.xm !== "" && !isNaN(+d.xm));
        if (validData.length >= 2) {
            // linear fit
            const n = validData.length;
            const sumM = validData.reduce((s, d) => s + d.m, 0);
            const sumX = validData.reduce((s, d) => s + +d.xm, 0);
            const sumMX = validData.reduce((s, d) => s + d.m * +d.xm, 0);
            const sumM2 = validData.reduce((s, d) => s + d.m * d.m, 0);
            const slope = (n * sumMX - sumM * sumX) / (n * sumM2 - sumM * sumM);
            const intercept = (sumX - slope * sumM) / n;

            ctx.beginPath();
            ctx.moveTo(toX(0), toY(intercept));
            ctx.lineTo(toX(maxM), toY(slope * maxM + intercept));
            ctx.strokeStyle = "#00ffaa";
            ctx.lineWidth = 2;
            ctx.stroke();

            validData.forEach(d => {
                ctx.beginPath();
                ctx.arc(toX(d.m), toY(+d.xm), 5, 0, Math.PI * 2);
                ctx.fillStyle = "#00ffaa";
                ctx.fill();
            });
        }

        // legend
        ctx.font = "10px monospace";
        [[`#ff6622`, "Theoretical"], [`#00ffaa`, "Your data"]].forEach(([c, l], i) => {
            ctx.fillStyle = c;
            ctx.fillRect(W - 80, 12 + i * 16, 12, 3);
            ctx.fillStyle = "#aaa";
            ctx.fillText(l, W - 64, 16 + i * 16);
        });
    }, [wireD, R, xmData]);

    // wire thickness from user data
    const calcWire = () => {
        const validData = xmData.filter(d => d.xm !== "" && !isNaN(+d.xm));
        if (validData.length < 2) return null;
        const n = validData.length;
        const sumM = validData.reduce((s, d) => s + d.m, 0);
        const sumX = validData.reduce((s, d) => s + +d.xm, 0);
        const sumMX = validData.reduce((s, d) => s + d.m * +d.xm, 0);
        const sumM2 = validData.reduce((s, d) => s + d.m * d.m, 0);
        const slope = (n * sumMX - sumM * sumX) / (n * sumM2 - sumM * sumM);
        return (2 * LAMBDA * 1e-3 * R) / slope; // mm
    };
    const calcResult = calcWire();

    return (
        <div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, flexDirection: mobile ? "column" : "row" }}>
                <div style={{ flex: 1, minWidth: mobile ? 0 : 220, width: mobile ? "100%" : "auto" }}>
                    {[
                        { label: "Wire diameter a (mm)", val: wireD, set: setWireD, min: 0.05, max: 0.5, step: 0.01 },
                        { label: "Screen distance R (mm)", val: R, set: setR, min: 200, max: 2000, step: 50 },
                    ].map(({ label, val, set, min, max, step }) => (
                        <div key={label} style={sliderRow}>
                            <label style={labelStyle}>{label} = <b style={{ color: "#ff8855" }}>{val}</b></label>
                            <input type="range" min={min} max={max} step={step} value={val}
                                onChange={e => set(+e.target.value)} style={sliderStyle} />
                        </div>
                    ))}
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={showMinima} onChange={e => setShowMinima(e.target.checked)} />
                        Show minima markers
                    </label>
                </div>
                <div style={{ ...infoBox, minWidth: mobile ? 0 : 180, width: mobile ? "100%" : "auto" }}>
                    <p style={{ fontSize: 12, marginBottom: 6 }}>Theoretical minima xₘ = 2mλR/a</p>
                    {[1, 2, 3, 4].map(m => (
                        <p key={m} style={{ fontFamily: "monospace", fontSize: 12 }}>
                            m={m}: x = <b style={{ color: "#ff8855" }}>{theoreticalXm(m).toFixed(2)} mm</b>
                        </p>
                    ))}
                </div>
            </div>

            <p style={labelStyle}>Diffraction Pattern (λ = 0.6328 µm)</p>
            <canvas ref={cvs} width={480} height={70} style={{ width: "100%", borderRadius: 6, border: "1px solid #1e3", display: "block", marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flexDirection: mobile ? "column" : "row" }}>
                <div style={{ flex: 1, minWidth: mobile ? 0 : 240, width: mobile ? "100%" : "auto" }}>
                    <p style={labelStyle}>xₘ vs m graph (enter your measurements)</p>
                    <canvas ref={plot} width={300} height={200} style={{ width: "100%", borderRadius: 6, border: "1px solid #1e3", display: "block", marginBottom: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: mobile ? 0 : 220, width: mobile ? "100%" : "auto" }}>
                    <p style={labelStyle}>Enter your measured xₘ values (mm)</p>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "monospace" }}>
                        <thead>
                            <tr>
                                {["m", "xₘ (mm)", "Theoretical"].map(h => (
                                    <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid #2a4", color: "#4a8", textAlign: "left" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {xmData.map((row, i) => (
                                <tr key={row.m}>
                                    <td style={{ padding: "4px 8px", color: "#aaa" }}>{row.m}</td>
                                    <td style={{ padding: "4px 8px" }}>
                                        <input
                                            type="number"
                                            value={row.xm}
                                            placeholder={theoreticalXm(row.m).toFixed(2)}
                                            onChange={e => {
                                                const next = [...xmData];
                                                next[i] = { ...row, xm: e.target.value };
                                                setXmData(next);
                                            }}
                                            style={{ width: mobile ? "100%" : 80, background: "#0d1f0d", border: "1px solid #2a5", borderRadius: 4, color: "#0fa", padding: mobile ? "8px 10px" : "3px 6px", fontFamily: "monospace", fontSize: mobile ? 16 : 13, boxSizing: "border-box" }}
                                        />
                                    </td>
                                    <td style={{ padding: "4px 8px", color: "#ff8855" }}>{theoreticalXm(row.m).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {calcResult && (
                        <div style={{ ...infoBox, marginTop: 12 }}>
                            <p style={{ fontSize: 12, marginBottom: 4 }}>From slope = 2λR/a:</p>
                            <p style={{ color: "#0fa", fontFamily: "monospace", fontSize: 16 }}>
                                a = <b style={{ fontSize: 20 }}>{calcResult.toFixed(4)} mm</b>
                            </p>
                            <p style={{ color: "#888", fontSize: 11 }}>= {(calcResult * 1000).toFixed(1)} µm</p>
                            <p style={{ color: "#888", fontSize: 11 }}>Set value: {wireD} mm</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 – Q&A
// ══════════════════════════════════════════════════════════════════════════════
const QA_DATA = [
    {
        q: "What are the characteristics of laser beams?",
        a: "Laser beams are: (1) Spatially & temporally coherent — all photons are in phase; (2) Monochromatic — single wavelength (λ = 632.8 nm for He-Ne); (3) Directional — very low divergence; (4) Intense — high power density due to collimation."
    },
    {
        q: "Can you obtain diffraction of laser light by the edge of a razor blade?",
        a: "Yes! Even though the blade is large, diffraction only occurs at the edge — a region comparable to the wavelength. The sharp edge acts like a half-obstacle, and Huygens-Fresnel principle predicts bending of light into the geometrical shadow. You'd see fringes on the shadow side."
    },
    {
        q: "Which component measures the laser light intensity?",
        a: "The photoresistor (F), connected to a stabilized DC source (S2). Its resistance changes with light intensity, varying the voltage across a resistor (R), which is read by the voltmeter (V). Higher light intensity → lower resistance → higher voltage reading."
    },
    {
        q: "Can we use a different type of light source?",
        a: "Not easily. The experiment requires coherent, monochromatic light for a clear diffraction pattern. An ordinary lamp or LED has a broad spectrum and no spatial coherence, producing washed-out or no diffraction fringes. A laser is essentially mandatory for Fraunhofer diffraction experiments."
    },
    {
        q: "What is Babinet's principle?",
        a: "Babinet's principle states that the diffraction pattern of an opaque obstacle is identical to that of a complementary aperture (one that blocks where the obstacle transmits, and vice versa) — except for the forward beam. This is why a thin wire produces the same pattern as a single slit of the same width."
    }
];

function QASection() {
    const [open, setOpen] = useState(null);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {QA_DATA.map((item, i) => (
                <div key={i} style={{ border: "1px solid #1e3a1e", borderRadius: 8, overflow: "hidden" }}>
                    <button
                        onClick={() => setOpen(open === i ? null : i)}
                        style={{ width: "100%", textAlign: "left", background: open === i ? "#0d2a0d" : "#080f08", color: "#8ef", padding: "12px 14px", border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
                    >
                        <span>Q{i + 1}: {item.q}</span>
                        <span style={{ color: "#2a8", fontSize: 18 }}>{open === i ? "▲" : "▼"}</span>
                    </button>
                    {open === i && (
                        <div style={{ padding: "10px 14px", background: "#060e06", color: "#adc", fontSize: 13, fontFamily: "sans-serif", lineHeight: 1.6 }}>
                            {item.a}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const labelStyle = { color: "#8ab", fontSize: 12, fontFamily: "monospace", marginBottom: 4, marginTop: 0 };
const sliderRow = { marginBottom: 14 };
const sliderStyle = { width: "100%", accentColor: "#ff4422", marginTop: 4, height: 6 };
const infoBox = {
    background: "#070f07", border: "1px solid #1a3a1a", borderRadius: 8,
    padding: "10px 14px", fontSize: 12, fontFamily: "monospace", color: "#8bc",
    lineHeight: 1.8, overflowX: "auto"
};

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
    { id: "gaussian", label: "① Gaussian Beam" },
    { id: "divergence", label: "② Divergence" },
    { id: "diffraction", label: "③ Diffraction" },
    { id: "qa", label: "④ Q & A" },
];

export default function App() {
    const mobile = useIsMobile();
    const [tab, setTab] = useState("gaussian");

    return (
        <div style={{ minHeight: "100vh", background: "#04080a", color: "#cdd", fontFamily: "'Courier New', monospace", padding: "0 0 40px" }}>

            {/* header */}
            <div style={{ background: "linear-gradient(135deg,#0a1a0a 0%,#001408 50%,#0a0a1a 100%)", borderBottom: "1px solid #1a3a1a", padding: mobile ? "14px 12px 10px" : "18px 24px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: mobile ? 8 : 14, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff2200", boxShadow: "0 0 12px #ff4400", flexShrink: 0 }} />
                    <h1 style={{ margin: 0, fontSize: mobile ? 14 : 20, color: "#dff", letterSpacing: "0.08em", fontWeight: 700 }}>
                        LASER LIGHT{mobile ? <br /> : " "}INTENSITY & DIFFRACTION
                    </h1>
                </div>
                <p style={{ margin: 0, color: "#557", fontSize: mobile ? 10 : 12 }}>He-Ne Laser · λ = 0.6328 µm · Interactive Laboratory Simulator</p>
            </div>

            {/* tabs — horizontally scrollable on mobile */}
            <div style={{ display: "flex", borderBottom: "1px solid #1a3", background: "#060e06", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        style={{ padding: mobile ? "10px 10px" : "10px 16px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #4f8" : "2px solid transparent", color: tab === t.id ? "#4f8" : "#567", cursor: "pointer", fontFamily: "monospace", fontSize: mobile ? 11 : 12, transition: "color 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* content */}
            <div style={{ padding: mobile ? "14px 10px 0" : "20px 20px 0" }}>

                {tab === "gaussian" && (
                    <>
                        <SectionHeader title="Gaussian Beam Intensity Distribution"
                            formula="I(r) = I₀ · exp(−r² / ρ²)"
                            desc="The He-Ne laser emits a single transverse mode with a Gaussian cross-sectional intensity profile. ρ is the effective beam radius where intensity drops to 1/e of the peak." />
                        <GaussianSection />
                    </>
                )}

                {tab === "divergence" && (
                    <>
                        <SectionHeader title="Laser Beam Divergence"
                            formula="tan θ = (ρ₂ − ρ₁) / d"
                            desc="Place a screen at two distances from the laser. Measure the beam radius ρ at each position. The separation d between screens and the change in radius give the half-angle divergence θ." />
                        <DivergenceSection />
                    </>
                )}

                {tab === "diffraction" && (
                    <>
                        <SectionHeader title="Fraunhofer Diffraction by a Thin Wire"
                            formula="a = 2mλR / xₘ"
                            desc="By Babinet's principle, a thin wire produces the same diffraction pattern as a single slit of the same width. Measure xₘ (distance between m-th order minima) to find wire diameter a." />
                        <DiffractionSection />
                    </>
                )}

                {tab === "qa" && (
                    <>
                        <SectionHeader title="Questions & Answers"
                            formula=""
                            desc="Click each question to reveal the answer." />
                        <QASection />
                    </>
                )}
            </div>
        </div>
    );
}

function SectionHeader({ title, formula, desc }) {
    return (
        <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #1a2a1a" }}>
            <h2 style={{ margin: "0 0 4px", color: "#7df", fontSize: 16, letterSpacing: "0.04em" }}>{title}</h2>
            {formula && <p style={{ margin: "0 0 6px", color: "#ff8855", fontFamily: "monospace", fontSize: 14 }}>{formula}</p>}
            <p style={{ margin: 0, color: "#678", fontSize: 12, lineHeight: 1.5 }}>{desc}</p>
        </div>
    );
}