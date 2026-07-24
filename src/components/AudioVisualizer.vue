<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { visualizerRuntime } from '../visualizerRuntime';

const props = defineProps({
  analyser: Object,
  active: Boolean,
  mode: { type: String, default: 'bars' },
  accent: { type: String, default: '#ff705f' },
  accent2: { type: String, default: '#69dfb1' },
  intensity: { type: Number, default: 0.78 },
  opacity: { type: Number, default: 0.48 },
  glow: { type: Number, default: 18 },
  density: { type: Number, default: 54 },
  speed: { type: Number, default: 1 },
  mirrored: { type: Boolean, default: true },
  reflection: { type: Boolean, default: true },
  channels: { type: Array, default: () => [] },
  channelMode: { type: String, default: 'mix' },
  renderer: { type: String, default: 'auto' },
  workerProcessing: { type: Boolean, default: true },
  targetFps: { type: Number, default: 60 },
  className: String,
});

const canvasRef = ref(null);
let cleanup = () => {};

function roundedRect(context, x, y, width, height, radius) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, nextRadius);
    return;
  }
  context.moveTo(x + nextRadius, y);
  context.arcTo(x + width, y, x + width, y + height, nextRadius);
  context.arcTo(x + width, y + height, x, y + height, nextRadius);
  context.arcTo(x, y + height, x, y, nextRadius);
  context.arcTo(x, y, x + width, y, nextRadius);
  context.closePath();
}

