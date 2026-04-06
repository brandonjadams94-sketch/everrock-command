import { useState, useEffect, useReducer, useCallback, useRef } from "react";
import * as recharts from "recharts";
import { X, ChevronRight, ChevronDown, Edit3, Check, TrendingUp, TrendingDown, Activity, AlertTriangle, Clock, DollarSign, Building2, Zap, BarChart3, Globe, Layers, Plus, Trash2, ArrowUpRight, ArrowDownRight, Radio, Search, FileText, MapPin, Star, Eye, ExternalLink, Filter, RefreshCw } from "lucide-react";

const { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = recharts;

const T = {
  bg: "#06060b", panel: "#0c0c14", card: "#12121c", cardHover: "#181828",
  border: "#1a1a2e", borderLight: "#252540",
  green: "#00e676", red: "#ff1744", amber: "#ffc400", cyan: "#00b8d4",
  blue: "#448aff", purple: "#b388ff", orange: "#ff6d00",
  text: "#e2e2ef", textSec: "#5c5c78", textDim: "#2e2e44",
  greenGlow: "rgba(0,230,118,0.08)", redGlow: "rgba(255,23,68,0.08)",
};

const mono = "'IBM Plex Mono', monospace";

const loadData = async (key, fallback) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const saveData = async (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error(e); }
};

// ─── SCANNER API ───
// Set your VPS URL here or use REACT_APP_SCANNER_API env variable
const SCANNER_API = "/api";

const api = {
  async fetchListings(params = {}) {
    const qs = new URLSearchParams(params).toString();
    try {
      const r = await fetch(`${SCANNER_API}/api/listings?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return data.listings.map(apiToFrontend);
    } catch (e) {
      console.warn("Scanner API unreachable, using local data:", e.message);
      return null; // null = fallback to local
    }
  },
  async fetchStats() {
    try {
      const r = await fetch(`${SCANNER_API}/api/stats`);
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },
  async triggerScan() {
    try {
      const r = await fetch(`${SCANNER_API}/api/scan`, { method: "POST" });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },
  async updateStatus(id, status) {
    try { await fetch(`${SCANNER_API}/api/listings/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); } catch {}
  },
  async updateStar(id, starred) {
    try { await fetch(`${SCANNER_API}/api/listings/${id}/star`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ starred }) }); } catch {}
  },
  async updateNotes(id, notes) {
    try { await fetch(`${SCANNER_API}/api/listings/${id}/notes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }); } catch {}
  },
  async deleteListing(id) {
    try { await fetch(`${SCANNER_API}/api/listings/${id}`, { method: "DELETE" }); } catch {}
  },
  async checkHealth() {
    try { const r = await fetch(`${SCANNER_API}/api/health`); return r.ok; } catch { return false; }
  }
};

// ─── RFP SCANNER API (port 8421) ───
const RFP_API = "/rfpapi";

const rfpApi = {
  async fetchRFPs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    try {
      const r = await fetch(`${RFP_API}/api/rfps?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return data.rfps.map(rfpToFrontend);
    } catch (e) {
      console.warn("RFP API unreachable:", e.message);
      return null;
    }
  },
  async fetchStats() {
    try { const r = await fetch(`${RFP_API}/api/rfps/stats`); return r.ok ? await r.json() : null; } catch { return null; }
  },
  async triggerScan() {
    try { const r = await fetch(`${RFP_API}/api/rfps/scan`, { method: "POST" }); return r.ok ? await r.json() : null; } catch { return null; }
  },
  async updateStatus(id, status) {
    try { await fetch(`${RFP_API}/api/rfps/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); } catch {}
  },
  async updateStar(id, starred) {
    try { await fetch(`${RFP_API}/api/rfps/${id}/star`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ starred }) }); } catch {}
  },
  async updateNotes(id, notes) {
    try { await fetch(`${RFP_API}/api/rfps/${id}/notes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }); } catch {}
  },
  async checkHealth() {
    try { const r = await fetch(`${RFP_API}/api/rfps/health`); return r.ok; } catch { return false; }
  }
};

const rfpToFrontend = (item) => ({
  id: item.id, title: item.title || "", agency: item.agency || "", campus: item.campus || "",
  system: item.system || "", rfpNumber: item.rfp_number || "", description: item.description || "",
  category: item.category || "", dueDate: item.due_date || "", postedDate: item.posted_date || "",
  status: item.status || "open", platform: item.platform || "", listingUrl: item.listing_url || "",
  contactName: item.contact_name || "", contactEmail: item.contact_email || "", contactPhone: item.contact_phone || "",
  estimatedValue: item.estimated_value || "", preBidDate: item.pre_bid_date || "",
  preBidMandatory: Boolean(item.pre_bid_mandatory), documentsUrl: item.documents_url || "",
  relevanceScore: item.relevance_score || 0, keywordMatches: item.keyword_matches || "",
  userStatus: item.user_status || "new", notes: item.notes || "",
  starred: Boolean(item.starred), addedDate: item.added_date || "",
});

// Transform API snake_case → frontend camelCase
const apiToFrontend = (item) => ({
  id: item.id,
  name: item.name || "",
  address: item.address || item.city || "",
  askPrice: item.ask_price || 0,
  grossRev: item.gross_revenue || 0,
  brokerage: item.brokerage || "Direct",
  score: item.score || 0,
  status: item.status || "new",
  notes: item.notes || "",
  addedDate: item.added_date || "",
  cocEstimate: item.coc_estimate || 0,
  starred: Boolean(item.starred),
  listingUrl: item.listing_url || "",
  description: item.description || "",
  cashFlow: item.cash_flow || 0,
  brokerName: item.broker_name || "",
  brokerPhone: item.broker_phone || "",
  brokerEmail: item.broker_email || "",
  scoreBreakdown: typeof item.score_breakdown === "string" ? JSON.parse(item.score_breakdown || "{}") : (item.score_breakdown || {}),
});

const genHistory = (base, volatility, points = 48) => {
  const d = []; let p = base;
  for (let i = 0; i < points; i++) { p += (Math.random() - 0.48) * volatility; p = Math.max(p * 0.9, p); d.push({ t: i, v: +p.toFixed(2) }); }
  return d;
};

// ─── DEFAULT DATA ───
const DEFAULT_DEALS = {
  roundNRound: { name: "Round-N-Round Coin Laundry", status: "Under Contract", address: "Bell Gardens, CA", askPrice: 440000, adjNoiLow: 7700, adjNoiHigh: 8500, equipment: "2014 Speed Queen + 20yr mix", equipRoi: "Net-positive Day 1 (100% financed)", holdPeriod: "7 years", entity: "Adams Resources LLC", verification: "Utility-verified ✓", capRateLow: 21, capRateHigh: 23, nextSteps: "Close escrow", notes: "Hub location for Bell Gardens portfolio. Equipment replacement ROI analysis complete — new machines cash flow positive from day one even at 100% financing." },
  alligator: { name: "Alligator Laundry", status: "Evaluating", address: "6020 Florence Ave, Bell Gardens", askPrice: null, projCoc: 36.5, cocThreshold: 25, model: "Add-on / Spoke site", opsPartner: "Gilbert Gevorgian", verification: "Pending — utility request needed", nextSteps: "Run utility verification", notes: "Spoke site in hub-and-spoke model. Modeled ~36.5% cash-on-cash — well above 25% threshold. Need water consumption data to verify revenue claims." },
  botbuilt: { name: "BotBuilt", status: "Launching", equitySplit: "75/25 w/ Alena Solutions", salesPartner: "Shay", verticals: "Dental, Home Services", pipeline: 12, mrrTarget: 8500, hiring: "Appointment setters", notes: "Term sheet finalized. Sales playbook, pricing framework, 6-month campaign plan complete." },
  postal: { name: "Postal Solutions Inc.", status: "Negotiating", location: "Scottsdale, AZ", seller: "Janell Soyster Buchholdt", structure: "No-money-down, 50/50 revenue split", growth: "Virtual mailbox expansion", notes: "Sits under Float Holdings LLC." },
  signalTrader: { name: "Signal Trader", status: "Paper Trading", portfolio: 10000, openSignals: 3, nextStep: "Wire live API keys", notes: "Phase 1 code-complete. News → Claude API → Alpaca pipeline. 30-60 day paper trading." },
};

const DEFAULT_SDSU = {
  rfpNumber: "7074",
  title: "SDSU Student Housing Laundry Services",
  platform: "PlanetBids",
  entity: "University Laundry Services LLC",
  entityNumber: "B20260143027",
  ein: "41-5119468",
  address: "232 El Camino Dr., Beverly Hills, CA 90212",
  website: "universitylaundryservices.com",
  opsPartner: "Gilbert Gevorgian",
  opsPartnerDetail: "Director of Operations, Lake Balboa Professional Laundry, SB# 2030987, 22+ yrs experience",
  dvbePartner: "Donell Johnson",
  dvbePercent: 5,
  preBidVisit: "March 10 — sole attendee",
  milestones: [
    { label: "Pre-Bid Site Visit", date: "Mar 10", status: "complete" },
    { label: "Entity Formation (CA SOS)", date: "Mar 2025", status: "complete" },
    { label: "Website Deployed (Netlify)", date: "Mar 2025", status: "complete" },
    { label: "Technical Proposal v11", date: "Mar 2025", status: "complete" },
    { label: "Price Proposal v5", date: "Mar 2025", status: "complete" },
    { label: "Exhibit B + C", date: "Mar 2025", status: "complete" },
    { label: "Company One-Pager", date: "Mar 2025", status: "complete" },
    { label: "Combined PDF Submitted", date: "Mar 2025", status: "complete" },
    { label: "Bid Evaluation", date: "TBD", status: "waiting" },
    { label: "Award Notification", date: "TBD", status: "waiting" },
    { label: "Contract Execution", date: "TBD", status: "pending" },
  ],
  submittedDocs: ["Technical Proposal (v11)", "Price Proposal (v5)", "Exhibit B", "Exhibit C", "Company One-Pager", "Combined PDF Package"],
  notes: "Only attendee at pre-bid site visit. Full submission package complete and submitted via PlanetBids. Gilbert Gevorgian is key ops partner across laundromat and institutional contracts.",
};

