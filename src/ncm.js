import CryptoJS from 'crypto-js';

const NCM_MAGIC = 'CTENFDAM';
const CORE_KEY = CryptoJS.enc.Hex.parse('687a4852416d736f356b496e62617857');
const METADATA_KEY = CryptoJS.enc.Hex.parse('2331346c6a6b5f215c5d2630553c2728');
const MAX_KEY_LENGTH = 1024 * 1024;
const MAX_METADATA_LENGTH = 16 * 1024 * 1024;
const AUDIO_CHUNK_SIZE = 1024 * 1024;

class NcmCursor {
  constructor(file) {
    this.file = file;
    this.offset = 0;
  }

  get remaining() {
    return this.file.size - this.offset;
  }

  async readBytes(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new Error('NCM 文件不完整');
    }
    const bytes = new Uint8Array(await this.file.slice(this.offset, this.offset + length).arrayBuffer());
    this.offset += length;
    return bytes;
  }

  async readUint32() {
    const bytes = await this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  }

  skip(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new Error('NCM 文件不完整');
    }
    this.offset += length;
  }
}

function bytesToWordArray(bytes) {
  const words = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] = (words[index >>> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray) {
  const bytes = new Uint8Array(Math.max(0, wordArray.sigBytes));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes;
}

function aesEcbDecrypt(bytes, key) {
  if (!bytes.length || bytes.length % 16 !== 0) throw new Error('NCM 加密区无效');
  const encrypted = CryptoJS.lib.CipherParams.create({ ciphertext: bytesToWordArray(bytes) });
  const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  const result = wordArrayToBytes(decrypted);
  if (!result.length) throw new Error('NCM 密钥解码失败');
  return result;
}

function buildAudioMask(key) {
  if (!key.length) throw new Error('NCM 音频密钥为空');
  const keyBox = Uint8Array.from({ length: 256 }, (_, index) => index);
  let lastByte = 0;
  let keyOffset = 0;

  for (let index = 0; index < 256; index += 1) {
    const original = keyBox[index];
    const swapIndex = (original + lastByte + key[keyOffset]) & 0xff;
    keyOffset = (keyOffset + 1) % key.length;
    keyBox[index] = keyBox[swapIndex];
    keyBox[swapIndex] = original;
    lastByte = swapIndex;
  }

  return Uint8Array.from({ length: 256 }, (_, index) => {
    const cursor = (index + 1) & 0xff;
    return keyBox[(keyBox[cursor] + keyBox[(keyBox[cursor] + cursor) & 0xff]) & 0xff];
  });
}

function parseMetadata(bytes) {
  if (!bytes.length) return {};
  const decodedHeader = Uint8Array.from(bytes, (value) => value ^ 0x63);
  const encoded = new TextDecoder().decode(decodedHeader.slice(22)).trim();
  if (!encoded) return {};

  const encrypted = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(encoded),
  });
  const decrypted = CryptoJS.AES.decrypt(encrypted, METADATA_KEY, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  const text = new TextDecoder().decode(wordArrayToBytes(decrypted));
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) return {};
  return JSON.parse(text.slice(jsonStart));
}

function normalizeMetadata(raw) {
  const artists = raw.artist || raw.artists || [];
  const artist = Array.isArray(artists)
    ? artists
        .map((item) => (Array.isArray(item) ? item[0] : item?.name || item))
        .filter(Boolean)
        .join(' / ')
    : String(artists || '');
  const duration = Number(raw.duration);

  return {
    title: raw.musicName || raw.name || '',
    artist,
    album: raw.album || raw.albumName || '',
    duration: Number.isFinite(duration) && duration > 0 ? duration / 1000 : 0,
    format: String(raw.format || '').toLocaleLowerCase(),
  };
}

function detectImageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}

function detectAudioFormat(bytes, declaredFormat) {
  if (['mp3', 'flac', 'ogg', 'm4a', 'wav'].includes(declaredFormat)) return declaredFormat;
  const signature = new TextDecoder('windows-1252').decode(bytes.slice(0, 12));
  if (signature.startsWith('fLaC')) return 'flac';
  if (signature.startsWith('OggS')) return 'ogg';
  if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WAVE') return 'wav';
  if (signature.slice(4, 8) === 'ftyp') return 'm4a';
  if (signature.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  throw new Error('无法识别 NCM 内的音频格式');
}

function audioMimeType(format) {
  return {
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
  }[format] || 'application/octet-stream';
}

export async function decodeNcm(file, objectUrls) {
  const cursor = new NcmCursor(file);
  const magic = new TextDecoder('windows-1252').decode(await cursor.readBytes(8));
  if (magic !== NCM_MAGIC) throw new Error('不是有效的 NCM 文件');

  cursor.skip(2);
  const encryptedKeyLength = await cursor.readUint32();
  if (encryptedKeyLength < 16 || encryptedKeyLength > MAX_KEY_LENGTH) throw new Error('NCM 密钥区长度无效');
  const encryptedKey = await cursor.readBytes(encryptedKeyLength);
  for (let index = 0; index < encryptedKey.length; index += 1) encryptedKey[index] ^= 0x64;
  const decryptedKey = aesEcbDecrypt(encryptedKey, CORE_KEY);
  if (decryptedKey.length <= 17) throw new Error('NCM 音频密钥无效');
  const audioMask = buildAudioMask(decryptedKey.slice(17));

  const metadataLength = await cursor.readUint32();
  if (metadataLength > MAX_METADATA_LENGTH) throw new Error('NCM 元数据区长度无效');
  let rawMetadata = {};
  if (metadataLength) {
    try {
      rawMetadata = parseMetadata(await cursor.readBytes(metadataLength));
    } catch {
      rawMetadata = {};
    }
  }
  const metadata = normalizeMetadata(rawMetadata);

  cursor.skip(5);
  const coverFrameLength = await cursor.readUint32();
  const imageLength = await cursor.readUint32();
  if (imageLength > coverFrameLength || coverFrameLength > cursor.remaining) {
    throw new Error('NCM 封面区长度无效');
  }
  const imageBytes = await cursor.readBytes(imageLength);
  cursor.skip(coverFrameLength - imageLength);

  if (!cursor.remaining) throw new Error('NCM 中没有音频数据');
  const audioParts = [];
  let decodedLength = 0;
  let signature = null;
  while (cursor.remaining) {
    const chunk = await cursor.readBytes(Math.min(AUDIO_CHUNK_SIZE, cursor.remaining));
    for (let index = 0; index < chunk.length; index += 1) {
      chunk[index] ^= audioMask[(decodedLength + index) & 0xff];
    }
    if (!signature) signature = chunk.slice(0, 12);
    audioParts.push(chunk);
    decodedLength += chunk.length;
    if (decodedLength % (AUDIO_CHUNK_SIZE * 8) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const format = detectAudioFormat(signature, metadata.format);
  const audio = new Blob(audioParts, { type: audioMimeType(format) });
  let cover = null;
  let coverBlob = null;
  if (imageBytes.length) {
    coverBlob = new Blob([imageBytes], { type: detectImageType(imageBytes) });
    cover = URL.createObjectURL(coverBlob);
    objectUrls.add(cover);
  }

  return { audio, cover, coverBlob, format, metadata };
}