function render() {
  cleanup();
  const canvas = canvasRef.value;
  if (!canvas) return;
  const settings = visualizerRuntime.settings || {};
  const mode = settings.visualizer ?? props.mode;
  const analyser = visualizerRuntime.analyser || props.analyser;
  const channels = visualizerRuntime.channels.length ? visualizerRuntime.channels : props.channels;
  const channelMode = settings.visualizerChannelMode ?? props.channelMode;
  const renderer = settings.visualizerRenderer ?? props.renderer;
  const workerProcessing = settings.visualizerWorkerProcessing ?? props.workerProcessing;
  const targetFps = settings.visualizerTargetFps ?? props.targetFps;
  const intensity = settings.visualizerIntensity ?? props.intensity;
  const opacity = settings.visualizerOpacity ?? props.opacity;
  const glow = settings.visualizerGlow ?? props.glow;
  const density = settings.visualizerDensity ?? props.density;
  const speed = settings.visualizerSpeed ?? props.speed;
  const mirrored = settings.visualizerMirrored ?? props.mirrored;
  const reflection = settings.visualizerReflection ?? props.reflection;
  if (mode === 'none') {
    canvas.width = canvas.width;
    return;
  }
  const glRenderer = renderer !== 'cpu' ? createGpuRenderer(canvas) : null;
  const context = glRenderer ? null : canvas.getContext('2d');

  let frame = 0;
  let lastDraw = 0;
  let workerPending = false;
  let dspWorker = null;
  let processedBands = new Float32Array(0);
  let workerTick = 0;
  let frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(96);
  let timeData = analyser ? new Uint8Array(analyser.fftSize) : new Uint8Array(256).fill(128);
  let channelFrequencyData = [];
  let gpuGeometry = new Float32Array(4096);
  let gpuGeometryLength = 0;

  if (workerProcessing && props.active && typeof Worker !== 'undefined') {
    try {
      dspWorker = new Worker(new URL('../visualizerDsp.worker.js', import.meta.url), { type: 'module' });
      dspWorker.onmessage = ({ data }) => {
        processedBands = data.bands ? new Float32Array(data.bands) : processedBands;
        workerPending = false;
      };
    } catch {
      dspWorker = null;
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.25 : 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
    glRenderer?.resize(canvas.width, canvas.height);
  }

  function readAudio() {
    const analysers = channels.length ? channels : analyser ? [analyser] : [];
    if (!analysers.length) return;
    if (frequencyData.length !== analysers[0].frequencyBinCount) frequencyData = new Uint8Array(analysers[0].frequencyBinCount);
    if (timeData.length !== analysers[0].fftSize) timeData = new Uint8Array(analysers[0].fftSize);
    channelFrequencyData.length = analysers.length;
    for (let index = 0; index < analysers.length; index += 1) {
      const channel = analysers[index];
      const data = channelFrequencyData[index]?.length === channel.frequencyBinCount ? channelFrequencyData[index] : new Uint8Array(channel.frequencyBinCount);
      channel.getByteFrequencyData(data);
      if (index === 0) frequencyData = data;
      channelFrequencyData[index] = data;
    }
    analysers[0].getByteTimeDomainData(timeData);
    workerTick += 1;
    if (dspWorker && props.active && !workerPending && workerTick % 2 === 0) {
      const buffers = channelFrequencyData.map((channel) => channel.slice().buffer);
      workerPending = true;
      dspWorker.postMessage({ channels: buffers, count: density, channelMode }, buffers);
    }
  }

  function valueAt(index, timestamp) {
    if (!props.active || (!analyser && !channels.length)) return 0.08 + Math.sin(timestamp * 0.001 * speed + index * 0.5) * 0.025;
    let rawSample;
    if (processedBands.length) rawSample = processedBands[index % processedBands.length];
    else if (channelFrequencyData.length > 1 && channelMode !== 'mix') {
      const channelIndex = channelMode === 'right' || (channelMode === 'stereo' && index >= density / 2) ? 1 : 0;
      const source = channelFrequencyData[channelIndex] || frequencyData;
      rawSample = source[index % source.length] / 255;
    } else rawSample = frequencyData[index % frequencyData.length] / 255;
    const sample = rawSample * intensity;
    return Math.min(1, Math.max(0.025, Math.pow(sample, 0.72) * intensity));
  }

  function drawGpu(timestamp) {
    const renderer = glRenderer;
    gpuGeometryLength = 0;
    const addVertex = (x, y, color, alpha) => {
      if (gpuGeometryLength + 6 > gpuGeometry.length) {
        const next = new Float32Array(gpuGeometry.length * 2);
        next.set(gpuGeometry);
        gpuGeometry = next;
      }
      gpuGeometry[gpuGeometryLength++] = x * 2 - 1;
      gpuGeometry[gpuGeometryLength++] = 1 - y * 2;
      gpuGeometry[gpuGeometryLength++] = color[0];
      gpuGeometry[gpuGeometryLength++] = color[1];
      gpuGeometry[gpuGeometryLength++] = color[2];
      gpuGeometry[gpuGeometryLength++] = alpha;
    };
    const addQuad = (x, y, width, height, color, alpha) => {
      addVertex(x, y, color, alpha); addVertex(x + width, y, color, alpha); addVertex(x + width, y + height, color, alpha);
      addVertex(x, y, color, alpha); addVertex(x + width, y + height, color, alpha); addVertex(x, y + height, color, alpha);
    };
    const first = hexToRgb(props.accent);
    const second = hexToRgb(props.accent2);
    if (mode === 'bars') {
      const count = Math.max(18, Math.min(110, Math.round(density)));
      const gap = Math.max(0.004, Math.min(0.012, 1 / count * 0.16));
      const barWidth = Math.max(0.006, (1 - gap * (count - 1)) / count);
      const baseline = 0.88;
      for (let index = 0; index < count; index += 1) {
        const value = valueAt(index, timestamp);
        const x = index * (barWidth + gap);
        const color = index % 5 === 0 ? second : first;
        addQuad(x, baseline - value * 0.72, barWidth, Math.max(0.012, value * 0.72), color, opacity * (0.7 + value * 0.3));
        if (mirrored) addQuad(x, baseline + 0.025, barWidth, Math.max(0.008, value * 0.16), color, opacity * 0.18);
      }
    } else if (mode === 'radial') {
      const centerX = 0.5;
      const centerY = 0.52;
      const radius = 0.22;
      for (let index = 0; index < 96; index += 1) {
        const value = valueAt(index, timestamp);
        const angle = (index / 96) * Math.PI * 2 - Math.PI / 2;
        const length = 0.006 + value * radius * 0.8;
        const color = index % 4 === 0 ? second : first;
        addVertex(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, color, opacity * (0.35 + value * 0.55));
        addVertex(centerX + Math.cos(angle) * (radius + length), centerY + Math.sin(angle) * (radius + length), color, opacity * (0.35 + value * 0.55));
      }
    } else {
      const bands = mode === 'aurora' ? 5 : 1;
      const points = Math.min(256, timeData.length);
      for (let band = 0; band < bands; band += 1) {
        for (let index = 0; index < points; index += 1) {
          const x = index / Math.max(1, points - 1);
          const raw = analyser ? (timeData[Math.floor(index * timeData.length / points)] - 128) / 128 : Math.sin(index * 0.11 + timestamp * 0.001 * speed) * 0.08;
          const yBase = mode === 'aurora' ? 0.32 + band * 0.13 : mode === 'horizon' ? 0.72 : 0.52;
          const y = yBase + raw * (mode === 'aurora' ? 0.045 : 0.22) * intensity;
          const color = band % 2 ? second : first;
          addVertex(x, y, color, opacity * (mode === 'aurora' ? 0.2 : 0.8));
        }
      }
    }
    renderer.draw(gpuGeometry.subarray(0, gpuGeometryLength), mode === 'bars' ? 'triangles' : mode === 'radial' ? 'lines' : 'line-strip', mode === 'aurora' ? 5 : 1);
  }

  function drawBars(context, width, height, timestamp) {
    const count = Math.max(18, Math.min(110, Math.round(density)));
    const gap = Math.max(2, Math.min(6, width / count * 0.16));
    const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
    const baseline = height * 0.88;
    const maxHeight = height * 0.78;
    const gradient = context.createLinearGradient(0, baseline - maxHeight, 0, baseline);
    gradient.addColorStop(0, props.accent2);
    gradient.addColorStop(0.45, props.accent);
    gradient.addColorStop(1, `${props.accent}55`);
    context.fillStyle = gradient;
    context.shadowColor = props.accent;
    context.shadowBlur = glow;

    for (let index = 0; index < count; index += 1) {
      const value = valueAt(Math.floor(index * frequencyData.length / count), timestamp);
      const x = index * (barWidth + gap);
      const barHeight = Math.max(3, value * maxHeight);
      roundedRect(context, x, baseline - barHeight, barWidth, barHeight, barWidth / 2);
      context.globalAlpha = opacity * (0.7 + value * 0.3);
      context.fill();
      if (mirrored) {
        context.globalAlpha = opacity * 0.2;
        roundedRect(context, x, baseline + 4, barWidth, Math.max(2, barHeight * 0.22), barWidth / 2);
        context.fill();
      }
    }
    context.shadowBlur = 0;
    if (reflection) {
      const reflection = context.createLinearGradient(0, baseline + 8, 0, height);
      reflection.addColorStop(0, `${props.accent}22`);
      reflection.addColorStop(1, `${props.accent}00`);
      context.globalAlpha = opacity * 0.55;
      context.fillStyle = reflection;
      context.fillRect(0, baseline + 8, width, height - baseline);
    }
  }

  function drawWave(context, width, height, timestamp, horizon = false) {
    const center = height * (horizon ? 0.72 : 0.52);
    const amplitude = height * (horizon ? 0.23 : 0.3);
    const points = Math.min(512, timeData.length);
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, props.accent2);
    gradient.addColorStop(0.5, props.accent);
    gradient.addColorStop(1, props.accent2);
    context.strokeStyle = gradient;
    context.lineWidth = horizon ? 2.4 : 1.8;
    context.globalAlpha = opacity * 0.9;
    context.shadowColor = props.accent;
    context.shadowBlur = glow;
    context.beginPath();
    for (let index = 0; index < points; index += 1) {
      const x = (index / Math.max(1, points - 1)) * width;
      const raw = analyser ? (timeData[Math.floor(index * timeData.length / points)] - 128) / 128 : Math.sin(index * 0.11 + timestamp * 0.001 * speed) * 0.08;
      const y = center + raw * amplitude * intensity;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.shadowBlur = 0;
    if (mirrored && !horizon) {
      context.globalAlpha = opacity * 0.22;
      context.beginPath();
      for (let index = 0; index < points; index += 1) {
        const x = (index / Math.max(1, points - 1)) * width;
        const raw = analyser ? (timeData[Math.floor(index * timeData.length / points)] - 128) / 128 : Math.sin(index * 0.11 + timestamp * 0.001 * speed) * 0.08;
        const y = center - raw * amplitude * intensity + 10;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  function drawAurora(context, width, height, timestamp) {
    const bands = 5;
    for (let band = 0; band < bands; band += 1) {
      const yBase = height * (0.32 + band * 0.13);
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `${props.accent2}00`);
      gradient.addColorStop(0.3, `${props.accent2}80`);
      gradient.addColorStop(0.65, `${props.accent}70`);
      gradient.addColorStop(1, `${props.accent}00`);
      context.strokeStyle = gradient;
      context.lineWidth = 10 + band * 2;
      context.globalAlpha = opacity * (0.26 - band * 0.025);
      context.shadowColor = band % 2 ? props.accent : props.accent2;
      context.shadowBlur = glow * 1.5;
      context.beginPath();
      for (let index = 0; index <= 90; index += 1) {
        const x = (index / 90) * width;
        const wave = Math.sin(index * 0.16 + timestamp * 0.001 * speed + band) * height * 0.045 * intensity;
        const y = yBase + wave + Math.sin(index * 0.045 + band) * height * 0.025;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.shadowBlur = 0;
  }

  function drawRadial(context, width, height, timestamp) {
    const centerX = width * 0.5;
    const centerY = height * 0.52;
    const radius = Math.min(width, height) * 0.22;
    context.lineCap = 'round';
    for (let index = 0; index < 96; index += 1) {
      const value = valueAt(index, timestamp);
      const angle = (index / 96) * Math.PI * 2 - Math.PI / 2;
      const length = 4 + value * radius * 0.8;
      context.globalAlpha = opacity * (0.35 + value * 0.55);
      context.strokeStyle = index % 4 === 0 ? props.accent2 : props.accent;
      context.lineWidth = 1.5 + value * 2;
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = glow * 0.7;
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      context.lineTo(centerX + Math.cos(angle) * (radius + length), centerY + Math.sin(angle) * (radius + length));
      context.stroke();
    }
    context.shadowBlur = 0;
    context.globalAlpha = opacity * 0.18;
    context.fillStyle = props.accent;
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.18, 0, Math.PI * 2);
    context.fill();
  }

  function draw(timestamp = 0) {
    if (props.active && targetFps < 60 && timestamp - lastDraw < 1000 / targetFps) {
      frame = requestAnimationFrame(draw);
      return;
    }
    lastDraw = timestamp;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (context) context.clearRect(0, 0, width, height);
    readAudio();
    if (glRenderer) drawGpu(timestamp);
    else {
      if (mode === 'bars') drawBars(context, width, height, timestamp);
      else if (mode === 'radial') drawRadial(context, width, height, timestamp);
      else if (mode === 'aurora') drawAurora(context, width, height, timestamp);
      else drawWave(context, width, height, timestamp, mode === 'horizon');
      context.globalAlpha = 1;
    }
    if (props.active) frame = requestAnimationFrame(draw);
  }

  resize();
  draw();
  const observer = new ResizeObserver(() => { resize(); draw(); });
  observer.observe(canvas);
  cleanup = () => { cancelAnimationFrame(frame); observer.disconnect(); dspWorker?.terminate(); glRenderer?.dispose(); };
}

function hexToRgb(value) {
  const hex = String(value || '#ffffff').replace('#', '').padEnd(6, 'f');
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}

function createGpuRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, desynchronized: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, `#version 300 es\nin vec2 a_position;\nin vec4 a_color;\nout vec4 v_color;\nvoid main(){gl_Position=vec4(a_position,0.0,1.0);v_color=a_color;}`);
  gl.compileShader(vertexShader);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, `#version 300 es\nprecision mediump float;\nin vec4 v_color;\nout vec4 outColor;\nvoid main(){outColor=v_color;}`);
  gl.compileShader(fragmentShader);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program);
  const buffer = gl.createBuffer();
  const position = gl.getAttribLocation(program, 'a_position');
  const color = gl.getAttribLocation(program, 'a_color');
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  return {
    resize(width, height) { gl.viewport(0, 0, width, height); },
    draw(vertices, primitive, stripCount = 1) {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(color); gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 24, 8);
      const type = primitive === 'triangles' ? gl.TRIANGLES : primitive === 'lines' ? gl.LINES : gl.LINE_STRIP;
      if (primitive === 'line-strip' && stripCount > 1) {
        const points = vertices.length / 6 / stripCount;
        for (let index = 0; index < stripCount; index += 1) gl.drawArrays(type, index * points, points);
      } else gl.drawArrays(type, 0, vertices.length / 6);
    },
    dispose() { gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); },
  };
}

onMounted(render);
watch(() => [props.analyser, props.active, props.mode, props.accent, props.accent2, props.intensity, props.opacity, props.glow, props.density, props.speed, props.mirrored, props.reflection, visualizerRuntime.version], render);
onBeforeUnmount(() => cleanup());
</script>

<template><canvas ref="canvasRef" class="audio-visualizer" :class="className" aria-hidden="true" /></template>
