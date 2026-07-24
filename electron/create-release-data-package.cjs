const { zipSync } = require('fflate');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version || '')) throw new Error('用法: node electron/create-release-data-package.cjs <版本号>');

const sourceRoot = path.join(root, 'updates', `v${version}`);
const outputRoot = path.join(root, 'release-assets');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return files.flat();
}

async function main() {
  await fs.access(path.join(sourceRoot, 'package.json'));
  const archive = {};
  for (const file of await walk(sourceRoot)) archive[path.relative(sourceRoot, file).replace(/\\/g, '/')] = new Uint8Array(await fs.readFile(file));
  await fs.mkdir(outputRoot, { recursive: true });
  const output = path.join(outputRoot, `Nightwave-data-v${version}.zip`);
  await fs.writeFile(output, Buffer.from(zipSync(archive, { level: 6 })));
  console.log(output);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
