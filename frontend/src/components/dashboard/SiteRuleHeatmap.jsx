import React from 'react';
import { IOGP_RULES } from './dashboardData';

const SHORT = {
  'Bypassing Safety Controls': 'Bypass',
  'Confined Space': 'Confined',
  'Driving': 'Driving',
  'Energy Isolation': 'Isolation',
  'Hot Work': 'Hot Work',
  'Line of Fire': 'Line of Fire',
  'Safe Mechanical Lifting': 'Lifting',
  'Work Authorisation': 'Permit',
  'Working at Height': 'Height',
};

function cellColor(count, max) {
  if (!count) return 'rgba(255, 255, 255, 0.03)';
  const strength = 0.25 + 0.75 * (count / Math.max(max, 1));
  return `rgba(239, 68, 68, ${strength.toFixed(2)})`;
}

export default function SiteRuleHeatmap({ heatmap = [] }) {
  const max = Math.max(0, ...heatmap.flatMap((row) => row.cells.map((c) => c.sifCount)));

  return (
    <div style={{
      background: 'rgba(17, 24, 39, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f3f4f6', fontWeight: '600' }}>
          SIF-Precursor Heatmap: Site × Life-Saving Rule
        </h3>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
          Each cell = number of SIF-flagged reports. Darker = more fatal-potential precursors. Hover for totals.
        </p>
      </div>

      {heatmap.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
          No reports submitted yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: '4px', fontSize: '0.75rem', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: '#6b7280', fontWeight: '600', padding: '0.3rem' }}>Site</th>
                {IOGP_RULES.map((rule) => (
                  <th key={rule} title={rule} style={{ color: '#6b7280', fontWeight: '600', padding: '0.3rem', whiteSpace: 'nowrap' }}>
                    {SHORT[rule]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.map((row) => (
                <tr key={row.site}>
                  <td style={{ color: '#e5e7eb', padding: '0.3rem 0.5rem 0.3rem 0.3rem', whiteSpace: 'nowrap' }}>{row.site}</td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.rule}
                      title={`${row.site} · ${cell.rule}: ${cell.sifCount} SIF of ${cell.total} reports`}
                      style={{
                        background: cellColor(cell.sifCount, max),
                        color: cell.sifCount ? '#ffffff' : '#4b5563',
                        textAlign: 'center',
                        borderRadius: '4px',
                        padding: '0.45rem 0.3rem',
                        minWidth: '52px',
                        fontWeight: '700',
                      }}
                    >
                      {cell.sifCount || '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
