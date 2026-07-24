const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'webm', 'ncm']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function getExtension(name) {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function isAudioFile(file) {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(getExtension(file.name));
}

export function isImageFile(file) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(getExtension(file.name));
}

export function filePath(file) {
  return (file._nightwavePath || file.webkitRelativePath || file.name).replaceAll('\\', '/');
}

export function withoutExtension(path) {
  return path.replace(/\.[^/.]+$/, '');
}

export function fileStem(path) {
  return withoutExtension(path.split('/').pop() || path);
}

export function folderPath(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function mediaKey(path) {
  return withoutExtension(path).toLocaleLowerCase();
}

export function parseFileName(name) {
  const stem = fileStem(name).replace(/^\s*\d{1,3}[.\s_-]+/, '').trim();
  const parts = stem.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    return { artist: parts.shift().trim(), title: parts.join(' - ').trim() };
  }
  return { artist: '', title: stem || '未命名曲目' };
}

function decodeSynchsafe(bytes, offset) {
  return (
    (bytes[offset] << 21) |
    (bytes[offset + 1] << 14) |
    (bytes[offset + 2] << 7) |
    bytes[offset + 3]
  );
}

function decodeUint32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function decodeText(bytes, encoding) {
  if (!bytes.length) return '';
  let decoder;
  let value = bytes;

  try {
    if (encoding === 0) decoder = new TextDecoder('windows-1252');
    if (encoding === 3) decoder = new TextDecoder('utf-8');
    if (encoding === 1) {
      const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
      const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : bigEndian ? 2 : 0;
      value = bytes.slice(bom);
      if (bigEndian) {
        value = Uint8Array.from(value);
        for (let index = 0; index + 1 < value.length; index += 2) {
          [value[index], value[index + 1]] = [value[index + 1], value[index]];
        }
      }
      decoder = new TextDecoder('utf-16le');
    }
    if (encoding === 2) {
      value = Uint8Array.from(bytes);
      for (let index = 0; index + 1 < value.length; index += 2) {
        [value[index], value[index + 1]] = [value[index + 1], value[index]];
      }
      decoder = new TextDecoder('utf-16le');
    }
    return (decoder || new TextDecoder()).decode(value).replaceAll('\0', '').trim();
  } catch {
    return new TextDecoder().decode(bytes).replaceAll('\0', '').trim();
  }
}

function findTerminator(bytes, start, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
    }
    return bytes.length;
  }
  const index = bytes.indexOf(0, start);
  return index === -1 ? bytes.length : index + 1;
}

function parsePicture(bytes, objectUrls) {
  const encoding = bytes[0];
  let cursor = 1;
  const mimeEnd = bytes.indexOf(0, cursor);
  if (mimeEnd === -1) return null;

  const mime = decodeText(bytes.slice(cursor, mimeEnd), 0) || 'image/jpeg';
  cursor = mimeEnd + 2;
  cursor = findTerminator(bytes, cursor, encoding);
  if (cursor >= bytes.length) return null;

  const url = URL.createObjectURL(new Blob([bytes.slice(cursor)], { type: mime }));
  objectUrls.add(url);
  return url;
}

export async function readId3(file, objectUrls) {
  if (getExtension(file.name) !== 'mp3') return {};

  try {
    const readSlice = async (start, end) => {
      if (file._nightwaveDesktopPath && window.nightwaveDesktop?.readMusicFile) {
        return new Uint8Array(await window.nightwaveDesktop.readMusicFile(file._nightwaveDesktopPath, { offset: start, length: end - start }));
      }
      return new Uint8Array(await file.slice(start, end).arrayBuffer());
    };
    const header = await readSlice(0, 10);
    if (String.fromCharCode(...header.slice(0, 3)) !== 'ID3') return {};

    const version = header[3];
    const tagSize = Math.min(decodeSynchsafe(header, 6) + 10, file.size, 12 * 1024 * 1024);
    const bytes = await readSlice(0, tagSize);
    const metadata = {};
    let offset = 10;

    while (offset + 10 <= bytes.length) {
      const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4 ? decodeSynchsafe(bytes, offset + 4) : decodeUint32(bytes, offset + 4);
      if (!size || offset + 10 + size > bytes.length) break;

      const frame = bytes.slice(offset + 10, offset + 10 + size);
      if (id === 'TIT2') metadata.title = decodeText(frame.slice(1), frame[0]);
      if (id === 'TPE1') metadata.artist = decodeText(frame.slice(1), frame[0]);
      if (id === 'TALB') metadata.album = decodeText(frame.slice(1), frame[0]);
      if (id === 'APIC' && !metadata.cover) metadata.cover = parsePicture(frame, objectUrls);
      offset += 10 + size;
    }

    return metadata;
  } catch {
    return {};
  }
}

