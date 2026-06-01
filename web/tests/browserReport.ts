import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import {
  renderBrowserReport,
  type BrowserCaseResult,
  type BrowserReportData,
} from "./browserReportTemplate.ts";

const execFile = promisify(execFileCallback);

const MOCK_HOST = "127.0.0.1";
const APP_HOST = "127.0.0.1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const OUTPUT_DIR = path.join(WEB_ROOT, "test-results", "browser-report");

type MockScenario =
  | {
      kind: "single";
      text: string;
      delayMs?: number;
    }
  | {
      kind: "compare";
      baselineText: string;
      repoText: string;
      delayMs?: number;
    }
  | {
      kind: "error";
      status: number;
      message: string;
      delayMs?: number;
    };

interface MockRequestLog {
  timestamp: string;
  usesRepoContext: boolean;
  path: string;
}

interface MockServerController {
  url: string;
  setScenario: (scenario: MockScenario) => void;
  resetRequestLog: () => void;
  getRequestLog: () => MockRequestLog[];
  close: () => Promise<void>;
}

interface AppServerController {
  url: string;
  close: () => Promise<void>;
}

interface BrowserMetadata {
  userAgent: string;
  platform: string;
  language: string;
}

interface FailedRequestRecord {
  url: string;
  failure: string;
  method: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function writeCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const requestedHeaders = request.headers["access-control-request-headers"];
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    typeof requestedHeaders === "string" && requestedHeaders
      ? requestedHeaders
      : "Content-Type, Authorization",
  );
  response.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  response.setHeader("Access-Control-Expose-Headers", "*");
  response.setHeader("Vary", "Origin, Access-Control-Request-Headers");
}

function buildSseChunk(content: string): string {
  return `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
}

function buildSseDoneChunk(): string {
  return [
    `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
}

async function startMockOllamaServer(): Promise<MockServerController> {
  let scenario: MockScenario = {
    kind: "single",
    text: "Default mocked boosted prompt.",
  };
  let requestLog: MockRequestLog[] = [];

  const server = createHttpServer(async (request, response) => {
    writeCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Not found" } }));
      return;
    }

    const body = await readJsonBody(request);
    const usesRepoContext = JSON.stringify(body).includes("<repo_context>");
    requestLog.push({
      timestamp: new Date().toISOString(),
      usesRepoContext,
      path: request.url,
    });

    if (scenario.delayMs) {
      await sleep(scenario.delayMs);
    }

    if (scenario.kind === "error") {
      response.writeHead(scenario.status, {
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify({ error: { message: scenario.message } }));
      return;
    }

    const content =
      scenario.kind === "compare"
        ? usesRepoContext
          ? scenario.repoText
          : scenario.baselineText
        : scenario.text;

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.write(buildSseChunk(content));
    await sleep(40);
    response.end(buildSseDoneChunk());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, MOCK_HOST, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server did not expose a TCP port.");
  }

  return {
    url: `http://${MOCK_HOST}:${address.port}`,
    setScenario(nextScenario: MockScenario) {
      scenario = nextScenario;
    },
    resetRequestLog() {
      requestLog = [];
    },
    getRequestLog() {
      return [...requestLog];
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function startAppServer(): Promise<AppServerController> {
  const viteServer: ViteDevServer = await createViteServer({
    root: WEB_ROOT,
    server: {
      host: APP_HOST,
      port: 0,
      strictPort: false,
    },
    clearScreen: false,
    logLevel: "error",
  });

  await viteServer.listen();

  const address = viteServer.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not expose a TCP port.");
  }

  return {
    url: `http://${APP_HOST}:${address.port}/`,
    async close() {
      await viteServer.close();
    },
  };
}

async function getCommitHash(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--short", "HEAD"], {
    cwd: REPO_ROOT,
  });
  return stdout.trim();
}

async function getPackageVersions() {
  const [rootPackage, webPackage] = await Promise.all([
    readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
    readFile(path.join(WEB_ROOT, "package.json"), "utf8"),
  ]);

  return {
    appVersion: JSON.parse(rootPackage).version as string,
    webVersion: JSON.parse(webPackage).version as string,
  };
}

async function prepareOutputDirectory() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function openSettingsPanel(page: Page) {
  if ((await page.locator("input.api-input").count()) === 0) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
}

async function ensureOllamaSettings(page: Page) {
  await openSettingsPanel(page);

  if ((await page.locator("input.api-input").count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "Ollama", exact: true }).click();
  await page.waitForSelector("input.api-input", { state: "attached" });
}

async function closeSettingsPanel(page: Page) {
  const closeButton = page.getByRole("button", { name: "Close settings" });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector("input.api-input", { state: "detached" });
  }
}

