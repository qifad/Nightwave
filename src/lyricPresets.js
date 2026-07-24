export const LYRIC_PRESETS = [
  { id: 'cinema', name: '影院深潜', caption: '厚重、克制、电影感', accent: '#ff705f', accent2: '#f4c35b', font: 'Bahnschrift, "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 26, immersiveSize: 44, weight: 720, lineGap: 10, activeScale: 1.02, inactiveOpacity: 0.24, blur: 0, dim: 76, visualizer: 'horizon', motion: 72, karaoke: true },
  { id: 'neon', name: '霓虹脉冲', caption: '冷暖碰撞与高亮描边', accent: '#63e6be', accent2: '#ff5d8f', font: 'Bahnschrift, "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 27, immersiveSize: 46, weight: 760, lineGap: 12, activeScale: 1.04, inactiveOpacity: 0.2, blur: 1, dim: 68, visualizer: 'bars', motion: 90, karaoke: true },
  { id: 'vinyl', name: '黑胶暖光', caption: '暖白、唱片与缓慢律动', accent: '#f0b85c', accent2: '#e66555', font: 'Georgia, "Microsoft YaHei UI", serif', align: 'left', fontSize: 25, immersiveSize: 42, weight: 680, lineGap: 13, activeScale: 1.01, inactiveOpacity: 0.3, blur: 0, dim: 82, visualizer: 'radial', motion: 48, karaoke: false },
  { id: 'polar', name: '极地玻璃', caption: '清透留白与薄荷光线', accent: '#dffdf1', accent2: '#70d7ba', font: '"Segoe UI Variable", "Microsoft YaHei UI", sans-serif', align: 'center', fontSize: 25, immersiveSize: 43, weight: 650, lineGap: 14, activeScale: 1.03, inactiveOpacity: 0.22, blur: 1, dim: 62, visualizer: 'wave', motion: 64, karaoke: true },
  { id: 'mono', name: '排印黑白', caption: '高对比编辑部排版', accent: '#f4f4ef', accent2: '#a9aca8', font: 'Arial, "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 28, immersiveSize: 48, weight: 800, lineGap: 8, activeScale: 1, inactiveOpacity: 0.18, blur: 0, dim: 88, visualizer: 'wave', motion: 28, karaoke: false },
  { id: 'karaoke', name: '逐行流光', caption: '随播放位置推进的双色填充', accent: '#fff3d1', accent2: '#ff6e5d', font: 'Bahnschrift, "Microsoft YaHei UI", sans-serif', align: 'center', fontSize: 27, immersiveSize: 47, weight: 780, lineGap: 12, activeScale: 1.05, inactiveOpacity: 0.2, blur: 1, dim: 72, visualizer: 'bars', motion: 84, karaoke: true },
  { id: 'spectrum', name: '频谱回声', caption: '频率条与锐利节拍反馈', accent: '#78a7ff', accent2: '#ff7a62', font: 'Bahnschrift, "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 25, immersiveSize: 45, weight: 730, lineGap: 11, activeScale: 1.035, inactiveOpacity: 0.19, blur: 2, dim: 66, visualizer: 'bars', motion: 100, karaoke: true },
  { id: 'poster', name: '海报居中', caption: '大字号与舞台中央构图', accent: '#f5e8d0', accent2: '#ee6455', font: 'Georgia, "Microsoft YaHei UI", serif', align: 'center', fontSize: 29, immersiveSize: 52, weight: 720, lineGap: 16, activeScale: 1.06, inactiveOpacity: 0.16, blur: 1, dim: 78, visualizer: 'radial', motion: 55, karaoke: false },
  { id: 'stage', name: '舞台聚焦', caption: '高亮当前句，前后退入暗场', accent: '#ffffff', accent2: '#6ce5b1', font: '"Segoe UI Variable", "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 26, immersiveSize: 50, weight: 760, lineGap: 15, activeScale: 1.07, inactiveOpacity: 0.1, blur: 3, dim: 90, visualizer: 'horizon', motion: 78, karaoke: true },
  { id: 'minimal', name: '极简静音', caption: '低动态、轻量、专注文字', accent: '#eceee9', accent2: '#8e928f', font: '"Segoe UI Variable", "Microsoft YaHei UI", sans-serif', align: 'left', fontSize: 24, immersiveSize: 40, weight: 620, lineGap: 10, activeScale: 1, inactiveOpacity: 0.27, blur: 0, dim: 86, visualizer: 'none', motion: 0, karaoke: false },
];

export const DEFAULT_LYRIC_SETTINGS = {
  ...LYRIC_PRESETS[0],
  showTranslation: true,
  autoFollow: true,
  enabledVisualizer: true,
  autoTranslate: true,
  visualizerIntensity: 0.78,
  visualizerOpacity: 0.48,
  visualizerGlow: 18,
  visualizerDensity: 54,
  visualizerSpeed: 1,
  visualizerHeight: 118,
  visualizerMirrored: true,
  visualizerReflection: true,
  visualizerRenderer: 'auto',
  visualizerWorkerProcessing: true,
  visualizerTargetFps: 60,
  visualizerChannelMode: 'mix',
  offset: 0,
};

export function loadLyricSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('nightwave-lyric-settings') || 'null');
    return saved ? { ...DEFAULT_LYRIC_SETTINGS, ...saved } : DEFAULT_LYRIC_SETTINGS;
  } catch {
    return DEFAULT_LYRIC_SETTINGS;
  }
}

export function settingsForPreset(id, current = DEFAULT_LYRIC_SETTINGS) {
  const preset = LYRIC_PRESETS.find((item) => item.id === id) || LYRIC_PRESETS[0];
  return {
    ...current,
    ...preset,
    showTranslation: current.showTranslation,
    autoFollow: current.autoFollow,
    enabledVisualizer: current.enabledVisualizer,
    autoTranslate: current.autoTranslate,
    visualizerIntensity: current.visualizerIntensity,
    visualizerOpacity: current.visualizerOpacity,
    visualizerGlow: current.visualizerGlow,
    visualizerDensity: current.visualizerDensity,
    visualizerSpeed: current.visualizerSpeed,
    visualizerHeight: current.visualizerHeight,
    visualizerMirrored: current.visualizerMirrored,
    visualizerReflection: current.visualizerReflection,
    offset: current.offset,
  };
}
