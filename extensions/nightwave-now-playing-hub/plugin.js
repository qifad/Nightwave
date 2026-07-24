const hubStyles = `
.nightwave-hub-trigger,
.nightwave-hub-popover {
  --hub-accent: #0a84ff;
  --hub-accent-2: #30d158;
  --hub-text: #f5f5f7;
  --hub-muted: #a1a1a6;
  --hub-panel: rgba(44, 44, 46, .96);
  --hub-line: rgba(255, 255, 255, .16);
}

.nightwave-hub-trigger {
  width: min(238px, 24vw);
  min-width: 190px;
  height: 42px;
  display: grid;
  grid-template-columns: 29px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 7px;
  overflow: hidden;
  color: var(--hub-text);
  background: color-mix(in srgb, var(--hub-panel) 88%, transparent);
  border: 1px solid var(--hub-line);
  border-radius: 12px;
  box-shadow: 0 7px 22px rgba(0, 0, 0, .12);
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.nightwave-hub-trigger:hover,
.nightwave-hub-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--hub-accent) 54%, var(--hub-line));
  background: color-mix(in srgb, var(--hub-accent) 10%, var(--hub-panel));
  transform: translateY(-1px);
}

.nightwave-hub-trigger-art {
  position: relative;
  width: 29px;
  height: 29px;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--hub-accent), var(--hub-accent-2));
}

.nightwave-hub-trigger-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.nightwave-hub-trigger-art img[hidden] { display: none; }
.nightwave-hub-trigger-art::after { position: absolute; inset: 8px; content: ""; border: 1px solid rgba(255, 255, 255, .7); border-radius: 50%; opacity: .8; }
.nightwave-hub-trigger-copy, .nightwave-hub-trigger-copy strong, .nightwave-hub-trigger-copy small { min-width: 0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nightwave-hub-trigger-copy strong { color: var(--hub-text); font-size: 10px; }
.nightwave-hub-trigger-copy small { margin-top: 3px; color: var(--hub-muted); font-size: 8px; }
.nightwave-hub-trigger-chevron { color: var(--hub-muted); font-size: 15px; line-height: 1; transform: translateY(-2px); }

.nightwave-hub-popover {
  position: fixed;
  z-index: 170;
  top: 76px;
  right: 24px;
  width: 302px;
  padding: 15px;
  color: var(--hub-text);
  background: color-mix(in srgb, var(--hub-panel) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--hub-accent) 28%, var(--hub-line));
  border-radius: 17px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .3), 0 0 34px color-mix(in srgb, var(--hub-accent) 13%, transparent);
  backdrop-filter: blur(26px) saturate(150%);
  transform-origin: top right;
  animation: nightwave-hub-in 160ms ease-out;
}

.nightwave-hub-popover[hidden] { display: none; }
@keyframes nightwave-hub-in { from { opacity: 0; transform: translateY(-7px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.nightwave-hub-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nightwave-hub-head > span { color: var(--hub-accent); font: 9px Consolas, monospace; letter-spacing: .12em; }
.nightwave-hub-close { width: 24px; height: 24px; display: grid; place-items: center; color: var(--hub-muted); background: transparent; border: 0; border-radius: 50%; cursor: pointer; font-size: 17px; }
.nightwave-hub-close:hover { color: var(--hub-text); background: color-mix(in srgb, var(--hub-text) 10%, transparent); }
.nightwave-hub-art { position: relative; width: 116px; aspect-ratio: 1; margin: 17px auto 13px; }
.nightwave-hub-art::before { position: absolute; z-index: -1; inset: -17px; content: ""; background: var(--hub-accent); border-radius: 50%; opacity: .14; filter: blur(19px); }
.nightwave-hub-art img { width: 100%; height: 100%; object-fit: cover; border: 1px solid color-mix(in srgb, var(--hub-accent) 45%, transparent); border-radius: 14px; box-shadow: 0 16px 34px rgba(0, 0, 0, .24); }
.nightwave-hub-art img[hidden] { display: none; }
.nightwave-hub-art-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--hub-accent); background: linear-gradient(135deg, color-mix(in srgb, var(--hub-accent) 70%, transparent), color-mix(in srgb, var(--hub-accent-2) 70%, transparent)); border-radius: 14px; font-size: 26px; }
.nightwave-hub-art-empty[hidden] { display: none; }
.nightwave-hub-info { text-align: center; }
.nightwave-hub-info strong, .nightwave-hub-info small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nightwave-hub-info strong { color: var(--hub-text); font-size: 15px; }
.nightwave-hub-info small { margin-top: 5px; color: var(--hub-muted); font-size: 10px; }
.nightwave-hub-controls { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 17px; }
.nightwave-hub-controls button { display: grid; place-items: center; padding: 0; color: var(--hub-muted); background: transparent; border: 0; cursor: pointer; }
.nightwave-hub-controls button:hover { color: var(--hub-text); }
.nightwave-hub-controls .hub-main-control { width: 42px; height: 42px; color: #fff; background: var(--hub-accent); border-radius: 50%; box-shadow: 0 7px 20px color-mix(in srgb, var(--hub-accent) 32%, transparent); font-size: 17px; }
.nightwave-hub-controls .hub-main-control:hover { color: #fff; background: color-mix(in srgb, var(--hub-accent) 82%, #fff); }
.nightwave-hub-controls button:not(.hub-main-control) { width: 28px; height: 28px; font-size: 22px; }
.nightwave-hub-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 17px; padding-top: 13px; border-top: 1px solid var(--hub-line); }
.nightwave-hub-actions button { min-height: 31px; color: var(--hub-muted); background: color-mix(in srgb, var(--hub-text) 6%, transparent); border: 1px solid var(--hub-line); border-radius: 8px; cursor: pointer; font-size: 9px; }
.nightwave-hub-actions button:hover { color: var(--hub-text); border-color: color-mix(in srgb, var(--hub-accent) 55%, var(--hub-line)); }

@media (max-width: 780px) {
  .nightwave-hub-trigger { width: 40px; min-width: 40px; grid-template-columns: 29px; padding-right: 5px; }
  .nightwave-hub-trigger-copy, .nightwave-hub-trigger-chevron { display: none; }
  .nightwave-hub-popover { top: 66px; right: 14px; width: min(302px, calc(100vw - 28px)); }
}
`;

