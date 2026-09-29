import React, { useMemo, useState } from 'react';
import MetricCards from './MetricCards';
import DensityTable from './DensityTable';
import IOGPChart from './IOGPChart';
import SiteRuleHeatmap from './SiteRuleHeatmap';
import { DonutChart, HBarChart, TrendChart } from './Charts';
import { calculateDashboardMetrics } from './dashboardData';

/**
 * SIF-Precursor Risk Intelligence Dashboard.
 * Original components by Sai; charts added on top. Everything is computed from
 * the same live `reports` the officer page loaded from Supabase.
 */

const TIER_COLORS = { High: '#ef4444', Moderate: '#f59e0b', Low: '#10b981', Unknown: '#64748b' };
const TYPE_COLORS = { 'Unsafe Act': '#3b82f6', 'Unsafe Condition': '#f97316', 'Near Miss': '#a855f7', Incident: '#ef4444' };
const STATUS_LABELS = { submitted: 'Submitted', under_review: 'Under investigation', action_required: 'Action required', closed: 'Closed' };
const STATUS_COLORS = { submitted: '#64748b', under_review: '#3b82f6', action_required: '#f59e0b', closed: '#10b981' };
const INPUT_LABELS = { text: 'Typed', voice: 'Voice', ocr: 'OCR (photo)' };
const INPUT_COLORS = { text: '#0ea5e9', voice: '#f97316', ocr: '#8b5cf6' };

const densityColor = (rate) => (rate >= 50 ? '#ef4444' : rate >= 25 ? '#f59e0b' : '#10b981');

const grid = (min) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: '1rem',
  marginBottom: '1.25rem',
});

export default function DashboardView({ reports = [], loading = false }) {
  const [selectedSite, setSelectedSite] = useState('ALL');

  const uniqueSites = useMemo(
    () => Array.from(new Set(reports.map((r) => r.facility_location).filter(Boolean))).sort(),
    [reports]
  );

  const filtered = useMemo(
    () => (selectedSite === 'ALL' ? reports : reports.filter((r) => r.facility_location === selectedSite)),
    [reports, selectedSite]
  );

  const metrics = useMemo(() => calculateDashboardMetrics(filtered), [filtered]);

  const tierData = metrics.riskTierCounts.map((d) => ({ ...d, color: TIER_COLORS[d.label] || '#64748b' }));
  const typeData = metrics.reportTypeCounts.map((d) => ({ ...d, color: TYPE_COLORS[d.label] || '#64748b' }));
  const statusData = metrics.statusCounts.map((d) => ({
    label: STATUS_LABELS[d.label] || d.label,
    value: d.value,
    color: STATUS_COLORS[d.label] || '#64748b',
  }));
  const inputData = metrics.inputModeCounts.map((d) => ({
    label: INPUT_LABELS[d.label] || d.label,
    value: d.value,
    color: INPUT_COLORS[d.label] || '#64748b',
  }));

  const siteDensity = metrics.siteRankings.map((s) => ({
    label: s.name,
    value: s.densityRate,
    count: s.sifCount,
    total: s.total,
    note: s.lowSample ? '(few reports)' : '',
  }));

  const hazards = metrics.energySources.slice(0, 8).map((e) => ({ label: e.name, value: e.count }));

  return (
    <div style={{ color: '#f3f4f6', padding: '1rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.02em', color: '#ffffff' }}>
            SIF-Precursor Risk Intelligence
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.3rem' }}>
            {loading ? 'Loading reports...' : `Live data: ${reports.length} reports in the database`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: '500' }}>Filter site:</label>
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            style={{ background: '#1f2937', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '6px', padding: '0.45rem 0.85rem', color: '#f3f4f6', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
          >
            <option value="ALL">All sites ({uniqueSites.length})</option>
            {uniqueSites.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
        </div>
      </div>

      <MetricCards metrics={metrics} />

      <div style={grid(250)}>
        <DonutChart title="Risk Tiers" subtitle="High ≥ 70% · Moderate 50–70% · Low < 50%" data={tierData} />
        <DonutChart title="Report Types" subtitle="Employee answer or officer-confirmed type" data={typeData} />
        <DonutChart title="Review Status" subtitle="Officer workflow progress" data={statusData} />
        <DonutChart title="How Reports Arrive" subtitle="Typed, voice or OCR input" data={inputData} />
      </div>

      <div style={grid(340)}>
        <HBarChart
          title="SIF-Precursor Density by Site"
          subtitle="Share of each site's reports flagged SIF (sites with < 3 reports listed last)"
          data={siteDensity}
          max={100}
          valueFormat={(v, d) => `${v}% · ${d.count}/${d.total}`}
          colorFor={(d) => densityColor(d.value)}
        />
        <HBarChart
          title="Recurring High-Energy Hazards"
          subtitle="Energy sources the AI found in SIF-flagged reports (EEI categories)"
          data={hazards}
          valueFormat={(v) => `${v} report${v === 1 ? '' : 's'}`}
          colorFor={() => '#f97316'}
        />
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <TrendChart title="Weekly Trend" subtitle="All reports vs SIF precursors per week (last 8 weeks with data)" trend={metrics.trend} />
      </div>

      <SiteRuleHeatmap heatmap={metrics.heatmap} />

      <DensityTable
        rankings={{
          sites: metrics.siteRankings,
          departments: metrics.departmentRankings,
          types: metrics.typeRankings,
        }}
      />

      <IOGPChart ruleStats={metrics.ruleStats} />
    </div>
  );
}
