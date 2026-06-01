import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const browser = process.argv[2] === 'firefox' ? 'firefox' : 'chrome';
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(rootDir, '.output', `${browser}-mv3`);
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const zipPath = path.join(rootDir, '.output', `ryfine-${packageJson.version}-${browser}.zip`);

const zip = new JSZip();

async function addDirectory(sourceDir, prefix = '') {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectory(sourcePath, zipPath);
      continue;
    }

    const contents = await readFile(sourcePath);
    zip.file(zipPath, contents);
  }
}

await addDirectory(outDir);

const archive = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await writeFile(zipPath, archive);