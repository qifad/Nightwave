<script setup>
defineProps({
  label: String,
  value: Number,
  min: Number,
  max: Number,
  step: { type: Number, default: 1 },
  unit: { type: String, default: '' },
});
const emit = defineEmits(['update']);
</script>

<template>
  <label class="settings-range">
    <span><strong>{{ label }}</strong><small>{{ value }}{{ unit }}</small></span>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="value"
      :style="{ '--range-progress': `${((value - min) / (max - min)) * 100}%` }"
      @input="emit('update', Number($event.target.value))"
    >
  </label>
</template>
