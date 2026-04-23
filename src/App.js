import { useState, useMemo, useRef, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "./supabase";

// ─── FONT + GLOBAL STYLES ────────────────────────────────────────────────────
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
  .receipt-enter  { animation: slideUp 0.3s ease forwards; }
  .fade-in        { animation: fadeIn  0.2s ease forwards; }
  .scanning-pulse { animation: pulse  1.2s ease-in-out infinite; }
  .spinner        { animation: spin   0.8s linear infinite; }
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
  fontDisplay: "'Barlow Condensed', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
};

const ThemeCtx = createContext({ T: DARK, dark: true });
const useTheme = () => useContext(ThemeCtx);

// ─── DATA NORMALISERS (DB snake_case → app camelCase) ─────────────────────────
const normalizeProduct = (p) => ({
  id: p.id, sku: p.sku, barcode: p.barcode || "",
  name: p.name, costPrice: Number(p.cost_price),
  sellingPrice: Number(p.selling_price), reorderLevel: Number(p.reorder_level),
});
const normalizeStock = (s) => ({
  id: s.id, productId: s.product_id,
  quantity: Number(s.quantity), location: s.location || "Unassigned",
});
const normalizeSale = (s) => ({
  id: s.id, date: s.date, orderId: s.order_id,
  productId: s.product_id, quantity: Number(s.quantity),
  paymentMethod: s.payment_method || "cash",
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt   = (n) => `R${Number(n).toFixed(2)}`;
const today = ()  => new Date().toISOString().split("T")[0];

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", small, disabled, full, style: s }) => {
  const { T } = useTheme();
  const variants = {
    primary: { background: T.amber,       color: "#fff" },
    danger:  { background: T.red,         color: "#fff" },
    ghost:   { background: "transparent", color: T.muted, border: `1px solid ${T.border}` },
    success: { background: T.green,       color: "#fff" },
    blue:    { background: T.blue,        color: "#fff" },
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

const Input = ({ label, value, onChange, type = "text", placeholder, autoFocus, inputRef }) => {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
      <input
        ref={inputRef} autoFocus={autoFocus} type={type}
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: T.inputBg, border: `1px solid ${T.border}`, color: T.text,
          fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none",
          transition: "border-color 0.15s", width: "100%",
        }}
        onFocus={e => e.target.style.borderColor = T.amber}
        onBlur={e  => e.target.style.borderColor = T.border}
      />
    </div>
  );
};

const Badge = ({ children, color }) => {
  const { T } = useTheme();
  const c = color || T.muted;
  return (
    <span style={{
      fontFamily: T.fontMono, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", background: c + "22", color: c,
      border: `1px solid ${c}44`, letterSpacing: "0.04em",
    }}>{children}</span>
  );
};

const KPI = ({ label, value, sub, accent }) => {
  const { T } = useTheme();
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: "20px 24px", flex: 1, minWidth: 160, boxShadow: T.shadow }}>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, color: accent || T.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
};

const ThemeToggle = ({ dark, onToggle }) => {
  const { T } = useTheme();
  return (
    <button onClick={onToggle} style={{
      background: T.panel, border: `1px solid ${T.border}`, color: T.text,
      cursor: "pointer", padding: "5px 12px", fontFamily: T.fontMono,
      fontSize: 14, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
    }}>
      {dark ? "☀" : "☾"}
      <span style={{ fontFamily: T.fontDisplay, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>
        {dark ? "Light" : "Dark"}
      </span>
    </button>
  );
};

const Modal = ({ title, onClose, children }) => {
  const { T } = useTheme();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
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

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
const LoadingScreen = () => {
  const { T } = useTheme();
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 36, fontWeight: 800, color: T.amber, letterSpacing: "0.1em" }}>STOCKR</div>
      <div className="spinner" style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.amber, borderRadius: "50%" }} />
      <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>Connecting to database…</div>
    </div>
  );
};

// ─── ERROR BANNER ─────────────────────────────────────────────────────────────
const ErrorBanner = ({ message, onDismiss }) => {
  const { T } = useTheme();
  return (
    <div className="fade-in" style={{
      background: T.redDim, border: `1px solid ${T.red}55`,
      padding: "10px 18px", display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: 16,
    }}>
      <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.red }}>⚠ {message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 18 }}>×</button>
    </div>
  );
};

