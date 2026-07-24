<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { Check, Download, FolderInput, Gauge, LoaderCircle, X } from '@lucide/vue';
import { cancelTranscode, outputMime, sourceAudioBlob, transcodeAudio } from '../audioExport';
import { downloadBlob, pickSaveFileHandle, sanitizeFileName, writeToDirectory, writeToFileHandle } from '../fileAccess';

const props = defineProps({ track: { type: Object, required: true } });
const emit = defineEmits(['close', 'toast']);
const formats = [{ id: 'mp3', label: 'MP3' }, { id: 'flac', label: 'FLAC' }, { id: 'wav', label: 'WAV' }, { id: 'm4a', label: 'M4A' }, { id: 'ogg', label: 'OGG' }];
const format = ref(props.track.format || 'mp3');
const quality = ref(320);
const destination = ref(props.track.parentHandle ? 'directory' : 'saveAs');
const progress = ref(0);
const status = ref('idle');
const error = ref('');
let mounted = true;
let closeTimer = 0;
const direct = () => format.value === props.track.format;

function ensureMounted() { return mounted; }
async function handleExport() {
  const baseName = sanitizeFileName(`${props.track.artist} - ${props.track.title}`);
  const fileName = `${baseName}.${format.value}`;
  let saveHandle = null;
  error.value = '';
  try {
    if (destination.value === 'saveAs' && window.showSaveFilePicker) saveHandle = await pickSaveFileHandle(fileName, outputMime(format.value), `.${format.value}`);
    status.value = direct() ? 'saving' : 'converting';
    const blob = direct() ? await sourceAudioBlob(props.track) : await transcodeAudio(props.track, format.value, quality.value, (value) => { progress.value = value; });
    let result;
    if (destination.value === 'directory') result = await writeToDirectory(props.track.parentHandle, fileName, blob);
    else if (saveHandle) result = await writeToFileHandle(saveHandle, blob);
    else result = downloadBlob(blob, fileName);
    if (!ensureMounted()) return;
    status.value = 'done';
    emit('toast', `已保存 ${result.name}`);
    closeTimer = window.setTimeout(() => emit('close'), 500);
  } catch (exportError) {
    if (!ensureMounted()) return;
    if (exportError.name === 'AbortError') { status.value = 'idle'; return; }
    error.value = exportError.message || '导出失败';
    status.value = 'error';
  }
}
function handleCancel() {
  if (status.value === 'saving' || status.value === 'done') return;
  if (status.value === 'converting') cancelTranscode();
  emit('close');
}
onBeforeUnmount(() => { mounted = false; window.clearTimeout(closeTimer); if (status.value === 'converting') cancelTranscode(); });
</script>

<template>
  <div class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭导出窗口" @click="handleCancel" />
    <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header class="dialog-header"><div><span class="eyebrow">AUDIO LAB</span><h2 id="export-title">转换与导出</h2></div><button class="dialog-close" type="button" aria-label="关闭" @click="handleCancel"><X /></button></header>
      <div class="export-track"><img :src="track.cover" alt=""><span><strong>{{ track.title }}</strong><small>{{ track.artist }} · {{ track.format.toUpperCase() }}</small></span></div>
      <div class="export-section"><span class="control-label">输出格式</span><div class="format-options"><button v-for="item in formats" :key="item.id" type="button" :class="{ 'is-active': format === item.id }" @click="format = item.id">{{ item.label }}<small v-if="item.id === track.format">原始</small></button></div></div>
      <label v-if="['mp3', 'm4a', 'ogg'].includes(format) && !direct()" class="export-quality"><span><strong>音频码率</strong><small>{{ quality }} kbps</small></span><input v-model.number="quality" type="range" min="128" max="320" step="64" :style="{ '--range-progress': `${((quality - 128) / 192) * 100}%` }"></label>
      <div class="export-section"><span class="control-label">保存位置</span><div class="destination-options"><button type="button" :class="{ 'is-active': destination === 'directory' }" :disabled="!track.parentHandle" @click="destination = 'directory'"><FolderInput /><span>音乐文件夹</span></button><button type="button" :class="{ 'is-active': destination === 'saveAs' }" @click="destination = 'saveAs'"><Download /><span>系统另存为</span></button></div></div>
      <div v-if="status === 'converting'" class="conversion-progress"><span><LoaderCircle class="spin" />正在转换</span><strong>{{ Math.round(progress * 100) }}%</strong><i><b :style="{ width: `${progress * 100}%` }" /></i></div>
      <div v-else-if="status === 'saving'" class="conversion-progress"><span><LoaderCircle class="spin" />正在写入文件</span></div>
      <div v-else-if="status === 'done'" class="export-message is-success"><Check />保存完成</div>
      <div v-if="error" class="export-message is-error"><X />{{ error }}</div>
      <footer class="dialog-actions"><button class="secondary-action" type="button" @click="handleCancel">{{ status === 'converting' ? '取消转换' : '取消' }}</button><button class="primary-action" type="button" :disabled="['converting', 'saving', 'done'].includes(status)" @click="handleExport">{{ direct() ? `无损导出 ${format.toUpperCase()}` : `转换为 ${format.toUpperCase()}` }}</button></footer>
    </section>
  </div>
</template>
