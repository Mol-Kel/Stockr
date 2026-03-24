import { useState, useMemo, createContext, useContext } from "react";

// ─── FONT INJECTION ──────────────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
  .theme-toggle-btn:hover { opacity: 0.8; }
`;
document.head.appendChild(style);

// ─── THEME DEFINITIONS ───────────────────────────────────────────────────────
const DARK = {
  bg: "#0d1117", panel: "#161b22", border: "#21262d", borderHover: "#30363d",
  text: "#e6edf3", muted: "#8b949e",
  amber: "#e8a020", amberDim: "#2d1f00",
  red: "#f85149", redDim: "#2a0f0e",
  green: "#3fb950", greenDim: "#0d2112",
  blue: "#58a6ff",
  inputBg: "#0d1117",
  selectBg: "#161b22",
  tableRowHover: "#1c2128",
  scrollTrack: "#0d1117",
  shadow: "0 4px 24px rgba(0,0,0,0.5)",
  fontDisplay: "'Barlow Condensed', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
};

const LIGHT = {
  bg: "#f6f8fa", panel: "#ffffff", border: "#d0d7de", borderHover: "#afb8c1",
  text: "#1f2328", muted: "#656d76",
  amber: "#b35c00", amberDim: "#fff3e0",
  red: "#cf222e", redDim: "#fff0f0",
  green: "#1a7f37", greenDim: "#dafbe1",
  blue: "#0969da",
  inputBg: "#ffffff",
  selectBg: "#ffffff",
  tableRowHover: "#f6f8fa",
  scrollTrack: "#f6f8fa",
  shadow: "0 4px 24px rgba(0,0,0,0.08)",
  fontDisplay: "'Barlow Condensed', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
};

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────
const ThemeCtx = createContext({ T: DARK, dark: true });
const useTheme = () => useContext(ThemeCtx);

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_PRODUCTS = [
  { id: 1, sku: "SNK-001", name: "Nike Air Max 90",     costPrice: 85,  sellingPrice: 149.99, reorderLevel: 10 },
  { id: 2, sku: "SNK-002", name: "Adidas Stan Smith",   costPrice: 55,  sellingPrice:  99.99, reorderLevel:  8 },
  { id: 3, sku: "ACC-001", name: "Leather Belt — Brown",costPrice: 12,  sellingPrice:  34.99, reorderLevel:  5 },
  { id: 4, sku: "ACC-002", name: "Canvas Tote Bag",     costPrice:  8,  sellingPrice:  24.99, reorderLevel: 15 },
  { id: 5, sku: "SNK-003", name: "New Balance 574",     costPrice: 70,  sellingPrice: 119.99, reorderLevel:  6 },
];
const SEED_STOCK = [
  { productId: 1, quantity: 22, location: "Shelf A1" },
  { productId: 2, quantity:  7, location: "Shelf A2" },
  { productId: 3, quantity:  4, location: "Shelf B1" },
  { productId: 4, quantity: 18, location: "Shelf B2" },
  { productId: 5, quantity:  5, location: "Shelf A3" },
];
const SEED_SALES = [
  { id: 1, date: "2026-03-10", orderId: "ORD-1001", productId: 1, quantity: 2 },
  { id: 2, date: "2026-03-10", orderId: "ORD-1002", productId: 3, quantity: 1 },
  { id: 3, date: "2026-03-11", orderId: "ORD-1003", productId: 2, quantity: 3 },
  { id: 4, date: "2026-03-12", orderId: "ORD-1004", productId: 4, quantity: 5 },
  { id: 5, date: "2026-03-12", orderId: "ORD-1005", productId: 1, quantity: 1 },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n) => `R${Number(n).toFixed(2)}`;
const today = () => new Date().toISOString().split("T")[0];
let nextId = 100;
const uid = () => ++nextId;

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", small, disabled, style: s }) => {
  const { T } = useTheme();
  const base = {
    fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: "0.05em",
    border: "none", cursor: disabled ? "not-allowed" : "pointer",
    padding: small ? "6px 14px" : "10px 22px",
    fontSize: small ? "13px" : "15px", textTransform: "uppercase",
    transition: "all 0.15s ease", opacity: disabled ? 0.45 : 1,
  };
  const variants = {
    primary: { background: T.amber, color: "#fff" },
    danger:  { background: T.red,   color: "#fff" },
    ghost:   { background: "transparent", color: T.muted, border: `1px solid ${T.border}` },
    success: { background: T.green, color: "#fff" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...s }}>
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder }) => {
  const { T } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ fontFamily: T.fontDisplay, fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </label>
      )}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: T.inputBg, border: `1px solid ${T.border}`, color: T.text,
          fontFamily: T.fontMono, fontSize: 13, padding: "9px 12px", outline: "none",
          transition: "border-color 0.15s",
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

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────
const ThemeToggle = ({ dark, onToggle }) => {
  const { T } = useTheme();
  return (
    <button
      className="theme-toggle-btn"
      onClick={onToggle}
      title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      style={{
        background: T.panel, border: `1px solid ${T.border}`,
        color: T.text, cursor: "pointer", padding: "5px 12px",
        fontFamily: T.fontMono, fontSize: 14, display: "flex", alignItems: "center", gap: 6,
        transition: "all 0.2s ease",
      }}
    >
      {dark ? "☀" : "☾"}
      <span style={{ fontFamily: T.fontDisplay, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>
        {dark ? "Light" : "Dark"}
      </span>
    </button>
  );
};

// ─── MODAL ────────────────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => {
  const { T } = useTheme();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: T.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

// ─── VIEWS ────────────────────────────────────────────────────────────────────
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

  const recentSales = [...sales].reverse().slice(0, 6);

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
          <div style={{ fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            ⚠ Reorder Required
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lowStock.map(s => {
              const p = products.find(p => p.id === s.productId);
              return (
                <div key={s.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text }}>{p?.name}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{s.quantity} left / min {p?.reorderLevel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Recent Sales</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {["Date", "Order", "Product", "Qty", "Revenue"].map(h => (
                <th key={h} style={{ fontFamily: T.fontDisplay, fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 18px", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentSales.map(s => {
              const p = products.find(pr => pr.id === s.productId);
              return (
                <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}44` }}>
                  <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "10px 18px" }}>{s.date}</td>
                  <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber,  padding: "10px 18px" }}>{s.orderId}</td>
                  <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{p?.name ?? "—"}</td>
                  <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{s.quantity}</td>
                  <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green,  padding: "10px 18px" }}>{p ? fmt(p.sellingPrice * s.quantity) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryView({ products, stock, setStock, setSales, sales }) {
  const { T } = useTheme();
  const [receiveModal, setReceiveModal] = useState(null);
  const [receiveQty, setReceiveQty]     = useState("");
  const [saleModal, setSaleModal]       = useState(null);
  const [saleQty, setSaleQty]           = useState("");
  const [saleError, setSaleError]       = useState("");

  const handleReceive = () => {
    if (!receiveQty || isNaN(receiveQty) || Number(receiveQty) <= 0) return;
    setStock(prev => prev.map(s => s.productId === receiveModal.id ? { ...s, quantity: s.quantity + Number(receiveQty) } : s));
    setReceiveModal(null); setReceiveQty("");
  };

  const handleSale = () => {
    const q = Number(saleQty);
    const s = stock.find(s => s.productId === saleModal.id);
    if (!q || isNaN(q) || q <= 0)  { setSaleError("Enter a valid quantity."); return; }
    if (q > s.quantity)            { setSaleError(`Only ${s.quantity} in stock.`); return; }
    setSaleError("");
    setSales(prev => [...prev, { id: uid(), date: today(), orderId: `ORD-${1000 + prev.length + 1}`, productId: saleModal.id, quantity: q }]);
    setStock(prev => prev.map(st => st.productId === saleModal.id ? { ...st, quantity: st.quantity - q } : st));
    setSaleModal(null); setSaleQty("");
  };

  return (
    <div>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>Stock Levels</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>{stock.length} items</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["SKU", "Product", "Location", "On Hand", "Reorder At", "Status", "Actions"].map(h => (
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
                    <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text,   padding: "12px 18px" }}>{p.name}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted,  padding: "12px 18px" }}>{s.location}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 15, fontWeight: 600, color: low ? T.red : T.text, padding: "12px 18px" }}>{s.quantity}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{p.reorderLevel}</td>
                    <td style={{ padding: "12px 18px" }}>
                      {low ? <Badge color={T.red}>REORDER</Badge> : <Badge color={T.green}>OK</Badge>}
                    </td>
                    <td style={{ padding: "12px 18px", display: "flex", gap: 8 }}>
                      <Btn small variant="ghost" onClick={() => { setSaleModal(p); setSaleQty(""); setSaleError(""); }}>Sell</Btn>
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
            <Input label="Quantity Received" value={receiveQty} onChange={setReceiveQty} type="number" placeholder="0" />
            <Btn onClick={handleReceive} disabled={!receiveQty}>Confirm Receipt</Btn>
          </div>
        </Modal>
      )}

      {saleModal && (
        <Modal title={`Record Sale — ${saleModal.name}`} onClose={() => setSaleModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Quantity Sold" value={saleQty} onChange={v => { setSaleQty(v); setSaleError(""); }} type="number" placeholder="0" />
            {saleError && <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{saleError}</span>}
            <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>
              Revenue: <span style={{ color: T.green }}>{saleQty ? fmt(saleModal.sellingPrice * Number(saleQty)) : "—"}</span>
            </div>
            <Btn onClick={handleSale} disabled={!saleQty}>Confirm Sale</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductsView({ products, setProducts, stock, setStock }) {
  const { T } = useTheme();
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ sku: "", name: "", costPrice: "", sellingPrice: "", reorderLevel: "", location: "" });
  const [errors, setErrors] = useState({});
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.sku.trim())                      e.sku         = "Required";
    if (!form.name.trim())                     e.name        = "Required";
    if (!form.costPrice || isNaN(form.costPrice))     e.costPrice   = "Invalid";
    if (!form.sellingPrice || isNaN(form.sellingPrice)) e.sellingPrice = "Invalid";
    if (!form.reorderLevel || isNaN(form.reorderLevel)) e.reorderLevel = "Invalid";
    return e;
  };

  const handleAdd = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const id = uid();
    setProducts(prev => [...prev, { id, sku: form.sku, name: form.name, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice), reorderLevel: Number(form.reorderLevel) }]);
    setStock(prev => [...prev, { productId: id, quantity: 0, location: form.location || "Unassigned" }]);
    setModal(false);
    setForm({ sku: "", name: "", costPrice: "", sellingPrice: "", reorderLevel: "", location: "" });
    setErrors({});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={() => setModal(true)}>+ Add Product</Btn>
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["SKU", "Product Name", "Cost", "Price", "Margin", "Reorder Level"].map(h => (
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
                    <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.text,   padding: "12px 18px" }}>{p.name}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{fmt(p.costPrice)}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "12px 18px" }}>{fmt(p.sellingPrice)}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: Number(margin) > 40 ? T.green : T.amber, padding: "12px 18px" }}>{margin}%</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted,  padding: "12px 18px" }}>{p.reorderLevel} units</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Add New Product" onClose={() => setModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "SKU",            key: "sku",          placeholder: "e.g. SNK-004" },
              { label: "Product Name",   key: "name",         placeholder: "e.g. Puma RS-X" },
              { label: "Cost Price (R)", key: "costPrice",    placeholder: "0.00", type: "number" },
              { label: "Selling Price (R)", key: "sellingPrice", placeholder: "0.00", type: "number" },
              { label: "Reorder Level",  key: "reorderLevel", placeholder: "e.g. 10", type: "number" },
              { label: "Location",       key: "location",     placeholder: "e.g. Shelf C1" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <Input label={label} value={form[key]} onChange={v => update(key, v)} placeholder={placeholder} type={type || "text"} />
                {errors[key] && <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.red, marginTop: 3 }}>{errors[key]}</div>}
              </div>
            ))}
            <Btn onClick={handleAdd} style={{ marginTop: 4 }}>Add Product</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KPI label="Total Revenue" value={fmt(totalRevenue)} sub={`${sales.length} sales`} accent={T.green} />
        <KPI label="Total Profit"  value={fmt(totalProfit)}  sub={`${((totalProfit / totalRevenue) * 100 || 0).toFixed(1)}% margin`} accent={T.blue} />
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>All Transactions</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Date", "Order ID", "Product", "SKU", "Qty", "Revenue", "Profit"].map(h => (
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
                    <td style={{ fontFamily: T.fontMono, fontSize: 11, color: T.amber,  padding: "10px 18px", opacity: 0.7 }}>{p?.sku ?? "—"}</td>
                    <td style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text,   padding: "10px 18px" }}>{s.quantity}</td>
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
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "sales",     label: "Sales"     },
  { id: "products",  label: "Products"  },
];