// ─── BARCODE SCANNER ─────────────────────────────────────────────────────────
function BarcodeScanner({ onDetected, onClose }) {
  const { T } = useTheme();
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus]   = useState("starting");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    let animId;

    const start = async () => {
      if (!("BarcodeDetector" in window)) {
        setStatus("error");
        setErrorMsg("Barcode scanning requires Chrome on Android or desktop Chrome/Edge.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
        setStatus("scanning");
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) { onDetected(barcodes[0].rawValue); return; }
          } catch {}
          animId = requestAnimationFrame(scan);
        };
        animId = requestAnimationFrame(scan);
      } catch (e) {
        if (!active) return;
        setStatus("error");
        setErrorMsg(e.name === "NotAllowedError" ? "Camera permission denied. Please allow camera access and try again." : `Camera error: ${e.message}`);
      }
    };

    start();
    return () => {
      active = false;
      cancelAnimationFrame(animId);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onDetected]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {status === "error" ? (
        <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: 16, fontFamily: T.fontMono, fontSize: 13, color: T.red }}>{errorMsg}</div>
      ) : (
        <div style={{ position: "relative", background: "#000", aspectRatio: "4/3", overflow: "hidden" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "60%", height: "30%", border: `2px solid ${T.amber}`, boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)` }} />
          </div>
          {status === "scanning" && (
            <div className="scanning-pulse" style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, color: T.amber, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Scanning…
            </div>
          )}
          {status === "starting" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontMono, fontSize: 13, color: T.muted }}>
              Starting camera…
            </div>
          )}
        </div>
      )}
      <Btn variant="ghost" onClick={onClose} full>Cancel</Btn>
    </div>
  );
}

// ─── RECEIPT FLASH ────────────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose }) {
  const { T } = useTheme();
  const { items, total, paymentMethod, orderId, date } = receipt;
  return (
    <Modal title="Sale Complete ✓" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>
          <span>{orderId}</span><span>{date}</span>
        </div>
        <div style={{ background: T.panelAlt, border: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>{item.name}</div>
                <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>× {item.quantity} @ {fmt(item.price)}</div>
              </div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.text }}>{fmt(item.price * item.quantity)}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Payment</div>
            <Badge color={paymentMethod === "cash" ? T.amber : T.blue}>{paymentMethod === "cash" ? "💵 Cash" : "💳 Card"}</Badge>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 36, fontWeight: 800, color: T.green, lineHeight: 1 }}>{fmt(total)}</div>
          </div>
        </div>
        <Btn onClick={onClose} variant="success" full>Done — New Sale</Btn>
      </div>
    </Modal>
  );
}

// ─── TILL VIEW ────────────────────────────────────────────────────────────────
function TillView({ products, stock, setStock, setSales, sales, onError }) {
  const { T } = useTheme();
  const [search, setSearch]             = useState("");
  const [basket, setBasket]             = useState([]);
  const [payment, setPayment]           = useState("cash");
  const [showScanner, setShowScanner]   = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [receipt, setReceipt]           = useState(null);
  const [completing, setCompleting]     = useState(false);
  const searchRef = useRef(null);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    ).slice(0, 6);
  }, [search, products]);

  const addToBasket = useCallback((product) => {
    const stockItem = stock.find(s => s.productId === product.id);
    const inBasket  = basket.find(b => b.productId === product.id);
    const currentQty = inBasket ? inBasket.quantity : 0;
    if (!stockItem || currentQty >= stockItem.quantity) {
      setScanFeedback({ type: "err", msg: `Not enough stock for ${product.name}` });
      setTimeout(() => setScanFeedback(null), 2500);
      return;
    }
    setBasket(prev => {
      const exists = prev.find(b => b.productId === product.id);
      if (exists) return prev.map(b => b.productId === product.id ? { ...b, quantity: b.quantity + 1 } : b);
      return [...prev, { productId: product.id, name: product.name, price: product.sellingPrice, quantity: 1 }];
    });
    setSearch("");
    searchRef.current?.focus();
  }, [basket, stock]);

  const handleBarcode = useCallback((code) => {
    setShowScanner(false);
    const product = products.find(p => p.barcode === code || p.sku === code);
    if (!product) {
      setScanFeedback({ type: "err", msg: `No product found for barcode: ${code}` });
      setTimeout(() => setScanFeedback(null), 3000);
      return;
    }
    setScanFeedback({ type: "ok", msg: `Added: ${product.name}` });
    setTimeout(() => setScanFeedback(null), 1800);
    addToBasket(product);
  }, [products, addToBasket]);

  const updateQty = (productId, delta) => {
    setBasket(prev => prev
      .map(b => b.productId === productId ? { ...b, quantity: b.quantity + delta } : b)
      .filter(b => b.quantity > 0)
    );
  };

  const basketTotal = basket.reduce((acc, b) => acc + b.price * b.quantity, 0);
  const basketCount = basket.reduce((acc, b) => acc + b.quantity, 0);

  const completeSale = async () => {
    if (basket.length === 0 || completing) return;
    setCompleting(true);

    const orderId  = `ORD-${Date.now()}`;
    const saleDate = today();

    // ── 1. Insert sale rows into Supabase ──────────────────────────────────
    const saleRows = basket.map(b => ({
      date: saleDate,
      order_id: orderId,
      product_id: b.productId,
      quantity: b.quantity,
      payment_method: payment,
    }));

    const { data: insertedSales, error: salesError } = await supabase
      .from("sales")
      .insert(saleRows)
      .select();

    if (salesError) {
      onError(`Failed to record sale: ${salesError.message}`);
      setCompleting(false);
      return;
    }

    // ── 2. Update stock quantities in Supabase ─────────────────────────────
    for (const item of basket) {
      const currentStock = stock.find(s => s.productId === item.productId);
      if (!currentStock) continue;
      const newQty = currentStock.quantity - item.quantity;
      const { error: stockError } = await supabase
        .from("stock")
        .update({ quantity: newQty })
        .eq("product_id", item.productId);

      if (stockError) {
        onError(`Stock update failed for ${item.name}: ${stockError.message}`);
      }
    }

    // ── 3. Update local state ─────────────────────────────────────────────
    setSales(prev => [...prev, ...insertedSales.map(normalizeSale)]);
    setStock(prev => prev.map(s => {
      const line = basket.find(b => b.productId === s.productId);
      return line ? { ...s, quantity: s.quantity - line.quantity } : s;
    }));

    setReceipt({ items: basket, total: basketTotal, paymentMethod: payment, orderId, date: saleDate });
    setBasket([]);
    setPayment("cash");
    setCompleting(false);
  };

  const handleReceiptClose = () => {
    setReceipt(null);
    searchRef.current?.focus();
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

      {/* ── LEFT: Search + Results ── */}
      <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 12 }}>

        {scanFeedback && (
          <div className="fade-in" style={{
            padding: "10px 16px", fontFamily: T.fontMono, fontSize: 13,
            background: scanFeedback.type === "ok" ? T.greenDim : T.redDim,
            border: `1px solid ${scanFeedback.type === "ok" ? T.green : T.red}55`,
            color: scanFeedback.type === "ok" ? T.green : T.red,
          }}>
            {scanFeedback.type === "ok" ? "✓ " : "✗ "}{scanFeedback.msg}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={searchRef} autoFocus value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product name, SKU or barcode…"
            style={{
              flex: 1, background: T.inputBg, border: `1px solid ${T.border}`,
              color: T.text, fontFamily: T.fontMono, fontSize: 14,
              padding: "12px 16px", outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = T.amber}
            onBlur={e  => e.target.style.borderColor = T.border}
          />
          <button onClick={() => setShowScanner(true)} title="Scan barcode" style={{
            background: T.panel, border: `1px solid ${T.border}`, color: T.amber,
            cursor: "pointer", padding: "0 16px", fontSize: 22, flexShrink: 0, transition: "all 0.15s",
          }}>⊡</button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
            {searchResults.map((p, i) => {
              const s = stock.find(s => s.productId === p.id);
              const inStock = s && s.quantity > 0;
              return (
                <button key={p.id} onClick={() => inStock && addToBasket(p)} disabled={!inStock} style={{
                  width: "100%", background: "none", border: "none",
                  borderBottom: i < searchResults.length - 1 ? `1px solid ${T.border}` : "none",
                  padding: "12px 16px", cursor: inStock ? "pointer" : "not-allowed",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  transition: "background 0.1s", opacity: inStock ? 1 : 0.45, textAlign: "left",
                }}
                onMouseEnter={e => { if (inStock) e.currentTarget.style.background = T.panelAlt; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 14, color: T.text }}>{p.name}</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {p.sku} · {inStock ? `${s.quantity} in stock` : "Out of stock"}
                    </div>
                  </div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, color: T.amber, marginLeft: 12 }}>
                    {fmt(p.sellingPrice)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {search && searchResults.length === 0 && (
          <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.muted, padding: "10px 0" }}>
            No products match "{search}"
          </div>
        )}

        {!search && basket.length === 0 && (
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Start a new sale</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.subtle, marginTop: 8 }}>Search above or tap ⊡ to scan a barcode</div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Basket ── */}
      <div style={{ flex: "1 1 300px", background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.text }}>
            Basket {basketCount > 0 && <span style={{ color: T.amber }}>({basketCount})</span>}
          </span>
          {basket.length > 0 && (
            <button onClick={() => setBasket([])} style={{ background: "none", border: "none", fontFamily: T.fontMono, fontSize: 11, color: T.red, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>Clear</button>
          )}
        </div>

        <div style={{ minHeight: 200, maxHeight: 360, overflowY: "auto" }}>
          {basket.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: T.fontMono, fontSize: 12, color: T.subtle }}>Basket is empty</div>
          ) : (
            basket.map(item => (
              <div key={item.productId} style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}44`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted, marginTop: 2 }}>{fmt(item.price)} each</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => updateQty(item.productId, -1)} style={{ width: 28, height: 28, background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, color: T.text, minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.productId, 1)} style={{ width: 28, height: 28, background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
                <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, color: T.text, minWidth: 60, textAlign: "right" }}>{fmt(item.price * item.quantity)}</div>
                <button onClick={() => setBasket(prev => prev.filter(b => b.productId !== item.productId))} style={{ background: "none", border: "none", color: T.subtle, cursor: "pointer", fontSize: 16, padding: "0 2px" }}>×</button>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: "16px 18px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: T.panelAlt }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Total</span>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 32, fontWeight: 800, color: T.text }}>{fmt(basketTotal)}</span>
        </div>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Payment Method</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["cash", "💵 Cash"], ["card", "💳 Card"]].map(([val, label]) => (
              <button key={val} onClick={() => setPayment(val)} style={{
                flex: 1, padding: "10px 0", fontFamily: T.fontDisplay, fontSize: 15,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                cursor: "pointer", transition: "all 0.15s",
                border: `2px solid ${payment === val ? (val === "cash" ? T.amber : T.blue) : T.border}`,
                background: payment === val ? (val === "cash" ? T.amberDim : T.blueDim) : "transparent",
                color: payment === val ? (val === "cash" ? T.amber : T.blue) : T.muted,
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${T.border}` }}>
          <Btn onClick={completeSale} disabled={basket.length === 0 || completing} variant="success" full style={{ padding: "16px 0", fontSize: 18, letterSpacing: "0.08em" }}>
            {completing ? "Processing…" : "Complete Sale"}
          </Btn>
        </div>
      </div>

      {showScanner && (
        <Modal title="Scan Barcode" onClose={() => setShowScanner(false)}>
          <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />
        </Modal>
      )}

      {receipt && <ReceiptModal receipt={receipt} onClose={handleReceiptClose} />}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ products, stock, sales }) {
  const { T } = useTheme();
  const totalRevenue = useMemo(() => sales.reduce((acc, s) => {
    const p = products.find(p => p.id === s.productId);
    return acc + (p ? p.sellingPrice * s.quantity : 0);
  }, 0), [sales, products]);

  const totalCOGS = useMemo(() => sales.reduce((acc, s) => {
    const p = products.find(p => p.id === s.productId);
    return acc + (p ? p.costPrice * s.quantity : 0);
  }, 0), [sales, products]);

  const lowStock = stock.filter(s => {
    const p = products.find(p => p.id === s.productId);
    return p && s.quantity <= p.reorderLevel;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPI label="Total Revenue" value={fmt(totalRevenue)} sub={`${sales.length} transactions`} accent={T.green} />
        <KPI label="Gross Profit"  value={fmt(totalRevenue - totalCOGS)} sub={`COGS: ${fmt(totalCOGS)}`} accent={T.blue} />
        <KPI label="Products"      value={products.length} sub="active SKUs" />
        <KPI label="Low Stock"     value={lowStock.length} sub="need reorder" accent={lowStock.length > 0 ? T.red : T.green} />
      </div>

      {lowStock.length > 0 && (
        <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, padding: "14px 18px" }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>⚠ Reorder Required</div>
          {lowStock.map(s => {
            const p = products.find(p => p.id === s.productId);
            return (
              <div key={s.productId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>{p?.name}</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{s.quantity} left / min {p?.reorderLevel}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Recent Sales</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Date", "Order", "Product", "Qty", "Payment", "Revenue"].map(h => (
                  <th key={h} style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 18px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sales].reverse().slice(0, 8).map(s => {
                const p = products.find(pr => pr.id === s.productId);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}44` }}>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "10px 18px" }}>{s.date}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber,  padding: "10px 18px" }}>{s.orderId}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{p?.name ?? "—"}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{s.quantity}</td>
                    <td style={{ padding: "10px 18px" }}><Badge color={s.paymentMethod === "cash" ? T.amber : T.blue}>{s.paymentMethod}</Badge></td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green,  padding: "10px 18px" }}>{p ? fmt(p.sellingPrice * s.quantity) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function InventoryView({ products, stock, setStock, onError }) {
  const { T } = useTheme();
  const [receiveModal, setReceiveModal] = useState(null);
  const [receiveQty, setReceiveQty]     = useState("");
  const [saving, setSaving]             = useState(false);

  const handleReceive = async () => {
    const qty = Number(receiveQty);
    if (!qty || qty <= 0) return;
    setSaving(true);

    const current   = stock.find(s => s.productId === receiveModal.id);
    const newQty    = (current?.quantity ?? 0) + qty;

    const { error } = await supabase
      .from("stock")
      .update({ quantity: newQty })
      .eq("product_id", receiveModal.id);

    if (error) {
      onError(`Failed to update stock: ${error.message}`);
    } else {
      setStock(prev => prev.map(s => s.productId === receiveModal.id ? { ...s, quantity: newQty } : s));
    }
    setSaving(false);
    setReceiveModal(null);
    setReceiveQty("");
  };

  return (
    <div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Stock Levels</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>{stock.length} items</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["SKU", "Barcode", "Product", "Location", "On Hand", "Reorder At", "Status", "Action"].map(h => (
                  <th key={h} style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 18px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.map(s => {
                const p = products.find(p => p.id === s.productId);
                if (!p) return null;
                const low = s.quantity <= p.reorderLevel;
                return (
                  <tr key={s.productId} style={{ borderBottom: `1px solid ${T.border}44`, background: low ? T.redDim : "transparent" }}>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.amber,  padding: "12px 18px" }}>{p.sku}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.subtle, padding: "12px 18px" }}>{p.barcode || "—"}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text,   padding: "12px 18px" }}>{p.name}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted,  padding: "12px 18px" }}>{s.location}</td>
                    <td style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, color: low ? T.red : T.text, padding: "12px 18px" }}>{s.quantity}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{p.reorderLevel}</td>
                    <td style={{ padding: "12px 18px" }}>{low ? <Badge color={T.red}>REORDER</Badge> : <Badge color={T.green}>OK</Badge>}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <Btn small onClick={() => { setReceiveModal(p); setReceiveQty(""); }}>Receive</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {receiveModal && (
        <Modal title={`Receive Stock — ${receiveModal.name}`} onClose={() => setReceiveModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Quantity Received" value={receiveQty} onChange={setReceiveQty} type="number" placeholder="0" autoFocus />
            <Btn onClick={handleReceive} disabled={!receiveQty || saving}>{saving ? "Saving…" : "Confirm Receipt"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
function ProductsView({ products, setProducts, stock, setStock, onError }) {
  const { T } = useTheme();
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ sku: "", barcode: "", name: "", costPrice: "", sellingPrice: "", reorderLevel: "", location: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.sku.trim())                               e.sku          = "Required";
    if (!form.name.trim())                              e.name         = "Required";
    if (!form.costPrice    || isNaN(form.costPrice))    e.costPrice    = "Invalid number";
    if (!form.sellingPrice || isNaN(form.sellingPrice)) e.sellingPrice = "Invalid number";
    if (!form.reorderLevel || isNaN(form.reorderLevel)) e.reorderLevel = "Invalid number";
    return e;
  };

  const handleAdd = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);

    // ── Insert product ───────────────────────────────────────────────────────
    const { data: newProduct, error: prodError } = await supabase
      .from("products")
      .insert({
        sku: form.sku, barcode: form.barcode || null, name: form.name,
        cost_price: Number(form.costPrice),
        selling_price: Number(form.sellingPrice),
        reorder_level: Number(form.reorderLevel),
      })
      .select()
      .single();

    if (prodError) { onError(`Failed to add product: ${prodError.message}`); setSaving(false); return; }

    // ── Insert stock row ─────────────────────────────────────────────────────
    const { data: newStock, error: stockError } = await supabase
      .from("stock")
      .insert({ product_id: newProduct.id, quantity: 0, location: form.location || "Unassigned" })
      .select()
      .single();

    if (stockError) { onError(`Failed to create stock entry: ${stockError.message}`); setSaving(false); return; }

    setProducts(prev => [...prev, normalizeProduct(newProduct)]);
    setStock(prev => [...prev, normalizeStock(newStock)]);
    setModal(false);
    setForm({ sku: "", barcode: "", name: "", costPrice: "", sellingPrice: "", reorderLevel: "", location: "" });
    setErrors({});
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={() => setModal(true)}>+ Add Product</Btn>
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["SKU", "Barcode", "Product Name", "Cost", "Price", "Margin", "Reorder"].map(h => (
                  <th key={h} style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 18px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const margin = (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}44` }}>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.amber,  padding: "12px 18px" }}>{p.sku}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.subtle, padding: "12px 18px" }}>{p.barcode || "—"}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text,   padding: "12px 18px" }}>{p.name}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{fmt(p.costPrice)}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "12px 18px" }}>{fmt(p.sellingPrice)}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: Number(margin) > 40 ? T.green : T.amber, padding: "12px 18px" }}>{margin}%</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{p.reorderLevel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Add New Product" onClose={() => { setModal(false); setErrors({}); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "SKU",                key: "sku",          placeholder: "e.g. GRC-001" },
              { label: "Barcode (optional)", key: "barcode",      placeholder: "e.g. 6001234567890" },
              { label: "Product Name",       key: "name",         placeholder: "e.g. Salt 500g" },
              { label: "Cost Price (R)",     key: "costPrice",    placeholder: "0.00", type: "number" },
              { label: "Selling Price (R)",  key: "sellingPrice", placeholder: "0.00", type: "number" },
              { label: "Reorder Level",      key: "reorderLevel", placeholder: "e.g. 10", type: "number" },
              { label: "Location",           key: "location",     placeholder: "e.g. Shelf C1" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <Input label={label} value={form[key]} onChange={v => update(key, v)} placeholder={placeholder} type={type || "text"} />
                {errors[key] && <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.red, marginTop: 3 }}>{errors[key]}</div>}
              </div>
            ))}
            <Btn onClick={handleAdd} disabled={saving} style={{ marginTop: 4 }}>{saving ? "Saving…" : "Add Product"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SALES HISTORY ────────────────────────────────────────────────────────────
function SalesView({ sales, products }) {
  const { T } = useTheme();

  const totalRevenue = useMemo(() => sales.reduce((acc, s) => {
    const p = products.find(p => p.id === s.productId);
    return acc + (p ? p.sellingPrice * s.quantity : 0);
  }, 0), [sales, products]);

  const totalProfit = useMemo(() => sales.reduce((acc, s) => {
    const p = products.find(p => p.id === s.productId);
    return acc + (p ? (p.sellingPrice - p.costPrice) * s.quantity : 0);
  }, 0), [sales, products]);

  const cashTotal = useMemo(() => sales.filter(s => s.paymentMethod === "cash").reduce((acc, s) => {
    const p = products.find(p => p.id === s.productId);
    return acc + (p ? p.sellingPrice * s.quantity : 0);
  }, 0), [sales, products]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPI label="Total Revenue" value={fmt(totalRevenue)} sub={`${sales.length} line items`} accent={T.green} />
        <KPI label="Total Profit"  value={fmt(totalProfit)}  sub={`${((totalProfit / totalRevenue) * 100 || 0).toFixed(1)}% margin`} accent={T.blue} />
        <KPI label="Cash Sales"    value={fmt(cashTotal)}    sub={`${fmt(totalRevenue - cashTotal)} by card`} accent={T.amber} />
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>All Transactions</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Date", "Order ID", "Product", "Qty", "Payment", "Revenue", "Profit"].map(h => (
                  <th key={h} style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 18px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sales].reverse().map(s => {
                const p      = products.find(pr => pr.id === s.productId);
                const rev    = p ? p.sellingPrice * s.quantity : 0;
                const profit = p ? (p.sellingPrice - p.costPrice) * s.quantity : 0;
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}44` }}>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "10px 18px" }}>{s.date}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber,  padding: "10px 18px" }}>{s.orderId}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{p?.name ?? "—"}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{s.quantity}</td>
                    <td style={{ padding: "10px 18px" }}><Badge color={s.paymentMethod === "cash" ? T.amber : T.blue}>{s.paymentMethod}</Badge></td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green,  padding: "10px 18px" }}>{fmt(rev)}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: profit >= 0 ? T.green : T.red, padding: "10px 18px" }}>{fmt(profit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
const VIEWS = [
  { id: "till",      label: "Till"      },
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "sales",     label: "Sales"     },
  { id: "products",  label: "Products"  },
];

export default function App() {
  const [dark, setDark]         = useState(true);
  const T                       = dark ? DARK : LIGHT;
  const [view, setView]         = useState("till");
  const [products, setProducts] = useState([]);
  const [stock, setStock]       = useState([]);
  const [sales, setSales]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  document.body.style.background = T.bg;

  // ── Load all data from Supabase on mount ───────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [
          { data: productsData, error: pErr },
          { data: stockData,    error: sErr },
          { data: salesData,    error: saErr },
        ] = await Promise.all([
          supabase.from("products").select("*").order("name"),
          supabase.from("stock").select("*"),
          supabase.from("sales").select("*").order("created_at", { ascending: false }),
        ]);

        if (pErr)  throw new Error(`Products: ${pErr.message}`);
        if (sErr)  throw new Error(`Stock: ${sErr.message}`);
        if (saErr) throw new Error(`Sales: ${saErr.message}`);

        setProducts((productsData ?? []).map(normalizeProduct));
        setStock((stockData ?? []).map(normalizeStock));
        setSales((salesData ?? []).map(normalizeSale));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const lowStockCount = stock.filter(s => {
    const p = products.find(p => p.id === s.productId);
    return p && s.quantity <= p.reorderLevel;
  }).length;

  if (loading) return (
    <ThemeCtx.Provider value={{ T, dark }}>
      <LoadingScreen />
    </ThemeCtx.Provider>
  );

  return (
    <ThemeCtx.Provider value={{ T, dark }}>
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, transition: "background 0.25s" }}>

        {/* Header */}
        <header style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, zIndex: 50, boxShadow: T.shadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: T.amber, textTransform: "uppercase" }}>STOCKR</div>
            <div style={{ width: 1, height: 20, background: T.border }} />
            <nav style={{ display: "flex" }}>
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "6px 12px", background: "none", border: "none", cursor: "pointer",
                  color: view === v.id ? T.amber : T.muted,
                  borderBottom: view === v.id ? `2px solid ${T.amber}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}>
                  {v.label}
                  {v.id === "inventory" && lowStockCount > 0 && (
                    <span style={{ marginLeft: 5, background: T.red, color: "#fff", fontFamily: T.fontMono, fontSize: 10, padding: "1px 5px", borderRadius: 2 }}>{lowStockCount}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>
              {new Date().toLocaleDateString("en-ZA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
          </div>
        </header>

        {/* Main */}
        <main style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {view === "till"      && <TillView      products={products} stock={stock} setStock={setStock} setSales={setSales} sales={sales} onError={setError} />}
          {view === "dashboard" && <Dashboard     products={products} stock={stock} sales={sales} />}
          {view === "inventory" && <InventoryView products={products} stock={stock} setStock={setStock} onError={setError} />}
          {view === "sales"     && <SalesView     sales={sales} products={products} />}
          {view === "products"  && <ProductsView  products={products} setProducts={setProducts} stock={stock} setStock={setStock} onError={setError} />}
        </main>

        <footer style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, marginTop: 40 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.border, textAlign: "center" }}>
            STOCKR · {products.length} products · {sales.length} transactions · {dark ? "Dark" : "Light"} Mode · Live
          </div>
        </footer>
      </div>
    </ThemeCtx.Provider>
  );
}