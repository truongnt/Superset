import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

const metadata = new ChartMetadata({
  category: t('ECDS Custom'),
  credits: ['Globits ECDS'],
  description: t(
    'Bản đồ điểm (bubble/pie): hiển thị điểm từ cột lat/lng. ' +
    'Truyền metric để sizing bubble, truyền groupby để chia pie.',
  ),
  name: t('Bản đồ điểm'),
  tags: [t('Map'), t('Point'), t('Bubble'), t('Pie'), t('Geographic')],
  thumbnail: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgcng9IjEyIiBmaWxsPSIjZjBmNGY4Ii8+CiAgPCEtLSBWaWV0bmFtIHNpbXBsaWZpZWQgYmFja2dyb3VuZCAoZmxhdCBncmF5KSAtLT4KICA8cG9seWdvbiBwb2ludHM9Ijg1LDIwIDEyMCwxOCAxMzAsMzUgMTI1LDU1IDEyOCw3NSAxMjAsOTAgMTEyLDEwOCAxMDUsMTE4IDEwMiwxMzAgOTAsMTM1IDg4LDE1MCA3NSwxNTggNzIsMTcyIDU1LDE3NSA0NSwxNjUgNTAsMTUyIDYyLDE0OCA2NSwxMzIgNzgsMTEwIDgwLDEyNSA5MiwxMDAgOTAsODIgOTIsODIgOTAsMTAwIDc4LDExMCA2NSwxMzIgNjIsMTQ4IiBmaWxsPSIjZGNlM2VhIiBzdHJva2U9IiNiMGJhYzUiIHN0cm9rZS13aWR0aD0iMC44Ii8+CiAgPHBvbHlnb24gcG9pbnRzPSI4NSwyMCAxMjAsMTggMTMwLDM1IDEyNSw1NSAxMjgsNzUgMTIwLDkwIDExMiwxMDggMTA1LDExOCAxMDIsMTMwIDkwLDEzNSA4OCwxNTAgNzUsMTU4IDcyLDE3MiA1NSwxNzUgNDUsMTY1IDUwLDE1MiA2MiwxNDggNjUsMTMyIDc4LDExMCA4MCwxMjUgOTIsMTAwIDkwLDgyIDEwMCw2NSAxMDUsNjAgODgsNTAgODAsMzgiIGZpbGw9IiNkY2UzZWEiIHN0cm9rZT0iI2IwYmFjNSIgc3Ryb2tlLXdpZHRoPSIwLjgiLz4KICA8IS0tIFBvaW50czogYnViYmxlcyBvZiBkaWZmZXJlbnQgc2l6ZXMgYW5kIGNvbG9ycyAtLT4KICA8Y2lyY2xlIGN4PSIxMDUiIGN5PSIzNSIgIHI9IjgiICBmaWxsPSIjNUI4RkY5IiBvcGFjaXR5PSIwLjg4Ii8+CiAgPGNpcmNsZSBjeD0iMTE4IiBjeT0iNjgiICByPSI1IiAgZmlsbD0iI0U4Njg0QSIgb3BhY2l0eT0iMC44OCIvPgogIDxjaXJjbGUgY3g9IjEwOCIgY3k9Ijk1IiAgcj0iMTEiIGZpbGw9IiNGNkJEMTYiIG9wYWNpdHk9IjAuODgiLz4KICA8Y2lyY2xlIGN4PSI5NiIgIGN5PSIxMjAiIHI9IjYiICBmaWxsPSIjNUFEOEE2IiBvcGFjaXR5PSIwLjg4Ii8+CiAgPGNpcmNsZSBjeD0iNzQiICBjeT0iMTQwIiByPSI5IiAgZmlsbD0iIzkyNzBDQSIgb3BhY2l0eT0iMC44OCIvPgogIDxjaXJjbGUgY3g9IjYwIiAgY3k9IjE2MCIgcj0iNSIgIGZpbGw9IiM1QjhGRjkiIG9wYWNpdHk9IjAuODgiLz4KICA8Y2lyY2xlIGN4PSI5NSIgIGN5PSI1MCIgIHI9IjQiICBmaWxsPSIjRTg2ODRBIiBvcGFjaXR5PSIwLjg4Ii8+CiAgPGNpcmNsZSBjeD0iODgiICBjeT0iMTA4IiByPSI2IiAgZmlsbD0iIzI2OUE5OSIgb3BhY2l0eT0iMC44OCIvPgogIDx0ZXh0IHg9IjEwMCIgeT0iMTk0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMSIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiM0NDQ3NTMiPkLhuqJOIMSQ4buSIMSQSeG7gk08L3RleHQ+Cjwvc3ZnPg==',
});

export default class EcdsPointMapPlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../PointMap'),
      metadata,
      transformProps,
    });
  }
}
