import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

const metadata = new ChartMetadata({
  category: t('ECDS Custom'),
  credits: ['Globits ECDS'],
  description: t('Nhúng HTML/JS tuỳ chỉnh với dữ liệu từ dataset. Dùng {{tên_cột}} để chèn giá trị, window.__chartData để truy cập toàn bộ dữ liệu trong JS.'),
  name: t('HTML Widget'),
  tags: [t('HTML'), t('Custom'), t('Advanced'), t('Template')],
  thumbnail: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgcng9IjEyIiBmaWxsPSIjMWUxZTJlIi8+CiAgPCEtLSBDb2RlIGxpbmVzIC0tPgogIDxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjYwIiBoZWlnaHQ9IjgiIHJ4PSIzIiBmaWxsPSIjZjM4YmE4IiBvcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSI4OCIgeT0iMzAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI4IiByeD0iMyIgZmlsbD0iI2E2ZTNhMSIgb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iMTM2IiB5PSIzMCIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjgiIHJ4PSIzIiBmaWxsPSIjZjM4YmE4IiBvcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIzNSIgeT0iNTIiIHdpZHRoPSI5MCIgaGVpZ2h0PSI4IiByeD0iMyIgZmlsbD0iI2NiYTZmNyIgb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iMTMzIiB5PSI1MiIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjgiIHJ4PSIzIiBmaWxsPSIjZmFiMzg3IiBvcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIzNSIgeT0iNzQiIHdpZHRoPSI1MCIgaGVpZ2h0PSI4IiByeD0iMyIgZmlsbD0iIzg5ZGNlYiIgb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iOTMiIHk9Ijc0IiB3aWR0aD0iNzAiIGhlaWdodD0iOCIgcng9IjMiIGZpbGw9IiNhNmUzYTEiIG9wYWNpdHk9IjAuOSIvPgogIDxyZWN0IHg9IjM1IiB5PSI5NiIgd2lkdGg9IjExMCIgaGVpZ2h0PSI4IiByeD0iMyIgZmlsbD0iI2Y5ZTJhZiIgb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iMjAiIHk9IjExOCIgd2lkdGg9IjU1IiBoZWlnaHQ9IjgiIHJ4PSIzIiBmaWxsPSIjZjM4YmE4IiBvcGFjaXR5PSIwLjkiLz4KICA8IS0tIERhdGEgYmFkZ2UgLS0+CiAgPHJlY3QgeD0iMjAiIHk9IjE0MCIgd2lkdGg9IjE2MCIgaGVpZ2h0PSIzMiIgcng9IjYiIGZpbGw9IiMzMTMyNDQiLz4KICA8dGV4dCB4PSIxMDAiIHk9IjE2MSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iI2E2ZTNhMSI+eyJkYXRhIjogd2luZG93Ll9fY2hhcnREYXRhfTwvdGV4dD4KICA8dGV4dCB4PSIxMDAiIHk9IjE5MiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTEiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjY2RkNmY0Ij5IVE1MIFdJREdFVDwvdGV4dD4KPC9zdmc+Cg==',
});

export default class EcdsHtmlWidgetPlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../HtmlWidget'),
      metadata,
      transformProps,
    });
  }
}
