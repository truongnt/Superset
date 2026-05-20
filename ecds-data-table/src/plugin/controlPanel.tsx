import { ControlPanelConfig, sections } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    sections.legacyTimeseriesTime,
    {
      label: 'Query',
      expanded: true,
      controlSetRows: [
        ['metrics'],
        ['groupby'],
        ['adhoc_filters'],
        ['row_limit'],
      ],
    },
    {
      label: 'Hiển thị',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'page_size',
            config: {
              type: 'SelectControl',
              label: 'Số dòng mỗi trang',
              default: 50,
              choices: [
                [20, '20'],
                [50, '50'],
                [100, '100'],
                [200, '200'],
                [0, 'Tất cả'],
              ],
              renderTrigger: true,
              description: 'Số dòng hiển thị mỗi trang. Chọn "Tất cả" để tắt phân trang.',
            },
          },
        ],
      ],
    },
    {
      label: 'Heatmap',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'enable_heatmap',
            config: {
              type: 'CheckboxControl',
              label: 'Bật heatmap',
              default: false,
              renderTrigger: true,
              description:
                'Tô màu ô dựa theo giá trị — mỗi cột số tự tính min/max riêng.',
            },
          },
        ],
        [
          {
            name: 'heatmap_scope',
            config: {
              type: 'SelectControl',
              label: 'Phạm vi heatmap',
              default: 'column',
              choices: [
                ['column', 'Theo cột — min/max riêng từng cột'],
                ['row',    'Theo hàng — min/max riêng từng hàng'],
                ['cell',   'Theo toàn bảng — chung 1 min/max'],
              ],
              renderTrigger: true,
              description:
                'Cột: so sánh trong cùng cột. Hàng: so sánh trong cùng hàng. Toàn bảng: so sánh tất cả ô số.',
              visibility: ({ controls }: any) =>
                Boolean(controls?.enable_heatmap?.value),
            },
          },
        ],
        [
          {
            name: 'heatmap_color',
            config: {
              type: 'SelectControl',
              label: 'Màu heatmap',
              default: 'red',
              choices: [
                ['red',   'Đỏ (trắng → đỏ)'],
                ['blue',  'Xanh dương (trắng → xanh)'],
                ['green', 'Xanh lá (trắng → xanh lá)'],
              ],
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                Boolean(controls?.enable_heatmap?.value),
            },
          },
        ],
      ],
    },
  ],
};

export default config;
