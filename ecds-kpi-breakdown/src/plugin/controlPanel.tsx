import { t } from '@superset-ui/core';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        // Metric đếm số ca
        ['metric'],
        ['adhoc_filters'],
        ['time_range'],
        [
          {
            name: 'breakdown_column',
            config: {
              type: 'SelectControl',
              label: t('Cột phân loại (breakdown)'),
              description: t(
                'Cột dùng để nhóm các hàng thành breakdown phía dưới. ' +
                'Mỗi giá trị duy nhất trong cột này sẽ thành 1 ô riêng.',
              ),
              mapStateToProps: (state: any) => ({
                choices: (state.datasource?.columns ?? []).map((c: any) => [
                  c.column_name,
                  c.column_name,
                ]),
              }),
              clearable: true,
            },
          },
        ],
        [
          {
            name: 'date_column',
            config: {
              type: 'SelectControl',
              label: t('Cột ngày (để so sánh năm trước)'),
              description: t('Cột DATE/DATETIME dùng để lọc cùng kỳ năm trước'),
              mapStateToProps: (state: any) => ({
                choices: (state.datasource?.columns ?? []).map((c: any) => [
                  c.column_name,
                  c.column_name,
                ]),
              }),
              clearable: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Hiển thị'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'title_text',
            config: {
              type: 'TextControl',
              label: t('Tiêu đề thẻ'),
              default: 'Tổng số trường hợp bệnh',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'comparison_label',
            config: {
              type: 'TextControl',
              label: t('Nhãn so sánh'),
              default: 'cùng kỳ năm trước',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'show_comparison',
            config: {
              type: 'CheckboxControl',
              label: t('Hiện so sánh năm trước'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'sort_breakdown',
            config: {
              type: 'SelectControl',
              label: t('Sắp xếp breakdown'),
              default: 'value_desc',
              renderTrigger: true,
              choices: [
                ['value_desc', t('Giá trị giảm dần')],
                ['value_asc', t('Giá trị tăng dần')],
                ['label_asc', t('Nhãn A → Z')],
                ['label_desc', t('Nhãn Z → A')],
                ['natural', t('Thứ tự tự nhiên từ data')],
              ],
            },
          },
        ],
      ],
    },
  ],
};

export default config;
