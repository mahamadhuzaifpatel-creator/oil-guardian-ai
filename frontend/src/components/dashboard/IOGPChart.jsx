import React from 'react';
import { IOGP_RULES } from './dashboardData';

export default function IOGPChart({ ruleStats = {} }) {
  const totalTagged = IOGP_RULES.reduce((acc, rule) => acc + (ruleStats[rule]?.total || 0), 0);
  const untagged = ruleStats.None?.total || 0;

  const formattedRules = IOGP_RULES.map((rule) => {
    const count = ruleStats[rule]?.total || 0;
    const sifCount = ruleStats[rule]?.sifCount || 0;
    const percentage = totalTagged > 0 ? Number(((count / totalTagged) * 100).toFixed(1)) : 0;
    return { rule, count, sifCount, percentage };
  }).sort((a, b) => b.sifCount - a.sifCount || b.count - a.count);

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
          IOGP Life-Saving Rules Distribution
        </h3>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
          {totalTagged} reports mapped to a Life-Saving Rule · {untagged} with no rule · sorted by SIF precursors
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
        {formattedRules.map((item, idx) => (
          <div
            key={idx}
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '6px',
              padding: '0.75rem',
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
              <span style={{ color: '#e5e7eb', fontWeight: '500' }}>{item.rule}</span>
              <span style={{ color: item.count > 0 ? '#f59e0b' : '#6b7280', fontWeight: '600' }}>
                {item.sifCount} SIF / {item.count} total ({item.percentage}%)
              </span>
            </div>
            <div style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              height: '5px',
              overflow: 'hidden',
            }}>
              <div
                style={{
                  width: `${Math.min(item.percentage, 100)}%`,
                  background: item.percentage > 20 ? '#ef4444' : item.percentage > 10 ? '#f59e0b' : '#3b82f6',
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}