const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version || '')) throw new Error('用法: node electron/generate-update-package.cjs <版本号>');

const packageRoot = path.join(root, 'updates', `v${version}`);
const githubBase = `https://raw.githubusercontent.com/qifad/Nightwave/main/updates/v${version}`;

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return files.flat();
}

async function main() {
  for (const directory of ['app', 'editor', 'packager']) {
    await fs.access(path.join(packageRoot, directory));
  }
  const files = (await walk(packageRoot))
    .filter((file) => path.basename(file) !== 'package.json')
    .sort()
    .map(async (file) => {
      const bytes = await fs.readFile(file);
      const relativePath = path.relative(packageRoot, file).replace(/\\/g, '/');
      return {
        path: relativePath,
        url: `${githubBase}/${relativePath.split('/').map(encodeURIComponent).join('/')}`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
      };
    });
  const descriptor = { schema: 1, version, files: await Promise.all(files) };
  const descriptorBytes = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
  await fs.writeFile(path.join(packageRoot, 'package.json'), descriptorBytes);
  const manifest = {
    schema: 1,
    version,
    packageUrl: `${githubBase}/package.json`,
    packageSha256: createHash('sha256').update(descriptorBytes).digest('hex'),
  };
  await fs.mkdir(path.join(root, 'updates'), { recursive: true });
  await fs.writeFile(path.join(root, 'updates', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated v${version} update package with ${descriptor.files.length} files`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
