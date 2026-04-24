import { HelloWorldChartProps } from './types';

export default function HelloWorldChart({
  width,
  height,
  headerText,
  metricLabel,
  value,
}: HelloWorldChartProps) {
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          border: '1px solid #d9d9d9',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #f7fbff 0%, #eef6ff 100%)',
          padding: 24,
          fontFamily:
            '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#5b6b7a',
            marginBottom: 10,
          }}
        >
          {headerText}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#102a43',
            marginBottom: 8,
          }}
        >
          {value ?? 'N/A'}
        </div>
        <div
          style={{
            fontSize: 14,
            color: '#486581',
          }}
        >
          Metric: {metricLabel}
        </div>
      </div>
    </div>
  );
}
