import { t } from '@superset-ui/core';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

const TEMPLATE_HINT = `<!-- ═══════════════════════════════════════
  CÁCH DÙNG PLACEHOLDER:
  ───────────────────────────────────────
  {{tên_cột}}          → giá trị cột từ row đầu tiên
  {{tên_metric}}       → giá trị metric từ row đầu tiên

  TRUY CẬP TOÀN BỘ DATA QUA JS:
  ───────────────────────────────────────
  window.__chartData   → mảng tất cả rows (Array<Object>)
  window.__metricLabels → tên các metrics (Array<String>)
  window.__columnNames  → tên các columns (Array<String>)

  VÍ DỤ:
  ───────────────────────────────────────
  <div>Tổng ca bệnh: <b>{{count}}</b></div>

  <script>
    const rows = window.__chartData;
    const total = rows.reduce((s, r) => s + (r.count || 0), 0);
    document.getElementById('total').textContent = total;
  </script>
══════════════════════════════════════ -->

<div style="font-family:sans-serif; padding:16px;">
  <h2>Tổng ca: {{count}}</h2>
</div>`;

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        ['metrics'],
        ['groupby'],
        ['granularity_sqla'],
        ['time_grain_sqla'],
        ['adhoc_filters'],
        ['time_range'],
        [
          {
            name: 'row_limit',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Row limit'),
              default: 1000,
              choices: [
                [100, '100'],
                [500, '500'],
                [1000, '1 000'],
                [5000, '5 000'],
                [10000, '10 000'],
              ],
            },
          },
        ],
        [
          {
            name: 'ecds_sort_cols',
            config: {
              type: 'SelectControl',
              label: t('Sắp xếp'),
              multi: true,
              default: [],
              mapStateToProps: (state: any) => {
                const cols: string[] =
                  state.datasource?.columns?.map((c: any) => c.column_name) ?? [];
                return {
                  choices: [
                    ...cols.map((c: string) => [`${c} ASC`, `${c} ↑`]),
                    ...cols.map((c: string) => [`${c} DESC`, `${c} ↓`]),
                  ],
                };
              },
              renderTrigger: false,
              description: t('Thứ tự sắp xếp dữ liệu trả về từ query.'),
            },
          },
        ],
      ],
    },
    {
      label: t('HTML Template'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'html_template',
            config: {
              type: 'TextAreaControl',
              label: t('Nội dung HTML / JS'),
              description: t(
                '💡 Nhấn nút "Edit in modal" (↗) bên cạnh tên ô để mở editor toàn màn hình có highlight cú pháp. ' +
                'Dùng {{tên_cột}} hoặc {{tên_metric}} để chèn giá trị từ data. ' +
                'Truy cập toàn bộ data qua window.__chartData trong thẻ <script>.',
              ),
              default: TEMPLATE_HINT,
              renderTrigger: true,
              language: 'html',
              offerEditInModal: true,
              // Tăng chiều cao inline editor
              minLines: 28,
              maxLines: 60,
            },
          },
        ],
        [
          {
            name: 'sandbox_mode',
            config: {
              type: 'CheckboxControl',
              label: t('Sandbox iframe (an toàn hơn, giới hạn JS)'),
              default: false,
              renderTrigger: true,
              description: t(
                'Bật để chạy trong iframe sandbox — hạn chế localStorage, cookie, popup. ' +
                'Tắt nếu cần JS đầy đủ quyền (VD: gọi API nội bộ).',
              ),
            },
          },
        ],
      ],
    },
  ],
};

export default config;
