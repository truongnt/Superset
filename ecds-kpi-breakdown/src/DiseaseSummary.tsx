import React from 'react';
import { EcdsKpiBreakdownProps, BreakdownItem } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('vi-VN');
}

function calcChangePct(current: number, prev: number | null): number | null {
  if (prev == null) return null;
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

// ─── ComparisonRow ───────────────────────────────────────────────────────────

interface ComparisonRowProps {
  current: number;
  prev: number | null;
  comparisonLabel: string;
  fontSize?: number;
}

function ComparisonRow({ current, prev, comparisonLabel, fontSize = 12 }: ComparisonRowProps) {
  const pct = calcChangePct(current, prev);
  const arrow = pct !== null && pct < 0 ? '▼' : '▲';
  const pctText = pct !== null ? `${Math.abs(pct).toFixed(1)}%` : '-';
  const color = '#D32F2F';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 3,
        fontSize,
        color: '#555',
        marginTop: 2,
        lineHeight: 1.3,
      }}
    >
      <span style={{ color, fontWeight: 600 }}>{arrow}</span>
      <span style={{ color, fontWeight: 600 }}>
        {formatNumber(current)} ({pctText})
      </span>
      <span>{comparisonLabel}</span>
    </div>
  );
}

// ─── BreakdownCol ────────────────────────────────────────────────────────────

interface BreakdownColProps {
  item: BreakdownItem;
  comparisonLabel: string;
  showComparison: boolean;
  /** Thu nhỏ font khi có nhiều cột */
  compact: boolean;
}

function BreakdownCol({ item, comparisonLabel, showComparison, compact }: BreakdownColProps) {
  const numFontSize = compact ? 18 : 22;
  const labelFontSize = compact ? 11 : 13;

  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: compact ? '6px 2px' : '8px 4px',
        overflow: 'hidden',
      }}
    >
      {/* Label = giá trị thực tế từ cột breakdown */}
      <div
        style={{
          fontSize: labelFontSize,
          color: '#555',
          fontWeight: 500,
          marginBottom: 4,
          textAlign: 'center',
          wordBreak: 'break-word',
          maxWidth: '100%',
        }}
        title={item.label}
      >
        {item.label}
      </div>

      {/* Số metric */}
      <div
        style={{
          fontSize: numFontSize,
          fontWeight: 700,
          color: '#222',
          lineHeight: 1,
        }}
      >
        {formatNumber(item.current)}
      </div>

      {/* So sánh năm trước */}
      {showComparison && item.prev !== null && (
        <ComparisonRow
          current={item.current}
          prev={item.prev}
          comparisonLabel={comparisonLabel}
          fontSize={compact ? 10 : 11}
        />
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DiseaseSummary({
  width,
  height,
  title,
  total,
  totalPrev,
  breakdownItems,
  comparisonLabel,
  showComparison,
}: EcdsKpiBreakdownProps) {
  // Khi có nhiều cột (> 4), thu nhỏ để vừa màn hình
  const compact = breakdownItems.length > 4;

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        boxSizing: 'border-box',
        padding: 8,
      }}
    >
      <div
        style={{
          width: '100%',
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          backgroundColor: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header: tiêu đề + tổng ── */}
        <div
          style={{
            padding: '14px 16px 10px',
            textAlign: 'center',
            borderBottom: breakdownItems.length > 0 ? '1px solid #e0e0e0' : 'none',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: '#555', marginBottom: 6 }}>
            {title}
          </div>

          <div style={{ fontSize: 36, fontWeight: 700, color: '#222', lineHeight: 1.1, marginBottom: 4 }}>
            {formatNumber(total)}
          </div>

          {showComparison && (
            <ComparisonRow
              current={total}
              prev={totalPrev}
              comparisonLabel={comparisonLabel}
              fontSize={12}
            />
          )}
        </div>

        {/* ── Breakdown động ── */}
        {breakdownItems.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto' }}>
            {breakdownItems.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx > 0 && (
                  <div style={{ width: 1, backgroundColor: '#e0e0e0', margin: '8px 0', flexShrink: 0 }} />
                )}
                <BreakdownCol
                  item={item}
                  comparisonLabel={comparisonLabel}
                  showComparison={showComparison}
                  compact={compact}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