export function parseLrc(content) {
  const metadata = {};
  const timedLines = new Map();
  const plainLines = [];
  let offset = 0;

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const metaMatch = rawLine.match(/^\[(ar|ti|al|by|offset):\s*(.*?)\s*\]$/i);
    if (metaMatch) {
      metadata[metaMatch[1].toLowerCase()] = metaMatch[2];
      if (metaMatch[1].toLowerCase() === 'offset') offset = Number(metaMatch[2]) || 0;
      continue;
    }

    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) {
      if (rawLine.trim() && !/^\[[^\]]+\]$/.test(rawLine.trim())) plainLines.push(rawLine.trim());
      continue;
    }
    const text = rawLine.replace(/\[[^\]]+\]/g, '').trim();

    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(2, '0')}`) : 0;
      const time = Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction + offset / 1000);
      const key = time.toFixed(3);
      const existing = timedLines.get(key);
      if (!existing) timedLines.set(key, { time, text, translation: '' });
      else if (text && text !== existing.text) existing.translation = text;
    }
  }

  return {
    metadata,
    lines: [...timedLines.values()].sort((a, b) => a.time - b.time),
    plainLines: timedLines.size ? [] : plainLines,
    raw: content,
  };
}

export async function readLyrics(file) {
  if (!file) return { metadata: {}, lines: [], plainLines: [], raw: '', source: 'none' };
  try {
    const text = file._nightwaveDesktopPath && window.nightwaveDesktop?.readMusicFile
      ? new TextDecoder().decode(await window.nightwaveDesktop.readMusicFile(file._nightwaveDesktopPath))
      : await file.text();
    return { ...parseLrc(text), source: 'local' };
  } catch {
    return { metadata: {}, lines: [], plainLines: [], raw: '', source: 'none' };
  }
}

export function createArtwork(title, artist) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  const seed = [...`${title}${artist}`].reduce((total, char) => total + char.charCodeAt(0), 0);
  const palettes = [
    ['#17191b', '#ff705f', '#f5c45b'],
    ['#121514', '#65ddb0', '#e9ede8'],
    ['#171719', '#8fa7ff', '#f16f87'],
    ['#111315', '#e7e0d1', '#ef665b'],
  ];
  const [background, accent, detail] = palettes[seed % palettes.length];

  context.fillStyle = background;
  context.fillRect(0, 0, 720, 720);
  context.fillStyle = accent;
  context.beginPath();
  context.arc(560, 150, 240, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = detail;
  context.lineWidth = 8;
  for (let index = 0; index < 8; index += 1) {
    context.beginPath();
    context.arc(130, 630, 120 + index * 38, Math.PI * 1.05, Math.PI * 1.73);
    context.stroke();
  }
  context.fillStyle = '#f4f4ef';
  context.font = '700 68px Bahnschrift, Arial';
  context.fillText((title || 'LOCAL').slice(0, 13).toUpperCase(), 54, 500, 610);
  context.fillStyle = '#b8bbb7';
  context.font = '500 28px Bahnschrift, Arial';
  context.fillText((artist || 'NIGHTWAVE').slice(0, 24).toUpperCase(), 58, 552, 590);
  context.fillStyle = detail;
  context.fillRect(58, 585, 88, 7);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export async function collectDroppedFiles(dataTransfer) {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];

  const files = [];
  async function walk(entry) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      Object.defineProperty(file, '_nightwavePath', {
        configurable: true,
        value: entry.fullPath.replace(/^\//, ''),
      });
      files.push(file);
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    while (true) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      await Promise.all(batch.map(walk));
    }
  }

  await Promise.all(entries.map(walk));
  return files;
}
