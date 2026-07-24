export async function pickMusicDirectory() {
  if (!window.showDirectoryPicker) return null;
  const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const files = [];

  async function walk(directoryHandle, relativePath) {
    for await (const handle of directoryHandle.values()) {
      const path = relativePath ? `${relativePath}/${handle.name}` : handle.name;
      if (handle.kind === 'directory') {
        await walk(handle, path);
        continue;
      }
      const file = await handle.getFile();
      Object.defineProperties(file, {
        _nightwavePath: { configurable: true, value: `${rootHandle.name}/${path}` },
        _directoryHandle: { configurable: true, value: directoryHandle },
        _fileHandle: { configurable: true, value: handle },
      });
      files.push(file);
    }
  }

  await walk(rootHandle, '');
  return { files, name: rootHandle.name, rootHandle };
}

export function sanitizeFileName(value) {
  const cleaned = String(value || 'Nightwave')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || 'Nightwave';
}

export async function requestDirectoryWrite(directoryHandle) {
  if (!directoryHandle) return false;
  const options = { mode: 'readwrite' };
  if ((await directoryHandle.queryPermission?.(options)) === 'granted') return true;
  return (await directoryHandle.requestPermission?.(options)) === 'granted';
}

async function fileExists(directoryHandle, name) {
  try {
    await directoryHandle.getFileHandle(name);
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') return false;
    throw error;
  }
}

async function uniqueFileName(directoryHandle, suggestedName) {
  if (!(await fileExists(directoryHandle, suggestedName))) return suggestedName;
  const dot = suggestedName.lastIndexOf('.');
  const base = dot > 0 ? suggestedName.slice(0, dot) : suggestedName;
  const extension = dot > 0 ? suggestedName.slice(dot) : '';
  let index = 1;
  while (await fileExists(directoryHandle, `${base} (${index})${extension}`)) index += 1;
  return `${base} (${index})${extension}`;
}

export async function writeToDirectory(directoryHandle, suggestedName, blob, { overwrite = false } = {}) {
  if (!(await requestDirectoryWrite(directoryHandle))) throw new Error('没有音乐文件夹的写入权限');
  const safeName = sanitizeFileName(suggestedName);
  const name = overwrite ? safeName : await uniqueFileName(directoryHandle, safeName);
  const handle = await directoryHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { method: 'directory', name };
}

export async function pickSaveFileHandle(suggestedName, mimeType, extension) {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({
    suggestedName: sanitizeFileName(suggestedName),
    types: [
      {
        description: 'Nightwave 导出文件',
        accept: { [mimeType || 'application/octet-stream']: [extension] },
      },
    ],
  });
}

export async function writeToFileHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { method: 'save-picker', name: handle.name };
}

export function downloadBlob(blob, suggestedName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFileName(suggestedName);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: 'download', name: anchor.download };
}

export async function saveBlobAs(blob, suggestedName, mimeType, extension) {
  if (window.nightwaveDesktop?.saveFile) {
    const result = await window.nightwaveDesktop.saveFile({
      suggestedName: sanitizeFileName(suggestedName),
      description: 'Nightwave 导出文件',
      extension,
      mimeType,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
    if (result?.canceled) throw new DOMException('保存已取消', 'AbortError');
    return { method: 'electron-save-dialog', name: result.name };
  }
  const handle = await pickSaveFileHandle(suggestedName, mimeType, extension);
  if (handle) return writeToFileHandle(handle, blob);
  return downloadBlob(blob, suggestedName);
}
