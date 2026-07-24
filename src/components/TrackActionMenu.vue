<script setup>
import { computed } from 'vue';
import { Download, FileText, Info, Palette, Search, X } from '@lucide/vue';

const props = defineProps({ track: Object, position: Object });
const emit = defineEmits(['close', 'search', 'save', 'appearance', 'export']);
const menuStyle = computed(() => {
  const width = globalThis.innerWidth || 1280;
  const height = globalThis.innerHeight || 800;
  return {
    '--menu-x': `${Math.max(12, Math.min(props.position?.x || width - 270, width - 270))}px`,
    '--menu-y': `${Math.max(12, Math.min(props.position?.y || 100, height - 350))}px`,
  };
});

function action(name) {
  emit('close');
  emit(name, props.track);
}
</script>

<template>
  <template v-if="track">
    <button class="popover-backdrop" type="button" aria-label="关闭曲目菜单" @click="emit('close')" />
    <div class="track-action-menu" :style="menuStyle" role="menu">
      <header>
        <img :src="track.cover" alt="">
        <span><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
        <button type="button" aria-label="关闭" @click="emit('close')"><X /></button>
      </header>
      <div class="action-menu-group">
        <button type="button" role="menuitem" @click="action('search')"><Search /><span>联网搜索歌词</span></button>
        <button type="button" role="menuitem" @click="action('appearance')"><Palette /><span>歌词显示设置</span></button>
        <button type="button" role="menuitem" :disabled="!track.lyrics?.raw && !track.lyrics?.lines?.length && !track.lyrics?.plainLines?.length" @click="action('save')"><FileText /><span>保存歌词文件</span></button>
      </div>
      <div class="action-menu-group">
        <button type="button" role="menuitem" @click="action('export')"><Download /><span>{{ track.sourceKind === 'ncm' ? `导出 / 转换 ${track.format.toUpperCase()}` : '转换并导出音频' }}</span></button>
        <div class="action-menu-info"><Info /><span>{{ track.format.toUpperCase() }} · {{ track.path.split('/').pop() }}</span></div>
      </div>
    </div>
  </template>
</template>
