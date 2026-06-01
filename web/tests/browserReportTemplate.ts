export type BrowserCaseStatus = 'pass' | 'partial' | 'fail';

export interface BrowserCaseResult {
  id: string;
  name: string;
  input: string;
  expected: string;
  actual: Record<string, string>;
  status: BrowserCaseStatus;
  screenshotFile?: string;
}

export interface BrowserReportData {
  generatedAt: string;
  commitHash: string;
  appVersion: string;
  webVersion: string;
  browserName: string;
  browserVersion: string;
  browserUserAgent: string;
  browserPlatform: string;
  browserLanguage: string;
  appUrl: string;
  reportDirectoryName: string;
  toolsUsed: string[];
  responseHeaders: Record<string, string>;
  outputFiles: {
    html: string;
    json: string;
    pdf: string;
  };
  cases: BrowserCaseResult[];
  securityNotes: string[];
  performanceNotes: string[];
  limitations: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderStatus(status: BrowserCaseStatus): string {
  const label = status === 'pass' ? 'Pass' : status === 'partial' ? 'Partial' : 'Fail';
  return `<span class="status-pill status-${status}">${label}</span>`;
}

function renderKeyValueRows(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `
      <tr>
        <th scope="row">${escapeHtml(key)}</th>
        <td>${escapeHtml(value)}</td>
      </tr>`)
    .join('');
}

function renderList(values: string[]): string {
  return values
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join('');
}

