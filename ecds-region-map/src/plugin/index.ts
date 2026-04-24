import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

const metadata = new ChartMetadata({
  category: t('ECDS Custom'),
  credits: ['Globits ECDS'],
  description: t('Bản đồ choropleth theo vùng — hỗ trợ GeoJSON từ dataset hoặc file tĩnh, drilldown theo cấp hành chính'),
  name: t('Bản đồ vùng'),
  tags: [t('Geo'), t('Choropleth'), t('2D'), t('Region'), t('Map')],
  thumbnail: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgcng9IjEyIiBmaWxsPSIjZjBmNGY4Ii8+CiAgPCEtLSBWaWV0bmFtIHNpbXBsaWZpZWQgb3V0bGluZSAvIHJlZ2lvbnMgYXMgYWJzdHJhY3QgcG9seWdvbnMgLS0+CiAgPCEtLSBOb3J0aCByZWdpb24gKGJsdWUpIC0tPgogIDxwb2x5Z29uIHBvaW50cz0iODUsMjAgMTIwLDE4IDEzMCwzNSAxMjUsNTUgMTA1LDYwIDg4LDUwIDgwLDM4IiBmaWxsPSIjNUI4RkY5IiBvcGFjaXR5PSIwLjg1Ii8+CiAgPCEtLSBOb3J0aC1DZW50cmFsIChncmVlbikgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSIxMDUsNjAgMTI1LDU1IDEyOCw3NSAxMjAsOTAgMTA4LDkyIDk4LDgwIDEwMCw2NSIgZmlsbD0iIzVBRDhBNiIgb3BhY2l0eT0iMC44NSIvPgogIDwhLS0gQ2VudHJhbCAob3JhbmdlKSAtLT4KICA8cG9seWdvbiBwb2ludHM9IjEwMCw2NSAxMDgsOTIgMTEyLDEwOCAxMDUsMTE4IDk1LDExNSA5MCwxMDAgOTIsODIiIGZpbGw9IiNGNkJEMTYiIG9wYWNpdHk9IjAuODUiLz4KICA8IS0tIENlbnRyYWwgSGlnaGxhbmRzIChyZWQpIC0tPgogIDxwb2x5Z29uIHBvaW50cz0iOTIsMTAwIDEwNSwxMTggMTAyLDEzMCA5MCwxMzUgODAsMTI1IDc4LDExMCIgZmlsbD0iI0U4Njg0QSIgb3BhY2l0eT0iMC44NSIvPgogIDwhLS0gU291dGggKHB1cnBsZSkgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSI4MCwxMjUgOTAsMTM1IDg4LDE1MCA3NSwxNTggNjIsMTQ4IDY1LDEzMiA3MiwxMjIiIGZpbGw9IiM5MjcwQ0EiIG9wYWNpdHk9IjAuODUiLz4KICA8IS0tIE1la29uZyBEZWx0YSAodGVhbCkgLS0+CiAgPHBvbHlnb24gcG9pbnRzPSI2MiwxNDggNzUsMTU4IDcyLDE3MiA1NSwxNzUgNDUsMTY1IDUwLDE1MiIgZmlsbD0iIzI2OUE5OSIgb3BhY2l0eT0iMC44NSIvPgogIDwhLS0gQm9yZGVyIG91dGxpbmVzIC0tPgogIDxwb2x5bGluZSBwb2ludHM9Ijg1LDIwIDEyMCwxOCAxMzAsMzUgMTI1LDU1IDEyOCw3NSAxMjAsOTAgMTEyLDEwOCAxMDUsMTE4IDEwMiwxMzAgOTAsMTM1IDg4LDE1MCA3NSwxNTggNzIsMTcyIDU1LDE3NSA0NSwxNjUgNTAsMTUyIDYyLDE0OCA2NSwxMzIgNzgsMTEwIDgwLDEyNSA5MiwxMDAgOTAsMTAwIDc4LDExMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjAuOCIgb3BhY2l0eT0iMC42Ii8+CiAgPHRleHQgeD0iMTAwIiB5PSIxOTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzQ0NDc1MyI+QuG6ok4gxJDhu5IgVsOZTkc8L3RleHQ+Cjwvc3ZnPg==',
});

export default class EcdsRegionMapPlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../RegionMap'),
      metadata,
      transformProps,
    });
  }
}
