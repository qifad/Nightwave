<script setup>
import { AlignCenter, AlignLeft, AlignRight, AudioWaveform, Ban, ChartNoAxesColumn, Radar, RotateCcw, Waves, X } from '@lucide/vue';
import { DEFAULT_LYRIC_SETTINGS, LYRIC_PRESETS, settingsForPreset } from '../lyricPresets';
import SettingsRange from './SettingsRange.vue';

const props = defineProps({ settings: { type: Object, required: true } });
const emit = defineEmits(['update', 'close']);
const accentSwatches = ['#ff705f', '#63e6be', '#f0b85c', '#78a7ff', '#ff5d8f', '#f4f4ef'];
const visualizerModes = [
  { id: 'aurora', name: '极光丝带', caption: '柔和流动', icon: Waves },
  { id: 'bars', name: '玻璃频柱', caption: '节拍清晰', icon: ChartNoAxesColumn },
  { id: 'wave', name: '柔性波形', caption: '细腻呼吸', icon: AudioWaveform },
  { id: 'radial', name: '星环雷达', caption: '沉浸聚焦', icon: Radar },
  { id: 'horizon', name: '地平线', caption: '低调铺底', icon: Waves },
  { id: 'none', name: '关闭', caption: '纯歌词', icon: Ban },
];
function update(patch) { emit('update', { ...props.settings, ...patch }); }
function updatePreset(id) { emit('update', settingsForPreset(id, props.settings)); }
</script>