export function renderBrowserReport(report: BrowserReportData): string {
  const passCount = report.cases.filter((testCase) => testCase.status === 'pass').length;
  const partialCount = report.cases.filter((testCase) => testCase.status === 'partial').length;
  const failCount = report.cases.filter((testCase) => testCase.status === 'fail').length;

  const caseSummaryRows = report.cases
    .map((testCase) => `
      <tr>
        <td class="mono">${escapeHtml(testCase.id)}</td>
        <td>${escapeHtml(testCase.name)}</td>
        <td>${escapeHtml(testCase.input)}</td>
        <td>${escapeHtml(testCase.expected)}</td>
        <td>${Object.entries(testCase.actual).map(([key, value]) => `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}`).join('<br>')}</td>
        <td>${renderStatus(testCase.status)}</td>
      </tr>`)
    .join('');

  const detailCards = report.cases
    .map((testCase) => {
      const screenshotMarkup = testCase.screenshotFile
        ? `
          <figure>
            <img src="${encodeURI(testCase.screenshotFile)}" alt="Screenshot for ${escapeHtml(testCase.name)}">
            <figcaption>${escapeHtml(testCase.screenshotFile)}</figcaption>
          </figure>`
        : '';

      return `
        <article class="detail-card">
          <header>
            <div>
              <h3>${escapeHtml(testCase.id)} · ${escapeHtml(testCase.name)}</h3>
              <p>${escapeHtml(testCase.expected)}</p>
            </div>
            ${renderStatus(testCase.status)}
          </header>
          <table>
            <tbody>
              ${renderKeyValueRows(testCase.actual)}
            </tbody>
          </table>
          ${screenshotMarkup}
        </article>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RyFine Browser Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6fb;
      --surface: #ffffff;
      --surface-alt: #eef4ff;
      --text: #19202b;
      --muted: #5b6675;
      --border: #d7dfeb;
      --accent: #0f62fe;
      --accent-soft: #e9f1ff;
      --pass: #18794e;
      --pass-soft: #e9f8ef;
      --partial: #9a6700;
      --partial-soft: #fff4d8;
      --fail: #b42318;
      --fail-soft: #fdecea;
      --shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      --mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      --sans: "Segoe UI", Inter, system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--text);
      background: linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
    }

    .page {
      width: min(1240px, calc(100vw - 32px));
      margin: 24px auto 40px;
      display: grid;
      gap: 20px;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      padding: 24px;
    }

    .hero {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      align-items: start;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      font-size: clamp(2rem, 4vw, 3rem);
      letter-spacing: -0.04em;
      margin-bottom: 12px;
    }

    h2 {
      font-size: 1.2rem;
      margin-bottom: 14px;
    }

    h3 {
      font-size: 1rem;
      margin-bottom: 6px;
    }

    p {
      color: var(--muted);
      line-height: 1.55;
    }

    .eyebrow {
      display: inline-flex;
      width: fit-content;
      margin-bottom: 12px;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .meta-pills,
    .summary-pills,
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .pill,
    .status-pill,
    button,
    .download-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-alt);
      color: var(--text);
      font: inherit;
      font-weight: 600;
      text-decoration: none;
    }

    .download-link,
    button {
      cursor: pointer;
    }

    .primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .status-pass {
      background: var(--pass-soft);
      border-color: #bfe5cf;
      color: var(--pass);
    }

    .status-partial {
      background: var(--partial-soft);
      border-color: #efd084;
      color: var(--partial);
    }

    .status-fail {
      background: var(--fail-soft);
      border-color: #f4c4bc;
      color: var(--fail);
    }

    .grid-3,
    .grid-2 {
      display: grid;
      gap: 16px;
    }

    .grid-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .grid-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--surface);
    }

    .card strong {
      display: block;
      margin-bottom: 8px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .detail-card {
      display: grid;
      gap: 14px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--surface);
    }

    .detail-card header {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: start;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    th,
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      text-align: left;
      line-height: 1.5;
    }

    th {
      background: #f7faff;
      font-size: 0.88rem;
    }

    tbody tr:last-child th,
    tbody tr:last-child td {
      border-bottom: none;
    }

    .mono { font-family: var(--mono); }

    ul {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.6;
    }

    img {
      width: 100%;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: #f8fbff;
    }

    figure {
      margin: 0;
      display: grid;
      gap: 10px;
    }

    figcaption {
      color: var(--muted);
      font-size: 0.9rem;
    }

    @media (max-width: 960px) {
      .hero,
      .grid-3,
      .grid-2,
      .detail-grid {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      body { background: #fff; }
      .page { width: 100%; margin: 0; }
      .panel { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="panel hero" aria-labelledby="report-title">
      <div>
        <span class="eyebrow">Automated Browser QA</span>
        <h1 id="report-title">RyFine Browser Report</h1>
        <p>This report was generated by the checked-in Playwright-based browser harness. It starts the local Vite app, runs the RyFine web UI against a real mock Ollama SSE server, and writes HTML, JSON, PDF, and screenshot artifacts for review.</p>
        <div class="summary-pills" style="margin-top: 16px;">
          ${renderStatus('pass')}<span class="pill">${passCount} passed</span>
          ${renderStatus('partial')}<span class="pill">${partialCount} partial</span>
          ${renderStatus('fail')}<span class="pill">${failCount} failed</span>
        </div>
      </div>
      <aside>
        <div class="button-row" aria-label="Download options">
          <a class="download-link primary" href="${encodeURI(report.outputFiles.html)}" download>Download HTML</a>
          <a class="download-link" href="${encodeURI(report.outputFiles.pdf)}" download>Download PDF</a>
          <button type="button" onclick="downloadJsonReport()">Download JSON</button>
        </div>
        <div class="meta-pills" style="margin-top: 16px;">
          <span class="pill">Timestamp: <span class="mono">${escapeHtml(report.generatedAt)}</span></span>
          <span class="pill">Commit: <span class="mono">${escapeHtml(report.commitHash)}</span></span>
          <span class="pill">App: <span class="mono">${escapeHtml(report.appVersion)}</span></span>
          <span class="pill">Web: <span class="mono">${escapeHtml(report.webVersion)}</span></span>
        </div>
      </aside>
    </section>

    <section class="panel" aria-labelledby="environment-heading">
      <h2 id="environment-heading">Environment</h2>
      <div class="grid-3">
        <article class="card">
          <strong>Browser</strong>
          <p>${escapeHtml(report.browserName)} ${escapeHtml(report.browserVersion)}</p>
          <p class="mono">${escapeHtml(report.browserUserAgent)}</p>
        </article>
        <article class="card">
          <strong>Execution Surface</strong>
          <p>App URL: <span class="mono">${escapeHtml(report.appUrl)}</span></p>
          <p>Output directory: <span class="mono">${escapeHtml(report.reportDirectoryName)}</span></p>
          <p>Platform: <span class="mono">${escapeHtml(report.browserPlatform)}</span> · Language: <span class="mono">${escapeHtml(report.browserLanguage)}</span></p>
        </article>
        <article class="card">
          <strong>Tools Used</strong>
          <ul>
            ${renderList(report.toolsUsed)}
          </ul>
        </article>
      </div>
    </section>

    <section class="panel" aria-labelledby="header-heading">
      <h2 id="header-heading">Observed Response Headers</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Header</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          ${renderKeyValueRows(Object.fromEntries(Object.entries(report.responseHeaders).sort(([left], [right]) => left.localeCompare(right))))}
        </tbody>
      </table>
    </section>

    <section class="panel" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Test Case Summary</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Scenario</th>
            <th scope="col">Input</th>
            <th scope="col">Expected</th>
            <th scope="col">Actual</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          ${caseSummaryRows}
        </tbody>
      </table>
    </section>

    <section class="panel" aria-labelledby="details-heading">
      <h2 id="details-heading">Detailed Results</h2>
      <div class="detail-grid">
        ${detailCards}
      </div>
    </section>

    <section class="panel" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Security, Performance, and Limitations</h2>
      <div class="grid-2">
        <article class="card">
          <strong>Security Notes</strong>
          <ul>${renderList(report.securityNotes)}</ul>
        </article>
        <article class="card">
          <strong>Performance Notes</strong>
          <ul>${renderList(report.performanceNotes)}</ul>
        </article>
        <article class="card">
          <strong>Known Limitations</strong>
          <ul>${renderList(report.limitations)}</ul>
        </article>
        <article class="card">
          <strong>Generated Files</strong>
          <ul>
            <li>HTML: <span class="mono">${escapeHtml(report.outputFiles.html)}</span></li>
            <li>JSON: <span class="mono">${escapeHtml(report.outputFiles.json)}</span></li>
            <li>PDF: <span class="mono">${escapeHtml(report.outputFiles.pdf)}</span></li>
          </ul>
        </article>
      </div>
    </section>
  </div>

  <script>
    const reportData = ${JSON.stringify(report, null, 2)};

    function downloadJsonReport() {
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = reportData.outputFiles.json;
      link.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}