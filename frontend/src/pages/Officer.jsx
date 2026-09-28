import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  User,
  Power,
  RefreshCw,
  Flame,
  AlertTriangle,
  CheckCircle,
  Database,
  Crosshair,
  Search,
  FilterX,
  ChevronDown,
  X,
  ArrowLeft,
  Activity,
  MapPin,
  CheckSquare,
  MessageSquare,
  Target,
  Settings,
  BrainCircuit
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { supabase } from "../lib/supabase";
import DashboardView from "../components/dashboard/DashboardView";
import { useAuth } from "../context/AuthContext";

/* ---------- Display helpers ---------- */

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted (Awaiting Review)" },
  { value: "under_review", label: "Active Investigation" },
  { value: "action_required", label: "Corrective Action Required" },
  { value: "closed", label: "Resolved & Closed" }
];

const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under Investigation",
  action_required: "Action Required",
  closed: "Closed"
};

const CATEGORY_LABELS = {
  near_miss: "Near Miss",
  unsafe_act: "Unsafe Act",
  unsafe_condition: "Unsafe Condition"
};

const REPORT_TYPES = ["Unsafe Act", "Unsafe Condition", "Near Miss", "Incident"];

const categorySourceLabel = (report) => {
  const source = report.ai_result?.category_source;
  if (source === "officer") return "Confirmed by safety officer";
  if (source === "employee") return "Chosen by employee";
  if (source === "ai") return "AI-suggested, needs confirmation";
  return "Source not recorded";
};

const formatStatus = (status) => STATUS_LABELS[status] || status || "Submitted";

const formatCategory = (category) => {
  if (!category) return "Unclassified";
  return CATEGORY_LABELS[category.toLowerCase()] || category;
};

const riskLevel = (riskTier) => {
  const tier = (riskTier || "").toLowerCase();
  if (tier.startsWith("high")) return "high";
  if (tier.startsWith("moderate") || tier.startsWith("medium")) return "moderate";
  if (tier.startsWith("low")) return "low";
  return "unknown";
};

const riskPillClass = (riskTier) => {
  const level = riskLevel(riskTier);
  if (level === "high") return "risk-pill pill-red";
  if (level === "moderate") return "risk-pill pill-orange";
  return "risk-pill";
};

const lowPillStyle = {
  background: "rgba(16, 185, 129, 0.12)",
  color: "#10b981",
  border: "1px solid rgba(16, 185, 129, 0.35)"
};

const formatPercent = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? null
    : `${Number(value).toFixed(1)}%`;

const shortId = (id) => (id ? id.slice(0, 8).toUpperCase() : "—");

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";

/* Per-model score: dedicated column first, then the saved AI result */
const modelScore = (report, key) => {
  const column = report[`${key}_confidence`];
  if (column !== null && column !== undefined) return Number(column);
  const fromResult = report.ai_result?.models?.[key]?.confidence;
  return fromResult !== null && fromResult !== undefined ? Number(fromResult) : null;
};

const MODEL_ROWS = [
  {
    key: "unsafe_act",
    title: "Unsafe Act model (TF-IDF + Logistic Regression)",
    description: "Behavioural SIF signal: procedures skipped or controls ignored",
    icon: BrainCircuit,
    color: "bg-blue",
    textClass: "text-blue"
  },
  {
    key: "unsafe_condition",
    title: "Unsafe Condition model (MiniLM embeddings + XGBoost)",
    description: "Equipment and workplace condition SIF signal",
    icon: AlertTriangle,
    color: "bg-orange",
    textClass: "text-orange"
  },
  {
    key: "near_miss",
    title: "Near Miss model (MiniLM embeddings + XGBoost)",
    description: "High-energy close-call SIF signal",
    icon: Flame,
    color: "bg-orange",
    textClass: "text-orange"
  }
];

