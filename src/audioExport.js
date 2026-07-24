const CORE_BASE_URL = `${import.meta.env.BASE_URL}ffmpeg`;
let ffmpegInstance = null;
let ffmpegLoading = null;
let activeProgress = null;

const OUTPUTS = {
  mp3: { mime: 'audio/mpeg', args: (quality) => ['-vn', '-c:a', 'libmp3lame', '-b:a', `${quality || 320}k`] },
  flac: { mime: 'audio/flac', args: () => ['-vn', '-c:a', 'flac'] },
  wav: { mime: 'audio/wav', args: () => ['-vn', '-c:a', 'pcm_s16le'] },
  m4a: { mime: 'audio/mp4', args: (quality) => ['-vn', '-c:a', 'aac', '-b:a', `${Math.min(quality || 256, 320)}k`] },
  ogg: { mime: 'audio/ogg', args: (quality) => ['-vn', '-c:a', 'libvorbis', '-b:a', `${Math.min(quality || 256, 320)}k`] },
};

async function getFfmpeg(onProgress) {
  activeProgress = onProgress;
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    ffmpegInstance = ffmpeg;
    ffmpeg.on('progress', ({ progress }) => activeProgress?.(Math.max(0, Math.min(1, progress))));
    await ffmpeg.load({
      classWorkerURL: ffmpegWorkerURL,
      coreURL: `${CORE_BASE_URL}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE_URL}/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  })();

  try {
    return await ffmpegLoading;
  } finally {
    ffmpegLoading = null;
  }
}

function safeMetadata(value) {
  return String(value || '').replaceAll('\0', '').slice(0, 500);
}

export function outputMime(format) {
  return OUTPUTS[format]?.mime || 'application/octet-stream';
}

export async function sourceAudioBlob(track) {
  if (track.playbackBlob) return track.playbackBlob;
  const response = await fetch(track.src);
  if (!response.ok) throw new Error('无法读取原始音频文件');
  return response.blob();
}

export async function transcodeAudio(track, format, quality, onProgress) {
  const output = OUTPUTS[format];
  if (!output) throw new Error('不支持该输出格式');
  const lowMemoryDevice = navigator.deviceMemory && navigator.deviceMemory <= 4;
  const maximumBytes = window.innerWidth < 800 || lowMemoryDevice ? 128 * 1024 * 1024 : 512 * 1024 * 1024;
  const playbackBlob = await sourceAudioBlob(track);
  if (playbackBlob.size > maximumBytes) {
    throw new Error(`文件超过 ${Math.round(maximumBytes / 1024 / 1024)} MB，当前设备不适合在浏览器中转码`);
  }
  const ffmpeg = await getFfmpeg(onProgress);
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `input-${token}.${track.format || 'audio'}`;
  const outputName = `output-${token}.${format}`;
  const bytes = new Uint8Array(await playbackBlob.arrayBuffer());
  await ffmpeg.writeFile(inputName, bytes);

  const metadata = [
    '-metadata', `title=${safeMetadata(track.title)}`,
    '-metadata', `artist=${safeMetadata(track.artist)}`,
    '-metadata', `album=${safeMetadata(track.album)}`,
  ];
  try {
    onProgress?.(0);
    const exitCode = await ffmpeg.exec(['-i', inputName, ...output.args(quality), ...metadata, outputName]);
    if (exitCode !== 0) throw new Error(`FFmpeg 转换失败，代码 ${exitCode}`);
    const result = await ffmpeg.readFile(outputName);
    onProgress?.(1);
    return new Blob([result], { type: output.mime });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

export function cancelTranscode() {
  if (ffmpegInstance) ffmpegInstance.terminate();
  ffmpegInstance = null;
  ffmpegLoading = null;
  activeProgress = null;
}
import ffmpegWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url';
