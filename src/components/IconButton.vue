<script setup>
const emit = defineEmits(['click']);
defineProps({
  label: String,
  active: Boolean,
  disabled: Boolean,
});
</script>

<template>
  <button
    class="icon-button"
    :class="{ 'is-active': active }"
    :title="label"
    :aria-label="label"
    :disabled="disabled"
    type="button"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
