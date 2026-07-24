<script setup>
import { Edit3, FileArchive, PackagePlus, Palette, Puzzle, RefreshCw, X } from '@lucide/vue';

defineProps({
  extensions: { type: Array, default: () => [] },
  activeThemeId: { type: String, default: '' },
  enabledIds: { type: Set, default: () => new Set() },
  isElectron: Boolean,
  loading: Boolean,
});
const emit = defineEmits(['close', 'install', 'toggle', 'edit', 'refresh']);
</script>

<template>
  <section class="extensions-page" aria-label="扩展中心">
    <header class="app-page-header"><div><span class="eyebrow">NIGHTWAVE EXTENSIONS</span><h1>扩展</h1><p>从根目录 <code>extensions</code> 文件夹读取 ZIP 扩展，也可以从这里安装本地压缩包。</p></div><div class="page-header-actions"><button class="page-action compact-action" type="button" @click="emit('refresh')"><RefreshCw :class="{ spin: loading }" />扫描扩展</button><button class="page-close" type="button" aria-label="关闭扩展" @click="emit('close')"><X /></button></div></header>
    <div class="extension-toolbar"><label class="extension-import"><PackagePlus /><span>安装 ZIP 扩展</span><input type="file" accept=".zip,application/zip" @change="emit('install', $event.target.files?.[0]); $event.target.value = ''"></label><span class="extension-hint">主题会即时加载，插件只运行本地压缩包内的显式入口。</span></div>
    <div v-if="!extensions.length" class="extensions-empty"><FileArchive /><h2>还没有扩展</h2><p>把 ZIP 放进项目根目录的 <code>extensions</code> 文件夹，然后点击扫描。</p></div>
     <div v-else class="extensions-grid"><article v-for="extension in extensions" :key="extension.manifest.id" class="extension-card" :class="{ 'is-active': enabledIds.has(extension.manifest.id), 'is-current-theme': activeThemeId === extension.manifest.id }" tabindex="0" @click="emit('edit', extension)" @keydown.enter="emit('edit', extension)"><div class="extension-art" :style="{ '--extension-a': extension.manifest.accent || '#ff705f', '--extension-b': extension.manifest.accent2 || '#69dfb1' }"><Palette v-if="extension.manifest.type === 'theme'" /><Puzzle v-else /></div><div class="extension-card-body"><div class="extension-card-title"><div><span class="extension-type">{{ extension.manifest.type === 'theme' ? 'THEME' : 'PLUGIN' }}</span><h2>{{ extension.manifest.name }}</h2></div><span v-if="activeThemeId === extension.manifest.id" class="extension-active-label">当前</span><span v-else class="extension-version">v{{ extension.manifest.version || '1.0.0' }}</span></div><p>{{ extension.manifest.description || 'Nightwave 本地扩展' }}</p><footer><div class="extension-actions"><button class="page-action" type="button" :aria-pressed="enabledIds.has(extension.manifest.id)" @click.stop="emit('toggle', extension)">{{ enabledIds.has(extension.manifest.id) ? '停用' : '启用' }}</button><button class="page-action secondary-action" type="button" @click.stop="emit('edit', extension)" title="在编辑器中打开"><Edit3 /><span>编辑</span></button></div><small>{{ extension.sourceName }}</small></footer></div></article></div>
  </section>
</template>
