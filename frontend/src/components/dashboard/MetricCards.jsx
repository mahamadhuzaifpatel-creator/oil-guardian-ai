import React from 'react';

export default function MetricCards({ metrics }) {
  const {
    totalReports = 0,
    sifPrecursorCount = 0,
    precursorRate = 0,
    topSite = null,
  } = metrics || {};

  const topRiskSite = topSite ? topSite.name : 'N/A';
  const topSiteRate = topSite ? topSite.densityRate : 0;

  const cards = [
    {
      label: 'Total Safety Observations',
      value: totalReports.toLocaleString(),
      subtext: 'Reports submitted through the app',
      badge: 'Aggregated',
      badgeColor: 'rgba(255, 255, 255, 0.1)',
      textColor: '#ffffff',
    },
    {
      label: 'SIF Precursors Detected',
      value: sifPrecursorCount.toLocaleString(),
      subtext: 'High energy present + control failed',
      badge: 'Critical Precursors',
      badgeColor: 'rgba(239, 68, 68, 0.2)',
      textColor: '#f87171',
    },
    {
      label: 'Precursor Density Rate',
      value: `${precursorRate}%`,
      subtext: 'Of all safety observations',
      badge: precursorRate > 15 ? 'Elevated Risk' : 'Nominal Risk',
      badgeColor: precursorRate > 15 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
      textColor: precursorRate > 15 ? '#fbbf24' : '#34d399',
    },
    {
      label: 'Top Precursor Hotspot',
      value: topRiskSite,
      subtext: topSite
        ? `${topSiteRate}% SIF density · ${topSite.sifCount} of ${topSite.total} reports${topSite.lowSample ? ' (few reports)' : ''}`
        : 'No reports yet',
      badge: 'Priority Action',
      badgeColor: 'rgba(220, 38, 38, 0.25)',
      textColor: '#fca5a5',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem',
    }}>
      {cards.map((card, idx) => (
        <div
          key={idx}
          style={{
            background: 'rgba(17, 24, 39, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.25rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: '500' }}>
              {card.label}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '9999px',
                background: card.badgeColor,
                color: card.textColor,
                fontWeight: '600',
              }}
            >
              {card.badge}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '1.85rem', fontWeight: '700', color: card.textColor, letterSpacing: '-0.02em' }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.35rem' }}>
              {card.subtext}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}