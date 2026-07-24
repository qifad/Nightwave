<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ChevronDown, Disc3, FolderOpen, Gauge, Heart, Library, ListMusic, Maximize2, Minimize2,
  Package, Palette, Pause, Play, RefreshCw, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward,
  Puzzle, Settings, Sparkles, Volume1, Volume2, VolumeX, X,
} from '@lucide/vue';
import AudioExportDialog from './components/AudioExportDialog.vue';
import AudioVisualizer from './components/AudioVisualizer.vue';
import IconButton from './components/IconButton.vue';
import LyricsSearchDialog from './components/LyricsSearchDialog.vue';
import LyricsSaveDialog from './components/LyricsSaveDialog.vue';
import LyricsSettingsPanel from './components/LyricsSettingsPanel.vue';
import LyricsView from './components/LyricsView.vue';
import TrackActionMenu from './components/TrackActionMenu.vue';
import TrackList from './components/TrackList.vue';
import AppSettingsPage from './components/AppSettingsPage.vue';
import ExtensionsPage from './components/ExtensionsPage.vue';
import { collectDroppedFiles, createArtwork, filePath, fileStem, folderPath, formatTime, getExtension, isAudioFile, isImageFile, mediaKey, parseFileName, readId3, readLyrics } from './media';
import { decodeNcm } from './ncm';
import { pickMusicDirectory, saveBlobAs, writeToDirectory } from './fileAccess';
import { lyricsFromSearchResult, serializeLyrics } from './lyrics';
import { loadLyricSettings } from './lyricPresets';
import { loadEqSettings } from './eqSettings';
import { translateLyricLines } from './lyricsTranslate';
import { setVisualizerRuntime } from './visualizerRuntime';
import { disableExtension, enableExtension, enabledExtensionIds, parseExtensionZip } from './extensions';
import { getDecodedMedia, putDecodedMedia } from './mediaCache';

const DEFAULT_ART = createArtwork('Nightwave', 'Local sound');
const views = [
  { id: 'all', label: '所有音乐', icon: Library },
  { id: 'liked', label: '我的喜欢', icon: Heart },
  { id: 'recent', label: '最近播放', icon: RefreshCw },
];

function loadVolume() {
  try { const value = Number(localStorage.getItem('nightwave-volume') ?? 0.82); return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.82; } catch { return 0.82; }
}
function loadFavorites() {
  try { const value = JSON.parse(localStorage.getItem('nightwave-favorites') || '[]'); return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []); } catch { return new Set(); }
}
function persist(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } }
function loadJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } }

const inputRef = ref(null);
const audioRef = ref(null);
const tracks = ref([]);
const currentId = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(loadVolume());
const muted = ref(false);
const shuffle = ref(false);
const repeatMode = ref('off');
const favorites = ref(loadFavorites());
const recent = ref([]);
const activeView = ref('all');
const query = ref('');
const queueOpen = ref(false);
const immersive = ref(false);
const libraryName = ref('本地资料库');
const isImporting = ref(false);
const importProgress = ref({ processed: 0, total: 0, failed: 0 });
const dragging = ref(false);
const toast = ref('');
const actionMenu = ref(null);
const lyricsSearchId = ref(null);
const exportTrackId = ref(null);
const lyricsSettingsOpen = ref(false);
const lyricSettings = ref(loadLyricSettings());
const eqSettings = ref(loadEqSettings());
const analyser = ref(null);
const channelAnalysers = ref([]);
const settingsPageOpen = ref(false);
const extensionsPageOpen = ref(false);
const extensions = ref([]);
const activeThemeId = ref('');
const hasSavedExtensionState = localStorage.getItem('nightwave-enabled-extensions') !== null;
const savedEnabledExtensions = loadJson('nightwave-enabled-extensions', []);
const enabledExtensions = ref(new Set(Array.isArray(savedEnabledExtensions) ? savedEnabledExtensions.filter((id) => typeof id === 'string') : []));
const extensionsLoading = ref(false);
const isElectron = Boolean(window.nightwaveDesktop);
const dataUpdate = ref({ status: 'idle', currentVersion: '' });
const recentFolders = ref(loadJson('nightwave-recent-folders', []));
const recentFoldersOpen = ref(false);
const lyricsSavePreference = ref(loadJson('nightwave-lyrics-save-preference', 'ask'));
const lyricsSavePrompt = ref(null);
const userState = ref(loadJson('nightwave-user-state', null));
let objectUrls = new Set();
let audioGraph = null;
let importGeneration = 0;
let toastTimer = 0;
let userStateTimer = 0;
let eqPersistTimer = 0;
let eqAudioFrame = 0;
let dataUpdateTimer = 0;
const translationJobs = new Map();

const importProgressPercent = computed(() => importProgress.value.total ? Math.round((importProgress.value.processed / importProgress.value.total) * 100) : 0);

