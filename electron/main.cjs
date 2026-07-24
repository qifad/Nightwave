const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDevelopment = Boolean(process.env.ELECTRON_START_URL);
const distDirectory = path.join(__dirname, '..', 'dist');
const editorDistDirectory = path.join(__dirname, '..', 'EDITOR', 'dist');
const packagerDistDirectory = path.join(__dirname, '..', 'PACKAGER', 'dist');
let editorWindow = null;
let packagerWindow = null;

function extensionDirectory() {
  if (isDevelopment) return path.join(app.getAppPath(), 'extensions');
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  return path.join(path.dirname(executablePath), 'extensions');
}

const musicFileExtensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'webm', 'ncm', 'lrc', 'jpg', 'jpeg', 'png', 'webp']);
const mediaRoots = new Map();
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/qifad/Nightwave/main/updates/manifest.json';
const UPDATE_RAW_PREFIX = 'https://raw.githubusercontent.com/qifad/Nightwave/main/updates/';
let activeDataPackage = null;
let dataUpdateJob = null;

function registerMediaRoot(directory) {
  const token = randomUUID();
  mediaRoots.set(token, directory);
  while (mediaRoots.size > 12) mediaRoots.delete(mediaRoots.keys().next().value);
  return token;
}

function mediaUrl(token, relativePath) {
  return `nightwave://media/${token}/${relativePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function updateDataRoot() {
  return path.join(app.getPath('userData'), 'data-updates');
}

function updateStatePath() {
  return path.join(updateDataRoot(), 'active.json');
}

function compareVersions(left, right) {
  const leftParts = String(left || '').replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
  const rightParts = String(right || '').replace(/^v/i, '').split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function safeUpdateRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('../') || normalized.startsWith('.') || path.isAbsolute(normalized)) return '';
  return normalized;
}

function isTrustedUpdateUrl(value) {
  return typeof value === 'string' && value.startsWith(UPDATE_RAW_PREFIX);
}

function activeContentDirectory(hostname) {
  const folder = hostname === 'editor' ? 'editor' : hostname === 'packager' ? 'packager' : 'app';
  if (activeDataPackage) return path.join(activeDataPackage.directory, folder);
  return hostname === 'editor' ? editorDistDirectory : hostname === 'packager' ? packagerDistDirectory : distDirectory;
}

async function loadActiveDataPackage() {
  try {
    const state = JSON.parse(await fs.readFile(updateStatePath(), 'utf8'));
    const folder = safeUpdateRelativePath(state.folder);
    const directory = folder ? path.resolve(updateDataRoot(), folder) : '';
    if (!directory.startsWith(`${updateDataRoot()}${path.sep}`)) return;
    await Promise.all(['app/index.html', 'editor/index.html', 'packager/index.html'].map((file) => fs.access(path.join(directory, file))));
    activeDataPackage = { version: String(state.version), directory };
  } catch {
    activeDataPackage = null;
  }
}

async function fetchUpdateBytes(url) {
  const response = await net.fetch(url, { headers: { 'User-Agent': 'Nightwave/1.0 update client', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`更新服务器返回 ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchUpdateJson(url) {
  return JSON.parse((await fetchUpdateBytes(url)).toString('utf8'));
}

function updateStatus(status, extra = {}) {
  return { status, currentVersion: activeDataPackage?.version || app.getVersion(), ...extra };
}

async function checkDataUpdate() {
  if (dataUpdateJob) return dataUpdateJob;
  dataUpdateJob = (async () => {
    try {
      const manifest = await fetchUpdateJson(UPDATE_MANIFEST_URL);
      const version = String(manifest.version || '');
      if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version) || !isTrustedUpdateUrl(manifest.packageUrl) || !/^[a-f\d]{64}$/i.test(manifest.packageSha256 || '')) {
        throw new Error('更新清单格式无效');
      }
      if (compareVersions(version, activeDataPackage?.version || app.getVersion()) <= 0) return updateStatus('up-to-date', { remoteVersion: version });
      const descriptorBytes = await fetchUpdateBytes(manifest.packageUrl);
      if (createHash('sha256').update(descriptorBytes).digest('hex') !== manifest.packageSha256.toLowerCase()) throw new Error('更新包清单校验失败');
      const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
      if (descriptor.version !== version || !Array.isArray(descriptor.files) || !descriptor.files.length || descriptor.files.length > 5000) throw new Error('更新包内容无效');
      const root = updateDataRoot();
      const stageDirectory = path.join(root, `.staging-${version}-${Date.now()}`);
      const targetDirectory = path.join(root, `v${version}`);
      try {
        for (const file of descriptor.files) {
          const relativePath = safeUpdateRelativePath(file.path);
          if (!relativePath || !isTrustedUpdateUrl(file.url) || !/^[a-f\d]{64}$/i.test(file.sha256 || '')) throw new Error('更新文件清单无效');
          const bytes = await fetchUpdateBytes(file.url);
          if (bytes.length !== Number(file.size) || createHash('sha256').update(bytes).digest('hex') !== file.sha256.toLowerCase()) throw new Error(`更新文件校验失败: ${relativePath}`);
          const output = path.resolve(stageDirectory, relativePath);
          if (!output.startsWith(`${stageDirectory}${path.sep}`)) throw new Error('更新文件路径无效');
          await fs.mkdir(path.dirname(output), { recursive: true });
          await fs.writeFile(output, bytes);
        }
        await Promise.all(['app/index.html', 'editor/index.html', 'packager/index.html'].map((file) => fs.access(path.join(stageDirectory, file))));
        await fs.mkdir(root, { recursive: true });
        await fs.rm(targetDirectory, { recursive: true, force: true });
        await fs.rename(stageDirectory, targetDirectory);
        const state = { version, folder: `v${version}`, installedAt: new Date().toISOString() };
        const temporary = `${updateStatePath()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
        await fs.rm(updateStatePath(), { force: true });
        await fs.rename(temporary, updateStatePath());
        activeDataPackage = { version, directory: targetDirectory };
        return updateStatus('updated', { remoteVersion: version });
      } catch (error) {
        await fs.rm(stageDirectory, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    } catch (error) {
      return updateStatus('unavailable', { error: error.message || '无法检查更新' });
    } finally {
      dataUpdateJob = null;
    }
  })();
  return dataUpdateJob;
}

function mimeTypeForExtension(extension) {
  return {
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', ncm: 'application/octet-stream',
    lrc: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  }[extension] || 'application/octet-stream';
}

async function readMusicDirectory(directoryPath) {
  const root = path.resolve(directoryPath);
  const mediaToken = registerMediaRoot(root);
  const candidates = [];
  async function visit(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(fullPath); continue; }
      const extension = path.extname(entry.name).slice(1).toLocaleLowerCase();
      if (!musicFileExtensions.has(extension)) continue;
      candidates.push({ fullPath, extension, name: entry.name });
    }
  }
  await visit(root);
  const files = new Array(candidates.length);
  let nextIndex = 0;
  const workerCount = Math.min(6, Math.max(2, candidates.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = candidates[index];
      try {
        const stat = await fs.stat(candidate.fullPath);
        const relativePath = path.relative(root, candidate.fullPath).replace(/\\/g, '/');
        files[index] = {
          name: candidate.name,
          path: candidate.fullPath,
          relativePath,
          mediaUrl: mediaUrl(mediaToken, relativePath),
          directoryPath: path.dirname(candidate.fullPath),
          size: stat.size,
          lastModified: stat.mtimeMs,
          type: mimeTypeForExtension(candidate.extension),
        };
      } catch { /* Skip one inaccessible file without blocking the whole library. */ }
    }
  }));
  return files.filter(Boolean);
}

async function readMusicFile(filePath, options = {}) {
  const resolved = path.resolve(String(filePath || ''));
  const extension = path.extname(resolved).slice(1).toLocaleLowerCase();
  if (!musicFileExtensions.has(extension)) throw new Error('不支持读取此文件类型');
  const offset = Math.max(0, Number(options.offset) || 0);
  const requestedLength = Math.max(0, Number(options.length) || 0);
  if (!requestedLength) return new Uint8Array(await fs.readFile(resolved));
  const handle = await fs.open(resolved, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(requestedLength, 12 * 1024 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function decodeNcmFile(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (path.extname(resolved).toLocaleLowerCase() !== '.ncm') throw new Error('不是 NCM 文件');
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'ncm-worker.cjs'), { workerData: { filePath: resolved } });
    worker.once('message', (result) => result?.error ? reject(new Error(result.error)) : resolve(result));
    worker.once('error', reject);
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`NCM 解码任务异常退出 (${code})`)); });
  });
}

function lyricQuery(payload = {}) {
  return {
    title: String(payload.title || '').trim().slice(0, 300),
    artist: String(payload.artist || '').trim().slice(0, 300),
    album: String(payload.album || '').trim().slice(0, 300),
    duration: Math.max(0, Number(payload.duration) || 0),
  };
}

async function fetchLyricsJson(url, options = {}) {
  const response = await net.fetch(url, { ...options, headers: { 'User-Agent': 'Mozilla/5.0 Nightwave/1.0', ...options.headers } });
  if (!response.ok) throw new Error(`歌词服务返回 ${response.status}`);
  return response.json();
}

async function searchDesktopLyrics(provider, payload) {
  const query = lyricQuery(payload);
  if (!query.title) throw new Error('请填写歌曲名');
  if (provider === 'netease') {
    const params = new URLSearchParams({ s: query.artist ? `${query.title} ${query.artist}` : query.title, type: '1', offset: '0', total: 'true', limit: '20', csrf_token: '' });
    const response = await fetchLyricsJson(`https://music.163.com/api/search/get/web?${params}`);
    return (response.result?.songs || []).map((song) => ({
      id: String(song.id),
      provider: 'netease',
      trackName: song.name || query.title,
      artistName: (song.artists || []).map((artist) => artist.name).filter(Boolean).join(' / '),
      albumName: song.album?.name || '',
      duration: Number(song.duration || 0) / 1000,
      syncedLyrics: '',
      plainLyrics: '',
      providerData: { id: song.id },
    }));
  }
  throw new Error('不支持的歌词来源');
}

async function resolveDesktopLyrics(provider, result = {}) {
  if (provider === 'netease') {
    const id = Number(result.providerData?.id || result.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('网易云歌曲标识无效');
    const params = new URLSearchParams({ id: String(id), lv: '-1', kv: '-1', tv: '-1' });
    const response = await fetchLyricsJson(`https://music.163.com/api/song/lyric?${params}`);
    const syncedLyrics = response.lrc?.lyric || '';
    const plainLyrics = response.tlyric?.lyric || '';
    if (!syncedLyrics && !plainLyrics) throw new Error('该歌曲没有可下载的歌词');
    return { syncedLyrics, plainLyrics };
  }
  throw new Error('不支持的歌词来源');
}

function userStatePath() {
  return path.join(app.getPath('userData'), 'user-state.json');
}

function logMainError(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.error(line.trim());
  fs.appendFile(path.join(app.getPath('logs'), 'nightwave-main.log'), line).catch(() => {});
}

const ignoredProjectDirectories = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'release', 'out', 'coverage', '.cache']);
const packagingScripts = ['pack:win', 'package:win', 'dist:win', 'electron:build', 'make:win', 'pack', 'dist', 'package', 'make'];

function sanitizeFolderName(value) {
  return String(value || 'project').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/[. ]+$/g, '').trim() || 'project';
}

