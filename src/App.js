import { useState, useMemo, useRef, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "./supabase";

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
const styleEl = document.createElement("style");
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
  @keyframes slideUp   { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse     { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  @keyframes spin      { to { transform: rotate(360deg); } }
  @keyframes toastIn   { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .receipt-enter  { animation: slideUp 0.3s ease forwards; }
  .fade-in        { animation: fadeIn  0.2s ease forwards; }
  .scanning-pulse { animation: pulse  1.2s ease-in-out infinite; }
  .spinner        { animation: spin   0.8s linear infinite; }
  .toast-enter    { animation: toastIn 0.3s ease forwards; }
  .nav-scroll     { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .nav-scroll::-webkit-scrollbar { display: none; }
`;
document.head.appendChild(styleEl);

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = {
  bg: "#0d1117", panel: "#161b22", panelAlt: "#1c2128", border: "#21262d",
  text: "#e6edf3", muted: "#8b949e", subtle: "#484f58",
  amber: "#e8a020", amberDim: "#2d1f00",
  red: "#f85149",  redDim: "#2a0f0e",
  green: "#3fb950", greenDim: "#0d2112",
  blue: "#58a6ff",  blueDim: "#0c1a2e",
  inputBg: "#0d1117", shadow: "0 4px 24px rgba(0,0,0,0.5)",
  rowHover: "#1c212866",
  fontDisplay: "'Barlow Condensed', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
};
const LIGHT = {
  bg: "#f6f8fa", panel: "#ffffff", panelAlt: "#f6f8fa", border: "#d0d7de",
  text: "#1f2328", muted: "#656d76", subtle: "#afb8c1",
  amber: "#b35c00", amberDim: "#fff3e0",
  red: "#cf222e",  redDim: "#fff0f0",
  green: "#1a7f37", greenDim: "#dafbe1",
  blue: "#0969da",  blueDim: "#ddf4ff",
  inputBg: "#ffffff", shadow: "0 4px 24px rgba(0,0,0,0.08)",
  rowHover: "#f6f8fa",
  fontDisplay: "'Barlow Condensed', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
};

const ThemeCtx = createContext({ T: DARK, dark: true });
const useTheme = () => useContext(ThemeCtx);

// ─── TOAST SYSTEM ─────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const { T } = useTheme();
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = "success") => {
    const id = ++idRef.current;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const colors = { success: T.green, error: T.red, info: T.blue };
  const bgs    = { success: T.greenDim, error: T.redDim, info: T.blueDim };
  const icons  = { success: "✓", error: "✗", info: "ℹ" };

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast-enter" style={{
            background: bgs[t.type], border: `1px solid ${colors[t.type]}55`,
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: T.shadow,
          }}>
            <span style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 800, color: colors[t.type] }}>{icons[t.type]}</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text, flex: 1 }}>{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ─── DATA NORMALISERS ─────────────────────────────────────────────────────────
const normalizeProduct = (p) => ({ id: p.id, sku: p.sku, barcode: p.barcode || "", name: p.name, costPrice: Number(p.cost_price), sellingPrice: Number(p.selling_price), reorderLevel: Number(p.reorder_level) });
const normalizeStock = (s) => ({ id: s.id, productId: s.product_id, quantity: Number(s.quantity), location: s.location || "Unassigned" });
const normalizeSale = (s) => ({ id: s.id, date: s.date, orderId: s.order_id, productId: s.product_id, quantity: Number(s.quantity), paymentMethod: s.payment_method || "cash" });

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt   = (n) => `R${Number(n).toFixed(2)}`;
const today = ()  => new Date().toISOString().split("T")[0];

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", small, disabled, full, style: s }) => {
  const { T } = useTheme();
  const variants = {
    primary: { background: T.amber, color: "#fff" },
    danger:  { background: T.red,   color: "#fff" },
    ghost:   { background: "transparent", color: T.muted, border: `1px solid ${T.border}` },
    success: { background: T.green, color: "#fff" },
    blue:    { background: T.blue,  color: "#fff" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: "0.05em",
      border: "none", cursor: disabled ? "not-allowed" : "pointer",
      padding: small ? "6px 14px" : "10px 22px",
      fontSize: small ? "13px" : "15px", textTransform: "uppercase",
      transition: "all 0.15s ease", opacity: disabled ? 0.4 : 1,
      width: full ? "100%" : undefined,
      ...variants[variant], ...s,
    }}>{children}</button>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder, autoFocus, onKeyDown }) => {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
      <input autoFocus={autoFocus} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
        style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none", transition: "border-color 0.15s", width: "100%" }}
        onFocus={e => e.target.style.borderColor = T.amber} onBlur={e => e.target.style.borderColor = T.border} />
    </div>
  );
};

const Badge = ({ children, color }) => { const { T } = useTheme(); const c = color || T.muted; return <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 600, padding: "2px 8px", background: c + "22", color: c, border: `1px solid ${c}44`, letterSpacing: "0.04em" }}>{children}</span>; };

const KPI = ({ label, value, sub, accent }) => { const { T } = useTheme(); return (
  <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: "20px 24px", flex: 1, minWidth: 140, boxShadow: T.shadow }}>
    <div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
    <div style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, color: accent || T.text, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 6 }}>{sub}</div>}
  </div>
); };

const ThemeToggle = ({ dark, onToggle }) => { const { T } = useTheme(); return (
  <button onClick={onToggle} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", padding: "5px 12px", fontFamily: T.fontMono, fontSize: 14, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
    {dark ? "☀" : "☾"}<span style={{ fontFamily: T.fontDisplay, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>{dark ? "Light" : "Dark"}</span>
  </button>
); };

const HoverRow = ({ children, highlight }) => { const { T } = useTheme(); return (
  <tr style={{ borderBottom: `1px solid ${T.border}44`, background: highlight || "transparent", cursor: "default" }}
    onMouseEnter={e => { if (!highlight) e.currentTarget.style.background = T.rowHover; }} onMouseLeave={e => { if (!highlight) e.currentTarget.style.background = "transparent"; }}>
    {children}
  </tr>
); };

const EmptyState = ({ icon, title, sub }) => { const { T } = useTheme(); return (
  <div style={{ padding: "48px 24px", textAlign: "center" }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
    {sub && <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.subtle, marginTop: 8 }}>{sub}</div>}
  </div>
); };

const Th = ({ children }) => { const { T } = useTheme(); return <th style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 16px", textAlign: "left", fontWeight: 600 }}>{children}</th>; };
const Td = ({ children, color, bold, style: s }) => { const { T } = useTheme(); return <td style={{ fontFamily: bold ? T.fontDisplay : T.fontMono, fontSize: bold ? 16 : 12, fontWeight: bold ? 700 : 400, color: color || T.text, padding: "10px 16px", ...s }}>{children}</td>; };

const Modal = ({ title, onClose, children }) => {
  const { T } = useTheme();
  useEffect(() => { if (!onClose) return; const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="receipt-enter" style={{ background: T.panel, border: `1px solid ${T.border}`, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: T.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.text }}>{title}</span>
          {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 22 }}>×</button>}
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

const LoadingScreen = () => { const { T } = useTheme(); return (
  <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
    <div style={{ fontFamily: T.fontDisplay, fontSize: 36, fontWeight: 800, color: T.amber, letterSpacing: "0.1em" }}>STOCKR</div>
    <div className="spinner" style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.amber, borderRadius: "50%" }} />
    <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>Connecting to database…</div>
  </div>
); };

// ─── BARCODE SCANNER ─────────────────────────────────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const { T } = useTheme();
  const videoRef = useRef(null), streamRef = useRef(null);
  const [status, setStatus] = useState("starting");
  const [errorMsg, setErrorMsg] = useState("");
  useEffect(() => {
    let active = true, animId;
    const start = async () => {
      if (!("BarcodeDetector" in window)) { setStatus("error"); setErrorMsg("Barcode scanning requires Chrome on Android or desktop Chrome/Edge."); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const det = new window.BarcodeDetector({ formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e"] });
        setStatus("scanning");
        const scan = async () => { if (!active||!videoRef.current) return; try { const b = await det.detect(videoRef.current); if (b.length) { onDetected(b[0].rawValue); return; } } catch {} animId = requestAnimationFrame(scan); };
        animId = requestAnimationFrame(scan);
      } catch (e) { if (!active) return; setStatus("error"); setErrorMsg(e.name === "NotAllowedError" ? "Camera permission denied." : `Camera error: ${e.message}`); }
    };
    start();
    return () => { active = false; cancelAnimationFrame(animId); streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [onDetected]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {status === "error" ? <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: 16, fontFamily: T.fontMono, fontSize: 13, color: T.red }}>{errorMsg}</div> : (
        <div style={{ position: "relative", background: "#000", aspectRatio: "4/3", overflow: "hidden" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "60%", height: "30%", border: `2px solid ${T.amber}`, boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)` }} />
          </div>
          {status === "scanning" && <div className="scanning-pulse" style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, color: T.amber, textTransform: "uppercase", letterSpacing: "0.1em" }}>Scanning…</div>}
        </div>
      )}
      <Btn variant="ghost" onClick={onClose} full>Cancel</Btn>
    </div>
  );
}

