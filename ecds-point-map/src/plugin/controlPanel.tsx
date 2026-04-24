import { t } from '@superset-ui/core';
import { ControlPanelConfig, columnChoices } from '@superset-ui/chart-controls';

// ─── Dataset list mutator (chỉ dùng cho map_dataset_id) ──────────────────────
const datasetMutator = (data: any) =>
  (data?.result ?? []).map((d: any) => ({
    value: String(d.id),
    label: d.schema ? `${d.table_name} (${d.schema})` : d.table_name,
  }));

// Gợi ý tên cột — user gõ tuỳ ý nếu khác
const ID_CHOICES      = [['ma_don_vi','ma_don_vi'],['current_province_id','current_province_id'],['id','id'],['province_id','province_id'],['unit_id','unit_id']];
const CODE_CHOICES    = [['ma_tinh','ma_tinh'],['province_code','province_code'],['code','code']];
const NAME_CHOICES    = [['ten_dia_ban','ten_dia_ban'],['name','name'],['province_name','province_name'],['unit_name','unit_name']];
const GEOJSON_CHOICES = [['duong_bien','duong_bien'],['boundary','boundary'],['geojson','geojson'],['geometry','geometry']];
const LEVEL_CHOICES   = [['cap_don_vi','cap_don_vi'],['level','level'],['admin_level','admin_level']];
const PID_CHOICES     = [['ma_don_vi_cha','ma_don_vi_cha'],['parent_id','parent_id'],['province_id','province_id']];

