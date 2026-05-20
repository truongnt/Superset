import React, { useMemo, useRef, useEffect, useState } from 'react';
// @ts-ignore
import html2canvasSource from '!!raw-loader!html2canvas/dist/html2canvas.min.js';
import { EcdsHtmlWidgetProps } from './types';

// ─── Template engine ─────────────────────────────────────────────────────────

function applyPlaceholders(
  template: string,
  firstRow: Record<string, any>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    const val = firstRow[trimmed];
    if (val == null) return '';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? val.toLocaleString('vi-VN') : val.toFixed(2);
    }
    return String(val);
  });
}

// ─── Build srcdoc cho iframe ─────────────────────────────────────────────────

function buildSrcdoc(props: EcdsHtmlWidgetProps, widgetId: string): string {
  const { htmlTemplate, rows, firstRow, metricLabels, columnNames } = props;

  const dataJson    = JSON.stringify(rows);
  const metricsJson = JSON.stringify(metricLabels);
  const colsJson    = JSON.stringify(columnNames);

  // Inject html2canvas + data + script tự chụp và gửi ra ngoài qua postMessage
  // widgetId được nhúng vào để parent phân biệt screenshot từ widget nào
  const injectedScript = `
<script>
${html2canvasSource}
</script>
<script>
(function () {
  var WIDGET_ID = '${widgetId}';
  window.__chartData    = ${dataJson};
  window.__metricLabels = ${metricsJson};
  window.__columnNames  = ${colsJson};
  window.DATA  = window.__chartData;
  window.FIRST = window.__chartData[0] || {};

  function captureAndSend() {
    html2canvas(document.body, {
      backgroundColor: '#ffffff',
      scale: 1,
      useCORS: true,
      logging: false,
    }).then(function(canvas) {
      var dataUrl = canvas.toDataURL('image/png');
      window.parent.postMessage({ type: 'ecds-screenshot', widgetId: WIDGET_ID, dataUrl: dataUrl }, '*');
    }).catch(function(e) {
      window.parent.postMessage({ type: 'ecds-screenshot-error', widgetId: WIDGET_ID, error: String(e) }, '*');
    });
  }

  if (document.readyState === 'complete') {
    setTimeout(captureAndSend, 300);
  } else {
    window.addEventListener('load', function() {
      setTimeout(captureAndSend, 300);
    });
  }
})();
</script>`;

  const resolvedHtml = applyPlaceholders(htmlTemplate, firstRow);
  const isFullDoc = /<html[\s>]/i.test(resolvedHtml) || /<!doctype/i.test(resolvedHtml);

  if (isFullDoc) {
    // Inject vào <head> để data sẵn sàng trước khi user script chạy
    if (/<\/head>/i.test(resolvedHtml)) {
      return resolvedHtml.replace(/<\/head>/i, `${injectedScript}\n</head>`);
    }
    if (/<\/body>/i.test(resolvedHtml)) {
      return resolvedHtml.replace(/<body>/i, `<body>\n${injectedScript}`);
    }
    return injectedScript + resolvedHtml;
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #222; background: #fff; }
  </style>
${injectedScript}
</head>
<body>
${resolvedHtml}
</body>
</html>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HtmlWidget(props: EcdsHtmlWidgetProps) {
  const { width, height, htmlTemplate } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ID duy nhất cho mỗi widget instance — tránh nhận nhầm postMessage
  const widgetId = useRef<string>('ecds-' + Math.random().toString(36).slice(2));

  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const srcdoc = useMemo(() => buildSrcdoc(props, widgetId.current), [
    props.htmlTemplate, props.rows, props.firstRow,
    props.metricLabels, props.columnNames,
  ]);

  // Nhận postMessage từ iframe — chỉ xử lý nếu widgetId khớp
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'ecds-screenshot') return;
      if (event.data.widgetId !== widgetId.current) return; // bỏ qua widget khác
      setScreenshotUrl(event.data.dataUrl);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Reset khi data thay đổi
  useEffect(() => {
    setScreenshotUrl(null);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [srcdoc]);

  // Vẽ screenshot lên canvas
  useEffect(() => {
    if (!screenshotUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth  || (width as number);
      const h = img.naturalHeight || (height as number);
      // Đặt intrinsic size khớp với ảnh — tránh méo khi CSS != intrinsic
      canvas.width  = w;
      canvas.height = h;
      // Đồng bộ CSS size để không bị scale lệch
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.drawImage(img, 0, 0);
    };
    img.src = screenshotUrl;
  }, [screenshotUrl, width, height]);

  // Resize iframe theo nội dung
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          iframe.style.height = Math.max(height, body.scrollHeight) + 'px';
        }
      } catch (_) {}
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [srcdoc, height]);

  if (!htmlTemplate || !htmlTemplate.trim()) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontFamily: 'sans-serif',
          fontSize: 14,
          border: '1px dashed #ccc',
          borderRadius: 6,
          background: '#fafafa',
        }}
      >
        ✏️ Chưa có template HTML. Mở cấu hình chart → "Nội dung HTML / JS" để nhập.
      </div>
    );
  }

  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {/*
        iframe: user nhìn thấy, bị exclude khi export PDF nhờ class header-controls
        (dom-to-pdf của Superset dùng excludeClassNames: ['header-controls'])
      */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        title="ecds-html-widget"
        className="header-controls"
        width={width}
        height={height}
        style={{
          border: 'none',
          display: 'block',
          width,
          height,
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 2,            // Luôn nằm trên canvas — user thao tác được
        }}
      />

      {/*
        canvas: chứa screenshot từ iframe, được capture bởi dom-to-pdf khi export.
        zIndex thấp hơn iframe → bình thường bị che, chỉ lộ ra khi iframe bị
        exclude (class header-controls) lúc Superset chạy html2canvas để export PDF.
        CSS width/height được set động theo kích thước ảnh thực tế (tránh méo).
      */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 1,           // opacity: 1 để pdf capture đúng màu
          pointerEvents: 'none',
          userSelect: 'none',
          display: 'block',
          zIndex: 1,            // Dưới iframe (zIndex 2), trên nền (zIndex 0)
        }}
      />
    </div>
  );
}