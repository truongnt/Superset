import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

const metadata = new ChartMetadata({
  category: t('ECDS Custom'),
  credits: ['CHAI Vietnam'],
  description: t(
    'Bảng số liệu với filter từng cột, sort và heatmap tô màu theo giá trị.',
  ),
  name: t('Data Table'),
  tags: [t('Table'), t('Filter'), t('Sort'), t('Heatmap'), t('Custom')],
  thumbnail:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
        <rect width="160" height="120" rx="12" fill="#f0f4ff"/>
        <rect x="10" y="10" width="140" height="100" rx="8" fill="#fff" stroke="#dde3f0"/>
        <rect x="10" y="10" width="140" height="22" rx="8" fill="#dde3f0"/>
        <rect x="10" y="28" width="140" height="4" fill="#dde3f0"/>
        <rect x="14" y="36" width="60" height="10" rx="2" fill="#f0f4ff"/>
        <rect x="84" y="36" width="60" height="10" rx="2" fill="#bfdbfe"/>
        <rect x="14" y="52" width="60" height="10" rx="2" fill="#f0f4ff"/>
        <rect x="84" y="52" width="60" height="10" rx="2" fill="#93c5fd"/>
        <rect x="14" y="68" width="60" height="10" rx="2" fill="#f0f4ff"/>
        <rect x="84" y="68" width="60" height="10" rx="2" fill="#60a5fa"/>
        <rect x="14" y="84" width="60" height="10" rx="2" fill="#f0f4ff"/>
        <rect x="84" y="84" width="60" height="10" rx="2" fill="#2563eb"/>
      </svg>`,
    ),
});

export default class EcdsDataTablePlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../DataTable'),
      metadata,
      transformProps,
    });
  }
}