function packageManagerFor(entryNames) {
  if (entryNames.includes('pnpm-lock.yaml')) return { command: 'pnpm.cmd', label: 'pnpm' };
  if (entryNames.includes('yarn.lock')) return { command: 'yarn.cmd', label: 'yarn' };
  return { command: 'npm.cmd', label: 'npm' };
}

function dependencyMap(packageJson) {
  return { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.optionalDependencies };
}

function getPackagingPlan(packageJson, entryNames) {
  const scripts = packageJson.scripts || {};
  const scriptName = packagingScripts.find((name) => typeof scripts[name] === 'string');
  const dependencies = dependencyMap(packageJson);
  const hasElectron = Boolean(dependencies.electron || packageJson.main);
  const hasBuilder = Boolean(dependencies['electron-builder'] || dependencies['electron-forge'] || dependencies['electron-packager'] || packageJson.build || entryNames.includes('electron-builder.yml') || entryNames.includes('electron-builder.yaml'));
  if (!scriptName && !(hasElectron && hasBuilder)) return null;
  const packageManager = packageManagerFor(entryNames);
  const command = scriptName
    ? `${packageManager.label} run ${scriptName}`
    : `npx electron-builder --win portable`;
  return { scriptName: scriptName || '', command, packageManager, usesBuilder: !scriptName };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function scanPackagerProjects(rootDirectory) {
  const rootInput = String(rootDirectory || '').trim();
  if (!rootInput) return [];
  const root = path.resolve(rootInput);
  const projects = [];
  async function visit(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    const entryNames = entries.map((entry) => entry.name);
    const packageJson = entryNames.includes('package.json') ? await readJsonFile(path.join(directory, 'package.json')) : null;
    const plan = packageJson ? getPackagingPlan(packageJson, entryNames) : null;
    if (packageJson && plan) {
      const relativePath = path.relative(root, directory) || '.';
      const projectName = packageJson.productName || packageJson.name || path.basename(directory);
      const folderName = relativePath === '.'
        ? sanitizeFolderName(projectName)
        : sanitizeFolderName(`${projectName}-${relativePath.replace(/[\\/]+/g, '-')}`);
      projects.push({
        id: relativePath.replace(/\\/g, '/') || '.',
        name: projectName,
        relativePath: relativePath.replace(/\\/g, '/'),
        absolutePath: directory,
        framework: dependencyMap(packageJson).vue ? 'Vue + Electron' : 'Electron',
        version: packageJson.version || '0.0.0',
        folderName,
        ...plan,
      });
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignoredProjectDirectories.has(entry.name) || entry.name.startsWith('.')) continue;
      await visit(path.join(directory, entry.name));
    }
  }
  await visit(root);
  return projects.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN', { numeric: true }));
}

