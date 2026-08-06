import { ControlPanelConfig, sections, getStandardizedControls } from '@superset-ui/chart-controls';

const isAggregate = ({ controls }: any) =>
  (controls?.query_mode?.value ?? 'aggregate') === 'aggregate';

const isRaw = ({ controls }: any) =>
  controls?.query_mode?.value === 'raw_records';

const isHeatmap = ({ controls }: any) =>
  Boolean(controls?.enable_heatmap?.value);

const config: ControlPanelConfig = {
  // Phải dùng getStandardizedControls() để Superset pipeline giữ nguyên toàn bộ
  // custom fields (enable_heatmap, header_bg, ...) trong formData khi qua formDataOverrides.
  // Nếu chỉ return formData, Superset có thể replace bằng version stripped của nó.
  formDataOverrides: formData => {
    const isRawMode = (formData as any).query_mode === 'raw_records';
    return {
      ...formData,
      metrics: isRawMode ? [] : getStandardizedControls().popAllMetrics(),
      groupby: isRawMode ? [] : getStandardizedControls().popAllColumns(),
    };
  },
  controlPanelSections: [
    sections.legacyTimeseriesTime,

    // ── Query ──────────────────────────────────────────────────────────────
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
        // Built-in controls: dùng 'override' (không phải 'config') + resetOnHide: false
        // validators: [] bỏ validator "required" mặc định của metrics
        [
          {
            name: 'groupby',
            override: {
              visibility: isAggregate,
              resetOnHide: false,
            },
          },
        ],
        [
          {
            name: 'metrics',
            override: {
              validators: [],
              visibility: isAggregate,
              resetOnHide: false,
            },
          },
        ],
        // Raw records controls
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
              visibility: isRaw,
              resetOnHide: false,
              description: 'Chọn các cột muốn hiển thị. Để trống = lấy tất cả cột.',
            },
          },
        ],
        [
          {
            name: 'row_id_column',
            config: {
              type: 'SelectControl',
              label: 'Cột định danh duy nhất (chống gộp nhầm dòng)',
              default: null,
              clearable: true,
              mapStateToProps: (state: any) => {
                const cols: string[] =
                  state.datasource?.columns?.map((c: any) => c.column_name) ?? [];
                return { choices: cols.map(c => [c, c]) };
              },
              renderTrigger: false,
              visibility: isRaw,
              resetOnHide: false,
              description:
                'Superset tự GROUP BY toàn bộ cột đang hiển thị khi ở chế độ Raw records ' +
                '(không có metric) — 2 dòng khác nhau nhưng trùng giá trị ở TẤT CẢ cột hiển thị ' +
                'sẽ bị gộp thành 1. Chọn 1 cột định danh duy nhất cho mỗi dòng (mã ca, ID, ...) để ' +
                'query luôn giữ nguyên số dòng thật — cột này được tự thêm vào query kể cả khi ' +
                'không chọn hiển thị ở "Cột hiển thị".',
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
              visibility: isRaw,
              resetOnHide: false,
              description: 'Thứ tự sắp xếp mặc định khi load.',
            },
          },
        ],
        ['adhoc_filters'],
        ['row_limit'],
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

    // ── Table style settings ───────────────────────────────────────────────
    {
      label: 'Bảng — Màu sắc',
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'header_bg',
            config: {
              type: 'ColorPickerControl',
              label: 'Nền header',
              default: { r: 240, g: 244, b: 255, a: 1 },
              renderTrigger: true,
              description: 'Màu nền dòng tiêu đề cột.',
            },
          },
          {
            name: 'header_text',
            config: {
              type: 'ColorPickerControl',
              label: 'Chữ header',
              default: { r: 85, g: 85, b: 85, a: 1 },
              renderTrigger: true,
              description: 'Màu chữ tiêu đề cột.',
            },
          },
        ],
        [
          {
            name: 'row_odd_bg',
            config: {
              type: 'ColorPickerControl',
              label: 'Nền hàng lẻ',
              default: { r: 255, g: 255, b: 255, a: 1 },
              renderTrigger: true,
              description: 'Màu nền hàng 1, 3, 5, ...',
            },
          },
          {
            name: 'row_even_bg',
            config: {
              type: 'ColorPickerControl',
              label: 'Nền hàng chẵn',
              default: { r: 250, g: 252, b: 255, a: 1 },
              renderTrigger: true,
              description: 'Màu nền hàng 2, 4, 6, ...',
            },
          },
        ],
        [
          {
            name: 'border_color',
            config: {
              type: 'ColorPickerControl',
              label: 'Màu viền',
              default: { r: 238, g: 238, b: 238, a: 1 },
              renderTrigger: true,
              description: 'Màu đường kẻ giữa các ô và footer.',
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
              description: 'Tô màu ô dựa theo giá trị.',
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
