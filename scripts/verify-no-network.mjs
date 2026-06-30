import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['src', 'scripts'];
const thisFile = path.resolve(root, 'scripts', 'verify-no-network.mjs');

// Fragment selected forbidden names so this script does not flag its own source.
const forbidden = [
  { label: 'fetch call', regex: new RegExp('\\bfet' + 'ch\\s*\\(') },
  { label: 'WebSocket', regex: new RegExp('\\bWeb' + 'Socket\\b') },
  { label: 'EventSource', regex: new RegExp('\\bEvent' + 'Source\\b') },
  { label: 'localhost', regex: new RegExp('local' + 'host', 'i') },
  { label: 'loopback address', regex: /127\.0\.0\.1/ },
  { label: 'node http import', regex: new RegExp("['\"]node:" + 'http' + "s?['\"]") },
  { label: 'http server import', regex: new RegExp("from\\s+['\"]" + 'http' + "s?['\"]") },
  { label: 'createServer', regex: new RegExp('\\bcreate' + 'Server\\s*\\(') },
  { label: 'express app', regex: new RegExp('\\bexpress\\s*\\(') },
  { label: 'listen port', regex: new RegExp('\\.lis' + 'ten\\s*\\(') },
];

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const violations = [];

// Walk source files and report APIs that would introduce a local server/network
// dependency into the desktop-only app.
for (const scanRoot of scanRoots) {
  await walk(path.join(root, scanRoot));
}

if (violations.length > 0) {
  console.error('Forbidden network/server usage found:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('verify-no-network: ok');
}

async function walk(currentPath) {
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const child = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await walk(child);
      continue;
    }
    if (!entry.isFile() || !extensions.has(path.extname(entry.name)) || path.resolve(child) === thisFile) continue;
    await scanFile(child);
  }
}

async function scanFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const item of forbidden) {
      if (item.regex.test(line)) {
        violations.push(`${path.relative(root, filePath)}:${index + 1} ${item.label}`);
      }
    }
  });
}