<template>
  <div class="settings-layer">
    <button class="settings-backdrop" type="button" aria-label="关闭歌词设置" @click="emit('close')" />
    <aside class="lyrics-settings-panel" aria-label="歌词显示设置">
      <header class="dialog-header"><div><span class="eyebrow">LYRIC LAB</span><h2>歌词显示</h2></div><button class="dialog-close" type="button" aria-label="关闭" @click="emit('close')"><X /></button></header>
      <div class="settings-scroll">
        <section class="settings-section"><h3>显示预设</h3><div class="preset-grid">
          <button v-for="preset in LYRIC_PRESETS" :key="preset.id" type="button" :class="{ 'is-active': settings.id === preset.id }" @click="updatePreset(preset.id)"><span class="preset-preview" :style="{ '--preset-a': preset.accent, '--preset-b': preset.accent2 }"><i /><i /><i /></span><strong>{{ preset.name }}</strong></button>
        </div></section>
        <section class="settings-section"><h3>排版</h3>
          <div class="segmented-control"><button type="button" :class="{ 'is-active': settings.align === 'left' }" @click="update({ align: 'left' })"><AlignLeft /><span>左对齐</span></button><button type="button" :class="{ 'is-active': settings.align === 'center' }" @click="update({ align: 'center' })"><AlignCenter /><span>居中</span></button><button type="button" :class="{ 'is-active': settings.align === 'right' }" @click="update({ align: 'right' })"><AlignRight /><span>右对齐</span></button></div>
          <label class="settings-select"><span>字体</span><select :value="settings.font" @change="update({ font: $event.target.value })"><option value="Bahnschrift, &quot;Microsoft YaHei UI&quot;, sans-serif">Bahnschrift</option><option value="&quot;Segoe UI Variable&quot;, &quot;Microsoft YaHei UI&quot;, sans-serif">Segoe UI</option><option value="Georgia, &quot;Microsoft YaHei UI&quot;, serif">Georgia</option><option value="Consolas, &quot;Microsoft YaHei UI&quot;, monospace">Consolas</option></select></label>
          <SettingsRange label="普通字号" :value="settings.fontSize" :min="18" :max="36" unit=" px" @update="update({ fontSize: $event })" /><SettingsRange label="全屏字号" :value="settings.immersiveSize" :min="30" :max="64" unit=" px" @update="update({ immersiveSize: $event })" /><SettingsRange label="字重" :value="settings.weight" :min="500" :max="900" :step="20" @update="update({ weight: $event })" /><SettingsRange label="行间距" :value="settings.lineGap" :min="4" :max="24" unit=" px" @update="update({ lineGap: $event })" />
        </section>
        <section class="settings-section"><h3>强调色</h3><div class="color-swatches"><button v-for="color in accentSwatches" :key="color" type="button" :aria-label="color" :class="{ 'is-active': settings.accent === color }" :style="{ backgroundColor: color }" @click="update({ accent: color })" /><label class="custom-color"><input type="color" :value="settings.accent" @input="update({ accent: $event.target.value })"></label></div>
          <SettingsRange label="活跃缩放" :value="settings.activeScale" :min="1" :max="1.12" :step="0.005" @update="update({ activeScale: $event })" /><SettingsRange label="未播放透明度" :value="settings.inactiveOpacity" :min="0.06" :max="0.5" :step="0.01" @update="update({ inactiveOpacity: $event })" /><SettingsRange label="未播放模糊" :value="settings.blur" :min="0" :max="5" unit=" px" @update="update({ blur: $event })" /><SettingsRange label="背景压暗" :value="settings.dim" :min="45" :max="95" unit=" %" @update="update({ dim: $event })" /><SettingsRange label="动态强度" :value="settings.motion" :min="0" :max="100" unit=" %" @update="update({ motion: $event })" /><SettingsRange label="歌词偏移" :value="settings.offset" :min="-5" :max="5" :step="0.1" unit=" s" @update="update({ offset: $event })" />
        </section>
        <section class="settings-section visualizer-settings"><h3>音频可视化</h3><div class="visualizer-mode-grid"><button v-for="mode in visualizerModes" :key="mode.id" type="button" :class="{ 'is-active': settings.visualizer === mode.id }" @click="update({ visualizer: mode.id, enabledVisualizer: mode.id !== 'none' })"><component :is="mode.icon" /><span><strong>{{ mode.name }}</strong><small>{{ mode.caption }}</small></span></button></div><div class="visualizer-performance-grid"><label class="settings-select"><span>渲染后端</span><select :value="settings.visualizerRenderer" @change="update({ visualizerRenderer: $event.target.value })"><option value="auto">自动（GPU 优先）</option><option value="gpu">强制 GPU</option><option value="cpu">兼容模式</option></select></label><label class="settings-select"><span>音频通道</span><select :value="settings.visualizerChannelMode" @change="update({ visualizerChannelMode: $event.target.value })"><option value="mix">混合立体声</option><option value="stereo">左右分离</option><option value="left">仅左声道</option><option value="right">仅右声道</option></select></label><label class="settings-select"><span>目标帧率</span><select :value="settings.visualizerTargetFps" @change="update({ visualizerTargetFps: Number($event.target.value) })"><option value="60">60 FPS</option><option value="30">30 FPS 省电</option></select></label></div><SettingsRange label="动态强度" :value="settings.visualizerIntensity" :min="0.2" :max="1.4" :step="0.05" unit=" x" @update="update({ visualizerIntensity: $event })" /><SettingsRange label="可视化透明度" :value="settings.visualizerOpacity" :min="0.12" :max="0.9" :step="0.02" unit=" x" @update="update({ visualizerOpacity: $event })" /><SettingsRange label="光晕强度" :value="settings.visualizerGlow" :min="0" :max="42" unit=" px" @update="update({ visualizerGlow: $event })" /><SettingsRange label="频谱密度" :value="settings.visualizerDensity" :min="20" :max="100" @update="update({ visualizerDensity: $event })" /><SettingsRange label="可视化高度" :value="settings.visualizerHeight" :min="64" :max="220" unit=" px" @update="update({ visualizerHeight: $event })" /><SettingsRange label="律动速度" :value="settings.visualizerSpeed" :min="0.4" :max="2" :step="0.1" unit=" x" @update="update({ visualizerSpeed: $event })" /></section>
        <section class="settings-section settings-toggles"><label><span>显示翻译</span><input type="checkbox" :checked="settings.showTranslation" @change="update({ showTranslation: $event.target.checked })"></label><label><span>自动跟随</span><input type="checkbox" :checked="settings.autoFollow" @change="update({ autoFollow: $event.target.checked })"></label><label><span>自动补全中文</span><input type="checkbox" :checked="settings.autoTranslate" @change="update({ autoTranslate: $event.target.checked })"></label><label><span>歌词流光</span><input type="checkbox" :checked="settings.karaoke" @change="update({ karaoke: $event.target.checked })"></label><label><span>音频可视化</span><input type="checkbox" :checked="settings.enabledVisualizer" @change="update({ enabledVisualizer: $event.target.checked })"></label><label><span>Worker 多核心 DSP</span><input type="checkbox" :checked="settings.visualizerWorkerProcessing" @change="update({ visualizerWorkerProcessing: $event.target.checked })"></label><label><span>镜像反射</span><input type="checkbox" :checked="settings.visualizerMirrored" @change="update({ visualizerMirrored: $event.target.checked })"></label><label><span>底部反光</span><input type="checkbox" :checked="settings.visualizerReflection" @change="update({ visualizerReflection: $event.target.checked })"></label></section>
      </div>
      <button class="settings-reset" type="button" @click="emit('update', { ...DEFAULT_LYRIC_SETTINGS })"><RotateCcw />恢复默认</button>
    </aside>
  </div>
</template>