const config: ControlPanelConfig = {
  controlPanelSections: [
    // ── 1. Dữ liệu điểm ──────────────────────────────────────────────────────
    {
      label: t('Dữ liệu điểm'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'lat_column',
            config: {
              type: 'SelectControl',
              label: t('Cột Vĩ độ (Latitude)'),
              description: t('Cột chứa vĩ độ trong dataset chính, vd: lat, latitude'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
          {
            name: 'lng_column',
            config: {
              type: 'SelectControl',
              label: t('Cột Kinh độ (Longitude)'),
              description: t('Cột chứa kinh độ trong dataset chính, vd: lng, lon, longitude'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'label_column',
            config: {
              type: 'SelectControl',
              label: t('Cột nhãn điểm (tuỳ chọn)'),
              description: t('Tên / mô tả hiển thị trong tooltip, vd: facility_name'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'region_id_column',
            config: {
              type: 'SelectControl',
              label: t('Cột mã tỉnh (trong data)'),
              description: t('Cột mã tỉnh trong dataset điểm — dùng để nhận native filter tỉnh và auto-drill.'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
          {
            name: 'region_drill_id_column',
            config: {
              type: 'SelectControl',
              label: t('Cột mã xã (trong data)'),
              description: t('Cột mã xã trong dataset điểm — dùng để nhận native filter xã và auto-drill vào tỉnh chứa xã đó.'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        ['metrics'],
        ['groupby'],
        ['adhoc_filters'],
        [
          {
            name: 'row_limit',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Giới hạn dòng'),
              default: 50000,
              choices: [
                [1000,  '1 000'],
                [5000,  '5 000'],
                [10000, '10 000'],
                [50000, '50 000'],
              ],
            },
          },
        ],
      ],
    },

    // ── 2. Bản đồ nền ─────────────────────────────────────────────────────────
    {
      label: t('Bản đồ nền'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'map_dataset_id',
            config: {
              type: 'SelectAsyncControl',
              label: t('Dataset bản đồ'),
              description: t('Dataset chứa ranh giới vùng (bảng units)'),
              placeholder: t('Chọn dataset…'),
              dataEndpoint:
                '/api/v1/dataset/?q=(page_size:200,order_column:table_name,order_direction:asc)',
              valueKey: 'id',
              labelKey: 'table_name',
              mutator: datasetMutator,
              renderTrigger: false,
              default: null,
            },
          },
        ],
        [
          {
            name: 'map_id_column',
            config: {
              type: 'SelectControl',
              label: t('Cột ID đơn vị (PK)'),
              description: t('Khoá chính của đơn vị hành chính — xã tham chiếu cột này qua ma_don_vi_cha khi drill down'),
              default: 'ma_don_vi',
              freeForm: true,
              renderTrigger: false,
              choices: ID_CHOICES,
            },
          },
          {
            name: 'map_code_column',
            config: {
              type: 'SelectControl',
              label: t('Cột mã tỉnh (bản đồ)'),
              description: t('Cột mã tỉnh trong dataset bản đồ — join với "Cột mã tỉnh (trong data)"'),
              default: 'ma_tinh',
              freeForm: true,
              renderTrigger: false,
              choices: CODE_CHOICES,
            },
          },
        ],
        [
          {
            name: 'map_name_column',
            config: {
              type: 'SelectControl',
              label: t('Cột tên vùng'),
              description: t('Tên hiển thị trong tooltip'),
              default: 'ten_dia_ban',
              freeForm: true,
              renderTrigger: false,
              choices: NAME_CHOICES,
            },
          },
        ],
        [
          {
            name: 'map_geojson_column',
            config: {
              type: 'SelectControl',
              label: t('Cột GeoJSON (ranh giới)'),
              description: t('Cột chứa Polygon/MultiPolygon'),
              default: 'duong_bien',
              freeForm: true,
              renderTrigger: false,
              choices: GEOJSON_CHOICES,
            },
          },
          {
            name: 'map_level_column',
            config: {
              type: 'SelectControl',
              label: t('Cột cấp hành chính'),
              description: t('Cột phân biệt tỉnh/xã'),
              default: 'cap_don_vi',
              freeForm: true,
              renderTrigger: false,
              choices: LEVEL_CHOICES,
            },
          },
        ],
        [
          {
            name: 'map_parent_id_column',
            config: {
              type: 'SelectControl',
              label: t('Cột đơn vị cha'),
              description: t('Cột tham chiếu đơn vị cha — xã chứa mã tỉnh cha (khớp với map_id_column của tỉnh)'),
              default: 'ma_don_vi_cha',
              freeForm: true,
              renderTrigger: false,
              choices: PID_CHOICES,
            },
          },
        ],
        [
          {
            name: 'map_top_level',
            config: {
              type: 'SelectControl',
              label: t('Giá trị level tỉnh'),
              description: t('Giá trị level của cấp tỉnh/thành, vd: 2'),
              default: '2',
              freeForm: true,
              choices: [['1','1'],['2','2'],['3','3'],['4','4']],
              renderTrigger: false,
            },
          },
          {
            name: 'map_drill_level',
            config: {
              type: 'SelectControl',
              label: t('Giá trị level xã (drill down)'),
              description: t('Giá trị level của cấp xã/phường, vd: 3'),
              default: '3',
              freeForm: true,
              choices: [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']],
              renderTrigger: false,
            },
          },
        ],
        [
          {
            name: 'map_fill_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Màu nền vùng'),
              default: { r: 232, g: 232, b: 232, a: 1 },
              renderTrigger: true,
            },
          },
          {
            name: 'map_stroke_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Màu viền vùng'),
              default: { r: 170, g: 170, b: 170, a: 1 },
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'map_border_width',
            config: {
              type: 'SliderControl',
              label: t('Độ dày đường ranh giới (cấp tỉnh)'),
              description: t('Độ dày viền tỉnh. Cấp xã tự động mỏng hơn 3 lần.'),
              default: 0.5,
              min: 0.1,
              max: 3,
              step: 0.1,
              renderTrigger: true,
            },
          },
        ],
      ],
    },

    // ── 3. Timelapse ─────────────────────────────────────────────────────────
    {
      label: t('Timelapse (chạy theo thời gian)'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'timelapse_enabled',
            config: {
              type: 'CheckboxControl',
              label: t('Bật timelapse'),
              default: false,
              renderTrigger: true,
              description: t('Hiển thị thanh điều khiển animation để xem dữ liệu thay đổi theo thời gian'),
            },
          },
        ],
        [
          {
            name: 'timelapse_time_column',
            config: {
              type: 'SelectControl',
              label: t('Cột thời gian'),
              description: t('Cột trong dataset chứa mốc thời gian (tuần, tháng, ngày...) để phân nhóm dữ liệu khi chạy timelapse. Sau khi chọn cột cần nhấn "Update Chart" để truy vấn lại.'),
              default: '',
              freeForm: true,
              renderTrigger: false,
              mapStateToProps: (state: any) => ({
                choices: columnChoices(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: 'timelapse_speed',
            config: {
              type: 'SliderControl',
              label: t('Tốc độ (ms/bước)'),
              description: t('Thời gian dừng ở mỗi mốc trước khi chuyển bước tiếp theo (ms). Giá trị nhỏ = nhanh hơn.'),
              default: 1000,
              min: 200,
              max: 3000,
              step: 100,
              renderTrigger: true,
            },
          },
        ],
      ],
    },

    // ── 4. Hiển thị ───────────────────────────────────────────────────────────
    {
      label: t('Hiển thị điểm'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'enable_drilldown',
            config: {
              type: 'CheckboxControl',
              label: t('Cho phép drill down bản đồ nền'),
              default: true,
              renderTrigger: true,
              description: t('Click vào tỉnh/thành để xem ranh giới xã/phường bên trong'),
            },
          },
          {
            name: 'start_at_drill_level',
            config: {
              type: 'CheckboxControl',
              label: t('Hiển thị cấp xã ngay từ đầu'),
              default: false,
              renderTrigger: true,
              description: t('Bỏ qua cấp tỉnh, hiển thị toàn bộ ranh giới xã/phường luôn từ đầu'),
            },
          },
        ],
        [
          {
            name: 'point_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Màu điểm'),
              description: t('Màu mặc định khi không có groupby'),
              default: { r: 24, g: 144, b: 255, a: 1 },
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'point_size_min',
            config: {
              type: 'SliderControl',
              label: t('Kích thước nhỏ nhất (px)'),
              default: 5,
              min: 2,
              max: 30,
              step: 1,
              renderTrigger: true,
            },
          },
          {
            name: 'point_size_max',
            config: {
              type: 'SliderControl',
              label: t('Kích thước lớn nhất (px)'),
              default: 28,
              min: 5,
              max: 80,
              step: 1,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
