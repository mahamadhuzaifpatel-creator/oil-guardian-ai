import React from 'react';

const panel = {
  background: 'rgba(17, 24, 39, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '10px',
  padding: '1.25rem',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
};

function Bar({ label, value, max, color, right }) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
        <span style={{ color: '#e5e7eb' }}>{label}</span>
        <span style={{ color: '#9ca3af', fontWeight: '600' }}>{right}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color, height: '100%', borderRadius: '4px' }} />
      </div>
    </div>
  );
}

export default function PrecursorPatterns({ energySources = [], trend = [] }) {
  const maxEnergy = Math.max(0, ...energySources.map((e) => e.count));
  const maxWeek = Math.max(0, ...trend.map((w) => w.total));

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem',
    }}>
      <div style={panel}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f3f4f6', fontWeight: '600' }}>
          Recurring High-Energy Hazards
        </h3>
        <p style={{ margin: '0.25rem 0 1rem 0', fontSize: '0.75rem', color: '#9ca3af' }}>
          Energy sources the AI found in SIF-flagged reports (EEI energy categories)
        </p>
        {energySources.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No SIF-flagged reports with energy evidence yet.</div>
        ) : (
          energySources.slice(0, 8).map((e) => (
            <Bar key={e.name} label={e.name} value={e.count} max={maxEnergy} color="#f97316" right={`${e.count} report${e.count === 1 ? '' : 's'}`} />
          ))
        )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f3f4f6', fontWeight: '600' }}>
          Weekly Trend
        </h3>
        <p style={{ margin: '0.25rem 0 1rem 0', fontSize: '0.75rem', color: '#9ca3af' }}>
          SIF precursors vs all reports, by week (last 8 weeks with data)
        </p>
        {trend.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No dated reports yet.</div>
        ) : (
          trend.map((w) => (
            <Bar
              key={w.week}
              label={`Week of ${new Date(w.week).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
              value={w.sifCount}
              max={maxWeek}
              color="#ef4444"
              right={`${w.sifCount} SIF / ${w.total} total`}
            />
          ))
        )}
      </div>
    </div>
  );
}
