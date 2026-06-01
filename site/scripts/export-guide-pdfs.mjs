import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const distRoot = path.join(repoRoot, 'web', 'dist');
const guidesRoot = path.join(distRoot, 'guides');
const publicPdfRoot = path.join(repoRoot, 'site', 'public', 'media', 'pdfs');
const distPdfRoot = path.join(distRoot, 'media', 'pdfs');
const host = '127.0.0.1';
const port = 4325;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRequestPath(urlPath) {
  const requestPath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '');
  const directPath = path.join(distRoot, relativePath);

  if (await fileExists(directPath)) {
    const stat = await fs.stat(directPath);
    if (stat.isDirectory()) {
      return path.join(directPath, 'index.html');
    }
    return directPath;
  }

  const directoryIndexPath = path.join(distRoot, relativePath, 'index.html');
  if (await fileExists(directoryIndexPath)) {
    return directoryIndexPath;
  }

  return null;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    if (!request.url) {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    try {
      const filePath = await resolveRequestPath(request.url);
      if (!filePath) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
      const data = await fs.readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(data);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : 'Internal server error');
    }
  });
}

async function getGuideSlugs() {
  const entries = await fs.readdir(guidesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'tutorials')
    .map((entry) => entry.name)
    .sort();
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (error instanceof Error) {
      try {
        return await chromium.launch({ channel: 'msedge', headless: true });
      } catch {
        throw new Error(
          `Could not launch Playwright Chromium or Edge. Install a Playwright browser or ensure Microsoft Edge is available. Original error: ${error.message}`,
        );
      }
    }

    throw error;
  }
}

async function exportGuide(browser, slug) {
  const page = await browser.newPage();
  const url = `http://${host}:${port}/guides/${slug}/`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const pdfBuffer = await page.pdf({
    format: 'Letter',
    margin: {
      top: '0.45in',
      right: '0.45in',
      bottom: '0.55in',
      left: '0.45in',
    },
    printBackground: true,
    preferCSSPageSize: true,
  });

  const fileName = `${slug}.pdf`;
  await fs.writeFile(path.join(publicPdfRoot, fileName), pdfBuffer);
  await fs.writeFile(path.join(distPdfRoot, fileName), pdfBuffer);
  await page.close();

  return fileName;
}

async function main() {
  await ensureDir(publicPdfRoot);
  await ensureDir(distPdfRoot);

  if (!(await fileExists(guidesRoot))) {
    throw new Error(`Built guides directory not found at ${guidesRoot}. Run the site build first.`);
  }

  const guideSlugs = await getGuideSlugs();
  if (guideSlugs.length === 0) {
    throw new Error('No guide routes were found in the built site output.');
  }

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const browser = await launchBrowser();

  try {
    for (const slug of guideSlugs) {
      const fileName = await exportGuide(browser, slug);
      console.log(`Exported ${fileName}`);
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});