import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'src', 'main', 'preload.cjs');
const target = path.join(root, 'dist', 'main', 'main', 'preload.cjs');

await fs.mkdir(path.dirname(target), { recursive: true });
await fs.copyFile(source, target);
console.log(`copy-preload: ${path.relative(root, target)}`);
