import { ControlPanelConfig, sections } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    sections.legacyTimeseriesTime,
    {
      label: 'Query',
      expanded: true,
      controlSetRows: [['metric'], ['adhoc_filters']],
    },
    {
      label: 'Customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'headerText',
            config: {
              type: 'TextControl',
              label: 'Header text',
              default: 'Superset Plugin',
              renderTrigger: true,
              description: 'Short title displayed above the metric.',
            },
          },
        ],
      ],
    },
  ],
};

export default config;