function Officer() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showProfile, setShowProfile] = useState(false);
  const [view, setView] = useState("feed");
  const [selectedLog, setSelectedLog] = useState(null);

  const [editStatus, setEditStatus] = useState("submitted");
  const [editCategory, setEditCategory] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const pageVariants = {
    hidden: { opacity: 0, x: 20 },
    show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } }
  };

  /* ---------- Load reports from Supabase ---------- */

  const loadReports = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load reports:", error);
      setLoadError(`Could not load reports: ${error.message}`);
      setReports([]);
    } else {
      setReports(data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  /* ---------- Metrics (from real data) ---------- */

  const metrics = useMemo(() => {
    const count = (predicate) => reports.filter(predicate).length;
    return {
      high: count((r) => riskLevel(r.risk_tier) === "high"),
      moderate: count((r) => riskLevel(r.risk_tier) === "moderate"),
      low: count((r) => riskLevel(r.risk_tier) === "low"),
      active: count((r) => r.status === "under_review" || r.status === "action_required"),
      closed: count((r) => r.status === "closed"),
      total: reports.length
    };
  }, [reports]);

  /* ---------- Filters ---------- */

  const categoryOptions = useMemo(() => {
    const unique = new Set(reports.map((r) => formatCategory(r.category)));
    return Array.from(unique).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();

    return reports.filter((r) => {
      if (riskFilter !== "all" && riskLevel(r.risk_tier) !== riskFilter) return false;
      if (categoryFilter !== "all" && formatCategory(r.category) !== categoryFilter) return false;
      if (statusFilter !== "all" && (r.status || "submitted") !== statusFilter) return false;

      if (!term) return true;

      const haystack = [
        shortId(r.id),
        r.facility_location,
        r.operational_department,
        r.report_text,
        r.iogp_rule,
        formatCategory(r.category)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [reports, search, riskFilter, categoryFilter, statusFilter]);

  const clearFilters = () => {
    setSearch("");
    setRiskFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  /* ---------- Detail view + status update ---------- */

  const openReport = (report) => {
    setSelectedLog(report);
    setEditStatus(report.status || "submitted");
    setEditCategory(REPORT_TYPES.includes(formatCategory(report.category)) ? formatCategory(report.category) : "");
    setEditAssignee(report.assigned_to || "");
    setEditRemarks(report.officer_remarks || "");
    setSaveError("");
    setSaveMessage("");
  };

  const handleConfirmUpdate = async () => {
    if (!selectedLog || !user?.id) return;

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    const { data, error } = await supabase
      .from("reports")
      .update({
        status: editStatus,
        ...(editCategory &&
        (editCategory !== formatCategory(selectedLog.category) ||
          selectedLog.ai_result?.category_source === "ai")
          ? {
              category: editCategory,
              ai_result: { ...(selectedLog.ai_result || {}), category_source: "officer" }
            }
          : {}),
        assigned_to: editAssignee.trim() || null,
        officer_remarks: editRemarks.trim() || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", selectedLog.id)
      .select()
      .single();

    setSaving(false);
    setShowConfirmModal(false);

    if (error) {
      console.error("Status update failed:", error);
      setSaveError(
        `Update failed: ${error.message}. Make sure this account is approved as a safety officer.`
      );
      return;
    }

    setReports((current) => current.map((r) => (r.id === data.id ? data : r)));
    setSelectedLog(data);
    setSaveMessage("Status updated and saved.");
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const displayName = profile?.full_name || user?.email || "Safety Officer";

  /* ---------- Render ---------- */

  return (
    <div className="telemetry-page">
      {/* NAVBAR */}
      <nav className="telemetry-navbar">
        <div className="telemetry-nav-left">
          <div className="telemetry-brand">
            <div className="telemetry-logo"><Shield size={18} /></div>
            <span>OIL Guardian <strong className="text-orange">AI</strong></span>
          </div>
          <div className="telemetry-live-badge">
            <span className="live-dot" /> Command Center Live
          </div>
        </div>
        <div className="telemetry-nav-right">
          <button className="telemetry-btn-profile cursor-target" onClick={() => setShowProfile(true)}>
            <div className="profile-icon-blue"><User size={14} /></div>
            {displayName} <ChevronDown size={14} className="text-muted" />
          </button>
          <button className="telemetry-btn-logout cursor-target" onClick={handleLogout} title="Secure Logout">
            <Power size={14} />
          </button>
        </div>
      </nav>

      <main className="telemetry-container">
        <AnimatePresence mode="wait">
          {!selectedLog ? (
            /* ========== DASHBOARD VIEW (TABLE) ========== */
            <motion.div key="dashboard" variants={pageVariants} initial="hidden" animate="show" exit="exit">
              <div className="telemetry-header">
                <div>
                  <h1>Safety Telemetry Feed</h1>
                  <p>AI-triaged safety reports submitted across OIL operations.</p>
                </div>
                <button className="telemetry-btn-sync cursor-target" onClick={loadReports} disabled={loading}>
                  <RefreshCw size={14} /> {loading ? "Syncing..." : "Sync Feeds"}
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", margin: "4px 0 18px" }}>
                {[
                  { key: "feed", label: "Report Feed" },
                  { key: "analytics", label: "SIF-Precursor Analytics" }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    className="cursor-target"
                    onClick={() => setView(tab.key)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(249, 115, 22, 0.45)",
                      background: view === tab.key ? "rgba(249, 115, 22, 0.18)" : "transparent",
                      color: view === tab.key ? "#fb923c" : "#94a3b8",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer"
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {view === "analytics" ? (
                <DashboardView reports={reports} loading={loading} />
              ) : (
              <>
              <div className="telemetry-metrics-grid">
                <div className="metric-card">
                  <div className="metric-top text-red"><span>High Risk</span><Flame size={14} /></div>
                  <strong>{metrics.high}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top text-orange"><span>Moderate Risk</span><AlertTriangle size={14} /></div>
                  <strong>{metrics.moderate}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top text-green"><span>Low Risk</span></div>
                  <strong>{metrics.low}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top text-blue"><span>Active Inves.</span><Crosshair size={14} /></div>
                  <strong>{metrics.active}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top text-muted"><span>Closed</span><CheckCircle size={14} /></div>
                  <strong>{metrics.closed}</strong>
                </div>
                <div className="metric-card">
                  <div className="metric-top text-orange"><span>Total Logs</span><Database size={14} /></div>
                  <strong>{metrics.total}</strong>
                </div>
              </div>

              <div className="telemetry-filters">
                <div className="filter-search">
                  <Search size={16} className="text-muted" />
                  <input
                    type="text"
                    className="cursor-target"
                    placeholder="Search ID, site, department, report text, rule..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select className="cursor-target" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                  <option value="all">All Risk Tiers</option>
                  <option value="high">High Risk</option>
                  <option value="moderate">Moderate Risk</option>
                  <option value="low">Low Risk</option>
                </select>
                <select className="cursor-target" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">All Categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select className="cursor-target" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{STATUS_LABELS[option.value]}</option>
                  ))}
                </select>
                <button className="btn-clear-filters cursor-target" onClick={clearFilters} title="Clear filters">
                  <FilterX size={16} />
                </button>
              </div>

              {loadError && (
                <div
                  role="alert"
                  style={{
                    margin: "12px 0",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.45)",
                    color: "#fca5a5",
                    fontSize: "13px"
                  }}
                >
                  {loadError}
                </div>
              )}

              <div className="telemetry-table-wrapper">
                <table className="telemetry-table">
                  <thead>
                    <tr>
                      <th>TELEMETRY ID</th>
                      <th>SITE & DEPARTMENT</th>
                      <th>CATEGORY</th>
                      <th>IOGP RULE</th>
                      <th>RISK TIER</th>
                      <th>SIF SCORE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={7} className="text-muted">Loading reports...</td></tr>
                    )}

                    {!loading && !loadError && filteredReports.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-muted">
                          {reports.length === 0
                            ? "No reports submitted yet."
                            : "No reports match these filters."}
                        </td>
                      </tr>
                    )}

                    {!loading && filteredReports.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => openReport(log)}
                        className="telemetry-row-clickable cursor-target"
                      >
                        <td className="text-white font-bold">{shortId(log.id)}</td>
                        <td className="text-muted">
                          {log.facility_location} · {log.operational_department}
                          <div style={{ fontSize: "11px", opacity: 0.7 }}>{formatDate(log.created_at)}</div>
                        </td>
                        <td className="text-muted">{formatCategory(log.category)}</td>
                        <td className="text-muted">{log.iogp_rule || "—"}</td>
                        <td>
                          <span
                            className={riskPillClass(log.risk_tier)}
                            style={riskLevel(log.risk_tier) === "low" ? lowPillStyle : undefined}
                          >
                            {log.risk_tier || "Unknown"}
                          </span>
                        </td>
                        <td className="text-orange font-bold">{formatPercent(log.sif_percentage) || "—"}</td>
                        <td className={log.status === "closed" ? "text-green" : "text-muted"}>
                          {formatStatus(log.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
              )}
            </motion.div>
          ) : (
            /* ========== DETAILED REPORT VIEW ========== */
            <motion.div key="details" variants={pageVariants} initial="hidden" animate="show" exit="exit" className="report-detail-view">

              <div className="report-detail-header">
                <button className="btn-back cursor-target" onClick={() => setSelectedLog(null)}>
                  <ArrowLeft size={16} /> Back to Telemetry Feed
                </button>
                <div className="report-meta">
                  <MapPin size={14} /> {selectedLog.facility_location} · {selectedLog.operational_department} · {formatDate(selectedLog.created_at)}
                </div>
              </div>

              {/* TOP 4 KPI CARDS */}
              <div className="report-kpi-grid">
                <div className="report-kpi-card">
                  <div className="kpi-top"><span>SIF POTENTIAL SCORE</span> <Activity size={14} className="text-orange" /></div>
                  <div className="kpi-main">
                    <h2>{formatPercent(selectedLog.sif_percentage) || "—"}</h2>
                    <span
                      className={riskPillClass(selectedLog.risk_tier)}
                      style={riskLevel(selectedLog.risk_tier) === "low" ? lowPillStyle : undefined}
                    >
                      {riskLevel(selectedLog.risk_tier).toUpperCase()}
                    </span>
                  </div>
                  <div className="kpi-bar">
                    <div
                      className="kpi-fill"
                      style={{
                        width: formatPercent(selectedLog.sif_percentage) || "0%",
                        background: riskLevel(selectedLog.risk_tier) === "high" ? "#ef4444" : "#f97316"
                      }}
                    />
                  </div>
                  <small>Control failure × high-energy check · 50% = SIF threshold</small>
                </div>

                <div className="report-kpi-card">
                  <div className="kpi-top"><span>INCIDENT CATEGORY</span> <Target size={14} className="text-blue" /></div>
                  <div className="kpi-main">
                    <h2 className="text-white">{formatCategory(selectedLog.category)}</h2>
                  </div>
                  <div className="kpi-sub text-blue"><CheckCircle size={12} /> {categorySourceLabel(selectedLog)}</div>
                  <small>
                    {selectedLog.ai_result?.report_type_ai?.type
                      ? `AI suggestion: ${selectedLog.ai_result.report_type_ai.type} (${selectedLog.ai_result.report_type_ai.confidence}%)`
                      : `Input: ${selectedLog.input_mode || "text"}`}
                  </small>
                </div>

                <div className="report-kpi-card">
                  <div className="kpi-top"><span>RISK TIER</span> <AlertTriangle size={14} className="text-orange" /></div>
                  <div className="kpi-main">
                    <h2 className="text-orange">{selectedLog.risk_tier || "Unknown"}</h2>
                  </div>
                  <div className="kpi-sub text-muted"><Settings size={12} /> Status: {formatStatus(selectedLog.status)}</div>
                  <small>High ≥ 70% · Moderate 50–70% (SIF-flagged) · Low &lt; 50%</small>
                </div>

                <div className="report-kpi-card">
                  <div className="kpi-top"><span>IOGP LIFE-SAVING RULE</span> <Shield size={14} className="text-blue" /></div>
                  <div className="kpi-main">
                    <h2 className="text-white" style={{ fontSize: "18px" }}>{selectedLog.iogp_rule || "Not determined"}</h2>
                  </div>
                  <small>Mapped by the AI engine</small>
                </div>
              </div>

              {/* MAIN CONTENT GRID */}
              <div className="report-main-grid">

                {/* LEFT COLUMN */}
                <div className="report-left-col">

                  <div className="report-section-box">
                    <div className="section-box-header">
                      <div className="step-badge">01</div>
                      <h3>Field Observation</h3>
                    </div>
                    <div className="xai-text-box">{selectedLog.report_text}</div>
                  </div>

                  <div className="report-section-box">
                    <div className="section-box-header">
                      <div className="step-badge">02</div>
                      <h3>3-Model Ensemble Diagnostics</h3>
                      <span className="calibrated-badge">Soft-Voting Ensemble</span>
                    </div>

                    {MODEL_ROWS.map((row, index) => {
                      const score = modelScore(selectedLog, row.key);
                      const Icon = row.icon;
                      const isLast = index === MODEL_ROWS.length - 1;

                      return (
                        <div
                          key={row.key}
                          className="ensemble-model-row"
                          style={isLast ? { borderBottom: "none", paddingBottom: 0 } : undefined}
                        >
                          <div className="model-row-top">
                            <span><Icon size={14} className={row.textClass} /> {row.title}</span>
                            <strong className={row.textClass}>
                              {score === null ? "Not recorded" : formatPercent(score)}
                            </strong>
                          </div>
                          <div className="model-bar">
                            <div className={`model-fill ${row.color}`} style={{ width: score === null ? "0%" : `${score}%` }} />
                          </div>
                          <small>{row.description}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT COLUMN: WORKFLOW */}
                <div className="report-right-col">

                  <div className="report-section-box workflow-box">
                    <div className="workflow-eyebrow">COMMAND WORKFLOW</div>
                    <h3>Update Report Status</h3>

                    <div className="workflow-field">
                      <label>LIFECYCLE STATUS</label>
                      <select className="cursor-target" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="workflow-field">
                      <label>CONFIRM REPORT TYPE</label>
                      <select className="cursor-target" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                        <option value="">Keep as submitted</option>
                        {REPORT_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className="workflow-field">
                      <label>ASSIGN LEAD INVESTIGATOR</label>
                      <input
                        className="cursor-target"
                        type="text"
                        placeholder="e.g., Rig Supervisor (Drilling)"
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                      />
                    </div>

                    <div className="workflow-field">
                      <label>ACTION REMARKS</label>
                      <textarea
                        className="cursor-target"
                        placeholder="Record corrective actions and review notes..."
                        value={editRemarks}
                        onChange={(e) => setEditRemarks(e.target.value)}
                      />
                    </div>

                    {saveError && (
                      <div role="alert" style={{ color: "#fca5a5", fontSize: "13px", marginBottom: "10px" }}>
                        {saveError}
                      </div>
                    )}
                    {saveMessage && (
                      <div style={{ color: "#10b981", fontSize: "13px", marginBottom: "10px" }}>
                        {saveMessage}
                      </div>
                    )}

                    <button
                      className="btn-authorize cursor-target"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={saving}
                    >
                      <CheckSquare size={16} /> {saving ? "Saving..." : "Save Status Update"}
                    </button>
                  </div>

                  <div className="report-section-box notes-box">
                    <div className="notes-header">
                      <h3><MessageSquare size={14} className="text-orange" /> Review History</h3>
                    </div>

                    <div className="note-item">
                      <div className="note-top"><strong>Report submitted</strong> <span>{formatDate(selectedLog.created_at)}</span></div>
                      <p>Logged by field employee and triaged by the AI engine.</p>
                    </div>

                    {selectedLog.reviewed_at && (
                      <div className="note-item">
                        <div className="note-top">
                          <strong>{formatStatus(selectedLog.status)}</strong>
                          <span>{formatDate(selectedLog.reviewed_at)}</span>
                        </div>
                        <p>
                          {selectedLog.assigned_to ? `Investigator: ${selectedLog.assigned_to}. ` : ""}
                          {selectedLog.officer_remarks || "No remarks recorded."}
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div className="profile-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="confirm-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="confirm-icon">
                <AlertTriangle size={32} className="text-orange" />
              </div>
              <h3>Confirm Status Update</h3>
              <p>
                Set this report to <strong>{formatStatus(editStatus)}</strong>? The update is saved with your
                account and the time of review.
              </p>

              <div className="confirm-actions">
                <button className="btn-cancel cursor-target" onClick={() => setShowConfirmModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button className="btn-confirm cursor-target" onClick={handleConfirmUpdate} disabled={saving}>
                  {saving ? "Saving..." : "Confirm Update"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROFILE MODAL */}
      <AnimatePresence>
        {showProfile && (
          <motion.div className="profile-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="profile-modal">
              <button className="profile-close cursor-target" onClick={() => setShowProfile(false)}>
                <X size={24} />
              </button>
              <div className="profile-header">
                <div className="profile-avatar"><User size={34} /></div>
                <div className="profile-heading">
                  <h2>{displayName}</h2>
                  <h3>{profile?.job_title || "Safety Officer"}</h3>
                  {profile?.certification && (
                    <span className="profile-certification">{profile.certification}</span>
                  )}
                </div>
              </div>
              <div className="profile-divider" />
              <div className="profile-info">
                <div className="profile-row"><span>Employee ID</span><strong>{profile?.employee_id || "—"}</strong></div>
                <div className="profile-row"><span>Company</span><strong>{profile?.company || "Oil India Limited"}</strong></div>
                <div className="profile-row"><span>Division</span><strong>{profile?.division || "—"}</strong></div>
                <div className="profile-row"><span>Reports in Feed</span><strong>{metrics.total}</strong></div>
              </div>
              <button className="close-profile-button cursor-target" onClick={() => setShowProfile(false)}>Close Profile</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Officer;
