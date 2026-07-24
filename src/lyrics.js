import { parseLrc } from './media';

const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';

export const LYRIC_PROVIDERS = [
  { id: 'lrclib', label: 'LRCLIB', caption: '同步歌词优先' },
  { id: 'lyricsovh', label: 'Lyrics.ovh', caption: '国际曲目补充' },
  { id: 'netease', label: '网易云', caption: '中文曲目补充' },
];

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[\s·・'"“”‘’()[\]{}【】《》<>_-]+/g, '')
    .replace(/feat\.?|ft\.?/g, '');
}

function scoreResult(result, query) {
  let score = 0;
  const title = normalize(result.trackName);
  const artist = normalize(result.artistName);
  const album = normalize(result.albumName);
  const queryTitle = normalize(query.title);
  const queryArtist = normalize(query.artist);
  const queryAlbum = normalize(query.album);

  if (title === queryTitle) score += 60;
  else if (title.includes(queryTitle) || queryTitle.includes(title)) score += 34;
  if (artist === queryArtist) score += 26;
  else if (artist.includes(queryArtist) || queryArtist.includes(artist)) score += 14;
  if (queryAlbum && album === queryAlbum) score += 8;
  if (query.duration && result.duration) {
    const difference = Math.abs(result.duration - query.duration);
    score += difference < 2 ? 18 : difference < 5 ? 10 : difference < 12 ? 3 : -8;
  }
  if (result.syncedLyrics) score += 8;
  return score;
}

async function searchLrclib(query, signal) {
  const parameters = new URLSearchParams({ track_name: query.title.trim() });
  if (query.artist.trim()) parameters.set('artist_name', query.artist.trim());
  if (query.album.trim()) parameters.set('album_name', query.album.trim());
  const response = await fetch(`${LRCLIB_SEARCH_URL}?${parameters}`, { signal });
  if (!response.ok) throw new Error(`歌词服务返回 ${response.status}`);
  const results = await response.json();
  return results
    .map((result) => ({ ...result, provider: 'lrclib', matchScore: scoreResult(result, query) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 20);
}

async function searchLyricsOvh(query, signal) {
  const term = query.artist.trim() ? `${query.title.trim()} ${query.artist.trim()}` : query.title.trim();
  const response = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(term)}`, { signal });
  if (!response.ok) throw new Error(`Lyrics.ovh 返回 ${response.status}`);
  const payload = await response.json();
  return (payload.data || [])
    .map((result) => ({
      id: String(result.id),
      provider: 'lyricsovh',
      trackName: result.title || query.title.trim(),
      artistName: result.artist?.name || '',
      albumName: result.album?.title || '',
      duration: Number(result.duration || 0),
      syncedLyrics: '',
      plainLyrics: '',
      providerData: { title: result.title, artist: result.artist?.name },
      matchScore: scoreResult({ trackName: result.title, artistName: result.artist?.name, albumName: result.album?.title, duration: result.duration }, query),
    }))
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 20);
}

export async function searchOnlineLyrics(query, signal, provider = 'lrclib') {
  if (provider === 'lrclib') return searchLrclib(query, signal);
  if (provider === 'lyricsovh') return searchLyricsOvh(query, signal);
  if (!window.nightwaveDesktop?.searchLyrics) throw new Error('该歌词来源仅在 Nightwave 桌面版中可用');
  const results = await window.nightwaveDesktop.searchLyrics(provider, query);
  return results
    .map((result) => ({ ...result, matchScore: scoreResult(result, query) }))
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 20);
}

export async function resolveLyricsResult(result, signal) {
  if (result.syncedLyrics || result.plainLyrics) return result;
  if (result.provider === 'lyricsovh') {
    const artist = String(result.providerData?.artist || result.artistName || '').trim();
    const title = String(result.providerData?.title || result.trackName || '').trim();
    if (!artist || !title) throw new Error('Lyrics.ovh 缺少歌曲信息');
    const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { signal });
    if (!response.ok) throw new Error(`Lyrics.ovh 返回 ${response.status}`);
    const payload = await response.json();
    if (!payload.lyrics?.trim()) throw new Error('该歌曲没有可下载的歌词');
    return { ...result, syncedLyrics: '', plainLyrics: payload.lyrics };
  }
  if (!window.nightwaveDesktop?.resolveLyrics) throw new Error('该歌词来源仅在 Nightwave 桌面版中可用');
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  const lyrics = await window.nightwaveDesktop.resolveLyrics(result.provider, result);
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  return { ...result, ...lyrics };
}

export function lyricsFromSearchResult(result) {
  const raw = result.syncedLyrics || result.plainLyrics || '';
  const parsed = parseLrc(raw);
  return {
    ...parsed,
    metadata: {
      ...parsed.metadata,
      ti: result.trackName,
      ar: result.artistName,
      al: result.albumName,
    },
    raw,
    plainLines: result.syncedLyrics ? [] : (result.plainLyrics || '').split(/\r?\n/).filter((line) => line.trim()),
    source: result.provider || 'lrclib',
    providerId: `${result.provider || 'lrclib'}:${result.id}`,
  };
}

function timeTag(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, '0');
  const seconds = (value % 60).toFixed(2).padStart(5, '0');
  return `[${minutes}:${seconds}]`;
}

export function serializeLyrics(lyrics) {
  if (lyrics?.raw && !lyrics?.dirty) return lyrics.raw.trimEnd() + '\n';
  const header = [];
  if (lyrics?.metadata?.ti) header.push(`[ti:${lyrics.metadata.ti}]`);
  if (lyrics?.metadata?.ar) header.push(`[ar:${lyrics.metadata.ar}]`);
  if (lyrics?.metadata?.al) header.push(`[al:${lyrics.metadata.al}]`);
  const lines = (lyrics?.lines || []).flatMap((line) => {
    const output = [`${timeTag(line.time)}${line.text || ''}`];
    if (line.translation) output.push(`${timeTag(line.time)}${line.translation}`);
    return output;
  });
  if (!lines.length && lyrics?.plainLines?.length) lines.push(...lyrics.plainLines);
  return [...header, ...lines].join('\n').trimEnd() + '\n';
}
