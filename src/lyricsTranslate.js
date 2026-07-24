const TRANSLATION_ENDPOINT = 'https://api.mymemory.translated.net/get';
const CACHE_PREFIX = 'nightwave-translation-v1:';
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LATIN_PATTERN = /[A-Za-zÀ-ÿ]/;

function decodeHtml(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value.replace(/\s+/g, ' ').trim();
}

function cacheKey(text, sourceLanguage, targetLanguage) {
  return `${CACHE_PREFIX}${sourceLanguage}:${targetLanguage}:${text}`;
}

function readCache(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Translation still works when the browser blocks storage.
  }
}

export function containsChinese(text) {
  return CJK_PATTERN.test(String(text || ''));
}

export function needsTranslation(text) {
  const value = String(text || '').trim();
  return Boolean(value && !containsChinese(value) && LATIN_PATTERN.test(value));
}

async function translateLine(text, { signal, sourceLanguage = 'en', targetLanguage = 'zh-CN' } = {}) {
  const value = String(text || '').trim();
  if (!needsTranslation(value)) return '';
  const key = cacheKey(value, sourceLanguage, targetLanguage);
  const cached = readCache(key);
  if (cached) return cached;

  const parameters = new URLSearchParams({
    q: value,
    langpair: `${sourceLanguage}|${targetLanguage}`,
  });
  const response = await fetch(`${TRANSLATION_ENDPOINT}?${parameters}`, { signal });
  if (!response.ok) throw new Error(`翻译服务返回 ${response.status}`);
  const payload = await response.json();
  if (payload.responseStatus !== 200 || !payload.responseData?.translatedText) {
    throw new Error(payload.responseDetails || '翻译服务暂时不可用');
  }
  const translated = decodeHtml(payload.responseData.translatedText);
  if (translated) writeCache(key, translated);
  return translated;
}

export async function translateLyricLines(lines, { signal, onProgress, sourceLanguage = 'en', targetLanguage = 'zh-CN' } = {}) {
  const targets = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !containsChinese(line.translation) && needsTranslation(line.text));
  if (!targets.length) return { lines, translatedCount: 0, attemptedCount: 0 };

  const translatedLines = lines.map((line) => ({ ...line }));
  let translatedCount = 0;
  let completedCount = 0;
  let firstError = null;
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;
      try {
        const translation = await translateLine(target.line.text, { signal, sourceLanguage, targetLanguage });
        if (translation) {
          translatedLines[target.index].translation = translation;
          translatedCount += 1;
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        firstError ||= error;
      } finally {
        completedCount += 1;
        onProgress?.(completedCount / targets.length, completedCount, targets.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  if (firstError && !translatedCount) throw firstError;
  return { lines: translatedLines, translatedCount, attemptedCount: targets.length, error: firstError };
}
