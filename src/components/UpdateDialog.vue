<script setup>
import { computed } from 'vue';
import { ArrowDownToLine, LoaderCircle, PackageCheck, X } from '@lucide/vue';

const props = defineProps({ update: { type: Object, required: true }, downloading: Boolean });
const emit = defineEmits(['close', 'download']);

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

const sizeDelta = computed(() => {
  const value = Number(props.update.sizeDelta) || 0;
  return `${value >= 0 ? '+' : '-'}${formatBytes(Math.abs(value))}`;
});

const noteSections = computed(() => {
  const sections = [];
  let current = { title: '更新内容', lines: [] };
  for (const source of String(props.update.notes || '').split(/\r?\n/)) {
    const line = source.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      if (current.lines.length) sections.push(current);
      current = { title: heading[1], lines: [] };
      continue;
    }
    current.lines.push(line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, ''));
  }
  if (current.lines.length) sections.push(current);
  return sections.length ? sections : [{ title: '更新内容', lines: ['此版本未提供详细说明。'] }];
});
</script>

<template>
  <div class="modal-layer" role="presentation">
    <button class="modal-backdrop" type="button" aria-label="关闭更新提示" :disabled="downloading" @click="emit('close')" />
    <section class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
      <header class="dialog-header"><div><span class="eyebrow">NIGHTWAVE RELEASE</span><h2 id="update-dialog-title">{{ update.title }}</h2></div><button class="dialog-close" type="button" aria-label="关闭" :disabled="downloading" @click="emit('close')"><X /></button></header>
      <div class="update-version-row"><div><span>当前版本</span><strong>v{{ update.currentVersion }}</strong></div><ArrowDownToLine /><div><span>可用版本</span><strong>v{{ update.version }}</strong></div></div>
      <div class="update-size-row"><span>更新包 {{ formatBytes(update.size) }}</span><b>较当前 {{ sizeDelta }}</b></div>
      <div class="update-notes"><section v-for="section in noteSections" :key="section.title"><h3>{{ section.title }}</h3><ul><li v-for="line in section.lines" :key="line">{{ line }}</li></ul></section></div>
      <footer class="dialog-actions"><button class="secondary-action" type="button" :disabled="downloading" @click="emit('close')">稍后更新</button><button class="primary-action" type="button" :disabled="downloading" @click="emit('download')"><LoaderCircle v-if="downloading" class="spin" /><PackageCheck v-else /><span>{{ downloading ? '正在下载' : '下载并更新' }}</span></button></footer>
    </section>
  </div>
</template>
