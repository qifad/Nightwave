<script setup>
import { computed } from 'vue';
import { CloudDownload, Cpu, Gauge, MonitorCog, RefreshCw, Settings, X } from '@lucide/vue';
import SettingsRange from './SettingsRange.vue';
import EqualizerPanel from './EqualizerPanel.vue';

const props = defineProps({ settings: { type: Object, required: true }, eqSettings: { type: Object, required: true }, updateState: { type: Object, default: () => ({ status: 'idle', currentVersion: '' }) } });
const emit = defineEmits(['update', 'update-eq', 'check-update', 'close', 'lyrics']);
function update(patch) { emit('update', { ...props.settings, ...patch }); }
const updateText = computed(() => {
  if (props.updateState.status === 'checking') return '正在检查更新';
  if (props.updateState.status === 'updated') return `已切换到 v${props.updateState.remoteVersion}`;
  if (props.updateState.status === 'unavailable') return props.updateState.error || '暂时无法连接更新服务';
  return props.updateState.currentVersion ? `当前版本 v${props.updateState.currentVersion}` : '在线版本检测';
});
</script>

<template>
  <section class="app-settings-page" aria-label="Nightwave 设置">
    <header class="app-page-header"><div><span class="eyebrow">NIGHTWAVE CONTROL ROOM</span><h1>设置</h1><p>控制播放、渲染和歌词体验。所有设置只保存在当前设备。</p></div><button class="page-close" type="button" aria-label="关闭设置" @click="emit('close')"><X /></button></header>
    <div class="settings-page-grid">
      <section class="settings-page-card settings-page-hero"><div class="page-card-icon"><Settings /></div><div><span class="eyebrow">SYSTEM PROFILE</span><h2>Nightwave 工作台</h2><p>桌面版默认启用 GPU 渲染和 Web Worker 频谱处理。遇到老旧显卡时可切换到兼容模式。</p></div></section>
      <section class="settings-page-card"><header><Cpu /><div><h2>渲染性能</h2><p>可视化与播放图形管线</p></div></header><label class="settings-select"><span>渲染后端</span><select :value="settings.visualizerRenderer" @change="update({ visualizerRenderer: $event.target.value })"><option value="auto">自动（GPU 优先）</option><option value="gpu">强制 GPU</option><option value="cpu">兼容模式</option></select></label><label class="settings-select"><span>目标帧率</span><select :value="settings.visualizerTargetFps" @change="update({ visualizerTargetFps: Number($event.target.value) })"><option value="60">60 FPS</option><option value="30">30 FPS 省电</option></select></label><label class="settings-select"><span>音频通道</span><select :value="settings.visualizerChannelMode" @change="update({ visualizerChannelMode: $event.target.value })"><option value="mix">混合立体声</option><option value="stereo">左右分离</option><option value="left">仅左声道</option><option value="right">仅右声道</option></select></label><SettingsRange label="可视化高度" :value="settings.visualizerHeight" :min="64" :max="220" unit=" px" @update="update({ visualizerHeight: $event })" /></section>
      <section class="settings-page-card"><header><MonitorCog /><div><h2>播放体验</h2><p>动画与歌词跟随</p></div></header><label class="settings-page-toggle"><span>音频可视化</span><input type="checkbox" :checked="settings.enabledVisualizer" @change="update({ enabledVisualizer: $event.target.checked })"></label><label class="settings-page-toggle"><span>Worker 多核心 DSP</span><input type="checkbox" :checked="settings.visualizerWorkerProcessing" @change="update({ visualizerWorkerProcessing: $event.target.checked })"></label><label class="settings-page-toggle"><span>自动补全中文歌词</span><input type="checkbox" :checked="settings.autoTranslate" @change="update({ autoTranslate: $event.target.checked })"></label><label class="settings-page-toggle"><span>歌词自动跟随</span><input type="checkbox" :checked="settings.autoFollow" @change="update({ autoFollow: $event.target.checked })"></label></section>
      <section class="settings-page-card"><header><Gauge /><div><h2>歌词外观</h2><p>字号、预设、翻译和动效</p></div></header><button class="page-action" type="button" @click="emit('lyrics')">打开歌词显示设置 <span>→</span></button></section>
      <section class="settings-page-card"><header><CloudDownload /><div><h2>在线更新</h2><p>{{ updateText }}</p></div></header><button class="page-action" type="button" :disabled="updateState.status === 'checking'" @click="emit('check-update')"><RefreshCw :class="{ spin: updateState.status === 'checking' }" />检查并下载更新</button></section>
      <EqualizerPanel :settings="eqSettings" @update="emit('update-eq', $event)" />
    </div>
  </section>
</template>
