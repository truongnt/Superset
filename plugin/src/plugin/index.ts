import { ChartMetadata, ChartPlugin } from '@superset-ui/core';

import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

export default class HelloWorldChartPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      category: 'Examples',
      credits: ['Internal scaffold'],
      description: 'Starter chart plugin used as a base for custom Superset development.',
      name: 'Hello World',
      thumbnail:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
            <rect width="160" height="120" rx="16" fill="#eef6ff"/>
            <rect x="18" y="18" width="124" height="84" rx="12" fill="#ffffff" stroke="#c7d2fe"/>
            <rect x="32" y="70" width="24" height="18" rx="4" fill="#93c5fd"/>
            <rect x="68" y="54" width="24" height="34" rx="4" fill="#60a5fa"/>
            <rect x="104" y="40" width="24" height="48" rx="4" fill="#2563eb"/>
          </svg>`,
        ),
      tags: ['starter', 'typescript'],
    });

    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../HelloWorldChart'),
      metadata,
      transformProps,
    });
  }
}
