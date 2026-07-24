<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Languages, LoaderCircle, Music2, Search } from '@lucide/vue';
import { needsTranslation } from '../lyricsTranslate';

const props = defineProps({
  track: Object,
  currentTime: { type: Number, default: 0 },
  settings: { type: Object, required: true },
  immersive: Boolean,
  translationStatus: { type: String, default: 'idle' },
  translationProgress: { type: Number, default: 0 },
});
const emit = defineEmits(['seek', 'search', 'translate']);
const containerRef = ref(null);

const lines = computed(() => props.track?.lyrics?.lines || []);
const plainLines = computed(() => props.track?.lyrics?.plainLines || []);
const untranslatedCount = computed(() => {
  const synced = lines.value.filter((line) => !line.translation && needsTranslation(line.text)).length;
  const plain = plainLines.value.filter((line) => needsTranslation(line)).length;
  return synced + plain;
});
const translationLabel = computed(() => {
  if (props.translationStatus === 'loading') return `正在翻译 ${Math.round(props.translationProgress * 100)}%`;
  if (props.translationStatus === 'error') return '重试中文翻译';
  return `生成中文翻译 · ${untranslatedCount.value} 行`;
});
const displayTime = computed(() => props.currentTime + (props.settings.offset || 0));
const activeIndex = computed(() => {
  let result = -1;
  lines.value.forEach((line, index) => {
    if (line.time <= displayTime.value + 0.12) result = index;
  });
  return result;
});
const lyricStyle = computed(() => ({
  '--lyric-accent': props.settings.accent,
  '--lyric-accent-2': props.settings.accent2,
  '--lyric-font': props.settings.font,
  '--lyric-font-size': `${props.settings.fontSize}px`,
  '--lyric-immersive-size': `${props.settings.immersiveSize}px`,
  '--lyric-weight': props.settings.weight,
  '--lyric-line-gap': `${props.settings.lineGap}px`,
  '--lyric-active-scale': props.settings.activeScale,
  '--lyric-inactive-opacity': props.settings.inactiveOpacity,
  '--lyric-blur': `${props.settings.blur}px`,
  '--lyric-align': props.settings.align,
  '--lyric-motion': `${props.settings.motion / 100}`,
}));

function scrollActive() {
  if (!props.settings.autoFollow) return;
  nextTick(() => {
    const container = containerRef.value;
    const active = container?.querySelector('[data-active="true"]');
    if (!container || !active) return;
    const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

watch(activeIndex, scrollActive);
watch(() => props.settings.autoFollow, scrollActive);

function progressFor(line, index) {
  const nextTime = lines.value[index + 1]?.time ?? props.track?.duration ?? line.time + 5;
  if (index < activeIndex.value) return 1;
  if (index > activeIndex.value) return 0;
  return Math.max(0, Math.min(1, (displayTime.value - line.time) / Math.max(0.3, nextTime - line.time)));
}
</script>

<template>
  <div class="lyrics-view-shell" :class="{ 'is-immersive': immersive }">
    <button v-if="track && untranslatedCount > 0 && translationStatus !== 'ready'" class="lyrics-translation-cta" type="button" :disabled="translationStatus === 'loading'" @click="emit('translate', track)"><LoaderCircle v-if="translationStatus === 'loading'" class="spin" /><Languages v-else /><span>{{ translationLabel }}</span></button>
    <div v-if="!lines.length && !track?.lyrics?.plainLines?.length" class="lyrics-empty" :class="{ 'is-immersive': immersive }" :style="lyricStyle">
    <Music2 aria-hidden="true" />
    <strong>{{ track ? '未找到歌词' : '等待播放' }}</strong>
    <span>{{ track?.title || 'NIGHTWAVE' }}</span>
    <button v-if="track" type="button" @click="emit('search', track)"><Search />联网搜索歌词</button>
    </div>
    <div v-else-if="!lines.length" ref="containerRef" class="lyrics-scroll is-plain" :class="{ 'is-immersive': immersive }" :style="lyricStyle">
    <div class="lyrics-spacer" />
    <div v-for="(text, index) in track.lyrics.plainLines" :key="`${text}-${index}`" class="plain-lyric-line"><span>{{ text }}</span><small v-if="settings.showTranslation && track.lyrics.plainTranslations?.[index]">{{ track.lyrics.plainTranslations[index] }}</small></div>
    <div class="lyrics-spacer" />
    </div>
    <div v-else ref="containerRef" class="lyrics-scroll" :class="[`preset-${settings.id}`, { 'is-immersive': immersive }]" :style="lyricStyle">
    <div class="lyrics-spacer" />
    <button
      v-for="(line, index) in lines"
      :key="`${line.time}-${index}`"
      type="button"
      class="lyric-line"
      :class="{ 'has-karaoke': settings.karaoke }"
      :data-active="index === activeIndex"
      :style="{ '--lyric-progress': `${progressFor(line, index) * 100}%` }"
      @click="emit('seek', line.time - (settings.offset || 0))"
    >
      <span class="lyric-primary" :data-text="line.text || '· · ·'">{{ line.text || '· · ·' }}</span>
      <small v-if="settings.showTranslation && line.translation">{{ line.translation }}</small>
    </button>
    <div class="lyrics-spacer" />
    </div>
  </div>
</template>
