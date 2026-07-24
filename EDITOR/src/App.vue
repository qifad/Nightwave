<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { strToU8, zipSync } from 'fflate';
import {
  Check, Code2, Download, Eye, FileCode2, FileJson, Layers3, Palette, Play, Plus,
  RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles, WandSparkles, X, Zap,
} from '@lucide/vue';

const presets = [
  { id: 'glass', name: 'macOS Native', description: '系统蓝、浅色材质和原生窗口层级', mode: 'light', accent: '#007aff', accent2: '#34c759', surface: '#ffffff', surface2: '#f5f5f7', text: '#1d1d1f', muted: '#6e6e73', blur: 26, radius: 12, opacity: 0.78 },
  { id: 'signal', name: 'Signal Green', description: '清晰高对比的音频工作台', accent: '#74e0a0', accent2: '#f4d35e', surface: '#15201c', surface2: '#0c1411', blur: 14, radius: 8, opacity: 0.94 },
  { id: 'mono', name: 'Mono Studio', description: '黑白灰与单一亮色的专注界面', accent: '#f1f3f4', accent2: '#a7b4ff', surface: '#1b1d20', surface2: '#101113', blur: 8, radius: 5, opacity: 0.98 },
];

const defaultManifest = {
  id: 'nightwave.my-extension',
  name: 'My Nightwave Extension',
  version: '1.0.0',
  description: 'A custom Nightwave extension',
  type: 'theme',
  author: 'Nightwave Studio',
};

const defaultTokens = {
  accent: '#ff705f',
  accent2: '#69dfb1',
  surface: '#171a1c',
  surface2: '#0f1214',
  text: '#f1f3f4',
  muted: '#8b9295',
  blur: 26,
  radius: 12,
  opacity: 0.82,
  sidebarWidth: 236,
  contrast: 1,
};

const defaultUiRules = [
  { id: 'canvas', name: '应用画布', selector: '.app-shell', background: '#0d1014', textColor: '#f1f3f4', borderColor: '#252d32', radius: 0, blur: 0, opacity: 1, shadow: 0, enabled: true },
  { id: 'sidebar', name: '侧边栏', selector: '.sidebar, .queue-drawer', background: '#171d21', textColor: '#f1f3f4', borderColor: '#303b42', radius: 12, blur: 22, opacity: 0.9, shadow: 18, enabled: true },
  { id: 'surface', name: '内容卡片', selector: '.now-stage, .lyrics-column, .extension-card, .settings-page-card', background: '#171d21', textColor: '#f1f3f4', borderColor: '#303b42', radius: 12, blur: 18, opacity: 0.94, shadow: 24, enabled: true },
  { id: 'topbar', name: '顶部导航', selector: '.topbar, .editor-topbar', background: '#11161a', textColor: '#f1f3f4', borderColor: '#2d363c', radius: 0, blur: 18, opacity: 0.94, shadow: 8, enabled: true },
  { id: 'player', name: '播放栏', selector: '.player-bar', background: '#151b1f', textColor: '#f1f3f4', borderColor: '#303b42', radius: 12, blur: 24, opacity: 0.96, shadow: 30, enabled: true },
  { id: 'action', name: '主操作按钮', selector: '.play-button, .primary-action', background: '#69dfb1', textColor: '#101719', borderColor: '#69dfb1', radius: 10, blur: 0, opacity: 1, shadow: 24, enabled: true },
  { id: 'active', name: '选中状态', selector: '.nav-list button.is-active, .sidebar-tools button.is-active, .lyric-line[data-active="true"]', background: '#273338', textColor: '#69dfb1', borderColor: '#69dfb1', radius: 8, blur: 0, opacity: 1, shadow: 12, enabled: true },
  { id: 'controls', name: '输入与次要控件', selector: '.folder-button, .search-field, .page-action, .icon-button', background: '#20282d', textColor: '#cbd3d6', borderColor: '#344148', radius: 8, blur: 8, opacity: 0.94, shadow: 8, enabled: true },
  { id: 'rows', name: '列表与歌曲行', selector: '.track-list-head, .track-row, .queue-list > button', background: '#151b1f', textColor: '#dbe2e4', borderColor: '#293237', radius: 6, blur: 0, opacity: 0.9, shadow: 0, enabled: true },
  { id: 'overlays', name: '设置与弹窗', selector: '.app-settings-page, .extensions-page, .lyrics-settings-panel, .track-action-menu, .lyrics-search-dialog, .export-dialog', background: '#171d21', textColor: '#e8edee', borderColor: '#344148', radius: 14, blur: 24, opacity: 0.96, shadow: 28, enabled: true },
  { id: 'equalizer', name: '均衡器页面', selector: '.equalizer-panel, .eq-graph-wrap, .eq-band-row', background: '#151b1f', textColor: '#e8edee', borderColor: '#344148', radius: 10, blur: 18, opacity: 0.96, shadow: 22, enabled: true },
];

