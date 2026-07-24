<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Check, ChevronDown, CircleAlert, ExternalLink, FolderOpen, Package, Play, RefreshCw, Terminal, X,
} from '@lucide/vue';

const desktop = window.nightwaveDesktop;
const rootDirectory = ref('');
const destinationDirectory = ref('');
const projects = ref([]);
const selectedIds = ref([]);
const projectStates = ref({});
const logs = ref([]);
const isScanning = ref(false);
const isPackaging = ref(false);
const notice = ref('');
const errorMessage = ref('');
const session = ref({ current: 0, total: 0, status: 'idle' });
let removeProgressListener = null;

const selectedProjects = computed(() => projects.value.filter((project) => selectedIds.value.includes(project.id)));
const allSelected = computed(() => projects.value.length > 0 && selectedProjects.value.length === projects.value.length);
const canOperate = computed(() => Boolean(desktop?.pickPackagerDirectory && desktop?.scanPackagerProjects && desktop?.runPackager));

function setNotice(message) {
  notice.value = message;
  window.setTimeout(() => { if (notice.value === message) notice.value = ''; }, 3000);
}

function addLog(line, kind = 'normal') {
  logs.value = [...logs.value, { id: `${Date.now()}-${Math.random()}`, text: line, kind }].slice(-260);
}

function projectState(project) {
  return projectStates.value[project.id] || 'ready';
}

function toggleProject(project) {
  if (isPackaging.value) return;
  selectedIds.value = selectedIds.value.includes(project.id)
    ? selectedIds.value.filter((id) => id !== project.id)
    : [...selectedIds.value, project.id];
}

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : projects.value.map((project) => project.id);
}

async function chooseRoot() {
  if (!canOperate.value || isPackaging.value) return;
  const result = await desktop.pickPackagerDirectory({ kind: 'root', defaultPath: rootDirectory.value });
  if (result?.canceled) return;
  rootDirectory.value = result.path;
  await scanProjects();
}

async function chooseDestination() {
  if (!canOperate.value || isPackaging.value) return;
  const result = await desktop.pickPackagerDirectory({ kind: 'destination', defaultPath: destinationDirectory.value || rootDirectory.value });
  if (!result?.canceled) destinationDirectory.value = result.path;
}

async function scanProjects() {
  if (!rootDirectory.value || !canOperate.value) return;
  isScanning.value = true;
  errorMessage.value = '';
  projects.value = [];
  selectedIds.value = [];
  projectStates.value = {};
  logs.value = [];
  addLog(`扫描目录：${rootDirectory.value}`, 'muted');
  try {
    projects.value = await desktop.scanPackagerProjects(rootDirectory.value);
    selectedIds.value = projects.value.map((project) => project.id);
    addLog(`识别到 ${projects.value.length} 个可打包项目`, projects.value.length ? 'success' : 'muted');
    if (!projects.value.length) setNotice('没有找到可生成 exe 的 Vue / Electron 项目');
  } catch (error) {
    errorMessage.value = error.message || '项目扫描失败';
    addLog(errorMessage.value, 'error');
  } finally {
    isScanning.value = false;
  }
}

function handleProgress(progress) {
  if (progress.type === 'session') {
    session.value = { current: progress.status === 'complete' ? progress.total : 0, total: progress.total || 0, status: progress.status };
    if (progress.status === 'start') addLog(`开始打包，输出目录：${progress.destinationDirectory}`, 'accent');
    if (progress.status === 'complete') addLog('全部任务完成，正在打开资源管理器', 'success');
    return;
  }
  if (progress.type === 'log') {
    addLog(`[${progress.projectId}] ${progress.line}`);
    return;
  }
  if (progress.type === 'project') {
    projectStates.value = { ...projectStates.value, [progress.projectId]: progress.status };
    if (progress.status === 'start') addLog(`开始：${progress.projectName}`, 'accent');
    if (progress.status === 'complete') {
      session.value = { ...session.value, current: progress.index + 1 };
      addLog(`${progress.projectName} 完成，发现 ${progress.executables?.length || 0} 个 exe`, 'success');
    }
    if (progress.status === 'error') addLog(`${progress.projectName} 打包失败`, 'error');
  }
}

async function packageSelected() {
  if (isPackaging.value || !selectedProjects.value.length) return;
  if (!rootDirectory.value || !destinationDirectory.value) {
    setNotice('请先选择项目目录和输出目录');
    return;
  }
  isPackaging.value = true;
  errorMessage.value = '';
  projectStates.value = {};
  session.value = { current: 0, total: selectedProjects.value.length, status: 'running' };
  try {
    await desktop.runPackager({
      rootDirectory: rootDirectory.value,
      destinationDirectory: destinationDirectory.value,
      projectIds: selectedIds.value,
    });
    session.value = { ...session.value, status: 'complete', current: selectedProjects.value.length };
    setNotice('打包完成，资源管理器已打开');
  } catch (error) {
    errorMessage.value = error.message || '打包失败';
    session.value = { ...session.value, status: 'error' };
    addLog(errorMessage.value, 'error');
  } finally {
    isPackaging.value = false;
  }
}

