<script setup>
import { ref } from 'vue';
import { Check, FileDown, X } from '@lucide/vue';

defineProps({
  track: { type: Object, required: true },
});
const emit = defineEmits(['save', 'cancel']);
const remember = ref(false);
</script>

<template>
  <div class="modal-layer lyrics-save-layer" role="presentation">
    <button class="modal-backdrop" type="button" aria-label="关闭歌词保存提示" @click="emit('cancel', { remember: false })" />
    <section class="lyrics-save-dialog" role="dialog" aria-modal="true" aria-labelledby="lyrics-save-title">
      <header class="dialog-header"><div><span class="eyebrow">LYRICS READY</span><h2 id="lyrics-save-title">保存歌词文件？</h2></div><button class="dialog-close" type="button" aria-label="关闭" @click="emit('cancel', { remember: false })"><X /></button></header>
      <div class="lyrics-save-content"><div class="lyrics-save-icon"><FileDown /></div><p><strong>{{ track.title }}</strong><span>歌词已经获取完成，是否保存为同目录的 LRC 文件？</span></p><label class="lyrics-save-remember"><input v-model="remember" type="checkbox"><span>记住我的选择</span></label></div>
      <footer class="lyrics-save-actions"><button class="page-action" type="button" @click="emit('cancel', { remember })">暂不保存</button><button class="primary-action" type="button" @click="emit('save', { remember })"><Check />保存 LRC</button></footer>
    </section>
  </div>
</template>