function emitPackagerProgress(event, payload) {
  event.sender.send('nightwave:packager-progress', payload);
}

function runCommand(command, args, cwd, onLine) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: '1', npm_config_yes: 'true' },
      windowsHide: true,
    });
    let settled = false;
    const finish = (code, error = '') => {
      if (settled) return;
      settled = true;
      resolve({ code: typeof code === 'number' ? code : 1, error });
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach(onLine));
    child.stderr?.on('data', (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach(onLine));
    child.on('error', (error) => finish(1, error.message));
    child.on('close', (code) => finish(code));
  });
}

async function findExecutables(directory) {
  const results = [];
  async function visit(current) {
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.toLocaleLowerCase().endsWith('.exe')) results.push(fullPath);
    }
  }
  await visit(directory);
  return results;
}

async function collectProjectExecutables(project, outputDirectory) {
  let executables = await findExecutables(outputDirectory);
  if (executables.length) return executables;
  for (const directoryName of ['dist', 'release', 'out', 'build']) {
    const sourceDirectory = path.join(project.absolutePath, directoryName);
    const sourceExecutables = await findExecutables(sourceDirectory);
    for (const sourcePath of sourceExecutables) {
      const destinationPath = path.join(outputDirectory, path.basename(sourcePath));
      try {
        await fs.copyFile(sourcePath, destinationPath);
        executables.push(destinationPath);
      } catch { /* Keep the build result even when an optional artifact cannot be copied. */ }
    }
    if (executables.length) break;
  }
  return executables;
}