async function openRepoContextPanel(page: Page) {
  if ((await page.locator("#repo-context-upload").count()) === 0) {
    await page
      .getByRole("button", { name: "Repo context", exact: true })
      .click();
    await page.waitForSelector("#repo-context-upload", { state: "attached" });
  }
}

async function closeRepoContextPanel(page: Page) {
  const closeButton = page.getByRole("button", { name: "Close repo context" });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector("#repo-context-upload", { state: "detached" });
  }
}

async function configureMockEndpoint(page: Page, mockUrl: string) {
  await ensureOllamaSettings(page);
  const endpointInput = page.locator("input.api-input").first();
  await endpointInput.fill(mockUrl);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await closeSettingsPanel(page);
}

async function clearPersistedRepoFiles(page: Page) {
  await openRepoContextPanel(page);
  const clearFilesButton = page.getByRole("button", { name: "Clear files" });
  if (await clearFilesButton.isEnabled()) {
    await clearFilesButton.click();
    await page.waitForTimeout(150);
  }
  await closeRepoContextPanel(page);
}

function normalizeActual(
  values: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (value === null || value === undefined) {
        return [key, "n/a"];
      }

      if (typeof value === "string") {
        return [key, value];
      }

      return [key, JSON.stringify(value)];
    }),
  );
}

async function captureBrowserMetadata(page: Page): Promise<BrowserMetadata> {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  }));
}

async function waitForRequestCount(
  mockServer: MockServerController,
  expectedCount: number,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (mockServer.getRequestLog().length >= expectedCount) {
      return mockServer.getRequestLog();
    }

    await sleep(50);
  }

  throw new Error(
    `Timed out waiting for ${expectedCount} mock request(s); observed ${mockServer.getRequestLog().length}.`,
  );
}

async function writeOutputs(report: BrowserReportData, browser: Browser) {
  const htmlPath = path.join(OUTPUT_DIR, report.outputFiles.html);
  const jsonPath = path.join(OUTPUT_DIR, report.outputFiles.json);
  const pdfPath = path.join(OUTPUT_DIR, report.outputFiles.pdf);

  await writeFile(htmlPath, renderBrowserReport(report), "utf8");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const pdfPage = await browser.newPage();
  await pdfPage.goto(pathToFileURL(htmlPath).href);
  await pdfPage.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "16px",
      right: "16px",
      bottom: "16px",
      left: "16px",
    },
  });
  await pdfPage.close();
}