// ─── RECEIPT ──────────────────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose }) {
  const { T } = useTheme();
  const { items, total, paymentMethod, orderId, date } = receipt;
  return (
    <Modal title="Sale Complete ✓" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.fontMono, fontSize: 12, color: T.muted }}><span>{orderId}</span><span>{date}</span></div>
        <div style={{ background: T.panelAlt, border: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>{item.name}</div><div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>× {item.quantity} @ {fmt(item.price)}</div></div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.text }}>{fmt(item.price * item.quantity)}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Payment</div><Badge color={paymentMethod === "cash" ? T.amber : T.blue}>{paymentMethod === "cash" ? "💵 Cash" : "💳 Card"}</Badge></div>
          <div style={{ textAlign: "right" }}><div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total</div><div style={{ fontFamily: T.fontDisplay, fontSize: 36, fontWeight: 800, color: T.green, lineHeight: 1 }}>{fmt(total)}</div></div>
        </div>
        <Btn onClick={onClose} variant="success" full>Done — New Sale</Btn>
      </div>
    </Modal>
  );
}

// ─── TILL ─────────────────────────────────────────────────────────────────────
function TillView({ products, stock, setStock, setSales, sales }) {
  const { T } = useTheme();
  const toast = useToast();
  const [search, setSearch] = useState(""), [basket, setBasket] = useState([]), [payment, setPayment] = useState("cash");
  const [showScanner, setShowScanner] = useState(false), [receipt, setReceipt] = useState(null), [completing, setCompleting] = useState(false);
  const searchRef = useRef(null);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return [];
    return products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))).slice(0, 6);
  }, [search, products]);

  const getAvailableQty = useCallback((pid) => {
    const s = stock.find(x => x.productId === pid); const b = basket.find(x => x.productId === pid);
    return (s?.quantity ?? 0) - (b?.quantity ?? 0);
  }, [stock, basket]);

  const addToBasket = useCallback((product) => {
    if (getAvailableQty(product.id) <= 0) { toast(`Not enough stock for ${product.name}`, "error"); return; }
    setBasket(prev => {
      const ex = prev.find(b => b.productId === product.id);
      if (ex) return prev.map(b => b.productId === product.id ? { ...b, quantity: b.quantity + 1 } : b);
      return [...prev, { productId: product.id, name: product.name, price: product.sellingPrice, quantity: 1 }];
    });
    setSearch(""); searchRef.current?.focus();
  }, [getAvailableQty, toast]);

  const handleBarcode = useCallback((code) => {
    setShowScanner(false);
    const p = products.find(x => x.barcode === code || x.sku === code);
    if (!p) { toast(`No product for barcode: ${code}`, "error"); return; }
    toast(`Added: ${p.name}`, "success"); addToBasket(p);
  }, [products, addToBasket, toast]);

  const updateQty = (pid, delta) => {
    if (delta > 0 && getAvailableQty(pid) <= 0) { toast("No more stock available", "error"); return; }
    setBasket(prev => prev.map(b => b.productId === pid ? { ...b, quantity: b.quantity + delta } : b).filter(b => b.quantity > 0));
  };

  const basketTotal = basket.reduce((a, b) => a + b.price * b.quantity, 0);
  const basketCount = basket.reduce((a, b) => a + b.quantity, 0);

  const handleSearchKey = (e) => { if (e.key === "Enter" && searchResults.length > 0) { const f = searchResults[0]; const s = stock.find(x => x.productId === f.id); if (s && s.quantity > 0) addToBasket(f); } };

  const completeSale = async () => {
    if (!basket.length || completing) return; setCompleting(true);
    const orderId = `ORD-${Date.now()}`, saleDate = today();
    const rows = basket.map(b => ({ date: saleDate, order_id: orderId, product_id: b.productId, quantity: b.quantity, payment_method: payment }));
    const { data: ins, error: se } = await supabase.from("sales").insert(rows).select();
    if (se) { toast(`Sale failed: ${se.message}`, "error"); setCompleting(false); return; }
    for (const item of basket) { const cs = stock.find(s => s.productId === item.productId); if (!cs) continue; const { error } = await supabase.from("stock").update({ quantity: cs.quantity - item.quantity }).eq("product_id", item.productId); if (error) toast(`Stock error: ${item.name}`, "error"); }
    setSales(prev => [...prev, ...ins.map(normalizeSale)]);
    setStock(prev => prev.map(s => { const l = basket.find(b => b.productId === s.productId); return l ? { ...s, quantity: s.quantity - l.quantity } : s; }));
    setReceipt({ items: basket, total: basketTotal, paymentMethod: payment, orderId, date: saleDate });
    setBasket([]); setPayment("cash"); setCompleting(false);
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={searchRef} autoFocus value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearchKey}
            placeholder="Search product name, SKU or barcode…" style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.fontMono, fontSize: 14, padding: "12px 16px", outline: "none", transition: "border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor = T.amber} onBlur={e => e.target.style.borderColor = T.border} />
          <button onClick={() => setShowScanner(true)} title="Scan barcode" style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.amber, cursor: "pointer", padding: "0 16px", fontSize: 22, flexShrink: 0 }}>⊡</button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
            {searchResults.map((p, i) => {
              const s = stock.find(x => x.productId === p.id), inStock = s && s.quantity > 0;
              return (
                <button key={p.id} onClick={() => inStock && addToBasket(p)} disabled={!inStock} style={{
                  width: "100%", background: i === 0 ? T.panelAlt : "none", border: "none",
                  borderBottom: i < searchResults.length - 1 ? `1px solid ${T.border}` : "none",
                  padding: "12px 16px", cursor: inStock ? "pointer" : "not-allowed",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  transition: "background 0.1s", opacity: inStock ? 1 : 0.45, textAlign: "left",
                }} onMouseEnter={e => { if (inStock) e.currentTarget.style.background = T.panelAlt; }}
                   onMouseLeave={e => { if (i !== 0 && inStock) e.currentTarget.style.background = "transparent"; }}>
                  <div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 14, color: T.text }}>{p.name}{i === 0 && <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.muted, marginLeft: 8 }}>↵ Enter</span>}</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 2 }}>{p.sku} · {inStock ? `${s.quantity} in stock` : "Out of stock"}</div>
                  </div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, color: T.amber, marginLeft: 12 }}>{fmt(p.sellingPrice)}</div>
                </button>
              );
            })}
          </div>
        )}
        {search && searchResults.length === 0 && <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.muted, padding: "10px 0" }}>No products match "{search}"</div>}
        {!search && basket.length === 0 && <EmptyState icon="🛒" title="Start a new sale" sub="Search above or tap ⊡ to scan a barcode" />}
      </div>

      {/* Basket */}
      <div style={{ flex: "1 1 300px", background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.text }}>Basket {basketCount > 0 && <span style={{ color: T.amber }}>({basketCount})</span>}</span>
          {basket.length > 0 && <button onClick={() => setBasket([])} style={{ background: "none", border: "none", fontFamily: T.fontMono, fontSize: 11, color: T.red, cursor: "pointer", textTransform: "uppercase" }}>Clear</button>}
        </div>
        <div style={{ minHeight: 180, maxHeight: 360, overflowY: "auto" }}>
          {basket.length === 0 ? <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: T.fontMono, fontSize: 12, color: T.subtle }}>Basket is empty</div> :
          basket.map(item => (
            <div key={item.productId} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}44`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 2 }}>{fmt(item.price)} each</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => updateQty(item.productId, -1)} style={{ width: 30, height: 30, background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, color: T.text, minWidth: 26, textAlign: "center" }}>{item.quantity}</span>
                <button onClick={() => updateQty(item.productId, 1)} style={{ width: 30, height: 30, background: T.panelAlt, border: `1px solid ${T.border}`, color: getAvailableQty(item.productId) <= 0 ? T.subtle : T.text, cursor: getAvailableQty(item.productId) <= 0 ? "not-allowed" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: getAvailableQty(item.productId) <= 0 ? 0.4 : 1 }}>+</button>
              </div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.text, minWidth: 64, textAlign: "right" }}>{fmt(item.price * item.quantity)}</div>
              <button onClick={() => setBasket(prev => prev.filter(b => b.productId !== item.productId))} style={{ background: "none", border: "none", color: T.subtle, cursor: "pointer", fontSize: 16, padding: "0 2px" }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 18px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: T.panelAlt }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Total</span>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, color: T.text }}>{fmt(basketTotal)}</span>
        </div>
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Payment Method</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["cash", "💵 Cash"], ["card", "💳 Card"]].map(([val, label]) => (
              <button key={val} onClick={() => setPayment(val)} style={{ flex: 1, padding: "10px 0", fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", transition: "all 0.15s",
                border: `2px solid ${payment === val ? (val === "cash" ? T.amber : T.blue) : T.border}`,
                background: payment === val ? (val === "cash" ? T.amberDim : T.blueDim) : "transparent",
                color: payment === val ? (val === "cash" ? T.amber : T.blue) : T.muted }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          <Btn onClick={completeSale} disabled={!basket.length || completing} variant="success" full style={{ padding: "16px 0", fontSize: 18, letterSpacing: "0.08em" }}>{completing ? "Processing…" : "Complete Sale"}</Btn>
        </div>
      </div>

      {showScanner && <Modal title="Scan Barcode" onClose={() => setShowScanner(false)}><BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} /></Modal>}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => { setReceipt(null); searchRef.current?.focus(); }} />}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ products, stock, sales }) {
  const { T } = useTheme();
  const todayStr = today();
  const totalRev = useMemo(() => sales.reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? p.sellingPrice * s.quantity : 0); }, 0), [sales, products]);
  const totalCOGS = useMemo(() => sales.reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? p.costPrice * s.quantity : 0); }, 0), [sales, products]);
  const todaySales = useMemo(() => sales.filter(s => s.date === todayStr), [sales, todayStr]);
  const todayRev = useMemo(() => todaySales.reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? p.sellingPrice * s.quantity : 0); }, 0), [todaySales, products]);
  const lowStock = stock.filter(s => { const p = products.find(x => x.id === s.productId); return p && s.quantity <= p.reorderLevel; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPI label="Today" value={fmt(todayRev)} sub={`${todaySales.length} sales today`} accent={T.amber} />
        <KPI label="Total Revenue" value={fmt(totalRev)} sub={`${sales.length} all time`} accent={T.green} />
        <KPI label="Gross Profit" value={fmt(totalRev - totalCOGS)} sub={`COGS: ${fmt(totalCOGS)}`} accent={T.blue} />
        <KPI label="Low Stock" value={lowStock.length} sub="need reorder" accent={lowStock.length > 0 ? T.red : T.green} />
      </div>
      {lowStock.length > 0 && (
        <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: "14px 18px" }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>⚠ Reorder Required</div>
          {lowStock.map(s => { const p = products.find(x => x.id === s.productId); return (
            <div key={s.productId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>{p?.name}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{s.quantity} left / min {p?.reorderLevel}</span>
            </div>
          ); })}
        </div>
      )}
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Recent Sales</span>
        </div>
        {sales.length === 0 ? <EmptyState icon="📊" title="No sales yet" sub="Complete your first sale from the Till" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>{["Date","Order","Product","Qty","Payment","Revenue"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>{[...sales].reverse().slice(0, 8).map(s => { const p = products.find(x => x.id === s.productId); return (
                <HoverRow key={s.id}><Td color={T.muted}>{s.date}</Td><Td color={T.amber}>{s.orderId}</Td><Td>{p?.name ?? "—"}</Td><Td>{s.quantity}</Td><Td><Badge color={s.paymentMethod === "cash" ? T.amber : T.blue}>{s.paymentMethod}</Badge></Td><Td color={T.green}>{p ? fmt(p.sellingPrice * s.quantity) : "—"}</Td></HoverRow>
              ); })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function InventoryView({ products, stock, setStock }) {
  const { T } = useTheme();
  const toast = useToast();
  const [receiveModal, setReceiveModal] = useState(null), [receiveQty, setReceiveQty] = useState(""), [saving, setSaving] = useState(false), [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase(); if (!q) return stock;
    return stock.filter(s => { const p = products.find(x => x.id === s.productId); return p && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || s.location.toLowerCase().includes(q)); });
  }, [stock, products, filter]);

  const handleReceive = async () => {
    const qty = Number(receiveQty); if (!qty || qty <= 0) return; setSaving(true);
    const cur = stock.find(s => s.productId === receiveModal.id), newQty = (cur?.quantity ?? 0) + qty;
    const { error } = await supabase.from("stock").update({ quantity: newQty }).eq("product_id", receiveModal.id);
    if (error) toast(`Stock update failed: ${error.message}`, "error");
    else { setStock(prev => prev.map(s => s.productId === receiveModal.id ? { ...s, quantity: newQty } : s)); toast(`Received ${qty}× ${receiveModal.name}`, "success"); }
    setSaving(false); setReceiveModal(null); setReceiveQty("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ maxWidth: 320 }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name, SKU, or location…"
          style={{ width: "100%", background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none" }}
          onFocus={e => e.target.style.borderColor = T.amber} onBlur={e => e.target.style.borderColor = T.border} />
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Stock Levels</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>{filtered.length} of {stock.length}</span>
        </div>
        {stock.length === 0 ? <EmptyState icon="📦" title="No stock yet" sub="Add products first, then receive stock" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>{["SKU","Barcode","Product","Location","On Hand","Reorder At","Status","Action"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && filter && <tr><td colSpan={8} style={{ padding: "24px 16px", textAlign: "center", fontFamily: T.fontMono, fontSize: 13, color: T.muted }}>No items match "{filter}"</td></tr>}
                {filtered.map(s => { const p = products.find(x => x.id === s.productId); if (!p) return null; const low = s.quantity <= p.reorderLevel; return (
                  <HoverRow key={s.productId} highlight={low ? T.redDim : undefined}>
                    <Td color={T.amber} style={{ fontSize: 11 }}>{p.sku}</Td><Td color={T.subtle} style={{ fontSize: 11 }}>{p.barcode || "—"}</Td><Td style={{ fontSize: 13 }}>{p.name}</Td><Td color={T.muted} style={{ fontSize: 11 }}>{s.location}</Td>
                    <Td color={low ? T.red : T.text} bold>{s.quantity}</Td><Td color={T.muted}>{p.reorderLevel}</Td>
                    <Td>{low ? <Badge color={T.red}>REORDER</Badge> : <Badge color={T.green}>OK</Badge>}</Td>
                    <Td><Btn small onClick={() => { setReceiveModal(p); setReceiveQty(""); }}>Receive</Btn></Td>
                  </HoverRow>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {receiveModal && (
        <Modal title={`Receive Stock — ${receiveModal.name}`} onClose={() => setReceiveModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Quantity Received" value={receiveQty} onChange={setReceiveQty} type="number" placeholder="0" autoFocus onKeyDown={e => { if (e.key === "Enter") handleReceive(); }} />
            <Btn onClick={handleReceive} disabled={!receiveQty || saving}>{saving ? "Saving…" : "Confirm Receipt"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = { sku: "", barcode: "", name: "", costPrice: "", sellingPrice: "", reorderLevel: "", location: "" };
const FIELDS = [
  { label: "SKU", key: "sku", placeholder: "e.g. GRC-001" },
  { label: "Barcode (optional)", key: "barcode", placeholder: "e.g. 6001234567890" },
  { label: "Product Name", key: "name", placeholder: "e.g. Salt 500g" },
  { label: "Cost Price (R)", key: "costPrice", placeholder: "0.00", type: "number" },
  { label: "Selling Price (R)", key: "sellingPrice", placeholder: "0.00", type: "number" },
  { label: "Reorder Level", key: "reorderLevel", placeholder: "e.g. 10", type: "number" },
  { label: "Location", key: "location", placeholder: "e.g. Shelf C1" },
];

function ProductsView({ products, setProducts, stock, setStock }) {
  const { T } = useTheme(); const toast = useToast();
  const [mode, setMode] = useState(null), [editTarget, setEditTarget] = useState(null), [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({}), [saving, setSaving] = useState(false), [confirmDelete, setConfirmDelete] = useState(null), [deleting, setDeleting] = useState(false), [deleteConfirmText, setDeleteConfirmText] = useState(""), [filter, setFilter] = useState("");
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = useMemo(() => { const q = filter.trim().toLowerCase(); if (!q) return products; return products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))); }, [products, filter]);

  const openAdd = () => { setForm(EMPTY_FORM); setErrors({}); setEditTarget(null); setMode("add"); };
  const openEdit = (p) => { const s = stock.find(x => x.productId === p.id); setForm({ sku: p.sku, barcode: p.barcode || "", name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), reorderLevel: String(p.reorderLevel), location: s?.location || "" }); setErrors({}); setEditTarget(p); setMode("edit"); };
  const closeModal = () => { setMode(null); setEditTarget(null); setErrors({}); };

  const validate = () => { const e = {}; if (!form.sku.trim()) e.sku = "Required"; if (!form.name.trim()) e.name = "Required"; if (!form.costPrice || isNaN(form.costPrice)) e.costPrice = "Invalid"; if (!form.sellingPrice || isNaN(form.sellingPrice)) e.sellingPrice = "Invalid"; if (!form.reorderLevel || isNaN(form.reorderLevel)) e.reorderLevel = "Invalid"; return e; };

  const handleAdd = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrors(e); return; } setSaving(true);
    const { data: np, error: pe } = await supabase.from("products").insert({ sku: form.sku, barcode: form.barcode || null, name: form.name, cost_price: Number(form.costPrice), selling_price: Number(form.sellingPrice), reorder_level: Number(form.reorderLevel) }).select().single();
    if (pe) { toast(`Add failed: ${pe.message}`, "error"); setSaving(false); return; }
    const { data: ns, error: se } = await supabase.from("stock").insert({ product_id: np.id, quantity: 0, location: form.location || "Unassigned" }).select().single();
    if (se) { toast(`Stock entry failed: ${se.message}`, "error"); setSaving(false); return; }
    setProducts(prev => [...prev, normalizeProduct(np)]); setStock(prev => [...prev, normalizeStock(ns)]);
    toast(`${form.name} added`, "success"); closeModal(); setSaving(false);
  };

  const handleEdit = async () => {
    const e = validate(); if (Object.keys(e).length) { setErrors(e); return; } setSaving(true);
    const { error: pe } = await supabase.from("products").update({ sku: form.sku, barcode: form.barcode || null, name: form.name, cost_price: Number(form.costPrice), selling_price: Number(form.sellingPrice), reorder_level: Number(form.reorderLevel) }).eq("id", editTarget.id);
    if (pe) { toast(`Update failed: ${pe.message}`, "error"); setSaving(false); return; }
    await supabase.from("stock").update({ location: form.location || "Unassigned" }).eq("product_id", editTarget.id);
    setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...p, sku: form.sku, barcode: form.barcode, name: form.name, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice), reorderLevel: Number(form.reorderLevel) } : p));
    setStock(prev => prev.map(s => s.productId === editTarget.id ? { ...s, location: form.location || "Unassigned" } : s));
    toast(`${form.name} updated`, "success"); closeModal(); setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return; setDeleting(true);
    const { error } = await supabase.from("products").delete().eq("id", confirmDelete.id);
    if (error) toast(`Delete failed: ${error.message}`, "error");
    else { setProducts(prev => prev.filter(p => p.id !== confirmDelete.id)); setStock(prev => prev.filter(s => s.productId !== confirmDelete.id)); toast(`${confirmDelete.name} deleted`, "info"); }
    setDeleting(false); setConfirmDelete(null); setDeleteConfirmText("");
  };

  const marginPreview = form.costPrice && form.sellingPrice && !isNaN(form.costPrice) && !isNaN(form.sellingPrice) && Number(form.sellingPrice) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ maxWidth: 280 }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter products…"
            style={{ width: "100%", background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none" }}
            onFocus={e => e.target.style.borderColor = T.amber} onBlur={e => e.target.style.borderColor = T.border} />
        </div>
        <Btn onClick={openAdd}>+ Add Product</Btn>
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        {products.length === 0 ? <EmptyState icon="🏷️" title="No products yet" sub="Click + Add Product to get started" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>{["SKU","Barcode","Product Name","Cost","Price","Margin","Reorder","Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && filter && <tr><td colSpan={8} style={{ padding: "24px 16px", textAlign: "center", fontFamily: T.fontMono, fontSize: 13, color: T.muted }}>No products match "{filter}"</td></tr>}
                {filtered.map(p => {
                  const margin = p.sellingPrice > 0 ? (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1) : "0.0";
                  return (
                    <HoverRow key={p.id}>
                      <Td color={T.amber} style={{ fontSize: 11 }}>{p.sku}</Td><Td color={T.subtle} style={{ fontSize: 11 }}>{p.barcode || "—"}</Td><Td style={{ fontSize: 13 }}>{p.name}</Td>
                      <Td color={T.muted}>{fmt(p.costPrice)}</Td><Td>{fmt(p.sellingPrice)}</Td><Td color={Number(margin) > 40 ? T.green : T.amber}>{margin}%</Td><Td color={T.muted}>{p.reorderLevel}</Td>
                      <Td><div style={{ display: "flex", gap: 6 }}><Btn small variant="ghost" onClick={() => openEdit(p)}>Edit</Btn><Btn small variant="danger" onClick={() => { setConfirmDelete(p); setDeleteConfirmText(""); }}>Delete</Btn></div></Td>
                    </HoverRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mode && (
        <Modal title={mode === "add" ? "Add New Product" : `Edit — ${editTarget.name}`} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {FIELDS.map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <Input label={label} value={form[key]} onChange={v => update(key, v)} placeholder={placeholder} type={type || "text"} onKeyDown={e => { if (e.key === "Enter") { mode === "add" ? handleAdd() : handleEdit(); } }} />
                {errors[key] && <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.red, marginTop: 3 }}>{errors[key]}</div>}
              </div>
            ))}
            {marginPreview && (
              <div style={{ background: T.panelAlt, border: `1px solid ${T.border}`, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>Profit per unit</span>
                <span style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.green }}>
                  {fmt(Number(form.sellingPrice) - Number(form.costPrice))}
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginLeft: 8 }}>({(((Number(form.sellingPrice) - Number(form.costPrice)) / Number(form.sellingPrice)) * 100).toFixed(1)}%)</span>
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <Btn onClick={mode === "add" ? handleAdd : handleEdit} disabled={saving} full>{saving ? "Saving…" : mode === "add" ? "Add Product" : "Save Changes"}</Btn>
              <Btn variant="ghost" onClick={closeModal} style={{ flexShrink: 0 }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete Product?" onClose={() => { setConfirmDelete(null); setDeleteConfirmText(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: "14px 16px" }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text, marginBottom: 6 }}>You are about to permanently delete:</div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 700, color: T.red }}>{confirmDelete.name}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 4 }}>SKU: {confirmDelete.sku}</div>
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.muted }}>This removes the product and its stock entry. Sales history is kept. This cannot be undone.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text }}>
                To confirm, type <span style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.red, background: T.redDim, padding: "2px 6px" }}>{confirmDelete.name}</span> below:
              </div>
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && deleteConfirmText === confirmDelete.name) handleDelete(); }}
                placeholder={confirmDelete.name}
                style={{
                  background: T.inputBg, border: `1px solid ${deleteConfirmText === confirmDelete.name ? T.red : T.border}`,
                  color: T.text, fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none",
                  transition: "border-color 0.15s", width: "100%",
                }}
              />
              {deleteConfirmText.length > 0 && deleteConfirmText !== confirmDelete.name && (
                <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>
                  {confirmDelete.name.toLowerCase().startsWith(deleteConfirmText.toLowerCase()) ? "Keep typing…" : "Doesn't match — check spelling and capitalisation"}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="danger" onClick={() => { handleDelete(); setDeleteConfirmText(""); }} disabled={deleting || deleteConfirmText !== confirmDelete.name} full>
                {deleting ? "Deleting…" : "Delete Permanently"}
              </Btn>
              <Btn variant="ghost" onClick={() => { setConfirmDelete(null); setDeleteConfirmText(""); }} style={{ flexShrink: 0 }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SALES ────────────────────────────────────────────────────────────────────
function SalesView({ sales, products }) {
  const { T } = useTheme();
  const totalRev = useMemo(() => sales.reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? p.sellingPrice * s.quantity : 0); }, 0), [sales, products]);
  const totalProfit = useMemo(() => sales.reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? (p.sellingPrice - p.costPrice) * s.quantity : 0); }, 0), [sales, products]);
  const cashTotal = useMemo(() => sales.filter(s => s.paymentMethod === "cash").reduce((a, s) => { const p = products.find(x => x.id === s.productId); return a + (p ? p.sellingPrice * s.quantity : 0); }, 0), [sales, products]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPI label="Total Revenue" value={fmt(totalRev)} sub={`${sales.length} line items`} accent={T.green} />
        <KPI label="Total Profit" value={fmt(totalProfit)} sub={`${((totalProfit / totalRev) * 100 || 0).toFixed(1)}% margin`} accent={T.blue} />
        <KPI label="Cash Sales" value={fmt(cashTotal)} sub={`${fmt(totalRev - cashTotal)} by card`} accent={T.amber} />
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>All Transactions</span>
        </div>
        {sales.length === 0 ? <EmptyState icon="🧾" title="No sales yet" sub="Complete your first sale from the Till" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>{["Date","Order ID","Product","Qty","Payment","Revenue","Profit"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>{[...sales].reverse().map(s => {
                const p = products.find(x => x.id === s.productId), rev = p ? p.sellingPrice * s.quantity : 0, profit = p ? (p.sellingPrice - p.costPrice) * s.quantity : 0;
                return <HoverRow key={s.id}><Td color={T.muted}>{s.date}</Td><Td color={T.amber}>{s.orderId}</Td><Td>{p?.name ?? "—"}</Td><Td>{s.quantity}</Td><Td><Badge color={s.paymentMethod === "cash" ? T.amber : T.blue}>{s.paymentMethod}</Badge></Td><Td color={T.green}>{fmt(rev)}</Td><Td color={profit >= 0 ? T.green : T.red}>{fmt(profit)}</Td></HoverRow>;
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const VIEWS = [{ id: "till", label: "Till" }, { id: "dashboard", label: "Dashboard" }, { id: "inventory", label: "Inventory" }, { id: "sales", label: "Sales" }, { id: "products", label: "Products" }];

export default function App() {
  const [dark, setDark] = useState(true); const T = dark ? DARK : LIGHT;
  const [view, setView] = useState("till"), [products, setProducts] = useState([]), [stock, setStock] = useState([]), [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null);
  document.body.style.background = T.bg;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: pd, error: pe }, { data: sd, error: se }, { data: sa, error: sae }] = await Promise.all([
          supabase.from("products").select("*").order("name"), supabase.from("stock").select("*"), supabase.from("sales").select("*").order("created_at", { ascending: false }),
        ]);
        if (pe) throw new Error(`Products: ${pe.message}`); if (se) throw new Error(`Stock: ${se.message}`); if (sae) throw new Error(`Sales: ${sae.message}`);
        setProducts((pd ?? []).map(normalizeProduct)); setStock((sd ?? []).map(normalizeStock)); setSales((sa ?? []).map(normalizeSale));
      } catch (e) { setError(e.message); } finally { setLoading(false); }
    }; load();
  }, []);

  const lowStockCount = stock.filter(s => { const p = products.find(x => x.id === s.productId); return p && s.quantity <= p.reorderLevel; }).length;

  if (loading) return <ThemeCtx.Provider value={{ T, dark }}><LoadingScreen /></ThemeCtx.Provider>;

  return (
    <ThemeCtx.Provider value={{ T, dark }}>
      <ToastProvider>
        <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.fontMono, transition: "background 0.25s" }}>
          <header style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, zIndex: 50, boxShadow: T.shadow }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: T.amber, textTransform: "uppercase", flexShrink: 0 }}>STOCKR</div>
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              <nav className="nav-scroll" style={{ display: "flex", gap: 0, flex: 1 }}>
                {VIEWS.map(v => (
                  <button key={v.id} onClick={() => setView(v.id)} style={{ fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 12px", background: "none", border: "none", cursor: "pointer", color: view === v.id ? T.amber : T.muted, borderBottom: view === v.id ? `2px solid ${T.amber}` : "2px solid transparent", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {v.label}
                    {v.id === "inventory" && lowStockCount > 0 && <span style={{ marginLeft: 5, background: T.red, color: "#fff", fontFamily: T.fontMono, fontSize: 10, padding: "1px 5px", borderRadius: 2 }}>{lowStockCount}</span>}
                  </button>
                ))}
              </nav>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
            </div>
          </header>

          <main style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
            {error && (
              <div className="fade-in" style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.red }}>⚠ {error}</span>
                <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            )}
            {view === "till" && <TillView products={products} stock={stock} setStock={setStock} setSales={setSales} sales={sales} />}
            {view === "dashboard" && <Dashboard products={products} stock={stock} sales={sales} />}
            {view === "inventory" && <InventoryView products={products} stock={stock} setStock={setStock} />}
            {view === "sales" && <SalesView sales={sales} products={products} />}
            {view === "products" && <ProductsView products={products} setProducts={setProducts} stock={stock} setStock={setStock} />}
          </main>

          <footer style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, marginTop: 40 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.border, textAlign: "center" }}>STOCKR · {products.length} products · {sales.length} transactions · Live</div>
          </footer>
        </div>
      </ToastProvider>
    </ThemeCtx.Provider>
  );
}