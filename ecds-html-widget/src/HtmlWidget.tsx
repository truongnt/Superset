import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
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

function buildSrcdoc(props: EcdsHtmlWidgetProps): string {
  const { htmlTemplate, rows, firstRow, metricLabels, columnNames } = props;

  const dataJson    = JSON.stringify(rows);
  const metricsJson = JSON.stringify(metricLabels);
  const colsJson    = JSON.stringify(columnNames);

  const injectedScript = `<script>
(function () {
  window.__chartData    = ${dataJson};
  window.__metricLabels = ${metricsJson};
  window.__columnNames  = ${colsJson};
  window.DATA  = window.__chartData;
  window.FIRST = window.__chartData[0] || {};
})();
</script>`;

  const resolvedHtml = applyPlaceholders(htmlTemplate, firstRow);

  const isFullDoc =
    /<html[\s>]/i.test(resolvedHtml) || /<!doctype/i.test(resolvedHtml);

  if (isFullDoc) {
    if (/<head[\s>]/i.test(resolvedHtml)) {
      return resolvedHtml.replace(/(<head[^>]*>)/i, `$1\n${injectedScript}\n`);
    }
    return resolvedHtml.replace(/<body[^>]*>/i, `$&\n${injectedScript}\n`);
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      color: #222;
      background: transparent;
      padding: 0;
    }
  </style>
  ${injectedScript}
</head>
<body>
${resolvedHtml}
</body>
</html>`;
}

// ─── Build HTML thuần cho print div (không dùng iframe) ──────────────────────
// html2canvas capture được div trực tiếp, không capture được iframe.

function buildPrintHtml(props: EcdsHtmlWidgetProps): string {
  const { htmlTemplate, rows, firstRow, metricLabels, columnNames } = props;

  const resolvedHtml = applyPlaceholders(htmlTemplate, firstRow);

  // Lấy phần body content, bỏ <html>/<head>/<body> wrapper
  let bodyContent = resolvedHtml;
  const bodyMatch = resolvedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  } else if (/<html[\s>]/i.test(resolvedHtml) || /<!doctype/i.test(resolvedHtml)) {
    bodyContent = resolvedHtml
      .replace(/<!doctype[^>]*>/i, '')
      .replace(/<html[^>]*>/i, '')
      .replace(/<\/html>/i, '')
      .replace(/<head[\s\S]*?<\/head>/i, '');
  }

  // Inject data vào window trước khi các script trong template chạy
  const dataInit = `<script>
(function(){
  window.__chartData    = ${JSON.stringify(rows)};
  window.__metricLabels = ${JSON.stringify(metricLabels)};
  window.__columnNames  = ${JSON.stringify(columnNames)};
  window.DATA  = window.__chartData;
  window.FIRST = window.__chartData[0] || {};
})();
</script>`;

  return `${dataInit}${bodyContent}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HtmlWidget(props: EcdsHtmlWidgetProps) {
  const { width, height, htmlTemplate } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const printRef  = useRef<HTMLDivElement>(null);

  // isPrinting = true khi dom-to-pdf (Export to PDF) đang capture
  const [isPrinting, setIsPrinting] = useState(false);

  const srcdoc    = useMemo(() => buildSrcdoc(props), [
    props.htmlTemplate, props.rows, props.firstRow,
    props.metricLabels, props.columnNames,
  ]);

  const printHtml = useMemo(() => buildPrintHtml(props), [
    props.htmlTemplate, props.rows, props.firstRow,
    props.metricLabels, props.columnNames,
  ]);

  // ── Detect khi Superset bắt đầu export PDF ──────────────────────────────
  // Superset 4.x dùng dom-to-pdf → html2canvas. Trước khi chụp, dom-to-pdf
  // clone DOM và thêm style vào <head>. Detect bằng MutationObserver trên
  // <head> hoặc lắng nghe CustomEvent 'exportDashboard' mà một số Superset
  // version dispatch.
  useEffect(() => {
    // Phương án 1: window events (một số browser/version hỗ trợ)
    const onBefore = () => setIsPrinting(true);
    const onAfter  = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint',  onAfter);

    // Phương án 2: MutationObserver detect khi dom-to-pdf thêm style clone
    // dom-to-pdf tạo element canvas tạm thời ở body level
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (
            node instanceof HTMLElement &&
            (node.tagName === 'CANVAS' ||
              node.classList?.contains('dom-to-pdf') ||
              node.id?.includes('html2canvas'))
          ) {
            setIsPrinting(true);
            // Auto reset sau khi capture xong (~3s)
            setTimeout(() => setIsPrinting(false), 3000);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    // Phương án 3: Superset dispatch CustomEvent trước khi export
    // (tuỳ version, không đảm bảo nhưng thêm cho chắc)
    const onExport = () => {
      setIsPrinting(true);
      setTimeout(() => setIsPrinting(false), 5000);
    };
    window.addEventListener('superset-export-pdf', onExport as EventListener);

    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint',  onAfter);
      window.removeEventListener('superset-export-pdf', onExport as EventListener);
      observer.disconnect();
    };
  }, []);

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

  // Chạy inline scripts trong printRef sau khi dangerouslySetInnerHTML render
  useEffect(() => {
    if (!isPrinting || !printRef.current) return;
    const container = printRef.current;
    // Re-execute inline scripts vì dangerouslySetInnerHTML không tự chạy script
    container.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [isPrinting, printHtml]);

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
        NORMAL MODE: iframe — JS đầy đủ, isolated scope.
        Ẩn khi export (html2canvas không capture được iframe nội dung).
      */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        title="ecds-html-widget"
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
          visibility: isPrinting ? 'hidden' : 'visible',
        }}
      />

      {/*
        EXPORT MODE: div trực tiếp — html2canvas capture được.
        Chỉ hiện khi isPrinting = true.
        Script trong printHtml được re-execute bởi useEffect bên trên.
      */}
      <div
        ref={printRef}
        style={{
          width,
          height,
          overflow: 'hidden',
          fontFamily: "'Segoe UI', Arial, sans-serif",
          fontSize: 14,
          color: '#222',
          background: 'transparent',
          position: 'absolute',
          top: 0,
          left: 0,
          display: isPrinting ? 'block' : 'none',
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: printHtml }}
      />
    </div>
  );
}