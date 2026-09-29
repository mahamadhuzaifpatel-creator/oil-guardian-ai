import React from 'react';

/**
 * Lightweight SVG charts for the SIF-precursor dashboard (no chart library).
 * Every chart is drawn from the live `reports` data passed in by DashboardView.
 */

export const panel = {
  background: 'rgba(17, 24, 39, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '10px',
  padding: '1.1rem 1.25rem',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
};

function Header({ title, subtitle }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#f3f4f6', fontWeight: 600 }}>{title}</h3>
      {subtitle && (
        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{subtitle}</p>
      )}
    </div>
  );
}

function Empty() {
  return <div style={{ color: '#9ca3af', fontSize: '0.8rem', padding: '1.5rem 0' }}>No reports yet.</div>;
}

/* ---------------- Donut chart ---------------- */
export function DonutChart({ title, subtitle, data = [], centerLabel = 'reports' }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={panel}>
      <Header title={title} subtitle={subtitle} />
      {total === 0 ? (
        <Empty />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={title}>
            <g transform="rotate(-90 70 70)">
              <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
              {data.map((d) => {
                const len = (d.value / total) * c;
                const seg = (
                  <circle
                    key={d.label}
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke={d.color}
                    strokeWidth="18"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{`${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(0)}%)`}</title>
                  </circle>
                );
                offset += len;
                return seg;
              })}
            </g>
            <text x="70" y="68" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="700">{total}</text>
            <text x="70" y="86" textAnchor="middle" fill="#9ca3af" fontSize="10">{centerLabel}</text>
          </svg>

          <div style={{ flex: 1, minWidth: '130px' }}>
            {data.map((d) => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', marginBottom: '0.45rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: d.color, flexShrink: 0 }} />
                <span style={{ color: '#e5e7eb', flex: 1 }}>{d.label}</span>
                <span style={{ color: '#9ca3af', fontWeight: 600 }}>
                  {d.value} · {((d.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Horizontal bar chart ---------------- */
export function HBarChart({ title, subtitle, data = [], max, valueFormat = (v) => v, colorFor }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));

  return (
    <div style={panel}>
      <Header title={title} subtitle={subtitle} />
      {data.length === 0 ? (
        <Empty />
      ) : (
        data.map((d) => (
          <div key={d.label} style={{ marginBottom: '0.7rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem', gap: '0.5rem' }}>
              <span style={{ color: '#e5e7eb' }}>
                {d.label}
                {d.note && <span style={{ color: '#6b7280', marginLeft: '0.35rem', fontSize: '0.7rem' }}>{d.note}</span>}
              </span>
              <span style={{ color: '#d1d5db', fontWeight: 600, whiteSpace: 'nowrap' }}>{valueFormat(d.value, d)}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '9px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, (d.value / top) * 100)}%`,
                  height: '100%',
                  borderRadius: '4px',
                  background: colorFor ? colorFor(d) : '#3b82f6',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- Column chart: SIF vs all reports per week ---------------- */
export function TrendChart({ title, subtitle, trend = [] }) {
  const W = 560;
  const H = 200;
  const pad = { l: 28, r: 10, t: 12, b: 34 };
  const max = Math.max(1, ...trend.map((w) => w.total));
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = trend.length ? plotW / trend.length : plotW;
  const barW = Math.min(26, slot / 3);
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <div style={panel}>
      <Header title={title} subtitle={subtitle} />
      {trend.length === 0 ? (
        <Empty />
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fill="#6b7280" fontSize="9">{t}</text>
              </g>
            ))}
            {trend.map((w, i) => {
              const cx = pad.l + slot * i + slot / 2;
              const label = new Date(w.week).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
              return (
                <g key={w.week}>
                  <rect x={cx - barW - 2} y={y(w.total)} width={barW} height={pad.t + plotH - y(w.total)} rx="3" fill="#475569">
                    <title>{`Week of ${label}: ${w.total} reports`}</title>
                  </rect>
                  <rect x={cx + 2} y={y(w.sifCount)} width={barW} height={pad.t + plotH - y(w.sifCount)} rx="3" fill="#ef4444">
                    <title>{`Week of ${label}: ${w.sifCount} SIF precursors`}</title>
                  </rect>
                  <text x={cx} y={H - 14} textAnchor="middle" fill="#9ca3af" fontSize="9">{label}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.3rem' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#475569', borderRadius: 2, marginRight: 6 }} />All reports</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 6 }} />SIF precursors</span>
          </div>
        </>
      )}
    </div>
  );
}