function lightUiRules() {
  return defaultUiRules.map((rule) => ({
    ...rule,
    background: rule.id === 'canvas' ? '#f5f5f7' : rule.id === 'action' || rule.id === 'active' ? '#007aff' : '#ffffff',
    textColor: rule.id === 'action' || rule.id === 'active' ? '#ffffff' : '#1d1d1f',
    borderColor: rule.id === 'action' || rule.id === 'active' ? '#007aff' : '#c7c7cc',
    opacity: rule.id === 'canvas' || rule.id === 'action' || rule.id === 'active' ? 1 : 0.76,
    shadow: rule.id === 'canvas' ? 0 : rule.id === 'action' ? 18 : rule.shadow,
  }));
}

const defaultPlugin = `export function activate(api) {
  const button = document.createElement('button');
  button.className = 'nightwave-plugin-action';
  button.textContent = 'Plugin action';
  button.addEventListener('click', () => api.notify('插件按钮已触发'));
  document.querySelector('.topbar-actions')?.append(button);

  return () => button.remove();
}`;

const manifest = reactive({ ...defaultManifest });
const tokens = reactive({ ...defaultTokens });
const uiRules = reactive(defaultUiRules.map((rule) => ({ ...rule })));

const files = reactive({
  'manifest.json': '',
  'theme.css': '',
  'plugin.js': defaultPlugin,
});

const selectedFile = ref('theme.css');
const activeInspector = ref('visual');
const showCompletions = ref(false);
const completionIndex = ref(0);
const codeEditor = ref(null);
const notice = ref('');
let noticeTimer = 0;
let themeSyncFrame = 0;
let customRuleCount = 1;

const GENERATED_CSS_START = '/* NIGHTWAVE_EDITOR_GENERATED_START */';
const GENERATED_CSS_END = '/* NIGHTWAVE_EDITOR_GENERATED_END */';

function notify(message) {
  notice.value = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.value = ''; }, 2400);
}

function cleanId(value) {
  return String(value || 'nightwave.extension').trim().toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'nightwave.extension';
}

function manifestData() {
  return {
    id: cleanId(manifest.id),
    name: manifest.name.trim() || 'Untitled Extension',
    version: manifest.version.trim() || '1.0.0',
    description: manifest.description.trim(),
    type: manifest.type,
    author: manifest.author.trim(),
    ...(manifest.type === 'theme' ? {
      stylesheet: 'theme.css',
      accent: tokens.accent,
      accent2: tokens.accent2,
      uiRules: uiRules.map((rule) => ({ ...rule })),
      ...(manifest.entry ? { entry: manifest.entry } : {}),
    } : { entry: 'plugin.js' }),
  };
}

function presetTokens(preset) {
  return Object.fromEntries(Object.keys(defaultTokens).filter((key) => key in preset).map((key) => [key, preset[key]]));
}

function themeLooksLight(css) {
  return /color-scheme\s*:\s*light/i.test(css) || /--bg\s*:\s*#(?:f|e|d)[a-f0-9]{5}/i.test(css);
}

function syncManifestFile() {
  files['manifest.json'] = `${JSON.stringify(manifestData(), null, 2)}\n`;
}

function cloneUiRules(rules) {
  return rules.map((rule) => ({ ...rule }));
}

function replaceUiRules(rules) {
  uiRules.splice(0, uiRules.length, ...cloneUiRules(rules));
}

function extractCustomCss() {
  const source = files['theme.css'] || '';
  const startIndex = source.indexOf(GENERATED_CSS_START);
  const markerIndex = source.indexOf(GENERATED_CSS_END);
  if (startIndex >= 0 && markerIndex >= startIndex) return {
    before: source.slice(0, startIndex).trim(),
    after: source.slice(markerIndex + GENERATED_CSS_END.length).trim(),
  };
  return { before: source.trim(), after: '' };
}

function generateUiCss() {
  return uiRules.filter((rule) => rule.enabled && rule.selector.trim()).map((rule) => {
    const lines = [
      `${rule.selector.trim()} {`,
      `  background: color-mix(in srgb, ${rule.background} ${Math.round(Number(rule.opacity) * 100)}%, transparent);`,
      `  color: ${rule.textColor};`,
      `  border-color: ${rule.borderColor};`,
      `  border-radius: ${Math.max(0, Number(rule.radius) || 0)}px;`,
    ];
    if (Number(rule.blur) > 0) lines.push(`  backdrop-filter: blur(${Number(rule.blur)}px) saturate(1.2);`);
    if (Number(rule.shadow) > 0) lines.push(`  box-shadow: 0 ${Math.round(Number(rule.shadow) / 2)}px ${Number(rule.shadow) * 2}px rgba(0, 0, 0, 0.24);`);
    lines.push('}');
    return lines.join('\n');
  }).join('\n\n');
}

