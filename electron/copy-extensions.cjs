const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(projectRoot, process.argv[2] || 'release');

fs.cp(path.join(projectRoot, 'extensions'), path.join(outputDirectory, 'extensions'), { recursive: true, force: true })
  .then(() => console.log(`Copied extensions to ${path.join(outputDirectory, 'extensions')}`))
  .catch((error) => { console.error(error); process.exitCode = 1; });