function activate(api) {
  const style = document.createElement('style');
  style.dataset.nightwaveExtension = 'now-playing-hub';
  style.textContent = hubStyles;
  document.head.appendChild(style);

  const trigger = document.createElement('button');
  trigger.className = 'nightwave-hub-trigger';
  trigger.type = 'button';
  trigger.title = '打开 Now Playing Hub';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `
    <span class="nightwave-hub-trigger-art"><img data-hub-trigger-art alt=""><span /></span>
    <span class="nightwave-hub-trigger-copy"><strong data-hub-trigger-title>选择一首音乐</strong><small data-hub-trigger-artist>NIGHTWAVE</small></span>
    <span class="nightwave-hub-trigger-chevron">⌄</span>
  `;

  const popover = document.createElement('div');
  popover.className = 'nightwave-hub-popover';
  popover.hidden = false;
  popover.innerHTML = `
    <div class="nightwave-hub-head"><span>NOW PLAYING</span><button class="nightwave-hub-close" type="button" aria-label="关闭">×</button></div>
    <div class="nightwave-hub-art"><img data-hub-art alt=""><span class="nightwave-hub-art-empty">♪</span></div>
    <div class="nightwave-hub-info"><strong data-hub-title>选择一首音乐</strong><small data-hub-artist>NIGHTWAVE</small></div>
    <div class="nightwave-hub-controls"><button class="hub-prev" type="button" title="上一首">‹</button><button class="hub-main-control hub-play" type="button" title="播放或暂停">▶</button><button class="hub-next" type="button" title="下一首">›</button></div>
    <div class="nightwave-hub-actions"><button class="hub-lyrics" type="button">打开歌词</button><button class="hub-queue" type="button">打开队列</button></div>
  `;

  const host = document.querySelector('.topbar-actions');
  if (!host) return () => {};
  host.prepend(trigger);
  document.body.append(popover);

  const triggerArt = trigger.querySelector('[data-hub-trigger-art]');
  const triggerTitle = trigger.querySelector('[data-hub-trigger-title]');
  const triggerArtist = trigger.querySelector('[data-hub-trigger-artist]');
  const art = popover.querySelector('[data-hub-art]');
  const artEmpty = popover.querySelector('.nightwave-hub-art-empty');
  const title = popover.querySelector('[data-hub-title]');
  const artist = popover.querySelector('[data-hub-artist]');
  const play = popover.querySelector('.hub-play');
  let frame = 0;
  let closed = false;
  let requestedOpen = true;

  function setImage(image, source) {
    if (source) {
      image.src = source;
      image.hidden = false;
      if (image === art) artEmpty.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      if (image === art) artEmpty.hidden = false;
    }
  }

  function syncTrack() {
    const source = document.querySelector('.player-track');
    const shell = document.querySelector('.app-shell');
    const trackTitle = source?.querySelector('strong')?.textContent?.trim() || '选择一首音乐';
    const trackArtist = source?.querySelector('span')?.textContent?.trim() || 'NIGHTWAVE';
    const cover = source?.querySelector('img')?.getAttribute('src') || '';
    const playing = Boolean(shell?.classList.contains('is-playing'));
    triggerTitle.textContent = trackTitle;
    triggerArtist.textContent = trackArtist;
    title.textContent = trackTitle;
    artist.textContent = trackArtist;
    setImage(triggerArt, cover);
    setImage(art, cover);
    play.textContent = playing ? 'Ⅱ' : '▶';
    play.title = playing ? '暂停' : '播放';
  }

  function scheduleSync() {
    if (frame || closed) return;
    frame = requestAnimationFrame(() => { frame = 0; syncTrack(); });
  }

  function setOpen(open) {
    requestedOpen = open;
    popover.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }

  function syncOverlayVisibility() {
    const blocked = Boolean(document.querySelector('.settings-layer, .modal-layer, .immersive-player'));
    if (blocked) {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    popover.hidden = !requestedOpen;
    trigger.setAttribute('aria-expanded', String(requestedOpen));
  }

  function clickTransport(index) {
    const buttons = [...document.querySelectorAll('.transport-buttons button')];
    buttons[index]?.click();
    scheduleSync();
  }

  function onTriggerClick(event) { event.stopPropagation(); setOpen(popover.hidden); }
  function onCloseClick() { setOpen(false); }
  function onPlayClick() { clickTransport(2); }
  function onPreviousClick() { clickTransport(1); }
  function onNextClick() { clickTransport(3); }
  function onLyricsClick() { document.querySelector('.lyrics-column .section-heading button:nth-of-type(2)')?.click(); }
  function onQueueClick() { document.querySelectorAll('.player-tools button')[1]?.click(); }
  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
    if (event.code === 'Space') { event.preventDefault(); clickTransport(2); }
    if (event.key.toLocaleLowerCase() === 'l') { event.preventDefault(); onLyricsClick(); }
  }

  trigger.addEventListener('click', onTriggerClick);
  popover.querySelector('.nightwave-hub-close').addEventListener('click', onCloseClick);
  play.addEventListener('click', onPlayClick);
  popover.querySelector('.hub-prev').addEventListener('click', onPreviousClick);
  popover.querySelector('.hub-next').addEventListener('click', onNextClick);
  popover.querySelector('.hub-lyrics').addEventListener('click', onLyricsClick);
  popover.querySelector('.hub-queue').addEventListener('click', onQueueClick);
  window.addEventListener('keydown', onKeyDown);

  const observer = new MutationObserver(scheduleSync);
  const playerBar = document.querySelector('.player-bar');
  const appShell = document.querySelector('.app-shell');
  if (playerBar) observer.observe(playerBar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'src'] });
  if (appShell) observer.observe(appShell, { attributes: true, attributeFilter: ['class'] });
  const overlayObserver = new MutationObserver(syncOverlayVisibility);
  overlayObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('fullscreenchange', syncOverlayVisibility);
  syncTrack();
  syncOverlayVisibility();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    overlayObserver.disconnect();
    trigger.removeEventListener('click', onTriggerClick);
    popover.querySelector('.nightwave-hub-close')?.removeEventListener('click', onCloseClick);
    play.removeEventListener('click', onPlayClick);
    popover.querySelector('.hub-prev')?.removeEventListener('click', onPreviousClick);
    popover.querySelector('.hub-next')?.removeEventListener('click', onNextClick);
    popover.querySelector('.hub-lyrics')?.removeEventListener('click', onLyricsClick);
    popover.querySelector('.hub-queue')?.removeEventListener('click', onQueueClick);
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('fullscreenchange', syncOverlayVisibility);
    trigger.remove();
    popover.remove();
    style.remove();
  };

  return cleanup;
}

export { activate };