function generateThemeCss(preserveCustom = true) {
  const preserved = preserveCustom ? extractCustomCss() : { before: '', after: '' };
  const generated = `${GENERATED_CSS_START}
:root {
  --nightwave-extension-accent: ${tokens.accent};
  --nightwave-extension-accent-2: ${tokens.accent2};
  --nightwave-extension-surface: ${tokens.surface};
  --nightwave-extension-surface-2: ${tokens.surface2};
  --nightwave-extension-text: ${tokens.text};
  --nightwave-extension-muted: ${tokens.muted};
  --nightwave-extension-opacity: ${tokens.opacity};
  --nightwave-extension-sidebar-width: ${tokens.sidebarWidth}px;
}

/* Generated by Nightwave Extension Editor. Customize any selector below. */
.app-shell {
  --accent: var(--nightwave-extension-accent);
  --accent-2: var(--nightwave-extension-accent-2);
  --text: var(--nightwave-extension-text);
  --muted: var(--nightwave-extension-muted);
  --line: color-mix(in srgb, var(--accent) 18%, transparent);
  background: var(--nightwave-extension-surface-2);
}

.sidebar,
.queue-drawer,
.settings-page,
.extensions-page {
  background: color-mix(in srgb, var(--nightwave-extension-surface) ${Math.round(tokens.opacity * 100)}%, transparent);
  border-color: var(--line);
  backdrop-filter: blur(${tokens.blur}px) saturate(1.25);
}

.sidebar { width: ${tokens.sidebarWidth}px; }
.cover-wrap, .extension-card, .settings-section { border-radius: ${tokens.radius}px; }
.play-button, .primary-action { box-shadow: 0 0 26px color-mix(in srgb, var(--accent) 38%, transparent); }
.nav-list button.is-active, .sidebar-tools button.is-active { color: var(--accent); }
.lyric-line.is-active { color: var(--accent); text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 45%, transparent); }
.progress-row input::-webkit-slider-thumb { background: var(--accent); }
\n/* UI RULES: edit selectors and values from the Interface panel. */
${generateUiCss()}
\n${GENERATED_CSS_END}`;
  return `${preserved.before ? `${preserved.before}\n\n` : ''}${generated}${preserved.after ? `\n\n/* CUSTOM CSS: this section is preserved when controls update. */\n${preserved.after}` : ''}\n`;
}

function applyPreset(preset) {
  Object.assign(tokens, presetTokens(preset));
  replaceUiRules(preset.mode === 'light' ? lightUiRules() : defaultUiRules);
  files['theme.css'] = generateThemeCss();
  selectedFile.value = 'theme.css';
  notify(`已应用预设：${preset.name}`);
}

function applyThemeControls(showNotice = false) {
  if (themeSyncFrame) return;
  const sync = () => {
    themeSyncFrame = 0;
    files['theme.css'] = generateThemeCss();
    if (showNotice) notify('视觉参数已同步到 theme.css');
  };
  if (typeof window.requestAnimationFrame === 'function') themeSyncFrame = window.requestAnimationFrame(sync);
  else sync();
}

function addUiRule() {
  const index = customRuleCount++;
  uiRules.push({
    id: `custom-${Date.now()}`,
    name: `自定义区域 ${index}`,
    selector: `.custom-ui-area-${index}`,
    background: '#20282d',
    textColor: '#f1f3f4',
    borderColor: '#46545b',
    radius: 10,
    blur: 0,
    opacity: 1,
    shadow: 12,
    enabled: true,
  });
  activeInspector.value = 'interface';
  notify('已添加自定义 UI 区域');
}

function removeUiRule(index) {
  uiRules.splice(index, 1);
  notify('已移除 UI 区域规则');
}

