import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = process.cwd();
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const outDir = path.join(root, 'release', 'win-unpacked');
const appDir = path.join(outDir, 'resources', 'app');
const execFileAsync = promisify(execFile);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyRequiredAppFiles() {
  await fs.mkdir(appDir, { recursive: true });
  await fs.cp(path.join(root, 'dist'), path.join(appDir, 'dist'), { recursive: true });
  await fs.cp(path.join(root, 'node_modules'), path.join(appDir, 'node_modules'), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.cache${path.sep}`),
  });
  await fs.copyFile(path.join(root, 'package.json'), path.join(appDir, 'package.json'));
  await fs.copyFile(path.join(root, 'README.md'), path.join(appDir, 'README.md'));
}

async function main() {
  if (!(await exists(path.join(electronDist, 'electron.exe')))) {
    console.log('package-local: electron.exe missing, trying Electron mirror install...');
    await execFileAsync(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')], {
      cwd: root,
      env: { ...process.env, ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/' },
      timeout: 300_000,
    });
  }
  if (!(await exists(path.join(electronDist, 'electron.exe')))) {
    throw new Error('未找到 node_modules/electron/dist/electron.exe；请检查 Electron 下载网络或手动设置 ELECTRON_MIRROR');
  }
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.cp(electronDist, outDir, { recursive: true });
  const sourceExe = path.join(outDir, 'electron.exe');
  const targetExe = path.join(outDir, 'ISO11820Desktop.exe');
  if (await exists(targetExe)) await fs.rm(targetExe, { force: true });
  await fs.rename(sourceExe, targetExe);
  await copyRequiredAppFiles();
  await fs.mkdir(path.join(outDir, 'output'), { recursive: true });
  const marker = {
    productName: 'ISO11820Desktop',
    generatedAt: new Date().toISOString(),
    entry: 'ISO11820Desktop.exe',
    note: 'Local offline package generated without HTTP server or REST API.',
  };
  await fs.writeFile(path.join(outDir, 'PACKAGE-INFO.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  console.log(`package-local: ok -> ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
