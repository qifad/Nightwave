export const EQ_TYPES = ['peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'bandpass', 'notch'];

export const DEFAULT_EQ_SETTINGS = {
  enabled: true,
  bands: [
    { id: 'eq-1', type: 'lowshelf', frequency: 60, gain: 3, q: 0.7, enabled: true },
    { id: 'eq-2', type: 'peaking', frequency: 170, gain: 0, q: 1, enabled: true },
    { id: 'eq-3', type: 'peaking', frequency: 500, gain: 0, q: 1, enabled: true },
    { id: 'eq-4', type: 'peaking', frequency: 1000, gain: 0, q: 1, enabled: true },
    { id: 'eq-5', type: 'peaking', frequency: 3000, gain: 0, q: 1, enabled: true },
    { id: 'eq-6', type: 'peaking', frequency: 8000, gain: 0, q: 1, enabled: true },
    { id: 'eq-7', type: 'highshelf', frequency: 12000, gain: 2, q: 0.7, enabled: true },
  ],
};

export const EQ_PRESETS = [
  { id: 'flat', name: 'Flat', bands: DEFAULT_EQ_SETTINGS.bands.map((band) => ({ ...band, gain: 0 })) },
  { id: 'bass', name: 'Bass Boost', bands: DEFAULT_EQ_SETTINGS.bands.map((band) => ({ ...band, gain: band.frequency < 250 ? 6 : band.frequency > 7000 ? 1 : 0 })) },
  { id: 'vocal', name: 'Vocal', bands: DEFAULT_EQ_SETTINGS.bands.map((band) => ({ ...band, gain: band.frequency < 180 ? -2 : band.frequency >= 1000 && band.frequency <= 5000 ? 3 : 0 })) },
  { id: 'rock', name: 'Rock', bands: DEFAULT_EQ_SETTINGS.bands.map((band) => ({ ...band, gain: band.frequency < 180 ? 4 : band.frequency >= 5000 ? 3 : -1 })) },
];

export function loadEqSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('nightwave-eq-settings') || 'null');
    if (!saved || !Array.isArray(saved.bands)) return structuredClone(DEFAULT_EQ_SETTINGS);
    return { ...DEFAULT_EQ_SETTINGS, ...saved, bands: saved.bands.map((band, index) => ({ ...DEFAULT_EQ_SETTINGS.bands[index % DEFAULT_EQ_SETTINGS.bands.length], ...band })) };
  } catch {
    return structuredClone(DEFAULT_EQ_SETTINGS);
  }
}