async function packageProjects(event, payload = {}) {
  const rootInput = String(payload.rootDirectory || '').trim();
  const destinationInput = String(payload.destinationDirectory || '').trim();
  if (!rootInput || !destinationInput) throw new Error('缺少项目目录或输出目录');
  const rootDirectory = path.resolve(rootInput);
  const destinationDirectory = path.resolve(destinationInput);
  const projects = await scanPackagerProjects(rootDirectory);
  const selectedIds = new Set(Array.isArray(payload.projectIds) ? payload.projectIds : projects.map((project) => project.id));
  const selectedProjects = projects.filter((project) => selectedIds.has(project.id));
  if (!selectedProjects.length) throw new Error('没有选择可打包的项目');
  await fs.mkdir(destinationDirectory, { recursive: true });
  const results = [];
  emitPackagerProgress(event, { type: 'session', status: 'start', total: selectedProjects.length, destinationDirectory });
  for (let index = 0; index < selectedProjects.length; index += 1) {
    const project = selectedProjects[index];
    const outputDirectory = path.join(destinationDirectory, project.folderName);
    await fs.mkdir(outputDirectory, { recursive: true });
    const outputArgument = `--config.directories.output=${outputDirectory}`;
    const args = project.scriptName
      ? project.packageManager.label === 'npm'
        ? ['run', project.scriptName, '--', outputArgument]
        : ['run', project.scriptName, outputArgument]
      : ['electron-builder', '--win', 'portable', outputArgument];
    const command = project.scriptName ? project.packageManager.command : 'npx.cmd';
    emitPackagerProgress(event, { type: 'project', status: 'start', index, total: selectedProjects.length, projectId: project.id, projectName: project.name, outputDirectory, command: `${command} ${args.join(' ')}` });
    const commandResult = await runCommand(command, args, project.absolutePath, (line) => emitPackagerProgress(event, { type: 'log', projectId: project.id, line }));
    const executables = commandResult.code === 0 ? await collectProjectExecutables(project, outputDirectory) : [];
    const result = { projectId: project.id, projectName: project.name, outputDirectory, code: commandResult.code, error: commandResult.error, executables };
    results.push(result);
    emitPackagerProgress(event, { type: 'project', status: commandResult.code === 0 ? 'complete' : 'error', index, total: selectedProjects.length, ...result });
  }
  await shell.openPath(destinationDirectory);
  emitPackagerProgress(event, { type: 'session', status: 'complete', total: selectedProjects.length, results, destinationDirectory });
  return { destinationDirectory, results };
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nightwave',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#0d0e0f',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logMainError(`主窗口加载失败 ${errorCode} ${errorDescription} ${validatedURL}`);
    window.show();
    if (!isDevelopment) dialog.showErrorBox('Nightwave 启动失败', `${errorDescription}\n${validatedURL}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    logMainError(`主窗口渲染进程退出：${details.reason || 'unknown'} ${details.exitCode ?? ''}`);
  });
  const target = isDevelopment ? process.env.ELECTRON_START_URL : 'nightwave://app/index.html';
  window.loadURL(target).catch((error) => {
    logMainError(`主窗口 URL 加载异常：${error.message}`);
    window.show();
    if (!isDevelopment) dialog.showErrorBox('Nightwave 启动失败', error.message);
  });
}

function createEditorWindow(seed = '') {
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0d1014',
    title: 'Nightwave Extension Editor',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  window.on('closed', () => { if (editorWindow === window) editorWindow = null; });
  const query = seed ? `?seed=${encodeURIComponent(seed)}` : '';
  const editorUrl = process.env.NIGHTWAVE_EDITOR_URL
    ? `${process.env.NIGHTWAVE_EDITOR_URL.replace(/\/$/, '')}/${query}`
    : isDevelopment
      ? `http://127.0.0.1:5174/${query}`
      : `nightwave://editor/index.html${query}`;
  window.loadURL(editorUrl);
  editorWindow = window;
  return window;
}

function createPackagerWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#0b0f13',
    title: 'Nightwave Build Lab',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  window.on('closed', () => { if (packagerWindow === window) packagerWindow = null; });
  window.loadURL(isDevelopment ? 'http://127.0.0.1:5175/' : 'nightwave://packager/index.html');
  packagerWindow = window;
  return window;
}

