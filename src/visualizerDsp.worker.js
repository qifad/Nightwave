function averageRange(values, start, end) {
  let total = 0;
  let peak = 0;
  const safeEnd = Math.min(values.length, Math.max(start + 1, end));
  for (let index = start; index < safeEnd; index += 1) {
    const value = values[index] / 255;
    total += value;
    peak = Math.max(peak, value);
  }
  const count = Math.max(1, safeEnd - start);
  return Math.min(1, (total / count) * 0.72 + peak * 0.42);
}

self.onmessage = ({ data }) => {
  const channels = (data.channels || []).map((channel) => new Uint8Array(channel));
  const count = Math.max(12, Math.min(110, data.count || 54));
  const mode = data.channelMode || 'mix';
  const bands = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index / count) ** 1.45 * (channels[0]?.length || 1));
    const end = Math.floor(((index + 1) / count) ** 1.45 * (channels[0]?.length || 1));
    const selected = mode === 'left'
      ? channels[0]
      : mode === 'right'
        ? (channels[1] || channels[0])
        : mode === 'stereo'
          ? (channels[index < count / 2 ? 0 : 1] || channels[0])
          : channels;
    if (Array.isArray(selected)) {
      bands[index] = selected.reduce((total, channel) => total + averageRange(channel, start, end), 0) / Math.max(1, selected.length);
    } else {
      bands[index] = averageRange(selected, start, end);
    }
  }

  self.postMessage({ bands }, [bands.buffer]);
};