function stateLabel(state) {
  if (state === 'start') return '打包中';
  if (state === 'complete') return '完成';
  if (state === 'error') return '失败';
  return '待打包';
}

onMounted(() => {
  if (desktop?.onPackagerProgress) removeProgressListener = desktop.onPackagerProgress(handleProgress);
});

onBeforeUnmount(() => removeProgressListener?.());
</script>

<template>
  <div class="packager-app">
    <header class="packager-header">
      <div class="packager-brand"><span class="brand-symbol"><i /><i /><i /><i /></span><div><strong>NIGHTWAVE</strong><small>BUILD LAB</small></div></div>
      <div class="header-state" :class="`state-${session.status}`"><i />{{ isPackaging ? `正在处理 ${session.current}/${session.total}` : '本地构建工具' }}</div>
    </header>

    <main class="packager-main">
      <section class="packager-intro"><div><span class="eyebrow">MULTI PROJECT PACKAGING</span><h1>快速生成 Windows 安装包</h1><p>扫描一个工作目录，自动找出可打包的 Vue / Electron 项目，按项目分别输出 exe。</p></div><Package class="intro-icon" /></section>

      <section v-if="!canOperate" class="desktop-required"><CircleAlert /><div><strong>请在 Nightwave 桌面版中打开</strong><span>目录选择和 Electron Builder 需要本地文件系统权限。</span></div></section>

      <section class="path-grid">
        <div class="path-field"><div class="path-label"><span>项目扫描范围</span><small>{{ projects.length }} 个可打包项目</small></div><div class="path-control"><FolderOpen /><input :value="rootDirectory || '选择包含多个项目的文件夹'" readonly><button type="button" :disabled="!canOperate || isPackaging" @click="chooseRoot">选择目录</button></div></div>
        <div class="path-field"><div class="path-label"><span>exe 输出位置</span><small>每个项目独立文件夹</small></div><div class="path-control"><FolderOpen /><input :value="destinationDirectory || '选择打包文件放置地'" readonly><button type="button" :disabled="!canOperate || isPackaging" @click="chooseDestination">选择目录</button></div></div>
      </section>

      <section class="project-section">
        <div class="section-heading"><div><span class="eyebrow">PROJECT QUEUE</span><h2>待打包项目</h2></div><div class="section-actions"><span>{{ selectedProjects.length }} / {{ projects.length }} 已选择</span><button type="button" :disabled="!projects.length || isPackaging" @click="toggleAll"><Check /><span>{{ allSelected ? '取消全选' : '全选项目' }}</span></button><button type="button" :disabled="!rootDirectory || isScanning || isPackaging" title="重新扫描" @click="scanProjects"><RefreshCw :class="{ spin: isScanning }" /></button></div></div>
        <div v-if="!projects.length" class="empty-projects"><Package /><strong>{{ isScanning ? '正在扫描项目' : '选择目录后开始识别' }}</strong><span>{{ isScanning ? '会自动跳过依赖和构建产物目录' : '支持嵌套的 Vue + Electron 项目' }}</span></div>
        <div v-else class="project-list"><article v-for="project in projects" :key="project.id" class="project-row" :class="{ selected: selectedIds.includes(project.id), [`project-${projectState(project)}`]: true }" @click="toggleProject(project)"><div class="project-check"><Check v-if="selectedIds.includes(project.id)" /></div><div class="project-copy"><div class="project-title"><h3>{{ project.name }}</h3><span>{{ project.framework }}</span><small>v{{ project.version }}</small></div><code>{{ project.relativePath || '项目根目录' }}</code><div class="project-command"><Terminal /><code>{{ project.command }}</code></div></div><div class="project-status"><span>{{ stateLabel(projectState(project)) }}</span><ChevronDown /></div></article></div>
      </section>

      <section class="console-section"><div class="section-heading"><div><span class="eyebrow">BUILD OUTPUT</span><h2>构建日志</h2></div><button v-if="logs.length" class="clear-log" type="button" title="清空日志" @click="logs = []"><X /></button></div><div class="build-console"><div v-if="!logs.length" class="console-empty"><Terminal /><span>构建命令输出会显示在这里</span></div><div v-for="log in logs" :key="log.id" class="log-line" :class="`log-${log.kind}`"><span class="log-prompt">›</span>{{ log.text }}</div></div></section>
    </main>

    <footer class="packager-footer"><div><span class="eyebrow">OUTPUT</span><strong>{{ destinationDirectory || '尚未选择输出目录' }}</strong></div><button class="build-button" type="button" :disabled="!canOperate || isPackaging || !selectedProjects.length || !destinationDirectory" @click="packageSelected"><RefreshCw v-if="isPackaging" class="spin" /><Play v-else /><span>{{ isPackaging ? '正在打包' : `打包 ${selectedProjects.length} 个项目` }}</span></button></footer>
    <div v-if="notice" class="packager-notice"><Check />{{ notice }}</div>
    <div v-if="errorMessage" class="packager-error"><CircleAlert />{{ errorMessage }}<button type="button" title="关闭" @click="errorMessage = ''"><X /></button></div>
  </div>
</template>