const DEFAULT_WATCHLIST = [
  { id: "w1", name: "Sparkle Clean Laundromat", address: "4521 Whittier Blvd, East LA", askPrice: 380000, grossRev: 18000, brokerage: "BizBuySell", score: 72, status: "new", notes: "", addedDate: "2026-04-03", cocEstimate: 28, starred: false, brokerName: "Mike Torres", brokerPhone: "(323) 555-0142", brokerEmail: "mtorres@bizbuysell.com" },
  { id: "w2", name: "Super Wash N Dry", address: "1890 Pacific Ave, Long Beach", askPrice: 520000, grossRev: 24000, brokerage: "BizBen", score: 65, status: "new", notes: "", addedDate: "2026-04-02", cocEstimate: 22, starred: false, brokerName: "Linda Chen", brokerPhone: "(562) 555-0198", brokerEmail: "lchen@bizben.com" },
  { id: "w3", name: "Clean Machine Laundry", address: "3344 Florence Ave, Huntington Park", askPrice: 290000, grossRev: 14500, brokerage: "LoopNet", score: 81, status: "reviewing", notes: "Close to Bell Gardens hub. Check utility data.", addedDate: "2026-03-28", cocEstimate: 34, starred: true, brokerName: "Ray Gutierrez", brokerPhone: "(323) 555-0177", brokerEmail: "ray@sunbeltnetwork.com" },
  { id: "w4", name: "Coin-Op Express", address: "7812 S Vermont Ave, South LA", askPrice: 195000, grossRev: 9800, brokerage: "BizBuySell", score: 58, status: "new", notes: "", addedDate: "2026-04-04", cocEstimate: 19, starred: false, brokerName: "James Park", brokerPhone: "(213) 555-0233", brokerEmail: "" },
  { id: "w5", name: "Fresh & Clean Laundromat", address: "2100 W Slauson Ave, LA", askPrice: 445000, grossRev: 21000, brokerage: "BizBen", score: 69, status: "new", notes: "", addedDate: "2026-04-01", cocEstimate: 24, starred: false, brokerName: "Sandra Mejia", brokerPhone: "(310) 555-0165", brokerEmail: "smejia@bizben.com" },
  { id: "w6", name: "El Pueblo Lavanderia", address: "5678 E Gage Ave, Bell Gardens", askPrice: 310000, grossRev: 16200, brokerage: "LoopNet", score: 77, status: "reviewing", notes: "Same corridor as Round-N-Round. Spoke candidate.", addedDate: "2026-03-25", cocEstimate: 31, starred: true, brokerName: "Carlos Ruiz", brokerPhone: "(562) 555-0211", brokerEmail: "cruiz@loopnet.com" },
];

const BROKERAGES = ["ALL", "BizBuySell", "BizBen", "LoopNet", "BizQuest", "Sunbelt", "Direct"];
const SCAN_STATUS = ["all", "new", "reviewing", "passed", "offer"];

const MARKETS_INIT = [
  { sym: "SPX", price: 5248.32, chg: -12.30, pct: -0.23, history: genHistory(5248, 15) },
  { sym: "VIX", price: 21.4, chg: 2.1, pct: 10.87, history: genHistory(21, 1.5) },
  { sym: "BTC", price: 68420, chg: 1250, pct: 1.86, history: genHistory(68420, 800) },
  { sym: "QQQ", price: 442.18, chg: -3.45, pct: -0.77, history: genHistory(442, 4) },
  { sym: "DXY", price: 104.32, chg: 0.18, pct: 0.17, history: genHistory(104, 0.3) },
  { sym: "TNX", price: 4.28, chg: -0.03, pct: -0.69, history: genHistory(4.28, 0.05) },
];

const NEWS_INIT = [
  { src: "BLOOMBERG", hl: "Fed Officials Signal Patience on Rate Cuts Amid Sticky Inflation", t: 2, tag: "MACRO" },
  { src: "REUTERS", hl: "US Manufacturing PMI Contracts for Third Consecutive Month", t: 8, tag: "ECON" },
  { src: "CNBC", hl: "Commercial Real Estate Distress Spreads to Mid-Market Properties", t: 14, tag: "RE" },
  { src: "WSJ", hl: "Small Business Confidence Index Falls to 18-Month Low", t: 22, tag: "SMB" },
  { src: "FT", hl: "AI Automation Startups See Record Funding in Q1 2026", t: 31, tag: "TECH" },
  { src: "POLYMARKET", hl: "72% chance Fed holds rates through June — up 4pts today", t: 35, tag: "PRED" },
  { src: "BLOOMBERG", hl: "LA County Retail Vacancy Rates Tick Down 30bps QoQ", t: 42, tag: "RE" },
  { src: "COINDESK", hl: "Bitcoin Breaks $68K Resistance, Eyes All-Time Highs", t: 55, tag: "CRYPTO" },
  { src: "WSJ", hl: "Laundromat Industry Consolidation Accelerates in 2026", t: 62, tag: "SMB" },
  { src: "REUTERS", hl: "CBOE Options Volume Hits Record as Volatility Spikes", t: 70, tag: "OPTIONS" },
];

const PREDICTIONS = [
  { q: "Fed holds rates through June 2026", yes: 72, plat: "POLY" },
  { q: "US recession by Q4 2026", yes: 34, plat: "KALSHI" },
  { q: "BTC above $80K by July", yes: 41, plat: "POLY" },
  { q: "CPI below 3% by August", yes: 28, plat: "KALSHI" },
  { q: "S&P 500 above 5500 by EOY", yes: 55, plat: "POLY" },
];

const OPTIONS_POS = [
  { strat: "Bull Put", strike: "605/589", exp: "May 15", pl: 340 },
  { strat: "Bear Put", strike: "630/620", exp: "May 15", pl: -120 },
  { strat: "Bull Call", strike: "655/660", exp: "May 15", pl: 85 },
  { strat: "Iron Cond", strike: "580/650", exp: "Jun 20", pl: null },
];

// ─── REUSABLE COMPONENTS ───
const EditField = ({ label, value, onSave, prefix = "", suffix = "", type = "text" }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  useEffect(() => { setVal(value); }, [value]);
  const save = () => { onSave(type === "number" ? parseFloat(val) || 0 : val); setEditing(false); };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: T.textSec }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editing ? (
          <>
            <input ref={ref} value={val} onChange={e => setVal(e.target.value)} type={type} onKeyDown={e => e.key === "Enter" && save()}
              style={{ background: T.bg, border: `1px solid ${T.cyan}`, color: T.text, padding: "2px 6px", borderRadius: 3, fontSize: 12, fontFamily: mono, width: 120, outline: "none" }} />
            <Check size={13} color={T.green} style={{ cursor: "pointer" }} onClick={save} />
          </>
        ) : (
          <>
            <span style={{ fontFamily: mono, fontSize: 12, color: T.text, fontWeight: 500 }}>{prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}</span>
            <Edit3 size={11} color={T.textDim} style={{ cursor: "pointer", opacity: 0.5 }} onClick={() => setEditing(true)} />
          </>
        )}
      </div>
    </div>
  );
};

const StatBox = ({ label, value, color = T.green }) => (
  <div style={{ textAlign: "center", flex: 1, padding: "8px 4px" }}>
    <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color }}>{value}</div>
  </div>
);

const QuickStat = ({ label, value, color = T.text }) => (
  <div>
    <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>{label}</div>
    <div style={{ fontFamily: mono, fontSize: 13, color, fontWeight: 600 }}>{value}</div>
  </div>
);

const Badge = ({ text, color }) => (
  <span style={{ fontFamily: mono, fontSize: 9, padding: "2px 8px", borderRadius: 3, letterSpacing: 1, background: `${color}15`, color }}>{text}</span>
);

const SectionLabel = ({ children, color = T.textDim }) => (
  <div style={{ fontFamily: mono, fontSize: 10, color, letterSpacing: 3, padding: "8px 0 4px" }}>{children}</div>
);

