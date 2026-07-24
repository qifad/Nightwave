import { strFromU8, unzipSync } from 'fflate';

function findEntry(files, name) {
  const normalized = name.replace(/^\.\//, '').toLocaleLowerCase();
  for (const [entry, bytes] of files) {
    const lowerEntry = entry.toLocaleLowerCase();
    if (lowerEntry === normalized || lowerEntry.endsWith(`/${normalized}`)) return bytes;
  }
  return null;
}

export async function parseExtensionZip(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
  const files = Object.entries(unzipSync(bytes));
  const manifestBytes = findEntry(files, 'manifest.json');
  if (!manifestBytes) throw new Error('扩展缺少 manifest.json');
  let manifest;
  try { manifest = JSON.parse(strFromU8(manifestBytes)); } catch { throw new Error('扩展 manifest.json 格式无效'); }
  if (!manifest.id || !manifest.name || !['theme', 'plugin'].includes(manifest.type)) throw new Error('扩展 manifest 缺少有效 id、name 或 type');
  const cssBytes = manifest.stylesheet ? findEntry(files, manifest.stylesheet) : null;
  const pluginBytes = manifest.entry ? findEntry(files, manifest.entry) : null;
  return {
    manifest,
    css: cssBytes ? strFromU8(cssBytes) : '',
    pluginCode: pluginBytes ? strFromU8(pluginBytes) : '',
    sourceName: source.name || manifest.name,
  };
}

const runtimes = new Map();

function extensionId(extensionOrId) {
  return typeof extensionOrId === 'string' ? extensionOrId : extensionOrId?.manifest?.id;
}

function getCleanup(result, cleanups) {
  if (typeof result === 'function') cleanups.push(result);
  else if (typeof result?.dispose === 'function') cleanups.push(() => result.dispose());
  else if (typeof result?.deactivate === 'function') cleanups.push(() => result.deactivate());
}

export function enabledExtensionIds() {
  return [...runtimes.keys()];
}

export function disableExtension(extensionOrId) {
  const id = extensionId(extensionOrId);
  if (!id) return false;
  const runtime = runtimes.get(id);
  if (!runtime) return false;
  runtime.cleanups.splice(0).reverse().forEach((cleanup) => {
    try { cleanup(); } catch { /* Extension cleanup must not break the player. */ }
  });
  runtime.style?.remove();
  runtimes.delete(id);
  return true;
}

export async function enableExtension(extension, api = {}) {
  const id = extensionId(extension);
  if (!id || !extension.manifest) return false;
  disableExtension(id);
  if (extension.manifest.type === 'theme') {
    runtimes.forEach((runtime, runtimeId) => {
      if (runtime.type === 'theme') disableExtension(runtimeId);
    });
  }
  const runtime = { type: extension.manifest.type, cleanups: [], style: null };
  if (extension.manifest.type === 'theme' && extension.css) {
    const style = document.createElement('style');
    style.dataset.nightwaveExtension = id;
    style.textContent = extension.css;
    document.head.appendChild(style);
    runtime.style = style;
  }
  if (extension.pluginCode) {
    const url = URL.createObjectURL(new Blob([extension.pluginCode], { type: 'text/javascript' }));
    const cleanups = [];
    try {
      const module = await import(/* @vite-ignore */ url);
      const activate = module.activate || module.default?.activate || module.default;
      if (typeof activate === 'function') {
        getCleanup(await activate({ ...api, onCleanup: (cleanup) => getCleanup(cleanup, cleanups) }), cleanups);
      }
      runtime.cleanups.push(...cleanups);
    } catch (error) {
      cleanups.splice(0).reverse().forEach((cleanup) => {
        try { cleanup(); } catch { /* A failed plugin must not leak registered resources. */ }
      });
      runtime.style?.remove();
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  runtimes.set(id, runtime);
  return true;
}

export function applyExtensionTheme(extension) {
  if (!extension) return false;
  const currentTheme = [...runtimes.entries()].find(([, runtime]) => runtime.type === 'theme');
  if (currentTheme && currentTheme[0] !== extensionId(extension)) disableExtension(currentTheme[0]);
  if (runtimes.has(extensionId(extension))) return true;
  if (!extension.css) return false;
  const style = document.createElement('style');
  style.dataset.nightwaveExtension = extension.manifest.id;
  style.textContent = extension.css;
  document.head.appendChild(style);
  runtimes.set(extension.manifest.id, { type: 'theme', cleanups: [], style });
  return true;
}

export async function activateExtensionPlugin(extension, api) {
  return enableExtension(extension, api);
}
