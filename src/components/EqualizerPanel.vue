<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { Minus, Plus, RotateCcw, SlidersHorizontal, Trash2 } from '@lucide/vue';
import { EQ_PRESETS, EQ_TYPES } from '../eqSettings';

const props = defineProps({ settings: { type: Object, required: true } });
const emit = defineEmits(['update']);
const selectedBand = ref(3);
const dragging = ref(null);
const graphRef = ref(null);
const graph = { width: 640, height: 270, left: 44, right: 18, top: 18, bottom: 34 };
let dragFrame = 0;
let pendingDragUpdate = null;

const bands = computed(() => props.settings.bands || []);
const sortedBands = computed(() => bands.value.map((band, index) => ({ band, index })).sort((a, b) => a.band.frequency - b.band.frequency));
const graphWidth = graph.width - graph.left - graph.right;
const graphHeight = graph.height - graph.top - graph.bottom;
const frequencyLabels = [20, 100, 1000, 10000, 20000];
const gainLabels = [12, 6, 0, -6, -12];

function updateSettings(patch) { emit('update', { ...props.settings, ...patch }); }
function updateBand(index, patch) {
  const current = bands.value[index];
  if (!current || Object.entries(patch).every(([key, value]) => current[key] === value)) return;
  updateSettings({ bands: bands.value.map((band, bandIndex) => bandIndex === index ? { ...band, ...patch } : band) });
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function xForFrequency(frequency) { return graph.left + ((Math.log10(frequency) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * graphWidth; }
function yForGain(gain) { return graph.top + ((12 - gain) / 24) * graphHeight; }
function frequencyForX(x) { return Math.round(10 ** (Math.log10(20) + clamp((x - graph.left) / graphWidth, 0, 1) * (Math.log10(20000) - Math.log10(20)))); }
function gainForY(y) { return Math.round((12 - clamp((y - graph.top) / graphHeight, 0, 1) * 24) * 10) / 10; }
function pointFor(band) { return { x: xForFrequency(band.frequency), y: yForGain(band.gain) }; }
function curvePath() { return sortedBands.value.map(({ band }, index) => { const point = pointFor(band); return `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`; }).join(' '); }
function displayFrequency(value) { return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : `${value}`; }
function flushDragUpdate() {
  dragFrame = 0;
  if (!pendingDragUpdate) return;
  const { index, patch } = pendingDragUpdate;
  pendingDragUpdate = null;
  updateBand(index, patch);
}
function queueDragUpdate(index, patch) {
  pendingDragUpdate = { index, patch };
  if (!dragFrame) dragFrame = requestAnimationFrame(flushDragUpdate);
}
function startDrag(index, event) {
  const band = bands.value[index];
  if (!band) return;
  dragging.value = { index, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, frequency: band.frequency, gain: band.gain };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}
function moveDrag(event) {
  const drag = dragging.value;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const svg = graphRef.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const scaleX = graph.width / rect.width;
  const scaleY = graph.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  if (event.shiftKey) {
    const frequency = Math.round(drag.frequency * 10 ** (((event.clientX - drag.startX) / rect.width) * 0.54));
    const gain = Math.round((drag.gain - ((event.clientY - drag.startY) / rect.height) * 4.3) * 10) / 10;
    queueDragUpdate(drag.index, { frequency: clamp(frequency, 20, 20000), gain: clamp(gain, -12, 12) });
    return;
  }
  queueDragUpdate(drag.index, { frequency: clamp(frequencyForX(x), 20, 20000), gain: clamp(gainForY(y), -12, 12) });
}
function stopDrag(event) {
  if (!dragging.value || event?.pointerId !== dragging.value.pointerId) return;
  flushDragUpdate();
  dragging.value = null;
}
function addBand() {
  const frequency = bands.value.length ? clamp(Math.round((bands.value.at(-1).frequency || 1000) * 1.7), 20, 20000) : 1000;
  const next = { id: `eq-${Date.now()}`, type: 'peaking', frequency, gain: 0, q: 1, enabled: true };
  updateSettings({ bands: [...bands.value, next] });
  selectedBand.value = bands.value.length;
}
function removeBand(index) {
  if (bands.value.length <= 1) return;
  updateSettings({ bands: bands.value.filter((_, bandIndex) => bandIndex !== index) });
  selectedBand.value = Math.min(selectedBand.value, bands.value.length - 2);
}
function applyPreset(preset) { if (!preset) return; updateSettings({ bands: preset.bands.map((band, index) => ({ ...band, id: bands.value[index]?.id || `eq-${Date.now()}-${index}` })) }); }

onBeforeUnmount(() => { if (dragFrame) cancelAnimationFrame(dragFrame); });
</script>

<template>
  <section class="equalizer-panel">
    <header class="equalizer-header"><div><SlidersHorizontal /><div><span class="eyebrow">AUDIO FILTERS</span><h2>参数均衡器</h2><p>拖动节点调整，或直接输入精确数值。</p></div></div><label class="eq-power"><span>EQ</span><input :checked="settings.enabled" type="checkbox" @change="updateSettings({ enabled: $event.target.checked })"></label></header>
    <div class="eq-toolbar"><label class="eq-preset"><span>预设</span><select @change="applyPreset(EQ_PRESETS.find((preset) => preset.id === $event.target.value))"><option value="">自定义</option><option v-for="preset in EQ_PRESETS" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label><button class="eq-tool-button" type="button" title="添加频段" @click="addBand"><Plus />增加频段</button><button class="eq-tool-button" type="button" title="重置为平直" @click="applyPreset(EQ_PRESETS[0])"><RotateCcw />重置</button></div>
    <div class="eq-graph-wrap"><svg ref="graphRef" class="eq-graph" viewBox="0 0 640 270" role="img" aria-label="EQ 频率响应图" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag"><defs><linearGradient id="eq-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--eq-accent)" stop-opacity=".24" /><stop offset="1" stop-color="var(--eq-accent)" stop-opacity="0" /></linearGradient></defs><g class="eq-grid"><line v-for="gain in gainLabels" :key="`g-${gain}`" :x1="graph.left" :x2="graph.width - graph.right" :y1="yForGain(gain)" :y2="yForGain(gain)" /><line v-for="frequency in frequencyLabels" :key="`f-${frequency}`" :x1="xForFrequency(frequency)" :x2="xForFrequency(frequency)" :y1="graph.top" :y2="graph.height - graph.bottom" /></g><path class="eq-area" :d="`${curvePath()} L ${xForFrequency(sortedBands.at(-1)?.band.frequency || 20000)} ${graph.height - graph.bottom} L ${xForFrequency(sortedBands[0]?.band.frequency || 20)} ${graph.height - graph.bottom} Z`" /><path class="eq-curve" :d="curvePath()" /><g class="eq-labels"><text v-for="gain in gainLabels" :key="`gl-${gain}`" x="7" :y="yForGain(gain) + 4">{{ gain > 0 ? `+${gain}` : gain }}dB</text><text v-for="frequency in frequencyLabels" :key="`fl-${frequency}`" :x="xForFrequency(frequency)" y="260" text-anchor="middle">{{ displayFrequency(frequency) }}</text></g><g v-for="({ band, index }) in sortedBands" :key="band.id" class="eq-node" :class="{ selected: index === selectedBand, disabled: !band.enabled }" @pointerdown.stop="selectedBand = index; startDrag(index, $event)"><circle :cx="pointFor(band).x" :cy="pointFor(band).y" r="8" /><text :x="pointFor(band).x" :y="pointFor(band).y - 14" text-anchor="middle">{{ index + 1 }}</text></g></svg></div>
    <div class="eq-band-list"><article v-for="(band, index) in bands" :key="band.id" class="eq-band-row" :class="{ selected: selectedBand === index, disabled: !band.enabled }" @click="selectedBand = index"><span class="eq-band-index">{{ index + 1 }}</span><label class="eq-band-enable"><input :checked="band.enabled" type="checkbox" @click.stop @change="updateBand(index, { enabled: $event.target.checked })"></label><select :value="band.type" @click.stop @change="updateBand(index, { type: $event.target.value })"><option v-for="type in EQ_TYPES" :key="type" :value="type">{{ type }}</option></select><label><span>频率</span><input :value="band.frequency" type="number" min="20" max="20000" step="1" @click.stop @input="updateBand(index, { frequency: clamp(Number($event.target.value) || 20, 20, 20000) })"><b>Hz</b></label><label v-if="!['lowpass', 'highpass'].includes(band.type)"><span>增益</span><input :value="band.gain" type="number" min="-12" max="12" step="0.1" @click.stop @input="updateBand(index, { gain: clamp(Number($event.target.value) || 0, -12, 12) })"><b>dB</b></label><label><span>Q 值</span><input :value="band.q" type="number" min="0.1" max="18" step="0.01" @click.stop @input="updateBand(index, { q: clamp(Number($event.target.value) || 0.1, 0.1, 18) })"></label><button class="eq-remove" type="button" title="移除频段" :disabled="bands.length <= 1" @click.stop="removeBand(index)"><Trash2 /></button></article></div>
  </section>
</template>