const currentIndex = computed(() => tracks.value.findIndex((track) => track.id === currentId.value));
const currentTrack = computed(() => currentIndex.value >= 0 ? tracks.value[currentIndex.value] : null);
const actionTrack = computed(() => tracks.value.find((track) => track.id === actionMenu.value?.trackId) || null);
const lyricsSearchTrack = computed(() => tracks.value.find((track) => track.id === lyricsSearchId.value) || null);
const exportTrack = computed(() => tracks.value.find((track) => track.id === exportTrackId.value) || null);
const visibleTracks = computed(() => {
  let result = tracks.value;
  if (activeView.value === 'liked') result = result.filter((track) => favorites.value.has(track.key));
  if (activeView.value === 'recent') result = recent.value.map((id) => tracks.value.find((track) => track.id === id)).filter(Boolean);
  const term = query.value.trim().toLocaleLowerCase();
   return term ? result.filter((track) => track.searchText?.includes(term) || `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(term)) : result;
});

watch([volume, muted], () => { if (audioRef.value) { audioRef.value.volume = volume.value; audioRef.value.muted = muted.value; } persist('nightwave-volume', String(volume.value)); });
watch(favorites, (value) => persist('nightwave-favorites', JSON.stringify([...value])), { deep: true });
watch(lyricSettings, (value) => persist('nightwave-lyric-settings', JSON.stringify(value)), { deep: true });
watch(eqSettings, scheduleEqUpdate, { deep: true });
watch(enabledExtensions, (value) => persist('nightwave-enabled-extensions', JSON.stringify([...value])), { deep: true });
watch(recentFolders, (value) => { persist('nightwave-recent-folders', JSON.stringify(value)); scheduleUserStateSave(); }, { deep: true });
watch(lyricsSavePreference, (value) => { persist('nightwave-lyrics-save-preference', value); scheduleUserStateSave(); });
watch([volume, favorites, lyricSettings, enabledExtensions, recent], scheduleUserStateSave, { deep: true });
watch(activeThemeId, scheduleUserStateSave);
function syncVisualizerRuntime() { setVisualizerRuntime(lyricSettings.value, analyser.value, channelAnalysers.value); }
watch(lyricSettings, syncVisualizerRuntime, { deep: true, immediate: true });
watch([analyser, channelAnalysers], syncVisualizerRuntime, { immediate: true });
watch(toast, (value) => { window.clearTimeout(toastTimer); if (value) toastTimer = window.setTimeout(() => { toast.value = ''; }, 2600); });
watch(currentTrack, (track) => {
  if (!track || !('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: [{ src: track.cover, sizes: '512x512' }] });
  navigator.mediaSession.setActionHandler('play', togglePlay);
  navigator.mediaSession.setActionHandler('pause', togglePlay);
  navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  navigator.mediaSession.setActionHandler('seekto', ({ seekTime }) => seekTo(seekTime));
});
watch([currentTrack, () => lyricSettings.value.autoTranslate], ([track, enabled]) => {
  if (enabled && track) translateTrack(track);
});

function notify(message) { toast.value = message; }
async function checkDataUpdate(silent = false) {
  if (!window.nightwaveDesktop?.checkDataUpdate) return;
  dataUpdate.value = { ...dataUpdate.value, status: 'checking' };
  try {
    const result = await window.nightwaveDesktop.checkDataUpdate();
    dataUpdate.value = result;
    if (result.status === 'updated') {
      notify(`已下载 v${result.remoteVersion}，正在刷新`);
      window.setTimeout(() => window.location.reload(), 800);
    } else if (!silent && result.status === 'up-to-date') {
      notify(`当前已是 v${result.currentVersion}`);
    } else if (!silent && result.status === 'unavailable') {
      notify(result.error || '暂时无法检查更新');
    }
  } catch (error) {
    dataUpdate.value = { ...dataUpdate.value, status: 'unavailable', error: error.message || '暂时无法检查更新' };
    if (!silent) notify(dataUpdate.value.error);
  }
}
function scheduleEqUpdate() {
  if (!eqAudioFrame) {
    eqAudioFrame = requestAnimationFrame(() => {
      eqAudioFrame = 0;
      reconnectAudioFilters();
    });
  }
  window.clearTimeout(eqPersistTimer);
  eqPersistTimer = window.setTimeout(() => {
    persist('nightwave-eq-settings', JSON.stringify(eqSettings.value));
    scheduleUserStateSave();
  }, 220);
}
function coverStyle(url) { return { backgroundImage: `url("${url || ''}")` }; }
function revokeUrls(urls) { urls.forEach((url) => URL.revokeObjectURL(url)); }
function buildUserState() {
  return {
    version: 1,
    volume: volume.value,
    muted: muted.value,
    shuffle: shuffle.value,
    repeatMode: repeatMode.value,
    favorites: [...favorites.value],
    recentTracks: recent.value.slice(0, 50),
    lyricSettings: lyricSettings.value,
    eqSettings: eqSettings.value,
    enabledExtensions: [...enabledExtensions.value],
    activeThemeId: activeThemeId.value,
    recentFolders: recentFolders.value,
    lyricsSavePreference: lyricsSavePreference.value,
    updatedAt: Date.now(),
  };
}
function scheduleUserStateSave() {
  const snapshot = buildUserState();
  userState.value = snapshot;
  persist('nightwave-user-state', JSON.stringify(snapshot));
  window.clearTimeout(userStateTimer);
  userStateTimer = window.setTimeout(() => {
    const request = window.nightwaveDesktop?.saveUserState?.(snapshot);
    request?.catch?.(() => {});
  }, 700);
}
async function loadDesktopUserState() {
  let stored = null;
  try { stored = await window.nightwaveDesktop?.loadUserState?.(); } catch { stored = null; }
  if (!stored || stored.version !== 1) return;
  userState.value = stored;
  if (Number.isFinite(stored.volume)) volume.value = Math.max(0, Math.min(1, stored.volume));
  if (typeof stored.muted === 'boolean') muted.value = stored.muted;
  if (typeof stored.shuffle === 'boolean') shuffle.value = stored.shuffle;
  if (['off', 'all', 'one'].includes(stored.repeatMode)) repeatMode.value = stored.repeatMode;
  if (Array.isArray(stored.favorites)) favorites.value = new Set(stored.favorites.filter((item) => typeof item === 'string'));
  if (Array.isArray(stored.recentTracks)) recent.value = stored.recentTracks.filter((item) => typeof item === 'string').slice(0, 50);
  if (stored.lyricSettings && typeof stored.lyricSettings === 'object') lyricSettings.value = { ...lyricSettings.value, ...stored.lyricSettings };
  if (stored.eqSettings && typeof stored.eqSettings === 'object') eqSettings.value = { ...eqSettings.value, ...stored.eqSettings, bands: Array.isArray(stored.eqSettings.bands) ? stored.eqSettings.bands : eqSettings.value.bands };
  if (Array.isArray(stored.enabledExtensions)) enabledExtensions.value = new Set(stored.enabledExtensions.filter((item) => typeof item === 'string'));
  if (typeof stored.activeThemeId === 'string') activeThemeId.value = stored.activeThemeId;
  if (Array.isArray(stored.recentFolders)) recentFolders.value = stored.recentFolders.slice(0, 8);
  if (['ask', 'always', 'never'].includes(stored.lyricsSavePreference)) lyricsSavePreference.value = stored.lyricsSavePreference;
}
function rememberFolder(folderPath, name) {
  if (!folderPath && !name) return;
  const key = folderPath || name;
  recentFolders.value = [{ path: folderPath || '', name: name || folderPath, lastOpenedAt: Date.now() }, ...recentFolders.value.filter((item) => (item.path || item.name) !== key)].slice(0, 8);
}
function fileRecordsToFiles(records, rootPath) {
  return (records || []).map((record) => {
    const relativePath = String(record.relativePath || record.name).replaceAll('\\', '/');
    const sourcePath = record.path || `${rootPath}/${relativePath}`;
    return {
      name: record.name,
      type: record.type || '',
      size: record.size || 0,
      lastModified: record.lastModified || Date.now(),
      _nightwavePath: sourcePath,
      _nightwaveDirectoryPath: record.directoryPath || sourcePath.slice(0, Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'))),
      _nightwaveDesktopPath: record.path || '',
      _nightwaveMediaUrl: record.mediaUrl || '',
    };
  });
}
function mediaCacheKey(file, lrcFile) {
  return `${filePath(file)}|${file.size}|${file.lastModified}|${lrcFile?.size || 0}|${lrcFile?.lastModified || 0}`;
}
async function decodeDesktopNcm(file, urls) {
  const decoded = await window.nightwaveDesktop.decodeNcm(file._nightwaveDesktopPath);
  const audio = new Blob([decoded.audio], { type: decoded.audioType });
  const coverBlob = decoded.cover?.byteLength ? new Blob([decoded.cover], { type: decoded.coverType }) : null;
  const cover = coverBlob ? URL.createObjectURL(coverBlob) : null;
  if (cover) urls.add(cover);
  return { audio, cover, coverBlob, format: decoded.format, metadata: decoded.metadata || {} };
}
function persistExtensionCatalog() { persist('nightwave-extensions', JSON.stringify(extensions.value)); }
function extensionApi() {
  return { notify, openSettings: () => { settingsPageOpen.value = true; }, openEditor: openExtensionEditor };
}
async function toggleExtension(extension) {
  const id = extension?.manifest?.id;
  if (!id) return;
  if (enabledExtensions.value.has(id)) {
    disableExtension(id);
    enabledExtensions.value = new Set([...enabledExtensions.value].filter((item) => item !== id));
    if (activeThemeId.value === id) {
      activeThemeId.value = '';
      persist('nightwave-active-theme', '');
    }
    notify(`已停用：${extension.manifest.name}`);
    return;
  }
  if (extension.manifest.type === 'theme') {
    const currentTheme = extensions.value.find((item) => item.manifest.type === 'theme' && enabledExtensions.value.has(item.manifest.id));
    if (currentTheme) {
      disableExtension(currentTheme.manifest.id);
      enabledExtensions.value = new Set([...enabledExtensions.value].filter((item) => item !== currentTheme.manifest.id));
      if (activeThemeId.value === currentTheme.manifest.id) {
        activeThemeId.value = '';
        persist('nightwave-active-theme', '');
      }
    }
  }
  try {
    await enableExtension(extension, extensionApi());
    enabledExtensions.value = new Set([...enabledExtensions.value, id]);
    if (extension.manifest.type === 'theme') {
      activeThemeId.value = id;
      persist('nightwave-active-theme', id);
    }
    notify(`已启用：${extension.manifest.name}`);
  } catch (error) {
    notify(error.message || '扩展启用失败');
  }
}
async function installExtension(source) {
  if (!source) return;
  try {
    const extension = await parseExtensionZip(source);
    const wasEnabled = enabledExtensions.value.has(extension.manifest.id);
    if (wasEnabled) {
      disableExtension(extension.manifest.id);
      enabledExtensions.value = new Set([...enabledExtensions.value].filter((item) => item !== extension.manifest.id));
      if (activeThemeId.value === extension.manifest.id) {
        activeThemeId.value = '';
        persist('nightwave-active-theme', '');
      }
    }
    extensions.value = [...extensions.value.filter((item) => item.manifest.id !== extension.manifest.id), extension];
    persistExtensionCatalog();
    notify(wasEnabled ? `已更新扩展：${extension.manifest.name}` : `已安装扩展：${extension.manifest.name}`);
    await toggleExtension(extension);
  } catch (error) {
    notify(error.message || '扩展安装失败');
  }
}
async function loadRootExtensions() {
  extensionsLoading.value = true;
  try {
    const storedExtensions = loadJson('nightwave-extensions', []);
    const extensionMap = new Map(Array.isArray(storedExtensions) ? storedExtensions.map((item) => [item.manifest?.id, item]) : []);
    const rootExtensions = window.nightwaveDesktop?.listExtensions ? await window.nightwaveDesktop.listExtensions() : [];
    for (const item of rootExtensions || []) {
      try {
        const extension = await parseExtensionZip(new Uint8Array(item.bytes));
        extension.sourceName = item.name || extension.sourceName;
        extensionMap.set(extension.manifest.id, extension);
      } catch { /* Skip one invalid extension without blocking the library. */ }
    }
    extensions.value = [...extensionMap.values()].filter((item) => item?.manifest?.id);
    const savedTheme = localStorage.getItem('nightwave-active-theme');
    const availableIds = new Set(extensions.value.map((extension) => extension.manifest.id));
    for (const id of enabledExtensionIds()) if (!availableIds.has(id)) disableExtension(id);
    const requestedIds = new Set([...enabledExtensions.value].filter((id) => availableIds.has(id)));
    if (!hasSavedExtensionState && !requestedIds.size && savedTheme && availableIds.has(savedTheme)) requestedIds.add(savedTheme);
    const selectedTheme = extensions.value.find((extension) => extension.manifest.type === 'theme' && extension.manifest.id === savedTheme && requestedIds.has(extension.manifest.id))
      || extensions.value.find((extension) => extension.manifest.type === 'theme' && requestedIds.has(extension.manifest.id));
    const nextEnabled = new Set();
    for (const extension of extensions.value) {
      if (!requestedIds.has(extension.manifest.id)) continue;
      if (extension.manifest.type === 'theme' && extension.manifest.id !== selectedTheme?.manifest.id) continue;
      try {
        await enableExtension(extension, extensionApi());
        nextEnabled.add(extension.manifest.id);
      } catch { /* Ignore one broken extension while restoring the remaining catalog. */ }
    }
    enabledExtensions.value = nextEnabled;
    const theme = extensions.value.find((item) => item.manifest.id === selectedTheme?.manifest.id && nextEnabled.has(item.manifest.id));
    activeThemeId.value = theme?.manifest.id || '';
    persist('nightwave-active-theme', theme?.manifest.id || '');
    persistExtensionCatalog();
  } finally {
    extensionsLoading.value = false;
  }
}
async function refreshExtensions() { await loadRootExtensions(); notify(`已扫描 ${extensions.value.length} 个扩展`); }
function encodeEditorSeed(extension) {
  const bytes = new TextEncoder().encode(JSON.stringify(extension));
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function openExtensionEditor(extension) {
  if (!extension) return;
  const seed = encodeEditorSeed(extension);
  extensionsPageOpen.value = false;
  if (window.nightwaveDesktop?.openEditor) {
    window.nightwaveDesktop.openEditor({ seed });
    return;
  }
  window.open(`http://127.0.0.1:5174/?seed=${seed}`, '_blank', 'noopener');
}

function openPackager() {
  if (window.nightwaveDesktop?.openPackager) {
    window.nightwaveDesktop.openPackager();
    return;
  }
  window.open('http://127.0.0.1:5175/', '_blank', 'noopener');
}

async function importFiles(fileList, selectedLibraryName = '', selectedDirectoryPath = '') {
  if (isImporting.value) return;
  const generation = ++importGeneration;
  const nextUrls = new Set();
  const files = [...fileList];
  const audioFiles = files.filter(isAudioFile);
  if (!audioFiles.length) { importProgress.value = { processed: 0, total: 0, failed: 0 }; notify('没有找到可播放的音频文件'); return; }
  isImporting.value = true;
  importProgress.value = { processed: 0, total: audioFiles.length, failed: 0 };
  isPlaying.value = false;
  audioRef.value?.pause();
  revokeUrls(objectUrls);
  objectUrls = new Set();
  const lrcByPath = new Map();
  const lrcByStem = new Map();
  const imageByPath = new Map();
  const folderCovers = new Map();
  for (const file of files) {
    const path = filePath(file);
    if (getExtension(file.name) === 'lrc') {
      const stem = fileStem(path).toLocaleLowerCase();
      lrcByPath.set(mediaKey(path), file);
      lrcByStem.set(stem, [...(lrcByStem.get(stem) || []), file]);
    }
    if (isImageFile(file)) {
      imageByPath.set(mediaKey(path), file);
      if (/^(cover|folder|front|album)$/i.test(fileStem(path))) folderCovers.set(folderPath(path).toLocaleLowerCase(), file);
    }
  }
  const imageUrls = new Map();
  const getImageUrl = (file) => {
    if (!file) return null;
    if (file._nightwaveMediaUrl) return file._nightwaveMediaUrl;
    if (!imageUrls.has(file)) { const url = URL.createObjectURL(file); nextUrls.add(url); imageUrls.set(file, url); }
    return imageUrls.get(file);
  };
  const nextTracks = new Array(audioFiles.length);
  const metadataJobs = [];
  let failedNcmCount = 0;
  let nextIndex = 0;
  async function processFile(file, index) {
    try {
      const path = filePath(file);
      const parsedName = parseFileName(file.name);
      const stemFallback = lrcByStem.get(fileStem(path).toLocaleLowerCase()) || [];
      const lrcFile = lrcByPath.get(mediaKey(path)) || (stemFallback.length === 1 ? stemFallback[0] : null);
      const cacheKey = mediaCacheKey(file, lrcFile);
      let playableFile = file;
      let ncm = null;
      if (getExtension(file.name) === 'ncm') {
        const cached = await getDecodedMedia(cacheKey);
        if (cached?.audioBlob && cached.metadata) {
          const cover = cached.coverBlob ? URL.createObjectURL(cached.coverBlob) : null;
          if (cover) nextUrls.add(cover);
          ncm = { audio: cached.audioBlob, cover, coverBlob: cached.coverBlob || null, format: cached.format, metadata: cached.metadata };
        } else {
          ncm = file._nightwaveDesktopPath && window.nightwaveDesktop?.decodeNcm
            ? await decodeDesktopNcm(file, nextUrls)
            : await decodeNcm(file, nextUrls);
          void putDecodedMedia({ key: cacheKey, audioBlob: ncm.audio, coverBlob: ncm.coverBlob, format: ncm.format, metadata: ncm.metadata });
        }
        playableFile = new File([ncm.audio], `${fileStem(file.name)}.${ncm.format}`, { type: ncm.audio.type, lastModified: file.lastModified });
      }
      const lyrics = await readLyrics(lrcFile);
      const siblingCover = imageByPath.get(mediaKey(path));
      const folderCover = folderCovers.get(folderPath(path).toLocaleLowerCase());
      const title = ncm?.metadata.title || lyrics.metadata.ti || parsedName.title;
      const artist = ncm?.metadata.artist || lyrics.metadata.ar || parsedName.artist || '未知艺术家';
      const album = ncm?.metadata.album || lyrics.metadata.al || folderPath(path).split('/').pop() || '本地音乐';
      const src = ncm ? URL.createObjectURL(playableFile) : file._nightwaveMediaUrl || URL.createObjectURL(playableFile);
      if (!file._nightwaveMediaUrl || ncm) nextUrls.add(src);
      const track = { id: `${path}-${file.size}-${file.lastModified}`, key: path.toLocaleLowerCase(), searchText: `${title} ${artist} ${album}`.toLocaleLowerCase(), path, title, artist, album, cover: ncm?.cover || getImageUrl(siblingCover) || getImageUrl(folderCover) || createArtwork(title, artist), coverBlob: ncm?.coverBlob || null, lyrics, src, playbackBlob: ncm || !file._nightwaveMediaUrl ? playableFile : null, sourceFile: file, sourceKind: ncm ? 'ncm' : 'audio', format: ncm?.format || getExtension(file.name), parentHandle: file._directoryHandle || null, sourceDirectory: file._nightwaveDirectoryPath || selectedDirectoryPath || '', duration: ncm?.metadata.duration || 0 };
      nextTracks[index] = track;
      if (!ncm) metadataJobs.push({ file, track, title, artist, album });
    } catch {
      if (getExtension(file.name) === 'ncm') failedNcmCount += 1;
    } finally {
      importProgress.value = { processed: importProgress.value.processed + 1, total: audioFiles.length, failed: failedNcmCount };
    }
  }
  const workerCount = Math.min(audioFiles.length, Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < audioFiles.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (generation !== importGeneration) return;
      await processFile(audioFiles[index], index);
    }
  }));
  if (generation !== importGeneration) { revokeUrls(nextUrls); return; }
  const validTracks = nextTracks.filter(Boolean);
  if (!validTracks.length) { isImporting.value = false; notify(failedNcmCount ? 'NCM 文件无法解析或格式不受支持' : '没有找到可播放的音频文件'); return; }
  validTracks.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
  objectUrls = nextUrls;
  tracks.value = validTracks;
  currentId.value = validTracks[0].id;
  currentTime.value = 0;
  duration.value = 0;
  recent.value = [];
  activeView.value = 'all';
  libraryName.value = selectedLibraryName || (filePath(audioFiles[0]).split('/')[0] || '本地资料库');
  rememberFolder(selectedDirectoryPath, libraryName.value);
  isImporting.value = false;
  notify(failedNcmCount ? `已载入 ${validTracks.length} 首，${failedNcmCount} 个 NCM 解析失败` : `已载入 ${validTracks.length} 首音乐`);
  void hydrateTrackMetadata(metadataJobs, generation);
}

