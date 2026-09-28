import React, { useState } from 'react';

const TABS = [
  { key: 'sites', label: 'Sites', header: 'Facility / Location' },
  { key: 'departments', label: 'Departments', header: 'Operational Department' },
  { key: 'types', label: 'Report Types', header: 'Report Type' },
];

export default function DensityTable({ rankings = {} }) {
  const [activeTab, setActiveTab] = useState('sites');

  const items = rankings[activeTab] || [];
  const nameHeader = TABS.find((t) => t.key === activeTab).header;

  const getRiskBadge = (rate) => {
    if (rate >= 25) {
      return { label: 'CRITICAL', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (rate >= 15) {
      return { label: 'HIGH', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    }
    if (rate >= 5) {
      return { label: 'MODERATE', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
    return { label: 'LOW', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  };

  return (
    <div style={{
      background: 'rgba(17, 24, 39, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    }}>
      {/* Header and Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1.25rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        paddingBottom: '0.75rem',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f3f4f6', fontWeight: '600' }}>
            SIF-Precursor Risk Density Rankings
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
            Ranked by SIF-precursor density (SIF reports ÷ all reports). Groups with fewer than 3 reports are listed last.
          </p>
        </div>

        <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '2px' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? '#2563eb' : 'transparent',
                color: activeTab === tab.key ? '#ffffff' : '#9ca3af',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '5px',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label} ({(rankings[tab.key] || []).length})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: '#6b7280', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600', width: '60px' }}>Rank</th>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600' }}>{nameHeader}</th>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600', textAlign: 'center' }}>Total Logs</th>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600', textAlign: 'center' }}>Precursors</th>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600', width: '220px' }}>Precursor Density Rate</th>
              <th style={{ padding: '0.6rem 0.5rem', fontWeight: '600', textAlign: 'right' }}>Action Tier</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                  No reports submitted yet.
                </td>
              </tr>
            ) : (
              items.slice(0, 10).map((row, idx) => {
                const name = row.name;
                const badge = getRiskBadge(row.densityRate);
                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.75rem 0.5rem', color: idx < 3 ? '#fbbf24' : '#9ca3af', fontWeight: '700' }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#e5e7eb', fontWeight: '500' }}>
                      {name}
                      {row.lowSample && (
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: '#9ca3af' }}>
                          (few reports)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#9ca3af' }}>
                      {row.total}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#f87171', fontWeight: '600' }}>
                      {row.sifCount}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          flex: 1,
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '4px',
                          height: '6px',
                          overflow: 'hidden',
                        }}>
                          <div
                            style={{
                              width: `${Math.min(row.densityRate, 100)}%`,
                              background: badge.color,
                              height: '100%',
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#d1d5db', minWidth: '40px', fontWeight: '600' }}>
                          {row.densityRate}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        color: badge.color,
                        background: badge.bg,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        letterSpacing: '0.05em',
                      }}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}