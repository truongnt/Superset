import { ControlPanelConfig, sections } from '@superset-ui/chart-controls';

const isAggregate = ({ controls }: any) =>
  (controls?.query_mode?.value ?? 'aggregate') === 'aggregate';

const isRaw = ({ controls }: any) =>
  controls?.query_mode?.value === 'raw_records';

const isHeatmap = ({ controls }: any) =>
  Boolean(controls?.enable_heatmap?.value);

const config: ControlPanelConfig = {
  controlPanelSections: [
    sections.legacyTimeseriesTime,
    {
      label: 'Query',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'query_mode',
            config: {
              type: 'SelectControl',
              label: 'Chế độ query',
              default: 'aggregate',
              choices: [
                ['aggregate',   'Aggregate — groupby + metrics'],
                ['raw_records', 'Raw records — toàn bộ dòng'],
              ],
              renderTrigger: false,
              description:
                'Aggregate: tổng hợp theo nhóm. Raw records: lấy thẳng từng dòng không gom nhóm.',
            },
          },
        ],
        ['adhoc_filters'],
        ['row_limit'],
      ],
    },

    // ── Aggregate mode section ─────────────────────────────────────────────
    {
      label: 'Aggregate — Nhóm và tổng hợp',
      expanded: true,
      visibility: isAggregate,
      controlSetRows: [
        ['metrics'],
        ['groupby'],
      ],
    },

    // ── Raw records mode section ───────────────────────────────────────────
    {
      label: 'Raw Records — Chọn cột',
      expanded: true,
      visibility: isRaw,
      controlSetRows: [
        [
          {
            name: 'all_columns',
            config: {
              type: 'SelectControl',
              label: 'Cột hiển thị',
              multi: true,
              default: [],
              mapStateToProps: (state: any) => {
                const cols: string[] =
                  state.datasource?.columns?.map((c: any) => c.column_name) ?? [];
                return { choices: cols.map(c => [c, c]) };
              },
              renderTrigger: false,
              description: 'Chọn các cột muốn hiển thị. Để trống = lấy tất cả cột.',
            },
          },
        ],
        [
          {
            name: 'order_by_cols',
            config: {
              type: 'SelectControl',
              label: 'Sắp xếp mặc định',
              multi: true,
              default: [],
              mapStateToProps: (state: any) => {
                const cols: string[] =
                  state.datasource?.columns?.map((c: any) => c.column_name) ?? [];
                return {
                  choices: [
                    ...cols.map(c => [`${c} ASC`, `${c} ↑`]),
                    ...cols.map(c => [`${c} DESC`, `${c} ↓`]),
                  ],
                };
              },
              renderTrigger: false,
              description: 'Thứ tự sắp xếp mặc định khi load (user vẫn có thể sort lại trên UI).',
            },
          },
        ],
      ],
    },

    // ── Display settings ───────────────────────────────────────────────────
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

    // ── Heatmap settings ───────────────────────────────────────────────────
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
              description: 'Tô màu ô dựa theo giá trị — mỗi cột số tự tính min/max riêng.',
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
              visibility: isHeatmap,
            },
          },
        ],
        [
          {
            name: 'heatmap_color_low',
            config: {
              type: 'ColorPickerControl',
              label: 'Màu giá trị thấp',
              default: { r: 255, g: 255, b: 255, a: 1 },
              renderTrigger: true,
              description: 'Màu tô cho ô có giá trị nhỏ nhất.',
              visibility: isHeatmap,
            },
          },
          {
            name: 'heatmap_color_high',
            config: {
              type: 'ColorPickerControl',
              label: 'Màu giá trị cao',
              default: { r: 220, g: 38, b: 38, a: 1 },
              renderTrigger: true,
              description: 'Màu tô cho ô có giá trị lớn nhất.',
              visibility: isHeatmap,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