async function hydrateTrackMetadata(jobs, generation) {
  let nextIndex = 0;
  const workerCount = Math.min(2, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < jobs.length && generation === importGeneration) {
      const job = jobs[nextIndex];
      nextIndex += 1;
      const urls = new Set();
      try {
        const embedded = await readId3(job.file, urls);
        if (generation !== importGeneration) { revokeUrls(urls); return; }
        urls.forEach((url) => objectUrls.add(url));
        if (!embedded.title && !embedded.artist && !embedded.album && !embedded.cover) continue;
        const title = embedded.title || job.title;
        const artist = embedded.artist || job.artist;
        const album = embedded.album || job.album;
        tracks.value = tracks.value.map((track) => track.id === job.track.id ? {
          ...track,
          title,
          artist,
          album,
          cover: embedded.cover || track.cover,
          searchText: `${title} ${artist} ${album}`.toLocaleLowerCase(),
        } : track);
      } catch {
        revokeUrls(urls);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }));
}

async function openFolder() {
  if (isImporting.value) return;
  recentFoldersOpen.value = false;
  if (window.nightwaveDesktop?.pickMusicDirectory) {
    try {
      const selection = await window.nightwaveDesktop.pickMusicDirectory();
      if (selection?.canceled) return;
      await importFiles(fileRecordsToFiles(selection.files, selection.path), selection.name, selection.path);
      return;
    } catch (error) {
      notify(error.message || '音乐文件夹读取失败');
      return;
    }
  }
  if (window.showDirectoryPicker) {
    try { const selection = await pickMusicDirectory(); if (selection) { rememberFolder('', selection.name); await importFiles(selection.files, selection.name); } return; }
    catch (error) { if (error.name === 'AbortError') return; notify('目录授权不可用，已切换到普通文件夹选择'); }
  }
  inputRef.value?.click();
}
async function openRecentFolder(folder) {
  if (!folder?.path || !window.nightwaveDesktop?.readMusicDirectory) {
    notify('最近目录需要在桌面版中重新读取');
    return;
  }
  try {
    const selection = await window.nightwaveDesktop.readMusicDirectory(folder.path);
    await importFiles(fileRecordsToFiles(selection.files, selection.path), selection.name, selection.path);
    recentFoldersOpen.value = false;
  } catch (error) {
    recentFolders.value = recentFolders.value.filter((item) => item.path !== folder.path);
    notify(error.message || '最近目录已不可用');
  }
}
async function handleDrop(event) {
  event.preventDefault(); dragging.value = false;
  if (!isImporting.value) { try { await importFiles(await collectDroppedFiles(event.dataTransfer)); } catch { notify('文件夹读取失败，请重新选择'); } }
}
function configureEqFilter(filter, band, context) {
  filter.type = ['lowshelf', 'highshelf', 'lowpass', 'highpass', 'bandpass', 'notch', 'peaking'].includes(band.type) ? band.type : 'peaking';
  filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, Number(band.frequency) || 1000)), context.currentTime, 0.012);
  filter.Q.setTargetAtTime(Math.max(0.1, Math.min(18, Number(band.q) || 1)), context.currentTime, 0.012);
  filter.gain.setTargetAtTime(Math.max(-12, Math.min(12, Number(band.gain) || 0)), context.currentTime, 0.012);
}
function reconnectAudioFilters() {
  if (!audioGraph) return;
  const { source, context, analyser: nextAnalyser, splitter } = audioGraph;
  const enabledBands = eqSettings.value.enabled ? eqSettings.value.bands.filter((band) => band.enabled !== false) : [];
  const topology = `${eqSettings.value.enabled}|${enabledBands.map((band) => `${band.id}:${band.type}`).join('|')}`;
  if (audioGraph.eqTopology === topology) {
    enabledBands.forEach((band) => configureEqFilter(audioGraph.filters.get(band.id), band, context));
    return;
  }
  try { source.disconnect(); } catch { /* Audio graph may already be closing. */ }
  audioGraph.filters?.forEach((filter) => { try { filter.disconnect(); } catch { /* Ignore a disconnected filter. */ } });
  const filters = new Map(enabledBands.map((band) => {
    const filter = context.createBiquadFilter();
    configureEqFilter(filter, band, context);
    return [band.id, filter];
  }));
  let output = source;
  enabledBands.forEach((band) => { const filter = filters.get(band.id); output.connect(filter); output = filter; });
  output.connect(nextAnalyser);
  output.connect(splitter);
  audioGraph.filters = filters;
  audioGraph.eqTopology = topology;
}
async function ensureAudioGraph() {
  const audio = audioRef.value;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!audio || !Context) return null;
  if (!audioGraph) {
    try {
      const context = new Context();
      const source = context.createMediaElementSource(audio);
      const nextAnalyser = context.createAnalyser();
      nextAnalyser.fftSize = window.innerWidth < 800 ? 256 : 512;
      nextAnalyser.smoothingTimeConstant = 0.82;
      const splitter = context.createChannelSplitter(2);
      const leftAnalyser = context.createAnalyser();
      const rightAnalyser = context.createAnalyser();
      leftAnalyser.fftSize = nextAnalyser.fftSize;
      rightAnalyser.fftSize = nextAnalyser.fftSize;
      nextAnalyser.connect(context.destination);
      splitter.connect(leftAnalyser, 0);
      splitter.connect(rightAnalyser, 1);
      audioGraph = { context, source, analyser: nextAnalyser, splitter, channelAnalysers: [leftAnalyser, rightAnalyser], filters: new Map(), eqTopology: '' };
      reconnectAudioFilters();
      analyser.value = nextAnalyser;
      channelAnalysers.value = audioGraph.channelAnalysers;
    } catch { return null; }
  }
  if (audioGraph.context.state === 'suspended') await audioGraph.context.resume().catch(() => {});
  return audioGraph.analyser;
}
async function togglePlay() {
  if (!currentTrack.value) { openFolder(); return; }
  const audio = audioRef.value;
  if (!audio) return;
  if (audio.paused) { await ensureAudioGraph(); audio.play().then(() => { isPlaying.value = true; }).catch(() => { isPlaying.value = false; }); recent.value = [currentTrack.value.id, ...recent.value.filter((id) => id !== currentTrack.value.id)].slice(0, 50); }
  else { audio.pause(); isPlaying.value = false; }
}
function playTrack(track) { if (!track) return; if (track.id === currentId.value) { togglePlay(); return; } ensureAudioGraph(); currentId.value = track.id; currentTime.value = 0; isPlaying.value = true; recent.value = [track.id, ...recent.value.filter((id) => id !== track.id)].slice(0, 50); }
function playNext() { if (!tracks.value.length) return; let index; if (shuffle.value && tracks.value.length > 1) { do index = Math.floor(Math.random() * tracks.value.length); while (index === currentIndex.value); } else { index = currentIndex.value + 1; if (index >= tracks.value.length) { if (repeatMode.value !== 'all') { isPlaying.value = false; return; } index = 0; } } playTrack(tracks.value[index]); }
function playPrevious() { if (currentTime.value > 3) { seekTo(0); return; } if (tracks.value.length) playTrack(tracks.value[currentIndex.value <= 0 ? tracks.value.length - 1 : currentIndex.value - 1]); }
function handleEnded() { if (repeatMode.value === 'one') { seekTo(0); audioRef.value?.play(); } else playNext(); }
function seekTo(value) { if (!audioRef.value) return; const next = Math.max(0, Math.min(Number(value) || 0, audioRef.value.duration || duration.value || 0)); audioRef.value.currentTime = next; currentTime.value = next; }
function cycleRepeat() { repeatMode.value = repeatMode.value === 'off' ? 'all' : repeatMode.value === 'all' ? 'one' : 'off'; }
function toggleFavorite(track) { if (!track) return; const next = new Set(favorites.value); next.has(track.key) ? next.delete(track.key) : next.add(track.key); favorites.value = next; }
function openTrackMenu(track, event) { const rect = event.currentTarget.getBoundingClientRect(); actionMenu.value = { trackId: track.id, x: rect.right - 248, y: rect.bottom + 6 }; }
function applyOnlineLyrics(result) {
  const track = lyricsSearchTrack.value;
  if (!track) return;
  const nextTrack = { ...track, lyrics: lyricsFromSearchResult(result) };
  tracks.value = tracks.value.map((item) => item.id === track.id ? nextTrack : item);
  lyricsSearchId.value = null;
  notify(result.syncedLyrics ? '已应用同步歌词' : '已应用纯文本歌词');
  if (lyricsSavePreference.value === 'always') saveTrackLyrics(nextTrack);
  if (lyricsSavePreference.value === 'ask') lyricsSavePrompt.value = { track: nextTrack };
}
function updateTrackLyrics(trackId, patch) {
  tracks.value = tracks.value.map((track) => track.id === trackId ? { ...track, lyrics: { ...track.lyrics, ...patch } } : track);
}
async function translateTrack(track) {
  const lines = track.lyrics?.lines || [];
  const plainLines = track.lyrics?.plainLines || [];
  if ((!lines.length && !plainLines.length) || translationJobs.has(track.id)) return;
  if (track.lyrics.translationStatus === 'loading' || track.lyrics.translationStatus === 'ready') return;
  const controller = new AbortController();
  translationJobs.set(track.id, controller);
  updateTrackLyrics(track.id, { translationStatus: 'loading', translationProgress: 0, translationError: '' });
  try {
    let result;
    if (lines.length) {
      result = await translateLyricLines(lines, {
        signal: controller.signal,
        onProgress: (progress) => updateTrackLyrics(track.id, { translationProgress: progress }),
      });
      updateTrackLyrics(track.id, {
        lines: result.lines,
        translationStatus: 'ready',
        translationProgress: 1,
        translationProvider: 'MyMemory',
        dirty: result.translatedCount > 0 || track.lyrics.dirty,
      });
    } else {
      const plainResult = await translateLyricLines(plainLines.map((text) => ({ text, translation: '' })), {
        signal: controller.signal,
        onProgress: (progress) => updateTrackLyrics(track.id, { translationProgress: progress }),
      });
      updateTrackLyrics(track.id, {
        plainTranslations: plainResult.lines.map((line) => line.translation || ''),
        translationStatus: 'ready',
        translationProgress: 1,
        translationProvider: 'MyMemory',
        dirty: plainResult.translatedCount > 0 || track.lyrics.dirty,
      });
      result = plainResult;
    }
    if (result.translatedCount) notify(`已自动补全 ${result.translatedCount} 行中文翻译`);
  } catch (error) {
    if (error.name !== 'AbortError') {
      updateTrackLyrics(track.id, { translationStatus: 'error', translationError: error.message || '翻译服务暂时不可用' });
      notify('中文翻译失败，可点击歌词区按钮重试');
    }
  } finally {
    translationJobs.delete(track.id);
  }
}
async function saveTrackLyrics(track) {
  try {
    const text = serializeLyrics(track.lyrics);
    const name = `${fileStem(track.path)}.lrc`;
    let result;
    if (track.parentHandle) {
      result = await writeToDirectory(track.parentHandle, name, new Blob([text], { type: 'text/plain;charset=utf-8' }), { overwrite: true });
    } else if (track.sourceDirectory && window.nightwaveDesktop?.writeLyrics) {
      result = await window.nightwaveDesktop.writeLyrics({ directoryPath: track.sourceDirectory, name, text });
    } else {
      result = await saveBlobAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), name, 'text/plain', '.lrc');
    }
    notify(`已保存 ${result.name}`);
  } catch (error) {
    if (error.name !== 'AbortError') notify(error.message || '歌词保存失败');
  }
}
async function handleLyricsSaveDecision({ save, remember }) {
  lyricsSavePreference.value = remember ? (save ? 'always' : 'never') : 'ask';
  const track = lyricsSavePrompt.value?.track;
  lyricsSavePrompt.value = null;
  if (save && track) await saveTrackLyrics(track);
}
function enterImmersive() { if (!currentTrack.value) return; immersive.value = true; document.documentElement.requestFullscreen?.().catch(() => {}); }
function leaveImmersive() { immersive.value = false; if (document.fullscreenElement) document.exitFullscreen?.(); }
function onLoadedMetadata() { duration.value = audioRef.value?.duration || 0; tracks.value = tracks.value.map((track) => track.id === currentId.value ? { ...track, duration: duration.value } : track); if (isPlaying.value) audioRef.value?.play().catch(() => { isPlaying.value = false; }); }
function repeatIcon() { return repeatMode.value === 'one' ? Repeat1 : Repeat; }
function onKeyDown(event) { if (event.key === 'Escape') { actionMenu.value = null; lyricsSearchId.value = null; lyricsSettingsOpen.value = false; settingsPageOpen.value = false; extensionsPageOpen.value = false; } if (event.target instanceof Element && event.target.closest('input, textarea, select, button, [role="dialog"]')) return; if (event.code === 'Space') { event.preventDefault(); togglePlay(); } if (event.code === 'ArrowLeft') seekTo(currentTime.value - 5); if (event.code === 'ArrowRight') seekTo(currentTime.value + 5); if (event.key.toLocaleLowerCase() === 'm') muted.value = !muted.value; }
 onMounted(async () => { window.addEventListener('keydown', onKeyDown); document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) immersive.value = false; }); await loadDesktopUserState(); if (window.nightwaveDesktop?.getDataUpdateState) dataUpdate.value = await window.nightwaveDesktop.getDataUpdateState(); dataUpdateTimer = window.setTimeout(() => checkDataUpdate(true), 3500); loadRootExtensions(); });
 onBeforeUnmount(() => { window.removeEventListener('keydown', onKeyDown); translationJobs.forEach((controller) => controller.abort()); translationJobs.clear(); revokeUrls(objectUrls); audioGraph?.context?.close(); window.clearTimeout(toastTimer); window.clearTimeout(userStateTimer); window.clearTimeout(eqPersistTimer); window.clearTimeout(dataUpdateTimer); if (eqAudioFrame) cancelAnimationFrame(eqAudioFrame); });
