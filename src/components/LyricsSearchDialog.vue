<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Check, Clock3, FileText, LoaderCircle, Search, Sparkles, X } from '@lucide/vue';
import { formatTime } from '../media';
import { LYRIC_PROVIDERS, resolveLyricsResult, searchOnlineLyrics } from '../lyrics';

const props = defineProps({ track: { type: Object, required: true } });
const emit = defineEmits(['close', 'apply']);
const query = reactive({ title: props.track.title, artist: props.track.artist === '未知艺术家' ? '' : props.track.artist, album: props.track.album === '本地音乐' ? '' : props.track.album, duration: props.track.duration || 0 });
const results = ref([]);
const status = ref('idle');
const error = ref('');
const providerId = ref('lrclib');
const applyingId = ref('');
const activeProvider = computed(() => LYRIC_PROVIDERS.find((provider) => provider.id === providerId.value) || LYRIC_PROVIDERS[0]);
let controller = null;
let resolveController = null;

async function runSearch(event) {
  event?.preventDefault();
  if (!query.title.trim()) {
    error.value = '请填写歌曲名';
    return;
  }
  controller?.abort();
  controller = new AbortController();
  status.value = 'loading';
  error.value = '';
  results.value = [];
  try {
    results.value = await searchOnlineLyrics(query, controller.signal, providerId.value);
    status.value = 'ready';
  } catch (searchError) {
    if (searchError.name === 'AbortError') return;
    error.value = searchError.message || '联网搜索失败';
    status.value = 'error';
    results.value = [];
  }
}

function selectProvider(id) {
  if (providerId.value === id) return;
  providerId.value = id;
  runSearch();
}

async function applyResult(result) {
  resolveController?.abort();
  resolveController = new AbortController();
  const key = `${result.provider || providerId.value}:${result.id}`;
  applyingId.value = key;
  error.value = '';
  try {
    emit('apply', await resolveLyricsResult(result, resolveController.signal));
  } catch (resolveError) {
    if (resolveError.name !== 'AbortError') error.value = resolveError.message || '歌词下载失败';
  } finally {
    if (applyingId.value === key) applyingId.value = '';
  }
}

onMounted(runSearch);
onBeforeUnmount(() => { controller?.abort(); resolveController?.abort(); });
</script>

<template>
  <div class="modal-layer" role="presentation">
    <button class="modal-backdrop" type="button" aria-label="关闭歌词搜索" @click="emit('close')" />
    <section class="lyrics-search-dialog" role="dialog" aria-modal="true" aria-labelledby="lyrics-search-title">
      <header class="dialog-header"><div><span class="eyebrow">{{ activeProvider.label }} · ONLINE</span><h2 id="lyrics-search-title">匹配同步歌词</h2></div><button class="dialog-close" type="button" aria-label="关闭" @click="emit('close')"><X /></button></header>
      <form class="lyrics-query" @submit="runSearch">
        <div class="lyrics-provider-switch" role="group" aria-label="歌词来源"><button v-for="provider in LYRIC_PROVIDERS" :key="provider.id" type="button" :class="{ 'is-active': providerId === provider.id }" :title="provider.caption" @click="selectProvider(provider.id)">{{ provider.label }}</button></div>
        <label><span>歌曲</span><input v-model="query.title"></label>
        <label><span>艺术家</span><input v-model="query.artist"></label>
        <label><span>专辑</span><input v-model="query.album"></label>
        <button type="submit" :disabled="status === 'loading'"><LoaderCircle v-if="status === 'loading'" class="spin" /><Search v-else /><span>搜索</span></button>
      </form>
      <div class="lyrics-results">
        <div v-if="status === 'loading'" class="dialog-state"><LoaderCircle class="spin" /><strong>正在匹配</strong></div>
        <div v-else-if="error" class="dialog-state is-error"><X /><strong>{{ error }}</strong></div>
        <div v-else-if="status === 'ready' && !results.length" class="dialog-state"><Search /><strong>没有找到匹配歌词</strong></div>
        <button v-for="(result, index) in results" v-else :key="`${result.provider}:${result.id}`" class="lyric-result" type="button" :disabled="Boolean(applyingId)" @click="applyResult(result)">
          <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="result-copy"><strong>{{ result.trackName }}</strong><small>{{ result.artistName }}{{ result.albumName ? ` · ${result.albumName}` : '' }}</small></span>
          <span class="result-kind" :class="{ 'is-synced': result.syncedLyrics }"><Sparkles v-if="result.syncedLyrics" /><FileText v-else />{{ result.syncedLyrics ? '同步' : '纯文本' }}</span>
          <span class="result-duration"><Clock3 />{{ formatTime(result.duration) }}</span>
          <LoaderCircle v-if="applyingId === `${result.provider || providerId}:${result.id}`" class="result-apply spin is-visible" /><Check v-else class="result-apply" />
        </button>
      </div>
    </section>
  </div>
</template>
