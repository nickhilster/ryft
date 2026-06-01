import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const REPO_ROOT = 'C:/dev/ryfine';
const WEB_ROOT = path.join(REPO_ROOT, 'web');
const PLAN_ID = 'pipeline-upgrade-2026-05-29';
const TASK_ID = 'task-008';
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan', PLAN_ID, 'evidence', TASK_ID);
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots');

const { chromium } = await import(pathToFileURL(path.join(WEB_ROOT, 'node_modules', 'playwright', 'index.mjs')).href);
const { createServer: createViteServer } = await import(pathToFileURL(path.join(WEB_ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function writeCorsHeaders(request, response) {
  const requestedHeaders = request.headers['access-control-request-headers'];
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader(
    'Access-Control-Allow-Headers',
    typeof requestedHeaders === 'string' && requestedHeaders
      ? requestedHeaders
      : 'Content-Type, Authorization'
  );
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
  response.setHeader('Access-Control-Expose-Headers', '*');
  response.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
}

function buildSseChunk(content) {
  return `data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
}

function buildSseDoneChunk() {
  return [
    `data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

async function startMockOllamaServer() {
  let scenario = { kind: 'single', text: 'Default mocked refined prompt.' };

  const server = createHttpServer(async (request, response) => {
    writeCorsHeaders(request, response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/api/tags') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ models: [{ name: 'mock-coder' }] }));
      return;
    }

    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
      return;
    }

    const body = await readJsonBody(request);
    const usesRepoContext = JSON.stringify(body).includes('<repo_context>');

    const content = scenario.kind === 'compare'
      ? (usesRepoContext ? scenario.repoText : scenario.baselineText)
      : scenario.text;

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.write(buildSseChunk(content));
    await sleep(40);
    response.end(buildSseDoneChunk());
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Mock server did not expose a TCP port.');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    setScenario(nextScenario) {
      scenario = nextScenario;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

async function startAppServer() {
  const viteServer = await createViteServer({
    root: WEB_ROOT,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    clearScreen: false,
    logLevel: 'error',
  });

  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Vite did not expose a TCP port.');
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    async close() {
      await viteServer.close();
    },
  };
}

async function ensureEvidenceDirs() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
}

async function openSettingsPanel(page) {
  if ((await page.locator('input.api-input').count()) === 0) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForSelector('input.api-input', { state: 'attached' });
  }
}

async function closeSettingsPanel(page) {
  const closeButton = page.getByRole('button', { name: 'Close settings' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector('input.api-input', { state: 'detached' });
  }
}

async function configureMockEndpoint(page, mockUrl) {
  await openSettingsPanel(page);
  const endpointInput = page.locator('input.api-input').first();
  await endpointInput.fill(mockUrl);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(150);
  await closeSettingsPanel(page);
}

async function openSkillsPanel(page) {
  if ((await page.locator('.skill-manager').count()) === 0) {
    await page.getByRole('button', { name: 'Custom skills' }).click();
    await page.waitForSelector('.skill-manager', { state: 'visible' });
  }
}

async function closeSkillsPanel(page) {
  const closeButton = page.getByRole('button', { name: 'Close skills' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector('.skill-manager', { state: 'detached' });
  }
}

async function openRulesPanel(page) {
  if ((await page.locator('#custom-boost-instructions').count()) === 0) {
    await page.getByRole('button', { name: 'Boost rules' }).click();
    await page.waitForSelector('#custom-boost-instructions', { state: 'visible' });
  }
}

async function closeRulesPanel(page) {
  const closeButton = page.getByRole('button', { name: 'Close boost rules' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector('#custom-boost-instructions', { state: 'detached' });
  }
}

async function openRepoContextPanel(page) {
  if ((await page.locator('#repo-context-upload').count()) === 0) {
    await page.getByRole('button', { name: 'Repo context' }).click();
    await page.waitForSelector('#repo-context-upload', { state: 'attached' });
  }
}

async function closeRepoContextPanel(page) {
  const closeButton = page.getByRole('button', { name: 'Close repo context' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector('#repo-context-upload', { state: 'detached' });
  }
}

async function openProjectPanel(page) {
  if ((await page.locator('.project-list').count()) === 0) {
    await page.getByRole('button', { name: 'Project' }).click();
    await page.waitForSelector('.project-list', { state: 'visible' });
  }
}

async function closeProjectPanel(page) {
  const closeButton = page.getByRole('button', { name: 'Close project panel' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForSelector('.project-list', { state: 'detached' });
  }
}

async function createSkill(page, { name, domain, signals, lens }) {
  await openSkillsPanel(page);
  await page.getByRole('button', { name: 'New skill', exact: true }).click();
  await page.locator('#skill-name').fill(name);
  await page.locator('#skill-domain').fill(domain);
  await page.locator('#skill-signals').fill(signals);
  await page.locator('#skill-lens').fill(lens);
  await page.getByRole('button', { name: 'Save skill', exact: true }).click();
  await page.waitForFunction(
    (expectedName) => Array.from(document.querySelectorAll('.skill-card-name')).some((node) => node.textContent?.trim() === expectedName),
    name
  );
}

async function createProject(page, name, description) {
  await openProjectPanel(page);
  await page.getByRole('button', { name: '+ New project', exact: true }).click();
  const inputs = page.locator('.project-form-input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill(description);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForFunction((expectedName) => {
    const subtitle = document.querySelector('.drawer-project .drawer-subtitle');
    return subtitle?.textContent?.includes(expectedName) ?? false;
  }, name);
}

async function uploadRepoContext(page) {
  await openRepoContextPanel(page);
  await page.locator('#repo-context-upload').setInputFiles([
    path.join(REPO_ROOT, 'README.md'),
    path.join(REPO_ROOT, 'web', 'package.json'),
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.repo-context-item').length >= 2);
  const summary = normalizeText(await page.locator('.repo-context-summary').innerText());
  await closeRepoContextPanel(page);
  return summary;
}

async function setRules(page, rulesText) {
  await openRulesPanel(page);
  await page.locator('#custom-boost-instructions').fill(rulesText);
  await page.waitForTimeout(100);
  await closeRulesPanel(page);
}

async function runSingleRefinement(page, mockServer, { prompt, outputText }) {
  mockServer.setScenario({ kind: 'single', text: outputText });
  await page.getByRole('textbox', { name: /raw prompt/i }).fill(prompt);
  await page.getByRole('button', { name: 'RyFine ✦', exact: true }).click();
  await page.getByText(outputText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForSelector('.pipeline-trace', { state: 'visible', timeout: 15000 });
  const chips = await page.locator('.pipeline-trace .trace-chip').allInnerTexts();
  return chips.map((chip) => normalizeText(chip));
}

async function expandPrompt(page) {
  await page.getByRole('button', { name: 'View prompt', exact: true }).click();
  await page.waitForSelector('.trace-system-prompt', { state: 'visible' });
  return await page.locator('.trace-system-prompt').innerText();
}

async function runCompareMode(page, mockServer) {
  mockServer.setScenario({
    kind: 'compare',
    baselineText: 'Baseline compare result without repo context.',
    repoText: 'Repo-aware compare result with grounded details.',
  });
  await page.getByRole('textbox', { name: /raw prompt/i }).fill('Turn this into a stronger repo-aware prompt.');
  await page.getByRole('button', { name: 'RyFine both', exact: true }).click();
  await page.waitForSelector('.compare-toolbar', { state: 'visible', timeout: 15000 });
  await page.getByText('Baseline compare result without repo context.', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('Repo-aware compare result with grounded details.', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  return await page.locator('.pipeline-trace').count();
}

function scenarioResult(name, status, evidence, blockers = '') {
  return { name, status, evidence, blockers };
}

async function main() {
  await ensureEvidenceDirs();

  let appServer;
  let mockServer;
  let browser;
  let context;

  const consoleErrors = [];
  const networkFailures = [];
  const scenarios = [];

  try {
    appServer = await startAppServer();
    mockServer = await startMockOllamaServer();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleErrors.push(`${message.type()}: ${message.text()}`);
      }
    });

    page.on('requestfailed', (request) => {
      networkFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
    });

    await page.goto(appServer.url, { waitUntil: 'networkidle' });
    await configureMockEndpoint(page, mockServer.url);

    await page.getByRole('combobox', { name: 'Specialization agent' }).selectOption('auto');
    const autoCodingChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Implement a TypeScript function that validates an API payload and returns typed errors.',
      outputText: 'AUTO_CODING_RESULT',
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'auto-coding-trace.png'), fullPage: true });
    scenarios.push(
      autoCodingChips.includes('Coding') && !autoCodingChips.includes('Auto')
        ? scenarioResult('Auto agent on a coding prompt shows Coding in the trace, not Auto', 'passed', `Trace chips: ${autoCodingChips.join(', ')}`)
        : scenarioResult('Auto agent on a coding prompt shows Coding in the trace, not Auto', 'failed', `Trace chips: ${autoCodingChips.join(', ')}`)
    );

    await page.getByRole('combobox', { name: 'Specialization agent' }).selectOption('auto');
    const autoVagueChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Make this better.',
      outputText: 'AUTO_VAGUE_RESULT',
    });
    scenarios.push(
      autoVagueChips.includes('Auto')
        ? scenarioResult('Auto agent on a vague prompt falls back to Auto', 'passed', `Trace chips: ${autoVagueChips.join(', ')}`)
        : scenarioResult('Auto agent on a vague prompt falls back to Auto', 'failed', `Trace chips: ${autoVagueChips.join(', ')}`)
    );

    await page.getByRole('combobox', { name: 'Specialization agent' }).selectOption('coding');
    const explicitCodingChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Write a short announcement for our users.',
      outputText: 'EXPLICIT_CODING_RESULT',
    });
    scenarios.push(
      explicitCodingChips.includes('Coding') && !explicitCodingChips.includes('Auto')
        ? scenarioResult('Explicit coding agent shows Coding regardless of prompt content', 'passed', `Trace chips: ${explicitCodingChips.join(', ')}`)
        : scenarioResult('Explicit coding agent shows Coding regardless of prompt content', 'failed', `Trace chips: ${explicitCodingChips.join(', ')}`)
    );

    await createSkill(page, {
      name: 'Broad guardrails',
      domain: 'general',
      signals: '',
      lens: '- Keep instructions explicit.\n- Preserve risk-aware wording.',
    });
    await createSkill(page, {
      name: 'Legal review',
      domain: 'legal',
      signals: 'legal, contract',
      lens: '- Surface legal risk areas.\n- Ask for jurisdiction if missing.',
    });
    await closeSkillsPanel(page);

    await page.reload({ waitUntil: 'networkidle' });
    await openSkillsPanel(page);
    const persistedSkillCount = await page.locator('.skill-card').count();
    await closeSkillsPanel(page);

    await page.getByRole('combobox', { name: 'Specialization agent' }).selectOption('auto');
    const broadOnlyChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Draft a welcome email for new users.',
      outputText: 'BROAD_SKILL_RESULT',
    });
    scenarios.push(
      broadOnlyChips.includes('Broad guardrails') && !broadOnlyChips.includes('Legal review') && persistedSkillCount === 2
        ? scenarioResult('User can create a skill with no signal keywords and it is applied broadly', 'passed', `Reload preserved ${persistedSkillCount} skills; trace chips: ${broadOnlyChips.join(', ')}`)
        : scenarioResult('User can create a skill with no signal keywords and it is applied broadly', 'failed', `Reload preserved ${persistedSkillCount} skills; trace chips: ${broadOnlyChips.join(', ')}`)
    );

    const legalChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Review this legal contract for risky clauses and missing protections.',
      outputText: 'LEGAL_SKILL_RESULT',
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'legal-skill-trace.png'), fullPage: true });
    scenarios.push(
      legalChips.includes('Broad guardrails') && legalChips.includes('Legal review')
        ? scenarioResult('User can create a skill with keywords legal, contract and it only applies when those words appear', 'passed', `Non-keyword prompt omitted Legal review; keyword prompt trace chips: ${legalChips.join(', ')}`)
        : scenarioResult('User can create a skill with keywords legal, contract and it only applies when those words appear', 'failed', `Keyword prompt trace chips: ${legalChips.join(', ')}`)
    );

    await setRules(page, 'Always preserve numbered acceptance criteria.');
    const repoSummary = await uploadRepoContext(page);
    await createProject(page, 'Task 008 Validation', 'Seed history for style examples');
    await closeProjectPanel(page);

    await runSingleRefinement(page, mockServer, {
      prompt: 'Create a concise kickoff brief for this project.',
      outputText: 'PROJECT_HISTORY_SEED',
    });

    const traceChipScenarioChips = await runSingleRefinement(page, mockServer, {
      prompt: 'Refine this engineering onboarding prompt for our repository.',
      outputText: 'TRACE_CHIPS_RESULT',
    });
    const expandedPromptText = await expandPrompt(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'trace-expanded-prompt.png'), fullPage: true });

    const hasExpectedTraceChips = traceChipScenarioChips.includes('Repo context')
      && traceChipScenarioChips.includes('Custom rules')
      && traceChipScenarioChips.includes('Style examples');
    scenarios.push(
      expandedPromptText.includes('CRITICAL RULE: Your ONLY job is to rewrite and enhance the prompt you are given.')
        ? scenarioResult(
            'View prompt expands the assembled system prompt',
            'passed',
            `Expanded prompt length: ${expandedPromptText.length} chars; sections present: ${[
              expandedPromptText.includes('## Additional constraints') ? 'Additional constraints' : null,
              expandedPromptText.includes('## Style reference from project history') ? 'Style reference from project history' : null,
              expandedPromptText.includes('## Broad guardrails') ? 'Broad guardrails' : null,
            ].filter(Boolean).join(', ')}`
          )
        : scenarioResult('View prompt expands the assembled system prompt', 'failed', `Expanded prompt length: ${expandedPromptText.length} chars`)
    );
    scenarios.push(
      hasExpectedTraceChips
        ? scenarioResult('Repo context, custom rules, and style examples surface the expected chips when present', 'passed', `Repo summary: ${repoSummary}; trace chips: ${traceChipScenarioChips.join(', ')}`)
        : scenarioResult('Repo context, custom rules, and style examples surface the expected chips when present', 'failed', `Repo summary: ${repoSummary}; trace chips: ${traceChipScenarioChips.join(', ')}`)
    );

    const traceCountInCompare = await runCompareMode(page, mockServer);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'compare-mode-no-trace.png'), fullPage: true });
    scenarios.push(
      traceCountInCompare === 0
        ? scenarioResult('Trace does not appear in compare mode', 'passed', 'Compare toolbar rendered and .pipeline-trace was absent.')
        : scenarioResult('Trace does not appear in compare mode', 'failed', `.pipeline-trace count in compare mode: ${traceCountInCompare}`)
    );

    const report = {
      generatedAt: new Date().toISOString(),
      plan_id: PLAN_ID,
      task_id: TASK_ID,
      status: scenarios.every((scenario) => scenario.status === 'passed') ? 'success' : 'failed',
      console_errors: consoleErrors,
      network_failures: networkFailures,
      scenarios,
      evidence_path: EVIDENCE_DIR,
    };

    await writeFile(path.join(EVIDENCE_DIR, 'functional-validation.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await mockServer?.close().catch(() => undefined);
    await appServer?.close().catch(() => undefined);
  }
}

main().catch(async (error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    plan_id: PLAN_ID,
    task_id: TASK_ID,
    status: 'failed',
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    evidence_path: EVIDENCE_DIR,
  };
  await mkdir(EVIDENCE_DIR, { recursive: true }).catch(() => undefined);
  await writeFile(path.join(EVIDENCE_DIR, 'functional-validation.json'), JSON.stringify(failure, null, 2), 'utf8').catch(() => undefined);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});