export default function App() {
  const [dark, setDark]         = useState(true);
  const T                       = dark ? DARK : LIGHT;
  const [view, setView]         = useState("dashboard");
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [stock, setStock]       = useState(SEED_STOCK);
  const [sales, setSales]       = useState(SEED_SALES);

  const lowStockCount = stock.filter(s => {
    const p = products.find(p => p.id === s.productId);
    return p && s.quantity <= p.reorderLevel;
  }).length;

  // Update body background when theme changes
  document.body.style.background = T.bg;

  return (
    <ThemeCtx.Provider value={{ T, dark }}>
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.fontMono, transition: "background 0.25s, color 0.25s" }}>

        {/* ── Header ── */}
        <header style={{
          background: T.panel, borderBottom: `1px solid ${T.border}`,
          padding: "0 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 56,
          position: "sticky", top: 0, zIndex: 50,
          boxShadow: T.shadow,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: T.amber, textTransform: "uppercase" }}>
              STOCKR
            </div>
            <div style={{ width: 1, height: 20, background: T.border }} />
            <nav style={{ display: "flex", gap: 2 }}>
              {VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  fontFamily: T.fontDisplay, fontSize: 13, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "6px 14px", background: "none", border: "none",
                  cursor: "pointer",
                  color: view === v.id ? T.amber : T.muted,
                  borderBottom: view === v.id ? `2px solid ${T.amber}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}>
                  {v.label}
                  {v.id === "inventory" && lowStockCount > 0 && (
                    <span style={{ marginLeft: 6, background: T.red, color: "#fff", fontFamily: T.fontMono, fontSize: 10, padding: "1px 5px", borderRadius: 2 }}>
                      {lowStockCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>
              {new Date().toLocaleDateString("en-ZA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
            <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
          </div>
        </header>

        {/* ── Main ── */}
        <main style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
          {view === "dashboard" && <Dashboard products={products} stock={stock} sales={sales} />}
          {view === "inventory" && <InventoryView products={products} stock={stock} setStock={setStock} setSales={setSales} sales={sales} />}
          {view === "sales"     && <SalesView sales={sales} products={products} />}
          {view === "products"  && <ProductsView products={products} setProducts={setProducts} stock={stock} setStock={setStock} />}
        </main>

        {/* ── Footer ── */}
        <footer style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}`, marginTop: 40 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.border, textAlign: "center" }}>
            STOCKR MVP · {products.length} products · {sales.length} transactions · {dark ? "Dark" : "Light"} Mode
          </div>
        </footer>
      </div>
    </ThemeCtx.Provider>
  );
}