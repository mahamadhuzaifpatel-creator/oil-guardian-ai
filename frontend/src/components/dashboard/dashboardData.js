/**
 * SIF-precursor dashboard metrics from real Supabase `reports` rows.
 * Original aggregation design by Sai; adapted to the live schema.
 *
 * Field mapping (reports table):
 *   site        <- facility_location
 *   department  <- operational_department
 *   report type <- category
 *   SIF flag    <- ai_result.ensemble.is_sif, else sif_percentage >= 50
 *   IOGP rule   <- iogp_rule
 *   energy      <- ai_result.ensemble.high_energy_evidence (categories)
 */

export const IOGP_RULES = [
  "Bypassing Safety Controls",
  "Confined Space",
  "Driving",
  "Energy Isolation",
  "Hot Work",
  "Line of Fire",
  "Safe Mechanical Lifting",
  "Work Authorisation",
  "Working at Height",
];

// Groups with fewer reports than this are flagged: their density is unreliable
export const MIN_RELIABLE_REPORTS = 3;

const TYPE_LABELS = {
  near_miss: "Near Miss",
  unsafe_act: "Unsafe Act",
  unsafe_condition: "Unsafe Condition",
};

export function normaliseRule(rule) {
  if (!rule) return "None";
  const value = String(rule).trim().replace(/Authorization/i, "Authorisation");
  const match = IOGP_RULES.find((r) => r.toLowerCase() === value.toLowerCase());
  return match || "None";
}

export function isSifReport(row) {
  const flag = row?.ai_result?.ensemble?.is_sif;
  if (typeof flag === "boolean") return flag;
  const pct = Number(row?.sif_percentage);
  if (row?.sif_percentage !== null && row?.sif_percentage !== undefined && Number.isFinite(pct)) return pct >= 50;
  return row?.is_sif === true || row?.is_sif === "true";
}

export function riskTierOf(row) {
  const tier = String(row?.risk_tier || "").toLowerCase();
  if (tier.startsWith("high")) return "High";
  if (tier.startsWith("moderate") || tier.startsWith("medium")) return "Moderate";
  if (tier.startsWith("low")) return "Low";
  const pct = Number(row?.sif_percentage);
  if (!Number.isFinite(pct)) return "Unknown";
  return pct >= 70 ? "High" : pct >= 50 ? "Moderate" : "Low";
}

function countBy(rows, key, order = []) {
  const counts = {};
  rows.forEach((r) => (counts[r[key]] = (counts[r[key]] || 0) + 1));
  const keys = [...order.filter((k) => counts[k]), ...Object.keys(counts).filter((k) => !order.includes(k))];
  return keys.map((k) => ({ label: k, value: counts[k] }));
}

export function normaliseRow(row) {
  const category = row.category || "";
  return {
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    site: row.facility_location || row.site || row.location || "Unknown site",
    department: row.operational_department || row.activity || "Unspecified department",
    reportType: TYPE_LABELS[category.toLowerCase()] || category || "Unclassified",
    rule: normaliseRule(row.iogp_rule),
    isSif: isSifReport(row),
    energy: Object.keys(row?.ai_result?.ensemble?.high_energy_evidence || {}),
    riskTier: riskTierOf(row),
    status: row.status || "submitted",
    inputMode: (row.input_mode || "text").toLowerCase(),
  };
}

function rank(rows, key) {
  const map = {};
  rows.forEach((r) => {
    const name = r[key];
    if (!map[name]) map[name] = { name, total: 0, sifCount: 0 };
    map[name].total += 1;
    if (r.isSif) map[name].sifCount += 1;
  });

  return Object.values(map)
    .map((g) => ({
      ...g,
      densityRate: Number(((g.sifCount / g.total) * 100).toFixed(1)),
      lowSample: g.total < MIN_RELIABLE_REPORTS,
    }))
    // Reliable groups first, then highest density, then most precursors
    .sort(
      (a, b) =>
        Number(a.lowSample) - Number(b.lowSample) ||
        b.densityRate - a.densityRate ||
        b.sifCount - a.sifCount
    );
}

export function calculateDashboardMetrics(records = []) {
  const rows = (records || []).map(normaliseRow);
  const total = rows.length;
  const sif = rows.filter((r) => r.isSif);

  const ruleStats = {};
  IOGP_RULES.concat("None").forEach((rule) => {
    ruleStats[rule] = { total: 0, sifCount: 0 };
  });
  rows.forEach((r) => {
    ruleStats[r.rule].total += 1;
    if (r.isSif) ruleStats[r.rule].sifCount += 1;
  });

  // Site x IOGP rule heatmap: number of SIF precursors in each cell
  const sites = Array.from(new Set(rows.map((r) => r.site))).sort();
  const heatmap = sites.map((site) => ({
    site,
    cells: IOGP_RULES.map((rule) => ({
      rule,
      sifCount: sif.filter((r) => r.site === site && r.rule === rule).length,
      total: rows.filter((r) => r.site === site && r.rule === rule).length,
    })),
  }));

  // High-energy sources found in SIF reports
  const energyCounts = {};
  sif.forEach((r) => r.energy.forEach((e) => (energyCounts[e] = (energyCounts[e] || 0) + 1)));
  const energySources = Object.entries(energyCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // SIF precursors per week (weeks start Monday; last 8 weeks with data)
  const weekly = {};
  rows.forEach((r) => {
    if (!r.createdAt || Number.isNaN(r.createdAt.getTime())) return;
    const d = new Date(r.createdAt);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!weekly[key]) weekly[key] = { week: key, total: 0, sifCount: 0 };
    weekly[key].total += 1;
    if (r.isSif) weekly[key].sifCount += 1;
  });
  const trend = Object.values(weekly).sort((a, b) => a.week.localeCompare(b.week)).slice(-8);

  const siteRankings = rank(rows, "site");
  const reliableTop = siteRankings.find((s) => !s.lowSample) || siteRankings[0] || null;

  return {
    totalReports: total,
    sifPrecursorCount: sif.length,
    precursorRate: total ? Number(((sif.length / total) * 100).toFixed(1)) : 0,
    topSite: reliableTop,
    siteRankings,
    departmentRankings: rank(rows, "department"),
    typeRankings: rank(rows, "reportType"),
    ruleStats,
    heatmap,
    energySources,
    trend,
    riskTierCounts: countBy(rows, "riskTier", ["High", "Moderate", "Low", "Unknown"]),
    reportTypeCounts: countBy(rows, "reportType", ["Unsafe Act", "Unsafe Condition", "Near Miss", "Incident"]),
    statusCounts: countBy(rows, "status", ["submitted", "under_review", "action_required", "closed"]),
    inputModeCounts: countBy(rows, "inputMode", ["text", "voice", "ocr"]),
  };
}
