const { createDecipheriv } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { parentPort, workerData } = require('node:worker_threads');

const CORE_KEY = Buffer.from('687a4852416d736f356b496e62617857', 'hex');
const METADATA_KEY = Buffer.from('2331346c6a6b5f215c5d2630553c2728', 'hex');

function decrypt(bytes, key) {
  const decipher = createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(bytes), decipher.final()]);
}

function audioMask(key) {
  const box = Uint8Array.from({ length: 256 }, (_value, index) => index);
  let last = 0;
  let keyIndex = 0;
  for (let index = 0; index < 256; index += 1) {
    const original = box[index];
    const swap = (original + last + key[keyIndex]) & 0xff;
    keyIndex = (keyIndex + 1) % key.length;
    box[index] = box[swap];
    box[swap] = original;
    last = swap;
  }
  return Uint8Array.from({ length: 256 }, (_value, index) => {
    const cursor = (index + 1) & 0xff;
    return box[(box[cursor] + box[(box[cursor] + cursor) & 0xff]) & 0xff];
  });
}

function metadata(raw) {
  const artists = raw.artist || raw.artists || [];
  const artist = Array.isArray(artists)
    ? artists.map((item) => (Array.isArray(item) ? item[0] : item?.name || item)).filter(Boolean).join(' / ')
    : String(artists || '');
  const duration = Number(raw.duration);
  return { title: raw.musicName || raw.name || '', artist, album: raw.album || raw.albumName || '', duration: Number.isFinite(duration) && duration > 0 ? duration / 1000 : 0, format: String(raw.format || '').toLocaleLowerCase() };
}

function formatFor(audio, declared) {
  if (['mp3', 'flac', 'ogg', 'm4a', 'wav'].includes(declared)) return declared;
  if (audio.subarray(0, 4).toString('ascii') === 'fLaC') return 'flac';
  if (audio.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (audio.subarray(0, 4).toString('ascii') === 'RIFF' && audio.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav';
  if (audio.subarray(4, 8).toString('ascii') === 'ftyp') return 'm4a';
  if (audio.subarray(0, 3).toString('ascii') === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)) return 'mp3';
  throw new Error('无法识别 NCM 内的音频格式');
}

async function decode(filePath) {
  const bytes = Buffer.from(await readFile(filePath));
  let offset = 0;
  const take = (length) => {
    if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) throw new Error('NCM 文件不完整');
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  if (take(8).toString('ascii') !== 'CTENFDAM') throw new Error('不是有效的 NCM 文件');
  take(2);
  const keyLength = take(4).readUInt32LE(0);
  if (keyLength < 16 || keyLength > 1024 * 1024) throw new Error('NCM 密钥区长度无效');
  const encryptedKey = Buffer.from(take(keyLength));
  for (let index = 0; index < encryptedKey.length; index += 1) encryptedKey[index] ^= 0x64;
  const key = decrypt(encryptedKey, CORE_KEY);
  if (key.length <= 17) throw new Error('NCM 音频密钥无效');
  const mask = audioMask(key.subarray(17));
  const metadataLength = take(4).readUInt32LE(0);
  if (metadataLength > 16 * 1024 * 1024) throw new Error('NCM 元数据区长度无效');
  let rawMetadata = {};
  if (metadataLength) {
    try {
      const encryptedMetadata = take(metadataLength);
      const decodedMetadata = Buffer.allocUnsafe(encryptedMetadata.length);
      for (let index = 0; index < encryptedMetadata.length; index += 1) decodedMetadata[index] = encryptedMetadata[index] ^ 0x63;
      const text = decrypt(Buffer.from(decodedMetadata.subarray(22).toString('utf8').trim(), 'base64'), METADATA_KEY).toString('utf8');
      const start = text.indexOf('{');
      if (start !== -1) rawMetadata = JSON.parse(text.slice(start));
    } catch { rawMetadata = {}; }
  }
  take(5);
  const coverFrameLength = take(4).readUInt32LE(0);
  const imageLength = take(4).readUInt32LE(0);
  if (imageLength > coverFrameLength || coverFrameLength > bytes.length - offset) throw new Error('NCM 封面区长度无效');
  const cover = Uint8Array.from(take(imageLength));
  take(coverFrameLength - imageLength);
  if (offset >= bytes.length) throw new Error('NCM 中没有音频数据');
  const audio = Uint8Array.from(bytes.subarray(offset));
  for (let index = 0; index < audio.length; index += 1) audio[index] ^= mask[index & 0xff];
  const normalizedMetadata = metadata(rawMetadata);
  const format = formatFor(Buffer.from(audio.subarray(0, 12)), normalizedMetadata.format);
  return {
    audio,
    audioType: { flac: 'audio/flac', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' }[format] || 'application/octet-stream',
    cover,
    coverType: cover[0] === 0x89 && cover[1] === 0x50 ? 'image/png' : cover[0] === 0x52 && cover[1] === 0x49 && cover[2] === 0x46 && cover[3] === 0x46 ? 'image/webp' : 'image/jpeg',
    format,
    metadata: normalizedMetadata,
  };
}

decode(workerData.filePath)
  .then((result) => parentPort.postMessage(result, [result.audio.buffer, result.cover.buffer]))
  .catch((error) => parentPort.postMessage({ error: error.message || 'NCM 解码失败' }));