app.whenReady().then(async () => {
  await loadActiveDataPackage();
  protocol.handle('nightwave', (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname === 'media') {
      const [, token, ...encodedSegments] = requestUrl.pathname.split('/');
      const root = mediaRoots.get(token);
      const relativePath = encodedSegments.map((segment) => decodeURIComponent(segment)).join(path.sep);
      const resolved = root ? path.resolve(root, relativePath) : '';
      if (!root || !resolved.startsWith(`${root}${path.sep}`) || !musicFileExtensions.has(path.extname(resolved).slice(1).toLocaleLowerCase())) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    }
     const baseDirectory = activeContentDirectory(requestUrl.hostname);
    const requestedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
    const resolved = path.resolve(baseDirectory, `.${requestedPath}`);
    if (!resolved.startsWith(`${baseDirectory}${path.sep}`) && resolved !== path.join(baseDirectory, 'index.html')) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(`${pathToFileURL(resolved).toString()}${requestUrl.search}`);
  });

  ipcMain.handle('nightwave:save-file', async (_event, payload) => {
    const result = await dialog.showSaveDialog({
      title: '保存 Nightwave 文件',
      defaultPath: payload.suggestedName,
      filters: [{ name: payload.description || 'Nightwave 文件', extensions: [payload.extension.replace(/^\./, '')] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, Buffer.from(payload.bytes));
    return { name: path.basename(result.filePath) };
  });

  ipcMain.handle('nightwave:list-extensions', async () => {
    const directory = extensionDirectory();
    try {
      const names = (await fs.readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith('.zip'))
        .map((entry) => entry.name);
      return Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await fs.readFile(path.join(directory, name))) })));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  });

  ipcMain.handle('nightwave:pick-music-directory', async () => {
    const result = await dialog.showOpenDialog({ title: '选择音乐文件夹', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const directoryPath = result.filePaths[0];
    return { canceled: false, path: directoryPath, name: path.basename(directoryPath), files: await readMusicDirectory(directoryPath) };
  });

  ipcMain.handle('nightwave:read-music-directory', async (_event, directoryPath) => {
    const resolved = path.resolve(String(directoryPath || ''));
    return { canceled: false, path: resolved, name: path.basename(resolved), files: await readMusicDirectory(resolved) };
  });

  ipcMain.handle('nightwave:read-music-file', async (_event, filePath, options) => {
    return readMusicFile(filePath, options);
  });

  ipcMain.handle('nightwave:decode-ncm', async (_event, filePath) => decodeNcmFile(filePath));
  ipcMain.handle('nightwave:search-lyrics', async (_event, provider, query) => searchDesktopLyrics(provider, query));
  ipcMain.handle('nightwave:resolve-lyrics', async (_event, provider, result) => resolveDesktopLyrics(provider, result));
  ipcMain.handle('nightwave:get-data-update-state', async () => updateStatus('idle'));
  ipcMain.handle('nightwave:check-data-update', async () => checkDataUpdate());

  ipcMain.handle('nightwave:write-lyrics', async (_event, payload = {}) => {
    const directoryInput = String(payload.directoryPath || '').trim();
    const name = path.basename(String(payload.name || 'lyrics.lrc'));
    if (!directoryInput || !name.toLocaleLowerCase().endsWith('.lrc')) throw new Error('歌词保存路径无效');
    const directoryPath = path.resolve(directoryInput);
    await fs.writeFile(path.join(directoryPath, name), String(payload.text || ''), 'utf8');
    return { name };
  });

  ipcMain.handle('nightwave:load-user-state', async () => {
    try { return JSON.parse(await fs.readFile(userStatePath(), 'utf8')); } catch { return null; }
  });

  ipcMain.handle('nightwave:save-user-state', async (_event, state) => {
    const target = userStatePath();
    const temporary = `${target}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporary, target);
    return { saved: true };
  });

  ipcMain.handle('nightwave:open-editor', async (_event, payload = {}) => {
    const seed = typeof payload.seed === 'string' ? payload.seed : '';
    if (editorWindow && !editorWindow.isDestroyed()) {
      editorWindow.loadURL(isDevelopment ? `http://127.0.0.1:5174/?seed=${encodeURIComponent(seed)}` : `nightwave://editor/index.html?seed=${encodeURIComponent(seed)}`);
      editorWindow.focus();
      return { opened: true };
    }
    createEditorWindow(seed);
    return { opened: true };
  });

  ipcMain.handle('nightwave:open-packager', async () => {
    if (packagerWindow && !packagerWindow.isDestroyed()) {
      packagerWindow.focus();
      return { opened: true };
    }
    createPackagerWindow();
    return { opened: true };
  });

  ipcMain.handle('nightwave:pick-packager-directory', async (_event, payload = {}) => {
    const result = await dialog.showOpenDialog({
      title: payload.kind === 'destination' ? '选择安装包输出目录' : '选择要扫描的项目目录',
      defaultPath: typeof payload.defaultPath === 'string' ? payload.defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths[0] ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('nightwave:scan-packager-projects', async (_event, rootDirectory) => scanPackagerProjects(rootDirectory));
  ipcMain.handle('nightwave:run-packager', async (event, payload) => packageProjects(event, payload));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
