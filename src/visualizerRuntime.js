import { shallowReactive } from 'vue';

export const visualizerRuntime = shallowReactive({
  settings: null,
  analyser: null,
  channels: [],
  version: 0,
});

export function setVisualizerRuntime(settings, analyser, channels) {
  visualizerRuntime.settings = settings;
  visualizerRuntime.analyser = analyser;
  visualizerRuntime.channels = channels || [];
  visualizerRuntime.version += 1;
}