function decodeSeed(seed) {
  const binary = atob(seed.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - seed.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cssValue(css, property, fallback) {
  const match = String(css || '').match(new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+)`, 'i'));
  return match?.[1]?.trim() || fallback;
}

function numberValue(value, fallback, min, max) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function hydrateTokens(css, extensionManifest = {}) {
  const source = String(css || '');
  const opacitySource = cssValue(source, '--nightwave-extension-opacity', '');
  const opacityNumber = Number.parseFloat(opacitySource);
  const opacity = Number.isFinite(opacityNumber)
    ? opacityNumber > 1 || opacitySource.includes('%') ? opacityNumber / 100 : opacityNumber
    : defaultTokens.opacity;
  const next = {
    accent: cssValue(source, '--nightwave-extension-accent', cssValue(source, '--accent', extensionManifest.accent || defaultTokens.accent)),
    accent2: cssValue(source, '--nightwave-extension-accent-2', cssValue(source, '--accent-2', extensionManifest.accent2 || defaultTokens.accent2)),
    surface: cssValue(source, '--nightwave-extension-surface', cssValue(source, '--panel', defaultTokens.surface)),
    surface2: cssValue(source, '--nightwave-extension-surface-2', cssValue(source, '--bg', defaultTokens.surface2)),
    text: cssValue(source, '--nightwave-extension-text', cssValue(source, '--text', defaultTokens.text)),
    muted: cssValue(source, '--nightwave-extension-muted', cssValue(source, '--muted', defaultTokens.muted)),
    blur: numberValue(cssValue(source, 'backdrop-filter', '').match(/blur\((\d+)/i)?.[1], defaultTokens.blur, 0, 42),
    radius: numberValue(cssValue(source, 'border-radius', ''), defaultTokens.radius, 0, 22),
    opacity: numberValue(opacity, defaultTokens.opacity, 0.55, 1),
    sidebarWidth: numberValue(cssValue(source, '--nightwave-extension-sidebar-width', ''), defaultTokens.sidebarWidth, 180, 300),
  };
  Object.assign(tokens, next);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('nightwave-editor-draft') || 'null');
    if (!draft?.manifest || !draft?.files) return false;
    Object.assign(manifest, defaultManifest, draft.manifest);
    Object.assign(tokens, defaultTokens, draft.tokens || {});
    replaceUiRules(Array.isArray(draft.uiRules) && draft.uiRules.length ? draft.uiRules : Array.isArray(draft.manifest.uiRules) && draft.manifest.uiRules.length ? draft.manifest.uiRules : defaultUiRules);
    Object.assign(files, draft.files);
    selectedFile.value = fileOptions.value.includes(selectedFile.value) ? selectedFile.value : manifest.type === 'theme' ? 'theme.css' : 'plugin.js';
    return true;
  } catch {
    return false;
  }
}

function loadSeed() {
  const seed = new URLSearchParams(window.location.search).get('seed');
  if (!seed) {
    if (restoreDraft()) return;
    Object.assign(tokens, presetTokens(presets[0]));
    replaceUiRules(presets[0].mode === 'light' ? lightUiRules() : defaultUiRules);
    files['theme.css'] = generateThemeCss();
    syncManifestFile();
    return;
  }
  try {
    const extension = decodeSeed(seed);
    Object.assign(manifest, defaultManifest, extension.manifest || {});
    replaceUiRules(Array.isArray(extension.manifest?.uiRules) && extension.manifest.uiRules.length ? extension.manifest.uiRules : themeLooksLight(extension.css) ? lightUiRules() : defaultUiRules);
    files['theme.css'] = extension.css || generateThemeCss();
    files['plugin.js'] = extension.pluginCode || defaultPlugin;
    hydrateTokens(files['theme.css'], manifest);
    syncManifestFile();
    selectedFile.value = manifest.type === 'plugin' ? 'plugin.js' : 'theme.css';
    notify(`已打开：${manifest.name}`);
  } catch {
    notify('扩展数据无法读取，已打开空白项目');
    files['theme.css'] = generateThemeCss();
    syncManifestFile();
  }
}

function selectType() {
  selectedFile.value = manifest.type === 'theme' ? 'theme.css' : 'plugin.js';
  syncManifestFile();
}

function saveDraft() {
  syncManifestFile();
  localStorage.setItem('nightwave-editor-draft', JSON.stringify({ manifest: manifestData(), tokens, uiRules, files }));
  notify('草稿已保存到本机');
}

function resetDraft() {
  Object.assign(manifest, defaultManifest);
  Object.assign(tokens, defaultTokens, presetTokens(presets[0]));
  replaceUiRules(defaultUiRules);
  files['theme.css'] = generateThemeCss(false);
  files['plugin.js'] = defaultPlugin;
  syncManifestFile();
  selectedFile.value = 'theme.css';
  notify('已重置编辑器');
}

function safeBaseName() {
  return cleanId(manifest.id).replaceAll('.', '-');
}

function exportExtension() {
  if (selectedFile.value === 'manifest.json' && !syncManifestFromFile()) return;
  syncManifestFile();
  let parsedManifest;
  try { parsedManifest = JSON.parse(files['manifest.json']); } catch { notify('manifest.json 格式无效'); return; }
  const folder = safeBaseName();
  const payload = {
    [`${folder}/manifest.json`]: strToU8(JSON.stringify(parsedManifest, null, 2)),
  };
  if (parsedManifest.stylesheet) payload[`${folder}/${parsedManifest.stylesheet}`] = strToU8(files['theme.css'] || '');
  if (parsedManifest.entry) payload[`${folder}/${parsedManifest.entry}`] = strToU8(files['plugin.js'] || '');
  const bytes = zipSync(payload, { level: 6 });
  if (window.nightwaveDesktop?.saveFile) {
    window.nightwaveDesktop.saveFile({ bytes, suggestedName: `${folder}.zip`, extension: '.zip', description: 'Nightwave 扩展' }).then((result) => {
      if (!result?.canceled) notify(`已保存：${result.name}`);
    }).catch(() => notify('扩展保存失败'));
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${folder}.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('扩展 ZIP 已导出');
}

const currentCode = computed({
  get: () => files[selectedFile.value] || '',
  set: (value) => { files[selectedFile.value] = value; },
});
const codeLines = computed(() => currentCode.value.split('\n').length);
const codeLanguage = computed(() => selectedFile.value === 'plugin.js' ? 'JS' : selectedFile.value === 'manifest.json' ? 'JSON' : 'CSS');
const fileOptions = computed(() => manifest.type === 'theme' ? ['theme.css', ...(manifest.entry ? ['plugin.js'] : []), 'manifest.json'] : ['plugin.js', 'manifest.json']);
const completionQuery = computed(() => currentCode.value.slice(0, codeEditor.value?.selectionStart || 0).match(/[\w-.:#]+$/)?.[0]?.toLocaleLowerCase() || '');

const completionSets = {
  CSS: [
    { label: 'var(--nightwave-extension-accent)', detail: '主题强调色' },
    { label: 'backdrop-filter: blur(24px);', detail: '玻璃模糊' },
    { label: 'color-mix(in srgb, var(--accent) 30%, transparent)', detail: '混合颜色' },
    { label: 'display: grid;', detail: '布局' },
    { label: 'border-radius: 12px;', detail: '圆角' },
    { label: 'box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 40%, transparent);', detail: '强调光晕' },
    { label: '.lyric-line.is-active', detail: '当前歌词行' },
    { label: '.sidebar-tools button.is-active', detail: '侧边栏工具状态' },
  ],
  JS: [
    { label: 'api.notify("message")', detail: '显示提示' },
    { label: 'api.openSettings()', detail: '打开设置' },
    { label: 'api.onCleanup(() => {})', detail: '注册卸载回调' },
    { label: 'document.querySelector(".topbar-actions")', detail: '查找播放器 UI' },
    { label: 'addEventListener("click", () => {})', detail: '监听事件' },
    { label: 'return () => {}', detail: '插件 cleanup' },
  ],
  JSON: [
    { label: '"id": "nightwave.extension"', detail: '扩展标识' },
    { label: '"name": "Extension name"', detail: '显示名称' },
    { label: '"version": "1.0.0"', detail: '版本号' },
    { label: '"stylesheet": "theme.css"', detail: '主题入口' },
    { label: '"entry": "plugin.js"', detail: '插件入口' },
  ],
};
const completions = computed(() => {
  const query = completionQuery.value;
  const items = completionSets[codeLanguage.value] || [];
  return query ? items.filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query)) : items;
});

function openCompletion() {
  if (!completions.value.length) return;
  showCompletions.value = true;
  completionIndex.value = 0;
}

function insertAtCursor(value, replaceLength = 0) {
  const editor = codeEditor.value;
  if (!editor) return;
  const cursor = editor.selectionStart;
  const start = cursor - replaceLength;
  currentCode.value = `${currentCode.value.slice(0, start)}${value}${currentCode.value.slice(cursor)}`;
  showCompletions.value = false;
  nextTick(() => {
    editor.focus();
    const position = start + value.length;
    editor.setSelectionRange(position, position);
  });
}

function chooseCompletion(item) {
  if (!item) return;
  const editor = codeEditor.value;
  const before = currentCode.value.slice(0, editor?.selectionStart || 0);
  const token = before.match(/[\w-.:#]+$/)?.[0] || '';
  insertAtCursor(item.label, token.length);
}

function handleCodeInput() {
  const editor = codeEditor.value;
  const before = currentCode.value.slice(0, editor?.selectionStart || 0);
  if (before.endsWith('--') || /(?:var|color|background|display|api|document)\.?[\w-]*$/.test(before)) openCompletion();
}

function syncManifestFromFile() {
  if (selectedFile.value !== 'manifest.json') return true;
  try {
    const next = JSON.parse(files['manifest.json']);
    if (!next?.id || !next?.name || !['theme', 'plugin'].includes(next.type)) {
      notify('manifest.json 缺少有效的 id、name 或 type');
      return false;
    }
    Object.assign(manifest, next);
    if (Array.isArray(next.uiRules) && next.uiRules.length) replaceUiRules(next.uiRules);
    notify('manifest.json 已应用到项目');
    return true;
  } catch {
    notify('manifest.json 仍有格式错误');
    return false;
  }
}

function handleCodeKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.code === 'Space') { event.preventDefault(); openCompletion(); return; }
  if (showCompletions.value && !completions.value.length) { showCompletions.value = false; }
  if (showCompletions.value && event.key === 'ArrowDown') { event.preventDefault(); completionIndex.value = (completionIndex.value + 1) % completions.value.length; return; }
  if (showCompletions.value && event.key === 'ArrowUp') { event.preventDefault(); completionIndex.value = (completionIndex.value - 1 + completions.value.length) % completions.value.length; return; }
  if (showCompletions.value && event.key === 'Enter') { event.preventDefault(); chooseCompletion(completions.value[completionIndex.value]); return; }
  if (event.key === 'Escape') { showCompletions.value = false; return; }
  if (event.key === 'Tab') { event.preventDefault(); insertAtCursor('  '); }
}

const previewVars = computed(() => ({
  '--preview-accent': tokens.accent,
  '--preview-accent-2': tokens.accent2,
  '--preview-surface': tokens.surface,
  '--preview-surface-2': tokens.surface2,
  '--preview-text': tokens.text,
  '--preview-muted': tokens.muted,
  '--preview-radius': `${tokens.radius}px`,
  '--preview-blur': `${tokens.blur}px`,
  '--preview-opacity': tokens.opacity,
}));

function previewRuleStyle(id) {
  const rule = uiRules.find((item) => item.id === id);
  if (!rule?.enabled) return {};
  return {
    background: `color-mix(in srgb, ${rule.background} ${Math.round(Number(rule.opacity) * 100)}%, transparent)`,
    color: rule.textColor,
    borderColor: rule.borderColor,
    borderRadius: `${Math.max(0, Number(rule.radius) || 0)}px`,
    ...(Number(rule.blur) > 0 ? { backdropFilter: `blur(${Number(rule.blur)}px) saturate(1.2)` } : {}),
    ...(Number(rule.shadow) > 0 ? { boxShadow: `0 ${Math.round(Number(rule.shadow) / 2)}px ${Number(rule.shadow) * 2}px rgba(0, 0, 0, 0.24)` } : {}),
  };
}

watch(() => [manifest.id, manifest.name, manifest.version, manifest.description, manifest.type, manifest.author], syncManifestFile, { immediate: true });
watch(uiRules, () => {
  if (manifest.type === 'theme') applyThemeControls();
  syncManifestFile();
}, { deep: true });
loadSeed();
onBeforeUnmount(() => {
  if (themeSyncFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(themeSyncFrame);
  window.clearTimeout(noticeTimer);
});
</script>

<template>
  <div class="editor-app">
    <header class="editor-topbar">
      <div class="editor-brand"><span class="brand-mark"><i /><i /><i /><i /></span><div><strong>NIGHTWAVE</strong><small>EXTENSION EDITOR</small></div></div>
      <div class="project-status"><span class="status-dot" />{{ manifest.name }}<span class="status-separator">/</span><b>{{ manifest.type === 'theme' ? 'THEME' : 'PLUGIN' }}</b></div>
      <div class="topbar-actions"><button class="icon-action" type="button" title="保存草稿" @click="saveDraft"><Save /></button><button class="outline-action" type="button" @click="resetDraft"><RotateCcw /><span>重置</span></button><button class="primary-action" type="button" @click="exportExtension"><Download /><span>导出 ZIP</span></button></div>
    </header>

    <main class="editor-layout">
      <aside class="project-sidebar">
        <div class="sidebar-heading"><div><span class="eyebrow">PROJECT</span><h1>扩展工作台</h1></div><button class="icon-action" type="button" title="新建扩展" @click="resetDraft"><Plus /></button></div>
        <div class="type-switch"><button type="button" :class="{ active: manifest.type === 'theme' }" @click="manifest.type = 'theme'; selectType()"><Palette /><span>主题</span></button><button type="button" :class="{ active: manifest.type === 'plugin' }" @click="manifest.type = 'plugin'; selectType()"><Zap /><span>插件</span></button></div>
        <span class="sidebar-label">文件</span>
        <nav class="file-list"><button v-for="file in fileOptions" :key="file" type="button" :class="{ active: selectedFile === file }" @click="selectedFile = file"><FileJson v-if="file === 'manifest.json'" /><FileCode2 v-else /><span>{{ file }}</span><Check v-if="file === selectedFile" /></button></nav>
        <div class="sidebar-footer"><div class="shortcut-hint"><Code2 /><div><strong>代码补全</strong><small>Ctrl / Cmd + Space</small></div></div><div class="editor-version">EDITOR 1.0.0</div></div>
      </aside>

      <section class="editor-center">
         <div class="workspace-heading"><div><span class="eyebrow">{{ codeLanguage }} SOURCE</span><h2>{{ selectedFile }}</h2></div><div class="editor-tools"><button type="button" :class="{ active: showCompletions }" title="打开代码补全" @click="openCompletion"><Sparkles /><span>补全</span></button><button type="button" title="运行预览" @click="notify('预览已刷新')"><Play /><span>预览</span></button></div></div>
        <div class="code-editor-shell">
          <div class="code-toolbar"><span><i class="traffic red" /><i class="traffic yellow" /><i class="traffic green" /></span><span class="code-path">src / {{ selectedFile }}</span><span class="code-language">{{ codeLanguage }}</span></div>
          <div class="code-area">
            <div class="line-numbers" aria-hidden="true"><span v-for="line in codeLines" :key="line">{{ String(line).padStart(2, '0') }}</span></div>
             <textarea ref="codeEditor" v-model="currentCode" spellcheck="false" aria-label="扩展源代码" @input="handleCodeInput" @keydown="handleCodeKeydown" @blur="window.setTimeout(() => { showCompletions = false; }, 180)" @change="syncManifestFromFile" />
            <div v-if="showCompletions" class="completion-menu"><div class="completion-header"><Sparkles />智能补全 <small>Enter 插入</small></div><button v-for="(item, index) in completions" :key="item.label" type="button" :class="{ selected: index === completionIndex }" @mousedown.prevent="chooseCompletion(item)"><code>{{ item.label }}</code><span>{{ item.detail }}</span></button></div>
          </div>
          <footer class="code-footer"><span>{{ codeLines }} 行</span><span>UTF-8</span><span>本地编辑</span></footer>
        </div>
      </section>

      <aside class="inspector-panel">
        <div class="inspector-tabs"><button type="button" :class="{ active: activeInspector === 'visual' }" @click="activeInspector = 'visual'"><SlidersHorizontal /><span>外观</span></button><button type="button" :class="{ active: activeInspector === 'interface' }" @click="activeInspector = 'interface'"><Layers3 /><span>界面</span></button><button type="button" :class="{ active: activeInspector === 'manifest' }" @click="activeInspector = 'manifest'"><Settings2 /><span>信息</span></button></div>

        <div v-if="activeInspector === 'visual'" class="inspector-content">
          <div v-if="manifest.type === 'theme'" class="inspector-section"><div class="section-title"><div><span class="eyebrow">PRESETS</span><h3>快速起步</h3></div><WandSparkles /></div><div class="preset-list"><button v-for="preset in presets" :key="preset.id" type="button" class="preset-option" @click="applyPreset(preset)"><span class="preset-swatch" :style="{ '--preset-a': preset.accent, '--preset-b': preset.accent2 }" /><span><strong>{{ preset.name }}</strong><small>{{ preset.description }}</small></span></button></div></div>
          <div class="inspector-section"><div class="section-title"><div><span class="eyebrow">TOKENS</span><h3>{{ manifest.type === 'theme' ? '界面参数' : '插件入口' }}</h3></div><Layers3 /></div>
            <template v-if="manifest.type === 'theme'">
              <label class="color-control"><span>主强调色</span><input v-model="tokens.accent" type="color" @change="applyThemeControls"><code>{{ tokens.accent }}</code></label><label class="color-control"><span>辅助强调色</span><input v-model="tokens.accent2" type="color" @change="applyThemeControls"><code>{{ tokens.accent2 }}</code></label><label class="color-control"><span>主背景</span><input v-model="tokens.surface2" type="color" @change="applyThemeControls"><code>{{ tokens.surface2 }}</code></label>
              <label class="range-control"><span><b>玻璃模糊</b><output>{{ tokens.blur }}px</output></span><input v-model.number="tokens.blur" type="range" min="0" max="42" @input="applyThemeControls"></label><label class="range-control"><span><b>圆角半径</b><output>{{ tokens.radius }}px</output></span><input v-model.number="tokens.radius" type="range" min="0" max="22" @input="applyThemeControls"></label><label class="range-control"><span><b>侧边栏宽度</b><output>{{ tokens.sidebarWidth }}px</output></span><input v-model.number="tokens.sidebarWidth" type="range" min="180" max="300" @input="applyThemeControls"></label><label class="range-control"><span><b>表面不透明度</b><output>{{ Math.round(tokens.opacity * 100) }}%</output></span><input v-model.number="tokens.opacity" type="range" min="0.55" max="1" step="0.01" @input="applyThemeControls"></label>
               <button class="sync-code-button" type="button" @click="applyThemeControls(true)"><Code2 />同步到 theme.css</button>
            </template>
            <template v-else><p class="inspector-note">插件从 <code>plugin.js</code> 的 <code>activate(api)</code> 开始运行。返回函数即可在停用时撤销 DOM、事件和定时器。</p><button class="sync-code-button" type="button" @click="selectedFile = 'plugin.js'"><Code2 />编辑插件入口</button></template>
          </div>
        </div>

         <div v-else-if="activeInspector === 'interface'" class="inspector-content">
           <div class="interface-heading"><div><span class="eyebrow">UI SURFACES</span><h3>整页界面规则</h3></div><button class="icon-action" type="button" title="添加自定义 UI 区域" @click="addUiRule"><Plus /></button></div>
           <p class="inspector-note">每条规则对应播放器中的一组选择器。可以逐层改变窗口、卡片、按钮和状态，底部代码区仍可继续写任意 CSS。</p>
           <div class="ui-rule-list">
             <article v-for="(rule, index) in uiRules" :key="rule.id" class="ui-rule-card" :class="{ disabled: !rule.enabled }">
               <header><div><strong>{{ rule.name }}</strong><small>{{ rule.enabled ? '实时同步' : '已停用' }}</small></div><button class="icon-action remove-rule" type="button" title="移除规则" @click="removeUiRule(index)"><X /></button></header>
               <label class="field-control"><span>CSS 选择器</span><input v-model="rule.selector" type="text" placeholder=".my-component" /></label>
               <div class="ui-rule-colors"><label class="color-control"><span>表面</span><input v-model="rule.background" type="color"><code>{{ rule.background }}</code></label><label class="color-control"><span>文字</span><input v-model="rule.textColor" type="color"><code>{{ rule.textColor }}</code></label><label class="color-control"><span>边框</span><input v-model="rule.borderColor" type="color"><code>{{ rule.borderColor }}</code></label></div>
               <label class="range-control"><span><b>圆角</b><output>{{ rule.radius }}px</output></span><input v-model.number="rule.radius" type="range" min="0" max="28"></label><label class="range-control"><span><b>模糊</b><output>{{ rule.blur }}px</output></span><input v-model.number="rule.blur" type="range" min="0" max="36"></label><label class="range-control"><span><b>阴影</b><output>{{ rule.shadow }}px</output></span><input v-model.number="rule.shadow" type="range" min="0" max="42"></label><label class="range-control"><span><b>不透明度</b><output>{{ Math.round(rule.opacity * 100) }}%</output></span><input v-model.number="rule.opacity" type="range" min="0.45" max="1" step="0.01"></label>
               <label class="ui-rule-toggle"><input v-model="rule.enabled" type="checkbox"><span>启用这条规则</span></label>
             </article>
           </div>
         </div>

         <div v-else class="inspector-content"><div class="inspector-section"><div class="section-title"><div><span class="eyebrow">MANIFEST</span><h3>扩展信息</h3></div><Settings2 /></div><label class="field-control"><span>显示名称</span><input v-model="manifest.name" type="text" placeholder="我的扩展" /></label><label class="field-control"><span>唯一 ID</span><input v-model="manifest.id" type="text" placeholder="nightwave.my-extension" /></label><div class="field-row"><label class="field-control"><span>版本</span><input v-model="manifest.version" type="text" placeholder="1.0.0" /></label><label class="field-control"><span>作者</span><input v-model="manifest.author" type="text" placeholder="作者" /></label></div><label class="field-control"><span>描述</span><textarea v-model="manifest.description" rows="3" placeholder="扩展用途" /></label></div><div class="manifest-preview"><span>导出 manifest.json</span><pre>{{ files['manifest.json'] }}</pre></div></div>
      </aside>
    </main>

      <section class="preview-dock"><div class="preview-heading"><div><span class="eyebrow">LIVE PREVIEW</span><h2>Nightwave UI</h2></div><span class="preview-state"><i />实时</span></div><div id="preview" class="preview-shell" :style="[previewVars, previewRuleStyle('canvas')]"><aside class="preview-sidebar" :style="previewRuleStyle('sidebar')"><div class="preview-brand"><span class="brand-mark"><i /><i /><i /><i /></span><strong>NIGHTWAVE</strong></div><span class="preview-caption">音乐库</span><div class="preview-nav active" :style="previewRuleStyle('active')"><Layers3 />所有音乐 <b>24</b></div><div class="preview-nav"><Palette />我的喜欢</div><div class="preview-nav"><Settings2 />最近播放</div><div class="preview-spacer" /><div class="preview-library"><small>当前资料库</small><strong>本地资料库</strong></div></aside><div class="preview-main" :style="previewRuleStyle('surface')"><div class="preview-top" :style="previewRuleStyle('topbar')"><div><span>LOCAL COLLECTION</span><strong>所有音乐</strong></div><div class="preview-search">搜索音乐</div></div><div class="preview-content"><div class="preview-cover"><div class="preview-disc" /><span>NOW PLAYING</span><strong>Midnight Drive</strong><small>Nightwave · Local collection</small></div><div class="preview-lyrics"><span>同步歌词</span><strong>we are still awake</strong><b>under the city lights</b><small>the night is ours tonight</small><i /></div><div class="preview-eq-mini" :style="previewRuleStyle('equalizer')"><span>EQ</span><i /><i /><i /><i /><i /><b>参数均衡器</b></div></div><div class="preview-player" :style="previewRuleStyle('player')"><div class="preview-track"><i /><span><b>Midnight Drive</b><small>Nightwave</small></span></div><div class="preview-controls"><b>‹</b><button :style="previewRuleStyle('action')"><Play /></button><b>›</b></div><div class="preview-progress"><i /></div></div></div></div></section>
    <div v-if="notice" class="editor-notice"><Check />{{ notice }}</div>
  </div>
</template>