</script>

<template>
  <div class="app-shell" :class="{ 'is-dragging': dragging, 'is-playing': isPlaying }" :style="{ '--global-lyric-accent': lyricSettings.accent, '--global-lyric-accent-2': lyricSettings.accent2 }" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave="(event) => { if (!event.currentTarget.contains(event.relatedTarget)) dragging = false }" @drop="handleDrop">
    <audio ref="audioRef" :src="currentTrack?.src || undefined" @ended="handleEnded" @loadedmetadata="onLoadedMetadata" @pause="isPlaying = false" @play="isPlaying = true" @timeupdate="currentTime = $event.currentTarget.currentTime" />
    <input ref="inputRef" class="visually-hidden" type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.ncm,.lrc,image/*" multiple webkitdirectory @change="importFiles($event.target.files); $event.target.value = ''">
     <aside class="sidebar"><div class="brand"><span class="brand-mark"><span /><span /><span /><span /></span><strong>NIGHTWAVE</strong></div><nav class="nav-list" aria-label="音乐库"><span class="nav-caption">音乐库</span><button v-for="view in views" :key="view.id" type="button" :class="{ 'is-active': activeView === view.id }" @click="activeView = view.id"><component :is="view.icon" /><span>{{ view.label }}</span><small v-if="view.id === 'all'">{{ tracks.length }}</small></button></nav><div class="sidebar-spacer" /><div class="folder-switcher"><div class="folder-control"><button class="folder-button" type="button" :disabled="isImporting" @click="openFolder"><FolderOpen /><span><small>当前资料库</small><strong>{{ libraryName }}</strong></span></button><button class="folder-history-toggle" type="button" :class="{ 'is-open': recentFoldersOpen }" :disabled="isImporting" :aria-expanded="recentFoldersOpen" aria-label="打开最近目录" @click="recentFoldersOpen = !recentFoldersOpen"><ChevronDown /></button></div><div v-if="recentFoldersOpen" class="recent-folder-menu"><header><span>最近打开</span><button type="button" aria-label="关闭最近目录" @click="recentFoldersOpen = false"><X /></button></header><button v-for="folder in recentFolders" :key="folder.path || folder.name" type="button" @click="openRecentFolder(folder)"><FolderOpen /><span><strong>{{ folder.name }}</strong><small>{{ folder.path || '浏览器目录' }}</small></span></button><p v-if="!recentFolders.length">还没有最近目录</p><button class="recent-folder-open" type="button" @click="openFolder"><FolderOpen />打开其他文件夹</button></div></div></aside>
    <main class="main-content"><header class="topbar"><div><span class="eyebrow">LOCAL COLLECTION</span><h1>{{ views.find((view) => view.id === activeView)?.label }}</h1></div><div class="topbar-actions"><label class="search-field"><Search /><input v-model="query" placeholder="搜索音乐"><button v-if="query" type="button" aria-label="清空搜索" @click="query = ''"><X /></button></label><button class="import-button" type="button" :disabled="isImporting" @click="openFolder"><FolderOpen /><span>{{ isImporting ? '正在载入' : '打开文件夹' }}</span></button></div></header>
      <template v-if="tracks.length"><section class="now-stage" :style="{ '--visualizer-height': `${lyricSettings.visualizerHeight}px` }"><div class="ambient-art" :style="coverStyle(currentTrack?.cover)" /><AudioVisualizer v-if="lyricSettings.enabledVisualizer" :analyser="analyser" :active="isPlaying && !immersive" :mode="lyricSettings.visualizer" :accent="lyricSettings.accent" :accent2="lyricSettings.accent2" :intensity="lyricSettings.visualizerIntensity" :opacity="lyricSettings.visualizerOpacity" :glow="lyricSettings.visualizerGlow" :density="lyricSettings.visualizerDensity" :speed="lyricSettings.visualizerSpeed" :mirrored="lyricSettings.visualizerMirrored" :reflection="lyricSettings.visualizerReflection" class-name="stage-visualizer" /><div class="art-column"><button class="cover-wrap" type="button" aria-label="打开全屏歌词" @click="enterImmersive"><img :src="currentTrack?.cover" :alt="`${currentTrack?.title} 封面`"><span class="cover-expand"><Maximize2 /></span></button><div class="now-copy"><span>NOW PLAYING</span><h2>{{ currentTrack?.title }}</h2><p>{{ currentTrack?.artist }} · {{ currentTrack?.album }}</p></div></div><div class="lyrics-column"><div class="section-heading"><span>同步歌词</span><div><IconButton label="联网搜索歌词" @click="lyricsSearchId = currentTrack.id"><Search /></IconButton><IconButton label="歌词显示设置" @click="lyricsSettingsOpen = true"><Palette /></IconButton><IconButton label="打开全屏歌词" @click="enterImmersive"><Maximize2 /></IconButton></div></div><LyricsView :track="currentTrack" :current-time="currentTime" :settings="lyricSettings" :translation-status="currentTrack?.lyrics?.translationStatus" :translation-progress="currentTrack?.lyrics?.translationProgress" @seek="seekTo" @search="lyricsSearchId = $event.id" @translate="translateTrack" /></div></section><section class="collection-section"><div class="collection-heading"><div><span class="eyebrow">{{ visibleTracks.length }} TRACKS</span><h2>{{ query ? '搜索结果' : views.find((view) => view.id === activeView)?.label }}</h2></div><IconButton label="歌词显示设置" @click="lyricsSettingsOpen = true"><Palette /></IconButton></div><TrackList :tracks="visibleTracks" :current-track="currentTrack" :is-playing="isPlaying" :favorites="favorites" @play="playTrack" @favorite="toggleFavorite" @more="openTrackMenu" /></section></template>
      <section v-else class="empty-stage"><div class="empty-art"><img :src="DEFAULT_ART" alt="Nightwave"><span><Disc3 /></span></div><span class="eyebrow">YOUR SOUND, YOUR SPACE</span><h2>{{ isImporting ? '正在构建资料库' : '让音乐从这里开始' }}</h2><button class="primary-action" type="button" :disabled="isImporting" @click="openFolder"><FolderOpen />选择音乐文件夹</button></section>
    </main>
    <aside class="queue-drawer" :class="{ 'is-open': queueOpen }" :aria-hidden="!queueOpen"><div class="queue-head"><div><span class="eyebrow">UP NEXT</span><h2>播放队列</h2></div><IconButton label="关闭播放队列" @click="queueOpen = false"><X /></IconButton></div><div class="queue-list"><button v-for="(track, index) in tracks" :key="track.id" type="button" :class="{ 'is-current': track.id === currentId }" @click="playTrack(track)"><span class="queue-index">{{ String(index + 1).padStart(2, '0') }}</span><img :src="track.cover" alt=""><span class="queue-copy"><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span><Gauge v-if="track.id === currentId" /></button></div></aside><button v-if="queueOpen" class="drawer-backdrop" type="button" aria-label="关闭播放队列" @click="queueOpen = false" />
    <footer class="player-bar"><div class="player-track"><img :src="currentTrack?.cover || DEFAULT_ART" alt=""><div><strong>{{ currentTrack?.title || '选择一首音乐' }}</strong><span>{{ currentTrack?.artist || 'NIGHTWAVE' }}</span></div><IconButton :active="currentTrack && favorites.has(currentTrack.key)" label="喜欢" :disabled="!currentTrack" @click="toggleFavorite(currentTrack)"><Heart :fill="currentTrack && favorites.has(currentTrack.key) ? 'currentColor' : 'none'" /></IconButton></div><div class="transport"><div class="transport-buttons"><IconButton :active="shuffle" label="随机播放" @click="shuffle = !shuffle"><Shuffle /></IconButton><IconButton label="上一首" @click="playPrevious"><SkipBack fill="currentColor" /></IconButton><button class="play-button" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click="togglePlay"><Pause v-if="isPlaying" fill="currentColor" /><Play v-else fill="currentColor" /></button><IconButton label="下一首" @click="playNext"><SkipForward fill="currentColor" /></IconButton><IconButton :active="repeatMode !== 'off'" label="循环模式" @click="cycleRepeat"><component :is="repeatIcon()" /></IconButton></div><div class="progress-row"><span>{{ formatTime(currentTime) }}</span><input v-model.number="currentTime" type="range" aria-label="播放进度" min="0" :max="duration || 0" :style="{ '--range-progress': `${duration ? (currentTime / duration) * 100 : 0}%` }" @input="seekTo(currentTime)"><span>{{ formatTime(duration) }}</span></div></div><div class="player-tools"><IconButton label="全屏歌词" :disabled="!currentTrack" @click="enterImmersive"><Maximize2 /></IconButton><IconButton :active="queueOpen" label="播放队列" @click="queueOpen = !queueOpen"><ListMusic /></IconButton><IconButton :label="muted ? '取消静音' : '静音'" @click="muted = !muted"><VolumeX v-if="muted || volume === 0" /><Volume1 v-else-if="volume < 0.5" /><Volume2 v-else /></IconButton><input v-model.number="volume" type="range" aria-label="音量" min="0" max="1" step="0.01" :style="{ '--range-progress': `${volume * 100}%` }"></div></footer>
    <div v-if="immersive && currentTrack" class="immersive-player" :class="`preset-${lyricSettings.id}`" :style="{ '--immersive-dim': lyricSettings.dim / 100 }"><div class="immersive-background" :style="coverStyle(currentTrack.cover)" /><AudioVisualizer v-if="lyricSettings.enabledVisualizer" :analyser="analyser" :active="isPlaying" :mode="lyricSettings.visualizer" :accent="lyricSettings.accent" :accent2="lyricSettings.accent2" :intensity="lyricSettings.visualizerIntensity" :opacity="lyricSettings.visualizerOpacity" :glow="lyricSettings.visualizerGlow" :density="lyricSettings.visualizerDensity" :speed="lyricSettings.visualizerSpeed" :mirrored="lyricSettings.visualizerMirrored" :reflection="lyricSettings.visualizerReflection" class-name="immersive-visualizer" /><header><div class="brand compact"><span class="brand-mark"><span /><span /><span /><span /></span><strong>NIGHTWAVE</strong></div><div class="immersive-header-actions"><IconButton label="联网搜索歌词" @click="lyricsSearchId = currentTrack.id"><Search /></IconButton><IconButton label="歌词显示设置" @click="lyricsSettingsOpen = true"><Palette /></IconButton><IconButton class="immersive-close" label="退出全屏" @click="leaveImmersive"><Minimize2 /></IconButton></div></header><div class="immersive-layout"><section class="immersive-art"><img :src="currentTrack.cover" :alt="`${currentTrack.title} 封面`"><div><span>NOW PLAYING</span><h1>{{ currentTrack.title }}</h1><p>{{ currentTrack.artist }} · {{ currentTrack.album }}</p></div></section><section class="immersive-lyrics"><LyricsView :track="currentTrack" :current-time="currentTime" :settings="lyricSettings" :translation-status="currentTrack?.lyrics?.translationStatus" :translation-progress="currentTrack?.lyrics?.translationProgress" immersive @seek="seekTo" @search="lyricsSearchId = $event.id" @translate="translateTrack" /></section></div><div class="immersive-controls"><IconButton :active="shuffle" label="随机播放" @click="shuffle = !shuffle"><Shuffle /></IconButton><IconButton label="上一首" @click="playPrevious"><SkipBack fill="currentColor" /></IconButton><button class="play-button" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click="togglePlay"><Pause v-if="isPlaying" fill="currentColor" /><Play v-else fill="currentColor" /></button><IconButton label="下一首" @click="playNext"><SkipForward fill="currentColor" /></IconButton><IconButton :active="repeatMode !== 'off'" label="循环模式" @click="cycleRepeat"><component :is="repeatIcon()" /></IconButton></div><div class="immersive-progress"><span>{{ formatTime(currentTime) }}</span><input v-model.number="currentTime" type="range" min="0" :max="duration || 0" aria-label="播放进度" :style="{ '--range-progress': `${duration ? (currentTime / duration) * 100 : 0}%` }" @input="seekTo(currentTime)"><span>{{ formatTime(duration) }}</span></div></div>
    <nav class="sidebar-tools" aria-label="软件菜单"><button type="button" :class="{ 'is-active': settingsPageOpen }" @click="settingsPageOpen = true"><Settings /><span>设置</span></button><button type="button" :class="{ 'is-active': extensionsPageOpen }" @click="extensionsPageOpen = true"><Puzzle /><span>扩展</span></button><button type="button" title="打开打包工具" @click="openPackager"><Package /><span>打包</span></button></nav>
      <AppSettingsPage v-if="settingsPageOpen" :settings="lyricSettings" :eq-settings="eqSettings" :update-state="dataUpdate" @update="lyricSettings = $event" @update-eq="eqSettings = $event" @check-update="checkDataUpdate(false)" @lyrics="lyricsSettingsOpen = true" @close="settingsPageOpen = false" />
     <ExtensionsPage v-if="extensionsPageOpen" :extensions="extensions" :active-theme-id="activeThemeId" :enabled-ids="enabledExtensions" :is-electron="isElectron" :loading="extensionsLoading" @close="extensionsPageOpen = false" @install="installExtension" @toggle="toggleExtension" @edit="openExtensionEditor" @refresh="refreshExtensions" />
    <TrackActionMenu :track="actionTrack" :position="actionMenu" @close="actionMenu = null" @search="lyricsSearchId = $event.id" @save="saveTrackLyrics" @appearance="lyricsSettingsOpen = true" @export="exportTrackId = $event.id" />
    <LyricsSearchDialog v-if="lyricsSearchTrack" :track="lyricsSearchTrack" @close="lyricsSearchId = null" @apply="applyOnlineLyrics" />
    <LyricsSettingsPanel v-if="lyricsSettingsOpen" :settings="lyricSettings" @update="lyricSettings = $event" @close="lyricsSettingsOpen = false" />
    <AudioExportDialog v-if="exportTrack" :track="exportTrack" @close="exportTrackId = null" @toast="notify" />
     <div v-if="isImporting" class="import-progress-dock"><div class="import-progress-ring" :style="{ '--progress-angle': `${importProgressPercent * 3.6}deg` }"><span>{{ importProgressPercent }}%</span></div><div><strong>正在读取音乐</strong><small>{{ importProgress.processed }} / {{ importProgress.total }} 个文件{{ importProgress.failed ? ` · ${importProgress.failed} 个失败` : '' }}</small></div></div><div v-if="dragging" class="drop-overlay"><Sparkles /><strong>松开以载入音乐</strong></div><div v-if="toast" class="toast" role="status">{{ toast }}</div><LyricsSaveDialog v-if="lyricsSavePrompt" :track="lyricsSavePrompt.track" @save="handleLyricsSaveDecision({ save: true, remember: $event.remember })" @cancel="handleLyricsSaveDecision({ save: false, remember: $event.remember })" />
  </div>
</template>