// ─── DEAL MODAL ───
const DealModal = ({ deal, dealKey, onClose, onUpdate }) => {
  if (!deal) return null;
  const update = (f, v) => onUpdate(dealKey, { ...deal, [f]: v });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ background: T.panel, border: `1px solid ${T.borderLight}`, borderRadius: 12, width: "90%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: 1 }}>{deal.name}</div>
            <div style={{ marginTop: 6 }}><Badge text={deal.status?.toUpperCase()} color={deal.status === "Under Contract" || deal.status === "Launching" ? T.green : T.cyan} /></div>
          </div>
          <X size={18} color={T.textSec} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: "12px 20px 20px" }}>
          {dealKey === "roundNRound" && (
            <div style={{ display: "flex", background: T.card, borderRadius: 8, marginBottom: 16, border: `1px solid ${T.border}` }}>
              <StatBox label="ASK" value={`$${(deal.askPrice/1000).toFixed(0)}K`} color={T.text} />
              <div style={{ width: 1, background: T.border }} />
              <StatBox label="ADJ NOI/MO" value={`$${deal.adjNoiLow?.toLocaleString()}–${deal.adjNoiHigh?.toLocaleString()}`} color={T.green} />
              <div style={{ width: 1, background: T.border }} />
              <StatBox label="CAP RATE" value={`${deal.capRateLow}–${deal.capRateHigh}%`} color={T.green} />
            </div>
          )}
          {dealKey === "alligator" && (
            <div style={{ display: "flex", background: T.card, borderRadius: 8, marginBottom: 16, border: `1px solid ${T.border}` }}>
              <StatBox label="PROJ CoC" value={`${deal.projCoc}%`} color={deal.projCoc >= deal.cocThreshold ? T.green : T.red} />
              <div style={{ width: 1, background: T.border }} />
              <StatBox label="THRESHOLD" value={`${deal.cocThreshold}% ✓`} color={T.green} />
              <div style={{ width: 1, background: T.border }} />
              <StatBox label="MODEL" value="SPOKE" color={T.cyan} />
            </div>
          )}
          {Object.entries(deal).filter(([k]) => !["name","status","notes"].includes(k)).map(([k, v]) => {
            if (v == null || typeof v === "object") return null;
            const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
            const isNum = typeof v === "number";
            return <EditField key={k} label={label} value={v} onSave={val => update(k, val)} type={isNum ? "number" : "text"} prefix={isNum && v > 100 ? "$" : ""} />;
          })}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 6 }}>NOTES</div>
            <textarea value={deal.notes || ""} onChange={e => update("notes", e.target.value)}
              style={{ width: "100%", minHeight: 80, background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: 10, fontSize: 12, fontFamily: mono, resize: "vertical", outline: "none", lineHeight: 1.5 }}
              onFocus={e => e.target.style.borderColor = T.cyan} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
        </div>
      </div>
    </div>
  );
};

const DealCard = ({ deal, dealKey, color, icon: Icon, onClick }) => {
  const [h, setH] = useState(false);
  const sc = deal.status === "Under Contract" || deal.status === "Launching" ? T.green : deal.status === "Evaluating" ? T.cyan : deal.status === "Negotiating" ? T.purple : T.amber;
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: h ? T.cardHover : T.card, border: `1px solid ${h ? T.borderLight : T.border}`, borderRadius: 8, padding: 14, cursor: "pointer", transition: "all 0.2s", borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={14} color={color} />
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color, letterSpacing: 0.5 }}>{deal.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge text={deal.status?.toUpperCase()} color={sc} />
          <ChevronRight size={14} color={T.textDim} style={{ transform: h ? "translateX(2px)" : "none", transition: "transform 0.2s" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {deal.askPrice && <QuickStat label="Ask" value={`$${(deal.askPrice/1000).toFixed(0)}K`} />}
        {deal.projCoc && <QuickStat label="CoC" value={`${deal.projCoc}%`} color={T.green} />}
        {deal.adjNoiLow && <QuickStat label="NOI/mo" value={`$${deal.adjNoiLow.toLocaleString()}+`} color={T.green} />}
        {deal.pipeline != null && <QuickStat label="Pipeline" value={`${deal.pipeline}`} />}
        {deal.mrrTarget != null && <QuickStat label="MRR" value={`$${deal.mrrTarget.toLocaleString()}`} />}
        {deal.structure && <QuickStat label="Deal" value={deal.structure.split(",")[0]} />}
        {deal.portfolio != null && <QuickStat label="Portfolio" value={`$${deal.portfolio.toLocaleString()}`} />}
      </div>
    </div>
  );
};

const MarketTicker = ({ market }) => {
  const isUp = market.chg >= 0; const color = isUp ? T.green : T.red;
  return (
    <div style={{ background: T.card, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: T.textSec, letterSpacing: 1 }}>{market.sym}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {isUp ? <ArrowUpRight size={11} color={color} /> : <ArrowDownRight size={11} color={color} />}
          <span style={{ fontFamily: mono, fontSize: 10, color }}>{isUp ? "+" : ""}{market.pct.toFixed(2)}%</span>
        </div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 2 }}>{market.sym === "BTC" ? `$${market.price.toLocaleString()}` : market.price.toFixed(2)}</div>
      <div style={{ height: 32 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={market.history.slice(-24)}>
            <defs><linearGradient id={`g-${market.sym}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.2}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g-${market.sym})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const NewsItem = ({ item }) => {
  const tagColor = { MACRO: T.amber, ECON: T.blue, RE: T.green, SMB: T.purple, TECH: T.cyan, PRED: T.amber, CRYPTO: "#ff9100", OPTIONS: T.red }[item.tag] || T.textSec;
  return (
    <div style={{ padding: "10px 12px", background: T.card, borderRadius: 6, borderLeft: `3px solid ${tagColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: tagColor, letterSpacing: 1 }}>{item.src}</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: T.textDim }}>{item.t}m ago</span>
      </div>
      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4 }}>{item.hl}</div>
    </div>
  );
};

