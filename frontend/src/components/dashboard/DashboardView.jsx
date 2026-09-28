import React, { useMemo, useState } from 'react';
import MetricCards from './MetricCards';
import DensityTable from './DensityTable';
import IOGPChart from './IOGPChart';
import SiteRuleHeatmap from './SiteRuleHeatmap';
import PrecursorPatterns from './PrecursorPatterns';
import { calculateDashboardMetrics } from './dashboardData';

/**
 * SIF-Precursor Risk Intelligence Dashboard (Phase 4).
 * Original components by Sai; wired to the officer's live report feed.
 * Receives the same `reports` the officer page already loaded from Supabase,
 * so "Sync Feeds" refreshes both views and no demo data is ever mixed in.
 */
export default function DashboardView({ reports = [], loading = false }) {
  const [selectedSite, setSelectedSite] = useState('ALL');

  const uniqueSites = useMemo(
    () => Array.from(new Set(reports.map((r) => r.facility_location).filter(Boolean))).sort(),
    [reports]
  );

  const filtered = selectedSite === 'ALL'
    ? reports
    : reports.filter((r) => r.facility_location === selectedSite);

  const metrics = useMemo(() => calculateDashboardMetrics(filtered), [filtered]);

  return (
    <div style={{ color: '#f3f4f6', padding: '1rem 0' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
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
            style={{
              background: '#1f2937',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              padding: '0.45rem 0.85rem',
              color: '#f3f4f6',
              fontSize: '0.85rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">All sites ({uniqueSites.length})</option>
            {uniqueSites.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
        </div>
      </div>

      <MetricCards metrics={metrics} />

      <DensityTable
        rankings={{
          sites: metrics.siteRankings,
          departments: metrics.departmentRankings,
          types: metrics.typeRankings,
        }}
      />

      <SiteRuleHeatmap heatmap={metrics.heatmap} />

      <PrecursorPatterns energySources={metrics.energySources} trend={metrics.trend} />

      <IOGPChart ruleStats={metrics.ruleStats} />
    </div>
  );
}