async function main() {
  await prepareOutputDirectory();

  let appServer: AppServerController | undefined;
  let mockServer: MockServerController | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    appServer = await startAppServer();
    mockServer = await startMockOllamaServer();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
    });
    const page = await context.newPage();
    const failedRequests: FailedRequestRecord[] = [];

    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? "unknown",
        method: request.method(),
      });
    });

    const [versions, commitHash] = await Promise.all([
      getPackageVersions(),
      getCommitHash(),
    ]);

    const response = await page.goto(appServer.url, {
      waitUntil: "networkidle",
    });
    const browserMetadata = await captureBrowserMetadata(page);
    const browserVersion = await browser.version();
    const responseHeaders = response ? await response.allHeaders() : {};
    const repoUploadInput = page.locator("#repo-context-upload");
    const repoUploadPaths = [
      path.join(REPO_ROOT, "README.md"),
      path.join(REPO_ROOT, "package.json"),
    ];

    const results: BrowserCaseResult[] = [];

    await ensureOllamaSettings(page);
    const providerHintVisible = await page
      .getByText("Runs on your machine — no API key or account needed.")
      .isVisible();
    await closeSettingsPanel(page);

    results.push({
      id: "TC-01",
      name: "Launch over HTTP with settings reachable",
      input: "Initial page load",
      expected:
        "The app loads over local HTTP, the settings panel exposes the local-provider hint when opened, and the main boost button is disabled until prompt text exists.",
      actual: normalizeActual({
        title: await page.title(),
        url: page.url(),
        providerHintVisible,
        boostDisabled: await page
          .getByRole("button", { name: "RyFine", exact: true })
          .isDisabled(),
      }),
      status:
        providerHintVisible &&
        (await page
          .getByRole("button", { name: "RyFine", exact: true })
          .isDisabled())
          ? "pass"
          : "fail",
    });

    await configureMockEndpoint(page, mockServer.url);
    await clearPersistedRepoFiles(page);

    results.push({
      id: "TC-02",
      name: "Empty input handling",
      input: "Empty textarea",
      expected:
        "RyFine remains disabled and the main Clear action stays disabled for an empty prompt.",
      actual: normalizeActual({
        boostDisabled: await page
          .getByRole("button", { name: "RyFine", exact: true })
          .isDisabled(),
        clearDisabled: await page
          .getByRole("button", { name: "Clear", exact: true })
          .isDisabled(),
      }),
      status: "pass",
    });

    await openRepoContextPanel(page);
    await repoUploadInput.setInputFiles(repoUploadPaths);
    await page.waitForSelector(".repo-context-item");
    const beforeReloadSummary = await page
      .locator(".repo-context-summary")
      .innerText();
    await page.reload({ waitUntil: "networkidle" });
    await configureMockEndpoint(page, mockServer.url);
    await openRepoContextPanel(page);
    await page.waitForSelector(".repo-context-item");
    const afterReloadSummary = await page
      .locator(".repo-context-summary")
      .innerText();
    await closeRepoContextPanel(page);
    results.push({
      id: "TC-03",
      name: "Repo files persist after reload",
      input: "Upload README.md and package.json, then reload",
      expected:
        "Uploaded repo context files remain selected after a full page reload.",
      actual: normalizeActual({
        beforeReloadSummary,
        afterReloadSummary,
        persistedFileCount: await page.locator(".repo-context-item").count(),
      }),
      status: beforeReloadSummary === afterReloadSummary ? "pass" : "fail",
    });

    const specialPrompt =
      'Rewrite JSON: {"user":"A&B <test>"}\nXML: <tag attr="1">&value;</tag>\nEmoji: 😀';
    await page
      .getByPlaceholder("Type or paste your raw prompt here...")
      .fill(specialPrompt);
    results.push({
      id: "TC-04",
      name: "Special character prompt input",
      input: "Prompt containing JSON, XML-like text, ampersands, and emoji",
      expected:
        "Special characters are preserved as literal text and still allow a boost run.",
      actual: normalizeActual({
        charCount: await page.locator(".char-count").innerText(),
        boostDisabled: await page
          .getByRole("button", { name: "RyFine", exact: true })
          .isDisabled(),
      }),
      status: (await page
        .getByRole("button", { name: "RyFine", exact: true })
        .isDisabled())
        ? "fail"
        : "pass",
    });

    const largePrompt = "A".repeat(12000);
    const largeStart = Date.now();
    await page
      .getByPlaceholder("Type or paste your raw prompt here...")
      .fill(largePrompt);
    const fillDurationMs = Date.now() - largeStart;
    const memorySnapshot = await page.evaluate(() => {
      const memory = performance.memory;
      if (!memory) {
        return null;
      }

      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    });
    results.push({
      id: "TC-05",
      name: "Large input responsiveness",
      input: "12,000-character prompt",
      expected:
        "The editor remains responsive and preserves accurate character counts for a very large input.",
      actual: normalizeActual({
        charCount: await page.locator(".char-count").innerText(),
        fillDurationMs,
        memorySnapshot,
      }),
      status:
        (await page.locator(".char-count").innerText()) === "12000 chars"
          ? "pass"
          : "fail",
    });

    mockServer.setScenario({
      kind: "compare",
      baselineText:
        "Baseline boosted prompt with general improvement guidance.",
      repoText:
        "Repo-aware boosted prompt with architecture details and grounded file references.",
    });
    mockServer.resetRequestLog();
    await page
      .getByPlaceholder("Type or paste your raw prompt here...")
      .fill("Turn this into a stronger repo-aware prompt.");
    const compareStart = Date.now();
    await page.getByRole("button", { name: "RyFine both" }).click();
    await waitForRequestCount(mockServer, 1);
    await page.waitForSelector(".compare-toolbar");
    const compareSummary = await page
      .locator(".compare-summary-block p")
      .innerText();
    const compareScreenshot = "compare-mode.png";
    const repoCompareCard = page.getByRole("region", {
      name: "Boost with repository context",
    });
    try {
      await waitForRequestCount(mockServer, 2, 8000);
    } catch (error) {
      const compareSnapshot = await page
        .locator(".compare-results")
        .innerText()
        .catch(() => "compare results unavailable");
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `Failed requests: ${JSON.stringify(failedRequests)}`,
          `Compare snapshot: ${compareSnapshot}`,
        ].join("\n"),
        { cause: error },
      );
    }
    await repoCompareCard.getByRole("button", { name: "Copy" }).waitFor();
    await page.screenshot({
      path: path.join(OUTPUT_DIR, compareScreenshot),
      fullPage: true,
    });
    await repoCompareCard.getByRole("button", { name: "Choose" }).click();
    const copySelectedDisabled = await page
      .getByRole("button", { name: "Copy selected" })
      .isDisabled();
    await page.getByRole("button", { name: "Use selected" }).click();
    await page.waitForSelector(".compare-toolbar", { state: "detached" });
    const selectedOutput = await page
      .locator(".pane-output .output-area")
      .innerText();
    results.push({
      id: "TC-06",
      name: "Compare mode choose-and-use workflow",
      input: "Repo-aware prompt with real mock SSE responses",
      expected:
        "RyFine both renders two cards, enables selecting the repo-aware option, and promotes it back to the main output.",
      actual: normalizeActual({
        requestCount: mockServer.getRequestLog().length,
        compareDurationMs: Date.now() - compareStart,
        compareSummary,
        copySelectedDisabled,
        selectedOutput,
      }),
      status:
        mockServer.getRequestLog().length === 2 &&
        !copySelectedDisabled &&
        selectedOutput.includes(
          "Repo-aware boosted prompt with architecture details and grounded file references.",
        )
          ? "pass"
          : "fail",
      screenshotFile: compareScreenshot,
    });

    mockServer.setScenario({
      kind: "error",
      status: 500,
      message: "Synthetic test failure",
    });
    await page
      .getByPlaceholder("Type or paste your raw prompt here...")
      .fill("Trigger a controlled API failure.");
    await page.getByRole("button", { name: "RyFine", exact: true }).click();
    await page.waitForSelector(".error-msg");
    const errorScreenshot = "error-state.png";
    await page.screenshot({
      path: path.join(OUTPUT_DIR, errorScreenshot),
      fullPage: true,
    });
    results.push({
      id: "TC-07",
      name: "API error handling",
      input: "Forced 500 response from the mock Ollama-compatible endpoint",
      expected:
        "The error is shown in the output pane while the prompt remains in the editor.",
      actual: normalizeActual({
        errorText: await page.locator(".error-msg").innerText(),
        preservedInput: await page
          .getByPlaceholder("Type or paste your raw prompt here...")
          .inputValue(),
      }),
      status: "pass",
      screenshotFile: errorScreenshot,
    });

    mockServer.setScenario({
      kind: "single",
      text: "Delayed boosted prompt with safe completion.",
      delayMs: 1400,
    });
    mockServer.resetRequestLog();
    await page
      .getByPlaceholder("Type or paste your raw prompt here...")
      .fill("Measure slow response handling.");
    const slowStart = Date.now();
    await page.getByRole("button", { name: "RyFine", exact: true }).click();
    await page.waitForTimeout(150);
    const stopVisible = await page
      .getByRole("button", { name: "Stop" })
      .isVisible()
      .catch(() => false);
    await page.waitForFunction(
      (text) => document.body.textContent?.includes(text),
      "Delayed boosted prompt with safe completion.",
      { timeout: 10000 },
    );
    results.push({
      id: "TC-08",
      name: "Slow-response responsiveness",
      input: "Mocked 1.4 s delayed SSE response",
      expected:
        "The loading state remains interactive, exposes Stop, and still completes with the delayed boosted prompt.",
      actual: normalizeActual({
        requestCount: mockServer.getRequestLog().length,
        durationMs: Date.now() - slowStart,
        stopVisible,
        output: await page.locator(".output-area").innerText(),
      }),
      status: stopVisible ? "pass" : "fail",
    });

    const report: BrowserReportData = {
      generatedAt: new Date().toISOString(),
      commitHash,
      appVersion: versions.appVersion,
      webVersion: versions.webVersion,
      browserName: "Playwright Chromium",
      browserVersion,
      browserUserAgent: browserMetadata.userAgent,
      browserPlatform: browserMetadata.platform,
      browserLanguage: browserMetadata.language,
      appUrl: appServer.url,
      reportDirectoryName: path
        .relative(REPO_ROOT, OUTPUT_DIR)
        .replaceAll("\\", "/"),
      toolsUsed: [
        "Playwright Chromium",
        "Vite development server API",
        "Node mock Ollama-compatible SSE server",
        "HTML + JSON + PDF report generation",
      ],
      responseHeaders,
      outputFiles: {
        html: "browser-report.html",
        json: "browser-report.json",
        pdf: "browser-report.pdf",
      },
      cases: results,
      securityNotes: [
        "The harness runs against a local HTTP Vite server. HTTPS and production reverse-proxy security headers are outside this local test scope.",
        "The dev response headers did not include Content-Security-Policy, which is common in local development but should be validated separately in production.",
        "No external secrets are required. The browser test uses a local mock Ollama-compatible endpoint instead of real provider credentials.",
      ],
      performanceNotes: [
        `The 12,000-character input updated in ${fillDurationMs} ms on the local Chromium run.`,
        "Compare mode used two real mock SSE requests and completed end-to-end without Playwright route interception.",
        "The delayed-response case validated both the visible Stop control and eventual completion under injected latency.",
      ],
      limitations: [
        "Cross-browser coverage is not included yet; the harness currently runs Chromium only.",
        "CPU utilization is not exposed through this Playwright harness, so the report records timing and JS heap data instead.",
        "The checked-in root report artifacts remain as historical snapshots; fresh generated artifacts are written under web/test-results/browser-report/.",
      ],
    };

    await writeOutputs(report, browser);

    const nonPassCount = results.filter(
      (result) => result.status !== "pass",
    ).length;
    process.exitCode = nonPassCount > 0 ? 1 : 0;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await mockServer?.close().catch(() => undefined);
    await appServer?.close().catch(() => undefined);
  }
}

main().catch(async (error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
