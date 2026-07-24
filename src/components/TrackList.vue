<script setup>
import { Disc3, Gauge, Heart, MoreHorizontal, Play } from '@lucide/vue';
import { formatTime } from '../media';
import IconButton from './IconButton.vue';

defineProps({
  tracks: { type: Array, required: true },
  currentTrack: Object,
  isPlaying: Boolean,
  favorites: { type: Object, required: true },
});
const emit = defineEmits(['play', 'favorite', 'more']);
</script>

<template>
  <div v-if="!tracks.length" class="list-empty"><Disc3 aria-hidden="true" /><span>这里还没有曲目</span></div>
  <div v-else class="track-list">
    <div class="track-list-head"><span>#</span><span>曲目</span><span>专辑</span><span>时长</span><span /><span /></div>
    <div v-for="(track, index) in tracks" :key="track.id" class="track-row" :class="{ 'is-current': currentTrack?.id === track.id }">
      <button class="track-number" type="button" :aria-label="`播放 ${track.title}`" @click="emit('play', track)">
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        <Gauge v-if="currentTrack?.id === track.id && isPlaying" class="playing-mark" aria-hidden="true" />
        <Play v-else aria-hidden="true" />
      </button>
      <button class="track-identity" type="button" @click="emit('play', track)">
        <img :src="track.cover" alt="">
        <span><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
      </button>
      <span class="track-album">{{ track.album }}</span>
      <span class="track-duration">{{ formatTime(track.duration) }}</span>
      <IconButton class="track-more" label="更多设置" @click="emit('more', track, $event)"><MoreHorizontal /></IconButton>
      <IconButton class="track-like" :active="favorites.has(track.key)" :label="favorites.has(track.key) ? '取消喜欢' : '喜欢'" @click="emit('favorite', track)"><Heart :fill="favorites.has(track.key) ? 'currentColor' : 'none'" /></IconButton>
    </div>
  </div>
</template>