const PredBar = ({ pred }) => {
  const color = pred.yes > 60 ? T.green : pred.yes > 40 ? T.amber : T.red;
  return (
    <div style={{ background: T.card, borderRadius: 6, padding: "10px 12px", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.text, marginBottom: 6, lineHeight: 1.3 }}>{pred.q}</div>
      <div style={{ height: 5, background: T.bg, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pred.yes}%`, background: color, borderRadius: 3, transition: "width 1s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10 }}>
        <span style={{ color }}>{pred.yes}% YES</span><span style={{ color: T.textDim }}>{pred.plat}</span>
      </div>
    </div>
  );
};

// ─── WATCHLIST CARD ───
const WatchlistCard = ({ listing, onUpdate, onDelete, onToggleStar }) => {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(listing.notes);
  const scoreColor = listing.score >= 75 ? T.green : listing.score >= 60 ? T.amber : T.red;
  const cocColor = listing.cocEstimate >= 25 ? T.green : listing.cocEstimate >= 20 ? T.amber : T.red;
  const statusColors = { new: T.cyan, reviewing: T.amber, passed: T.textDim, offer: T.green };
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", borderLeft: `3px solid ${scoreColor}` }}>
      <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <Star size={14} color={listing.starred ? T.amber : T.textDim} fill={listing.starred ? T.amber : "none"} style={{ cursor: "pointer", flexShrink: 0 }} onClick={e => { e.stopPropagation(); onToggleStar(); }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.name}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><MapPin size={9} /> {listing.address}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: T.text }}>${(listing.askPrice / 1000).toFixed(0)}K</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: cocColor }}>{listing.cocEstimate}% CoC est</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 36 }}>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 800, color: scoreColor }}>{listing.score}</div>
            <div style={{ fontFamily: mono, fontSize: 8, color: T.textDim, letterSpacing: 1 }}>SCORE</div>
          </div>
          <Badge text={listing.status.toUpperCase()} color={statusColors[listing.status]} />
          {expanded ? <ChevronDown size={14} color={T.textDim} /> : <ChevronRight size={14} color={T.textDim} />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 0" }}>
            <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>GROSS REV/MO</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.text }}>${listing.grossRev?.toLocaleString()}</div></div>
            <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>BROKERAGE</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.text }}>{listing.brokerage}</div></div>
            <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>ADDED</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.text }}>{listing.addedDate}</div></div>
          </div>

          {/* Broker contact card */}
          <div style={{ background: T.bg, borderRadius: 6, border: `1px solid ${T.border}`, padding: 12, marginBottom: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>BROKER CONTACT</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: T.text }}>{listing.brokerName || "—"}</div>
                {listing.brokerPhone && <div style={{ fontFamily: mono, fontSize: 11, color: T.textSec, marginTop: 2 }}>{listing.brokerPhone}</div>}
                {listing.brokerEmail && <div style={{ fontFamily: mono, fontSize: 11, color: T.textSec, marginTop: 1 }}>{listing.brokerEmail}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {listing.brokerPhone && (
                  <a href={`tel:${listing.brokerPhone.replace(/[^\d+]/g, "")}`} onClick={e => e.stopPropagation()}
                    style={{ background: `${T.green}15`, border: `1px solid ${T.green}30`, color: T.green, padding: "6px 12px", borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, textDecoration: "none", letterSpacing: 0.5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    CALL
                  </a>
                )}
                {listing.brokerPhone && (
                  <a href={`sms:${listing.brokerPhone.replace(/[^\d+]/g, "")}&body=Hi ${listing.brokerName?.split(" ")[0] || ""}, I'm interested in the listing for ${listing.name} at ${listing.address}. Is this still available? - Brandon Adams, Adams Resources LLC`} onClick={e => e.stopPropagation()}
                    style={{ background: `${T.blue}15`, border: `1px solid ${T.blue}30`, color: T.blue, padding: "6px 12px", borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, textDecoration: "none", letterSpacing: 0.5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    TEXT
                  </a>
                )}
                {listing.brokerEmail && (
                  <a href={`mailto:${listing.brokerEmail}?subject=Inquiry: ${listing.name}&body=Hi ${listing.brokerName?.split(" ")[0] || ""},${encodeURIComponent("\n\n")}I'm writing to inquire about the listing for ${listing.name} at ${listing.address} (asking $${(listing.askPrice/1000).toFixed(0)}K).${encodeURIComponent("\n\n")}Could you please share the financials, lease details, and equipment inventory?${encodeURIComponent("\n\n")}Best,${encodeURIComponent("\n")}Brandon Adams${encodeURIComponent("\n")}Adams Resources LLC${encodeURIComponent("\n")}(Managing Member)`} onClick={e => e.stopPropagation()}
                    style={{ background: `${T.cyan}15`, border: `1px solid ${T.cyan}30`, color: T.cyan, padding: "6px 12px", borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, textDecoration: "none", letterSpacing: 0.5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    EMAIL
                  </a>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["new", "reviewing", "passed", "offer"].map(s => (
              <button key={s} onClick={() => onUpdate({ ...listing, status: s })}
                style={{ background: listing.status === s ? `${statusColors[s]}20` : "transparent", border: `1px solid ${listing.status === s ? statusColors[s] : T.border}`, color: listing.status === s ? statusColors[s] : T.textDim, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>{s}</button>
            ))}
          </div>
          <EditField label="Ask Price" value={listing.askPrice} onSave={v => onUpdate({ ...listing, askPrice: v })} prefix="$" type="number" />
          <EditField label="Gross Rev/mo" value={listing.grossRev} onSave={v => onUpdate({ ...listing, grossRev: v })} prefix="$" type="number" />
          <EditField label="CoC Estimate %" value={listing.cocEstimate} onSave={v => onUpdate({ ...listing, cocEstimate: v })} suffix="%" type="number" />
          <EditField label="Deal Score" value={listing.score} onSave={v => onUpdate({ ...listing, score: v })} type="number" />
          <EditField label="Broker Name" value={listing.brokerName || ""} onSave={v => onUpdate({ ...listing, brokerName: v })} />
          <EditField label="Broker Phone" value={listing.brokerPhone || ""} onSave={v => onUpdate({ ...listing, brokerPhone: v })} />
          <EditField label="Broker Email" value={listing.brokerEmail || ""} onSave={v => onUpdate({ ...listing, brokerEmail: v })} />
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 4 }}>NOTES</div>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); onUpdate({ ...listing, notes: e.target.value }); }} placeholder="Add deal notes, utility data findings..."
              style={{ width: "100%", minHeight: 60, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, padding: 8, fontSize: 11, fontFamily: mono, resize: "vertical", outline: "none" }}
              onFocus={e => e.target.style.borderColor = T.cyan} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            {listing.listingUrl && (
              <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ background: "transparent", border: `1px solid ${T.cyan}30`, color: T.cyan, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 10, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                <ExternalLink size={11} /> View Listing
              </a>
            )}
            <button onClick={() => onDelete(listing.id)} style={{ background: "transparent", border: `1px solid ${T.red}30`, color: T.red, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}><Trash2 size={11} /> Remove</button>
          </div>
          {/* Score breakdown if available */}
          {listing.scoreBreakdown && Object.keys(listing.scoreBreakdown).length > 0 && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: T.bg, borderRadius: 4, border: `1px solid ${T.border}` }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>SCORE BREAKDOWN</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(listing.scoreBreakdown).map(([k, v]) => (
                  <div key={k} style={{ fontFamily: mono, fontSize: 10 }}>
                    <span style={{ color: T.textSec }}>{k}: </span>
                    <span style={{ color: v > 7 ? T.green : v > 4 ? T.amber : T.red, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AddListingForm = ({ onAdd, onCancel }) => {
  const [form, setForm] = useState({ name: "", address: "", askPrice: "", grossRev: "", brokerage: "BizBuySell", cocEstimate: "", score: "", brokerName: "", brokerPhone: "", brokerEmail: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const submit = () => { if (!form.name || !form.askPrice) return; onAdd({ id: `w${Date.now()}`, name: form.name, address: form.address, askPrice: parseFloat(form.askPrice) || 0, grossRev: parseFloat(form.grossRev) || 0, brokerage: form.brokerage, score: parseInt(form.score) || 50, status: "new", notes: "", addedDate: new Date().toISOString().split("T")[0], cocEstimate: parseFloat(form.cocEstimate) || 0, starred: false, brokerName: form.brokerName, brokerPhone: form.brokerPhone, brokerEmail: form.brokerEmail }); };
  const inputStyle = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12, fontFamily: mono, width: "100%", outline: "none" };
  return (
    <div style={{ background: T.card, border: `1px solid ${T.cyan}40`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: T.cyan, letterSpacing: 1, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><Plus size={13} /> ADD NEW LISTING</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "1 / -1" }}><input placeholder="Business Name *" value={form.name} onChange={e => set("name", e.target.value)} style={inputStyle} /></div>
        <div style={{ gridColumn: "1 / -1" }}><input placeholder="Address" value={form.address} onChange={e => set("address", e.target.value)} style={inputStyle} /></div>
        <input placeholder="Ask Price *" value={form.askPrice} onChange={e => set("askPrice", e.target.value)} type="number" style={inputStyle} />
        <input placeholder="Gross Rev/mo" value={form.grossRev} onChange={e => set("grossRev", e.target.value)} type="number" style={inputStyle} />
        <input placeholder="CoC Estimate %" value={form.cocEstimate} onChange={e => set("cocEstimate", e.target.value)} type="number" style={inputStyle} />
        <input placeholder="Deal Score (0-100)" value={form.score} onChange={e => set("score", e.target.value)} type="number" style={inputStyle} />
        <select value={form.brokerage} onChange={e => set("brokerage", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>{BROKERAGES.filter(b => b !== "ALL").map(b => <option key={b} value={b}>{b}</option>)}</select>
        <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4 }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>BROKER CONTACT</div>
        </div>
        <input placeholder="Broker Name" value={form.brokerName} onChange={e => set("brokerName", e.target.value)} style={inputStyle} />
        <input placeholder="Broker Phone" value={form.brokerPhone} onChange={e => set("brokerPhone", e.target.value)} style={inputStyle} />
        <div style={{ gridColumn: "1 / -1" }}><input placeholder="Broker Email" value={form.brokerEmail} onChange={e => set("brokerEmail", e.target.value)} style={inputStyle} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textSec, padding: "6px 16px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 11 }}>Cancel</button>
        <button onClick={submit} style={{ background: T.cyan, border: "none", color: T.bg, padding: "6px 16px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 600 }}>Add Listing</button>
      </div>
    </div>
  );
};

// ─── RFP CARD ───
const RFP_STATUSES = ["new", "reviewing", "bidding", "submitted", "won", "lost", "passed"];
const RFP_STATUS_COLORS = { new: T.cyan, reviewing: T.amber, bidding: T.blue, submitted: T.green, won: T.green, lost: T.red, passed: T.textDim };
const RFP_SYSTEMS = ["ALL", "CSU", "UC", "State", "Other"];
const RFP_CATEGORIES = ["all", "laundry", "vending", "facilities", "mixed"];

const RFPCard = ({ rfp, onUpdateStatus, onToggleStar, onUpdateNotes }) => {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(rfp.notes || "");
  const scoreColor = rfp.relevanceScore >= 70 ? T.green : rfp.relevanceScore >= 40 ? T.amber : T.red;
  const catColors = { laundry: T.green, vending: T.blue, facilities: T.purple, mixed: T.amber };
  const isDueSoon = rfp.dueDate && (() => { try { return new Date(rfp.dueDate) - new Date() < 7 * 86400000 && new Date(rfp.dueDate) > new Date(); } catch { return false; } })();

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", borderLeft: `3px solid ${scoreColor}` }}>
      <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <Star size={14} color={rfp.starred ? T.amber : T.textDim} fill={rfp.starred ? T.amber : "none"} style={{ cursor: "pointer", flexShrink: 0 }} onClick={e => { e.stopPropagation(); onToggleStar(rfp.id); }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{rfp.title || rfp.rfpNumber}</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec, display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span>{rfp.agency || rfp.campus}</span>
              {rfp.platform && <span style={{ color: T.textDim }}>via {rfp.platform}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {rfp.dueDate && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>DUE</div>
              <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: isDueSoon ? T.red : T.text }}>{rfp.dueDate}</div>
            </div>
          )}
          <div style={{ textAlign: "center", minWidth: 36 }}>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 800, color: scoreColor }}>{rfp.relevanceScore}</div>
            <div style={{ fontFamily: mono, fontSize: 8, color: T.textDim, letterSpacing: 1 }}>REL</div>
          </div>
          {rfp.category && <Badge text={rfp.category.toUpperCase()} color={catColors[rfp.category] || T.textSec} />}
          <Badge text={rfp.userStatus.toUpperCase()} color={RFP_STATUS_COLORS[rfp.userStatus] || T.textDim} />
          {expanded ? <ChevronDown size={14} color={T.textDim} /> : <ChevronRight size={14} color={T.textDim} />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 0" }}>
            {rfp.system && <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>SYSTEM</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.text }}>{rfp.system}</div></div>}
            {rfp.rfpNumber && <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>RFP #</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.text }}>{rfp.rfpNumber}</div></div>}
            {rfp.estimatedValue && <div><div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>EST VALUE</div><div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: T.green }}>{rfp.estimatedValue}</div></div>}
          </div>
          {rfp.preBidDate && (
            <div style={{ padding: "6px 10px", background: rfp.preBidMandatory ? `${T.red}10` : T.bg, borderRadius: 4, border: `1px solid ${rfp.preBidMandatory ? T.red : T.border}`, marginBottom: 8, fontFamily: mono, fontSize: 11 }}>
              <span style={{ color: rfp.preBidMandatory ? T.red : T.textSec }}>Pre-Bid: {rfp.preBidDate} {rfp.preBidMandatory ? "— MANDATORY" : ""}</span>
            </div>
          )}
          {rfp.keywordMatches && (
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, marginBottom: 8 }}>
              Matched: <span style={{ color: T.green }}>{rfp.keywordMatches}</span>
            </div>
          )}
          {/* Contact */}
          {(rfp.contactName || rfp.contactEmail || rfp.contactPhone) && (
            <div style={{ background: T.bg, borderRadius: 6, border: `1px solid ${T.border}`, padding: 10, marginBottom: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 6 }}>CONTACT</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  {rfp.contactName && <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: T.text }}>{rfp.contactName}</div>}
                  {rfp.contactPhone && <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec }}>{rfp.contactPhone}</div>}
                  {rfp.contactEmail && <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec }}>{rfp.contactEmail}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {rfp.contactEmail && (
                    <a href={`mailto:${rfp.contactEmail}?subject=Inquiry: RFP ${rfp.rfpNumber || rfp.title}&body=Hello ${rfp.contactName?.split(" ")[0] || ""},${encodeURIComponent("\n\n")}I'm writing on behalf of University Laundry Services LLC to inquire about RFP ${rfp.rfpNumber || ""} — ${rfp.title}.${encodeURIComponent("\n\n")}Could you share the full bid documents and any addenda?${encodeURIComponent("\n\n")}Best,${encodeURIComponent("\n")}Brandon Adams${encodeURIComponent("\n")}University Laundry Services LLC`}
                      onClick={e => e.stopPropagation()} style={{ background: `${T.cyan}15`, border: `1px solid ${T.cyan}30`, color: T.cyan, padding: "5px 10px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      EMAIL
                    </a>
                  )}
                  {rfp.contactPhone && (
                    <a href={`tel:${rfp.contactPhone.replace(/[^\d+]/g, "")}`} onClick={e => e.stopPropagation()}
                      style={{ background: `${T.green}15`, border: `1px solid ${T.green}30`, color: T.green, padding: "5px 10px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                      CALL
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Status pipeline */}
          <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
            {RFP_STATUSES.map(s => (
              <button key={s} onClick={() => onUpdateStatus(rfp.id, s)}
                style={{ background: rfp.userStatus === s ? `${RFP_STATUS_COLORS[s]}20` : "transparent", border: `1px solid ${rfp.userStatus === s ? RFP_STATUS_COLORS[s] : T.border}`, color: rfp.userStatus === s ? RFP_STATUS_COLORS[s] : T.textDim, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>{s}</button>
            ))}
          </div>
          {/* Notes */}
          <textarea value={notes} onChange={e => { setNotes(e.target.value); onUpdateNotes(rfp.id, e.target.value); }} placeholder="Bid strategy, notes..."
            style={{ width: "100%", minHeight: 50, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, padding: 8, fontSize: 11, fontFamily: mono, resize: "vertical", outline: "none" }}
            onFocus={e => e.target.style.borderColor = T.cyan} onBlur={e => e.target.style.borderColor = T.border} />
          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {rfp.listingUrl && (
              <a href={rfp.listingUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ background: `${T.cyan}15`, border: `1px solid ${T.cyan}30`, color: T.cyan, padding: "5px 12px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                <ExternalLink size={11} /> View RFP
              </a>
            )}
            {rfp.documentsUrl && (
              <a href={rfp.documentsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ background: `${T.blue}15`, border: `1px solid ${T.blue}30`, color: T.blue, padding: "5px 12px", borderRadius: 4, fontFamily: mono, fontSize: 10, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                <FileText size={11} /> Documents
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════
// ─── MAIN APP ───
// ═══════════════════════════
export function Dashboard() {
  const [deals, setDeals] = useState(DEFAULT_DEALS);
  const [markets, setMarkets] = useState(MARKETS_INIT);
  const [activeModal, setActiveModal] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [time, setTime] = useState(new Date());
  const [vix, setVix] = useState(21.4);
  const [newsFilter, setNewsFilter] = useState("ALL");
  const [sdsu, setSdsu] = useState(DEFAULT_SDSU);
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [wlFilter, setWlFilter] = useState("all");
  const [wlBrokerage, setWlBrokerage] = useState("ALL");
  const [wlSort, setWlSort] = useState("score");
  const [showAddForm, setShowAddForm] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [scanResult, setScanResult] = useState(null);

  // RFP state
  const [rfps, setRfps] = useState([]);
  const [rfpApiConnected, setRfpApiConnected] = useState(false);
  const [rfpFilter, setRfpFilter] = useState("all");
  const [rfpSystem, setRfpSystem] = useState("ALL");
  const [rfpCategory, setRfpCategory] = useState("all");
  const [rfpSort, setRfpSort] = useState("relevance_score");
  const [rfpScanActive, setRfpScanActive] = useState(false);
  const [rfpScanResult, setRfpScanResult] = useState(null);
  const [sdsuSubTab, setSdsuSubTab] = useState("sdsu"); // "sdsu" or "rfps"

  // Load persisted data + check API health
  useEffect(() => { (async () => {
    const [sd, ss, sw] = await Promise.all([loadData("everrock-deals", null), loadData("everrock-sdsu", null), loadData("everrock-watchlist", null)]);
    if (sd) setDeals(sd); if (ss) setSdsu(ss); if (sw) setWatchlist(sw);

    // Check if scanner API is live
    const alive = await api.checkHealth();
    setApiConnected(alive);
    if (alive) {
      const listings = await api.fetchListings();
      if (listings && listings.length > 0) setWatchlist(listings);
      const stats = await api.fetchStats();
      if (stats?.last_scan) setLastScan(stats.last_scan);
    }

    // Check RFP API
    const rfpAlive = await rfpApi.checkHealth();
    setRfpApiConnected(rfpAlive);
    if (rfpAlive) {
      const rfpData = await rfpApi.fetchRFPs();
      if (rfpData && rfpData.length > 0) setRfps(rfpData);
    }
  })(); }, []);

  // Persist deals + sdsu locally (not watchlist when API is connected)
  useEffect(() => { saveData("everrock-deals", deals); }, [deals]);
  useEffect(() => { saveData("everrock-sdsu", sdsu); }, [sdsu]);
  useEffect(() => { if (!apiConnected) saveData("everrock-watchlist", watchlist); }, [watchlist, apiConnected]);

  useEffect(() => { const i = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { const i = setInterval(() => {
    setMarkets(prev => prev.map(m => { const d = (Math.random() - 0.48) * (m.sym === "BTC" ? 200 : m.sym === "VIX" ? 0.3 : 2); const np = +(m.price + d).toFixed(2); const nc = +(m.chg + d).toFixed(2); const npct = +((nc / (m.price - m.chg)) * 100).toFixed(2); return { ...m, price: np, chg: nc, pct: npct, history: [...m.history.slice(1), { t: m.history.length, v: np }] }; }));
    setVix(v => +(v + (Math.random() - 0.5) * 0.4).toFixed(1));
  }, 4000); return () => clearInterval(i); }, []);

  // Poll API for health every 30s
  useEffect(() => {
    const i = setInterval(async () => {
      const alive = await api.checkHealth();
      setApiConnected(alive);
    }, 30000);
    return () => clearInterval(i);
  }, []);

  // Auto-refresh watchlist from API every 60s when connected
  useEffect(() => {
    if (!apiConnected) return;
    const i = setInterval(async () => {
      const listings = await api.fetchListings();
      if (listings) setWatchlist(listings);
    }, 60000);
    return () => clearInterval(i);
  }, [apiConnected]);

  // Poll RFP API health every 30s
  useEffect(() => {
    const i = setInterval(async () => { setRfpApiConnected(await rfpApi.checkHealth()); }, 30000);
    return () => clearInterval(i);
  }, []);

  // Auto-refresh RFPs every 60s when connected
  useEffect(() => {
    if (!rfpApiConnected) return;
    const i = setInterval(async () => {
      const data = await rfpApi.fetchRFPs();
      if (data) setRfps(data);
    }, 60000);
    return () => clearInterval(i);
  }, [rfpApiConnected]);

  // ─── SCAN: hit live API or fallback to simulated ───
  const runScan = async () => {
    setScanActive(true);
    setScanResult(null);

    if (apiConnected) {
      const result = await api.triggerScan();
      if (result) {
        setScanResult({ newCount: result.new_listings, success: true });
        // Refresh listings from API
        const listings = await api.fetchListings();
        if (listings) setWatchlist(listings);
        const stats = await api.fetchStats();
        if (stats?.last_scan) setLastScan(stats.last_scan);
      } else {
        setScanResult({ newCount: 0, success: false, error: "Scan request failed" });
      }
    } else {
      // Fallback: simulated scan when API is offline
      await new Promise(r => setTimeout(r, 2500));
      const names = ["Quick Spin Laundry", "Bubble Zone Wash", "LA Fresh Laundromat", "Suds & Spin", "Metro Wash House", "Valley Clean Wash", "Rinse Cycle LA", "SoCal Suds"];
      const addrs = ["1234 Atlantic Blvd, Maywood", "8901 S Central Ave, LA", "5555 Firestone Blvd, South Gate", "2222 E Florence Ave, Walnut Park", "7777 Pacific Blvd, Huntington Park", "3456 Rosecrans Ave, Compton", "6789 Slauson Ave, LA", "4321 Telegraph Rd, Commerce"];
      const idx = Math.floor(Math.random() * names.length);
      const newListing = { id: `w${Date.now()}`, name: names[idx], address: addrs[idx], askPrice: Math.round((200 + Math.random() * 400) * 1000), grossRev: Math.round((8 + Math.random() * 18) * 1000), brokerage: BROKERAGES[1 + Math.floor(Math.random() * (BROKERAGES.length - 2))], score: Math.round(40 + Math.random() * 50), status: "new", notes: "", addedDate: new Date().toISOString().split("T")[0], cocEstimate: Math.round(15 + Math.random() * 25), starred: false };
      setWatchlist(prev => [newListing, ...prev]);
      setScanResult({ newCount: 1, success: true, simulated: true });
    }
    setScanActive(false);
    // Clear scan result toast after 5s
    setTimeout(() => setScanResult(null), 5000);
  };

  const updateDeal = (key, data) => setDeals(prev => ({ ...prev, [key]: data }));

  // ─── Watchlist CRUD: sync to API when connected ───
  const updateWl = (updated) => {
    setWatchlist(prev => prev.map(w => w.id === updated.id ? updated : w));
    if (apiConnected) {
      // Sync changed fields to API
      api.updateStatus(updated.id, updated.status);
      api.updateNotes(updated.id, updated.notes);
    }
  };

  const deleteWl = (id) => {
    setWatchlist(prev => prev.filter(w => w.id !== id));
    if (apiConnected) api.deleteListing(id);
  };

  const toggleStar = (id) => {
    setWatchlist(prev => prev.map(w => {
      if (w.id === id) {
        const newStarred = !w.starred;
        if (apiConnected) api.updateStar(id, newStarred);
        return { ...w, starred: newStarred };
      }
      return w;
    }));
  };

  // ─── RFP handlers ───
  const runRfpScan = async () => {
    setRfpScanActive(true);
    setRfpScanResult(null);
    if (rfpApiConnected) {
      const result = await rfpApi.triggerScan();
      if (result) {
        setRfpScanResult({ newCount: result.new_rfps, success: true });
        const data = await rfpApi.fetchRFPs();
        if (data) setRfps(data);
      } else {
        setRfpScanResult({ success: false, error: "Scan failed" });
      }
    } else {
      setRfpScanResult({ success: false, error: "RFP API offline" });
    }
    setRfpScanActive(false);
    setTimeout(() => setRfpScanResult(null), 5000);
  };

  const updateRfpStatus = (id, status) => {
    setRfps(prev => prev.map(r => r.id === id ? { ...r, userStatus: status } : r));
    if (rfpApiConnected) rfpApi.updateStatus(id, status);
  };

  const toggleRfpStar = (id) => {
    setRfps(prev => prev.map(r => {
      if (r.id === id) {
        const ns = !r.starred;
        if (rfpApiConnected) rfpApi.updateStar(id, ns);
        return { ...r, starred: ns };
      }
      return r;
    }));
  };

  const updateRfpNotes = (id, notes) => {
    setRfps(prev => prev.map(r => r.id === id ? { ...r, notes } : r));
    if (rfpApiConnected) rfpApi.updateNotes(id, notes);
  };

  const filteredRfps = rfps
    .filter(r => rfpFilter === "all" || r.userStatus === rfpFilter)
    .filter(r => rfpSystem === "ALL" || r.system === rfpSystem)
    .filter(r => rfpCategory === "all" || r.category === rfpCategory)
    .sort((a, b) => rfpSort === "relevance_score" ? b.relevanceScore - a.relevanceScore : rfpSort === "due_date" ? (a.dueDate || "z").localeCompare(b.dueDate || "z") : b.addedDate.localeCompare(a.addedDate));

  const filteredWl = watchlist.filter(w => wlFilter === "all" || w.status === wlFilter).filter(w => wlBrokerage === "ALL" || w.brokerage === wlBrokerage)
    .sort((a, b) => wlSort === "score" ? b.score - a.score : wlSort === "price" ? a.askPrice - b.askPrice : wlSort === "coc" ? b.cocEstimate - a.cocEstimate : b.addedDate.localeCompare(a.addedDate));

  const tabs = [
    { id: "overview", label: "OVERVIEW", icon: Layers },
    { id: "deals", label: "DEALS", icon: Building2 },
    { id: "watchlist", label: "SCANNER", icon: Search },
    { id: "sdsu", label: "CONTRACTS", icon: FileText },
    { id: "markets", label: "MARKETS", icon: BarChart3 },
    { id: "news", label: "NEWS", icon: Globe },
  ];

  const filteredNews = newsFilter === "ALL" ? NEWS_INIT : NEWS_INIT.filter(n => n.tag === newsFilter);
  const vixColor = vix > 25 ? T.red : vix > 20 ? T.amber : T.green;

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'Outfit', 'Helvetica Neue', sans-serif", color: T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${T.bg}; } ::-webkit-scrollbar-thumb { background: ${T.borderLight}; border-radius: 2px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes livePulse { 0%,100%{opacity:1;box-shadow:0 0 6px ${T.green}}50%{opacity:0.5;box-shadow:0 0 2px ${T.green}} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
      `}</style>

      {/* HEADER */}
      <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: `1px solid ${T.border}`, background: `linear-gradient(180deg, ${T.panel} 0%, ${T.bg} 100%)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "livePulse 2s ease-in-out infinite" }} />
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, letterSpacing: 4, color: T.cyan }}>EVERROCK</span>
          <span style={{ fontFamily: mono, fontWeight: 400, fontSize: 13, letterSpacing: 4, color: T.textDim }}>COMMAND</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ background: activeTab === tab.id ? T.card : "transparent", border: `1px solid ${activeTab === tab.id ? T.borderLight : "transparent"}`, color: activeTab === tab.id ? T.text : T.textSec, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: mono, fontSize: 9, letterSpacing: 1.2, display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s" }}>
                <tab.icon size={11} /> {tab.label}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: mono, fontSize: 12, color: T.textSec, whiteSpace: "nowrap" }}>
            {time.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            <span style={{ color: T.green, fontWeight: 600, marginLeft: 8 }}>{time.toLocaleTimeString("en-US", { hour12: false })}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, height: "calc(100vh - 52px)", overflow: "auto" }}>

        {/* ═══ OVERVIEW ═══ */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, animation: "fadeUp 0.4s ease" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>{markets.map(m => <MarketTicker key={m.sym} market={m} />)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SectionLabel>ACTIVE DEALS</SectionLabel>
              <DealCard deal={deals.roundNRound} dealKey="roundNRound" color={T.amber} icon={Building2} onClick={() => setActiveModal("roundNRound")} />
              <DealCard deal={deals.alligator} dealKey="alligator" color={T.cyan} icon={Building2} onClick={() => setActiveModal("alligator")} />
              <DealCard deal={deals.botbuilt} dealKey="botbuilt" color={T.blue} icon={Zap} onClick={() => setActiveModal("botbuilt")} />
              <DealCard deal={deals.postal} dealKey="postal" color={T.purple} icon={Globe} onClick={() => setActiveModal("postal")} />
              <DealCard deal={deals.signalTrader} dealKey="signalTrader" color={T.green} icon={Activity} onClick={() => setActiveModal("signalTrader")} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SectionLabel>VIX & OPTIONS</SectionLabel>
              <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 20, textAlign: "center" }}>
                <div style={{ fontFamily: mono, fontSize: 52, fontWeight: 800, color: vixColor, lineHeight: 1, textShadow: `0 0 30px ${vixColor}40` }}>{vix}</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 3, marginTop: 6 }}>CBOE VOLATILITY INDEX</div>
              </div>
              <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>XSP POSITIONS</div>
                {OPTIONS_POS.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr 0.8fr", padding: "6px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none", fontFamily: mono, fontSize: 11 }}>
                    <span style={{ color: p.pl > 0 ? T.green : p.pl < 0 ? T.red : T.textDim }}>{p.strat}</span><span style={{ color: T.textSec }}>{p.strike}</span><span style={{ color: T.textSec }}>{p.exp}</span>
                    <span style={{ textAlign: "right", color: p.pl > 0 ? T.green : p.pl < 0 ? T.red : T.textDim }}>{p.pl != null ? `${p.pl > 0 ? "+" : ""}$${p.pl}` : "PEND"}</span>
                  </div>
                ))}
              </div>
              <SectionLabel>PREDICTIONS</SectionLabel>
              {PREDICTIONS.slice(0, 3).map((p, i) => <PredBar key={i} pred={p} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>NEWS FEED</SectionLabel>
              {filteredNews.map((n, i) => <NewsItem key={i} item={n} />)}
            </div>
          </div>
        )}

        {/* ═══ DEALS ═══ */}
        {activeTab === "deals" && (
          <div style={{ maxWidth: 800, margin: "0 auto", animation: "fadeUp 0.4s ease" }}>
            <SectionLabel>ALL DEALS — CLICK TO EXPAND & EDIT</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <SectionLabel color={T.amber}>LAUNDROMAT PORTFOLIO — BELL GARDENS</SectionLabel>
              <DealCard deal={deals.roundNRound} dealKey="roundNRound" color={T.amber} icon={Building2} onClick={() => setActiveModal("roundNRound")} />
              <DealCard deal={deals.alligator} dealKey="alligator" color={T.cyan} icon={Building2} onClick={() => setActiveModal("alligator")} />
              <SectionLabel color={T.blue}>FLOAT HOLDINGS — OTHER VENTURES</SectionLabel>
              <DealCard deal={deals.botbuilt} dealKey="botbuilt" color={T.blue} icon={Zap} onClick={() => setActiveModal("botbuilt")} />
              <DealCard deal={deals.postal} dealKey="postal" color={T.purple} icon={Globe} onClick={() => setActiveModal("postal")} />
              <DealCard deal={deals.signalTrader} dealKey="signalTrader" color={T.green} icon={Activity} onClick={() => setActiveModal("signalTrader")} />
            </div>
          </div>
        )}

        {/* ═══ SCANNER ═══ */}
        {activeTab === "watchlist" && (
          <div style={{ maxWidth: 900, margin: "0 auto", animation: "fadeUp 0.4s ease" }}>
            {/* Scan result toast */}
            {scanResult && (
              <div style={{ marginBottom: 12, padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 11,
                background: scanResult.success ? T.greenGlow : T.redGlow,
                border: `1px solid ${scanResult.success ? T.green : T.red}30`,
                color: scanResult.success ? T.green : T.red,
                animation: "fadeUp 0.3s ease" }}>
                {scanResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                {scanResult.success
                  ? `Scan complete — ${scanResult.newCount} new listing${scanResult.newCount !== 1 ? "s" : ""} found${scanResult.simulated ? " (simulated)" : ""}`
                  : scanResult.error || "Scan failed"}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: 1 }}>LAUNDROMAT ACQUISITION SCANNER</span>
                  {/* API connection indicator */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4,
                    background: apiConnected ? T.greenGlow : `${T.red}10`,
                    border: `1px solid ${apiConnected ? T.green : T.red}30` }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: apiConnected ? T.green : T.red,
                      boxShadow: `0 0 6px ${apiConnected ? T.green : T.red}`,
                      animation: apiConnected ? "livePulse 2s ease-in-out infinite" : "none" }} />
                    <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color: apiConnected ? T.green : T.red }}>
                      {apiConnected ? "API LIVE" : "OFFLINE"}
                    </span>
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec, marginTop: 4, display: "flex", gap: 12 }}>
                  <span>Scanning BizBuySell · BizBen · LoopNet · BizQuest · Sunbelt · Direct</span>
                  {lastScan && <span style={{ color: T.textDim }}>Last scan: {new Date(lastScan).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              </div>
              <button onClick={runScan} disabled={scanActive}
                style={{ background: scanActive ? T.card : T.cyan, border: "none", color: scanActive ? T.textSec : T.bg, padding: "8px 20px", borderRadius: 6, cursor: scanActive ? "default" : "pointer", fontFamily: mono, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, letterSpacing: 1 }}>
                <RefreshCw size={13} style={scanActive ? { animation: "spin 1s linear infinite" } : {}} />
                {scanActive ? (apiConnected ? "SCANNING BROKERAGES..." : "SCANNING...") : "SCAN NOW"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[{ v: watchlist.length, l: "TOTAL", c: T.text }, { v: watchlist.filter(w => w.starred).length, l: "STARRED", c: T.amber }, { v: watchlist.filter(w => w.cocEstimate >= 25).length, l: "≥25% CoC", c: T.green }, { v: watchlist.filter(w => w.status === "new").length, l: "NEW", c: T.cyan }].map((s, i) => (
                <div key={i} style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 14, textAlign: "center" }}>
                  <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {SCAN_STATUS.map(s => <button key={s} onClick={() => setWlFilter(s)} style={{ background: wlFilter === s ? T.borderLight : "transparent", border: "none", color: wlFilter === s ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>{s}</button>)}
                <span style={{ color: T.textDim, padding: "4px 2px" }}>|</span>
                {BROKERAGES.map(b => <button key={b} onClick={() => setWlBrokerage(b)} style={{ background: wlBrokerage === b ? T.borderLight : "transparent", border: "none", color: wlBrokerage === b ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{b}</button>)}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: T.textDim }}>SORT:</span>
                {[{ id: "score", l: "SCORE" }, { id: "coc", l: "CoC" }, { id: "price", l: "PRICE" }, { id: "date", l: "DATE" }].map(s => <button key={s.id} onClick={() => setWlSort(s.id)} style={{ background: wlSort === s.id ? T.borderLight : "transparent", border: "none", color: wlSort === s.id ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{s.l}</button>)}
                <button onClick={() => setShowAddForm(true)} style={{ background: T.green, border: "none", color: T.bg, padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}><Plus size={12} /> ADD</button>
              </div>
            </div>
            {showAddForm && <AddListingForm onAdd={l => { setWatchlist(p => [l, ...p]); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredWl.map(w => <WatchlistCard key={w.id} listing={w} onUpdate={updateWl} onDelete={deleteWl} onToggleStar={() => toggleStar(w.id)} />)}
              {filteredWl.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.textDim, fontFamily: mono, fontSize: 12 }}>No listings match current filters</div>}
            </div>
          </div>
        )}

        {/* ═══ CONTRACTS ═══ */}
        {activeTab === "sdsu" && (
          <div style={{ maxWidth: 900, margin: "0 auto", animation: "fadeUp 0.4s ease" }}>
            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              <button onClick={() => setSdsuSubTab("sdsu")}
                style={{ background: sdsuSubTab === "sdsu" ? T.card : "transparent", border: `1px solid ${sdsuSubTab === "sdsu" ? T.borderLight : "transparent"}`, color: sdsuSubTab === "sdsu" ? T.text : T.textSec, padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontFamily: mono, fontSize: 11, letterSpacing: 1.5, fontWeight: sdsuSubTab === "sdsu" ? 600 : 400 }}>
                SDSU RFP 7074
              </button>
              <button onClick={() => setSdsuSubTab("rfps")}
                style={{ background: sdsuSubTab === "rfps" ? T.card : "transparent", border: `1px solid ${sdsuSubTab === "rfps" ? T.borderLight : "transparent"}`, color: sdsuSubTab === "rfps" ? T.text : T.textSec, padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontFamily: mono, fontSize: 11, letterSpacing: 1.5, fontWeight: sdsuSubTab === "rfps" ? 600 : 400, display: "flex", alignItems: "center", gap: 6 }}>
                RFP SCANNER
                {rfps.filter(r => r.userStatus === "new").length > 0 && (
                  <span style={{ background: T.cyan, color: T.bg, borderRadius: 10, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{rfps.filter(r => r.userStatus === "new").length}</span>
                )}
              </button>
            </div>

            {/* ─── SDSU Sub-tab ─── */}
            {sdsuSubTab === "sdsu" && (
              <div style={{ maxWidth: 800 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: 1 }}>RFP {sdsu.rfpNumber} — SDSU STUDENT HOUSING LAUNDRY</div>
                    <div style={{ fontFamily: mono, fontSize: 11, color: T.textSec, marginTop: 4 }}>Platform: {sdsu.platform} &nbsp;|&nbsp; Entity: {sdsu.entity}</div>
                  </div>
                  <Badge text="SUBMITTED" color={T.green} />
                </div>
                <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 10 }}>ENTITY DETAILS</div>
                  <EditField label="Entity" value={sdsu.entity} onSave={v => setSdsu(p => ({ ...p, entity: v }))} />
                  <EditField label="CA SOS #" value={sdsu.entityNumber} onSave={v => setSdsu(p => ({ ...p, entityNumber: v }))} />
                  <EditField label="EIN" value={sdsu.ein} onSave={v => setSdsu(p => ({ ...p, ein: v }))} />
                  <EditField label="Address" value={sdsu.address} onSave={v => setSdsu(p => ({ ...p, address: v }))} />
                  <EditField label="Website" value={sdsu.website} onSave={v => setSdsu(p => ({ ...p, website: v }))} />
                  <EditField label="Ops Partner" value={sdsu.opsPartner} onSave={v => setSdsu(p => ({ ...p, opsPartner: v }))} />
                  <EditField label="Ops Detail" value={sdsu.opsPartnerDetail} onSave={v => setSdsu(p => ({ ...p, opsPartnerDetail: v }))} />
                  <EditField label="DVBE Partner" value={sdsu.dvbePartner} onSave={v => setSdsu(p => ({ ...p, dvbePartner: v }))} />
                  <EditField label="DVBE %" value={sdsu.dvbePercent} onSave={v => setSdsu(p => ({ ...p, dvbePercent: v }))} suffix="%" type="number" />
                  <EditField label="Pre-Bid Visit" value={sdsu.preBidVisit} onSave={v => setSdsu(p => ({ ...p, preBidVisit: v }))} />
                </div>
                <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 14 }}>BID TIMELINE</div>
                  {sdsu.milestones.map((m, i) => {
                    const color = m.status === "complete" ? T.green : m.status === "waiting" ? T.amber : T.textDim;
                    const icon = m.status === "complete" ? "✓" : m.status === "waiting" ? "◷" : "○";
                    const isLast = i === sdsu.milestones.length - 1;
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, marginBottom: isLast ? 0 : 4 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: `${color}20`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color, flexShrink: 0 }}>{icon}</div>
                          {!isLast && <div style={{ width: 2, flex: 1, background: T.border, minHeight: 16 }} />}
                        </div>
                        <div style={{ paddingBottom: isLast ? 0 : 8, flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: mono, fontSize: 12, color: m.status === "complete" ? T.text : T.textSec, fontWeight: m.status === "complete" ? 500 : 400 }}>{m.label}</span>
                          <span style={{ fontFamily: mono, fontSize: 10, color: T.textDim }}>{m.date}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 10 }}>SUBMITTED DOCUMENTS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {sdsu.submittedDocs.map((doc, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.bg, borderRadius: 4, border: `1px solid ${T.border}` }}>
                        <FileText size={12} color={T.green} /><span style={{ fontFamily: mono, fontSize: 11, color: T.text }}>{doc}</span><Check size={11} color={T.green} style={{ marginLeft: "auto" }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>NOTES</div>
                  <textarea value={sdsu.notes} onChange={e => setSdsu(p => ({ ...p, notes: e.target.value }))}
                    style={{ width: "100%", minHeight: 80, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: 10, fontSize: 12, fontFamily: mono, resize: "vertical", outline: "none", lineHeight: 1.5 }}
                    onFocus={e => e.target.style.borderColor = T.cyan} onBlur={e => e.target.style.borderColor = T.border} />
                </div>
              </div>
            )}

            {/* ─── RFP Scanner Sub-tab ─── */}
            {sdsuSubTab === "rfps" && (
              <div>
                {/* Result toast */}
                {rfpScanResult && (
                  <div style={{ marginBottom: 12, padding: "10px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 11,
                    background: rfpScanResult.success ? T.greenGlow : T.redGlow, border: `1px solid ${rfpScanResult.success ? T.green : T.red}30`, color: rfpScanResult.success ? T.green : T.red }}>
                    {rfpScanResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {rfpScanResult.success ? `Scan complete — ${rfpScanResult.newCount} new RFP${rfpScanResult.newCount !== 1 ? "s" : ""} found` : rfpScanResult.error}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: 1 }}>UNIVERSITY RFP SCANNER</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4,
                        background: rfpApiConnected ? T.greenGlow : `${T.red}10`, border: `1px solid ${rfpApiConnected ? T.green : T.red}30` }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: rfpApiConnected ? T.green : T.red, animation: rfpApiConnected ? "livePulse 2s ease-in-out infinite" : "none" }} />
                        <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color: rfpApiConnected ? T.green : T.red }}>{rfpApiConnected ? "LIVE" : "OFFLINE"}</span>
                      </div>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: T.textSec, marginTop: 4 }}>PlanetBids · CSU (23 campuses) · UC (9 campuses) · CaleProcure · BidSync</div>
                  </div>
                  <button onClick={runRfpScan} disabled={rfpScanActive}
                    style={{ background: rfpScanActive ? T.card : T.green, border: "none", color: rfpScanActive ? T.textSec : T.bg, padding: "8px 20px", borderRadius: 6, cursor: rfpScanActive ? "default" : "pointer", fontFamily: mono, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, letterSpacing: 1 }}>
                    <RefreshCw size={13} style={rfpScanActive ? { animation: "spin 1s linear infinite" } : {}} />
                    {rfpScanActive ? "SCANNING..." : "SCAN RFPs"}
                  </button>
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                  {[{ v: rfps.length, l: "TOTAL", c: T.text }, { v: rfps.filter(r => r.starred).length, l: "STARRED", c: T.amber }, { v: rfps.filter(r => r.category === "laundry").length, l: "LAUNDRY", c: T.green }, { v: rfps.filter(r => r.userStatus === "new").length, l: "NEW", c: T.cyan }].map((s, i) => (
                    <div key={i} style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, padding: 14, textAlign: "center" }}>
                      <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: T.textDim, letterSpacing: 1 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Filters */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {["all", "new", "reviewing", "bidding", "submitted", "won"].map(s => (
                      <button key={s} onClick={() => setRfpFilter(s)} style={{ background: rfpFilter === s ? T.borderLight : "transparent", border: "none", color: rfpFilter === s ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>{s}</button>
                    ))}
                    <span style={{ color: T.textDim, padding: "4px 2px" }}>|</span>
                    {RFP_SYSTEMS.map(s => (
                      <button key={s} onClick={() => setRfpSystem(s)} style={{ background: rfpSystem === s ? T.borderLight : "transparent", border: "none", color: rfpSystem === s ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{s}</button>
                    ))}
                    <span style={{ color: T.textDim, padding: "4px 2px" }}>|</span>
                    {RFP_CATEGORIES.map(c => (
                      <button key={c} onClick={() => setRfpCategory(c)} style={{ background: rfpCategory === c ? T.borderLight : "transparent", border: "none", color: rfpCategory === c ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, textTransform: "uppercase" }}>{c}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: T.textDim }}>SORT:</span>
                    {[{ id: "relevance_score", l: "RELEVANCE" }, { id: "due_date", l: "DUE DATE" }, { id: "date", l: "ADDED" }].map(s => (
                      <button key={s.id} onClick={() => setRfpSort(s.id)} style={{ background: rfpSort === s.id ? T.borderLight : "transparent", border: "none", color: rfpSort === s.id ? T.text : T.textDim, padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9 }}>{s.l}</button>
                    ))}
                  </div>
                </div>

                {/* RFP list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filteredRfps.map(r => (
                    <RFPCard key={r.id} rfp={r} onUpdateStatus={updateRfpStatus} onToggleStar={toggleRfpStar} onUpdateNotes={updateRfpNotes} />
                  ))}
                  {filteredRfps.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: T.textDim, fontFamily: mono, fontSize: 12 }}>
                      {rfpApiConnected ? "No RFPs match current filters" : "RFP scanner offline — deploy the scanner service to start finding opportunities"}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ MARKETS ═══ */}
        {activeTab === "markets" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              {markets.map(m => (
                <div key={m.sym} style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{m.sym}</span><span style={{ fontFamily: mono, fontSize: 13, color: m.chg >= 0 ? T.green : T.red }}>{m.chg >= 0 ? "+" : ""}{m.pct.toFixed(2)}%</span></div>
                  <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{m.sym === "BTC" ? `$${m.price.toLocaleString()}` : m.price.toFixed(2)}</div>
                  <div style={{ height: 80 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={m.history}><CartesianGrid strokeDasharray="3 3" stroke={T.border} /><Area type="monotone" dataKey="v" stroke={m.chg >= 0 ? T.green : T.red} strokeWidth={2} fill={m.chg >= 0 ? T.greenGlow : T.redGlow} dot={false} /></AreaChart></ResponsiveContainer></div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
              <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 24, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: mono, fontSize: 64, fontWeight: 800, color: vixColor, textShadow: `0 0 40px ${vixColor}30` }}>{vix}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 3, marginTop: 8 }}>VIX</div>
              </div>
              <div style={{ background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 12 }}>XSP OPTIONS BOOK</div>
                {OPTIONS_POS.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontFamily: mono, fontSize: 13 }}>
                    <span style={{ color: p.pl > 0 ? T.green : p.pl < 0 ? T.red : T.textSec, fontWeight: 600 }}>{p.strat}</span><span style={{ color: T.text }}>{p.strike}</span><span style={{ color: T.textSec }}>{p.exp}</span>
                    <span style={{ textAlign: "right", color: p.pl > 0 ? T.green : p.pl < 0 ? T.red : T.textDim, fontWeight: 600 }}>{p.pl != null ? `${p.pl > 0 ? "+" : ""}$${Math.abs(p.pl)}` : "PENDING"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ NEWS ═══ */}
        {activeTab === "news" && (
          <div style={{ maxWidth: 700, margin: "0 auto", animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SectionLabel>NEWS & SIGNALS</SectionLabel>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["ALL", "MACRO", "ECON", "RE", "SMB", "TECH", "CRYPTO", "OPTIONS", "PRED"].map(f => (
                  <button key={f} onClick={() => setNewsFilter(f)} style={{ background: newsFilter === f ? T.borderLight : "transparent", border: "none", color: newsFilter === f ? T.text : T.textDim, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: mono, fontSize: 9, letterSpacing: 0.5 }}>{f}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{filteredNews.map((n, i) => <NewsItem key={i} item={n} />)}</div>
            <SectionLabel>PREDICTION MARKETS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>{PREDICTIONS.map((p, i) => <PredBar key={i} pred={p} />)}</div>
          </div>
        )}
      </div>

      {activeModal && <DealModal deal={deals[activeModal]} dealKey={activeModal} onClose={() => setActiveModal(null)} onUpdate={updateDeal} />}
    </div>
  );
}
