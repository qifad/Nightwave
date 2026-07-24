const THEME_KEY = 'nightwave-macos-theme-mode';

function activate() {
  const root = document.documentElement;
  const previousMode = root.dataset.nightwaveMacosTheme;
  const previousColorScheme = root.style.colorScheme;
  const button = document.createElement('button');
  button.className = 'macos-theme-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', '切换 macOS 日夜模式');
  button.innerHTML = '<span class="macos-theme-toggle-icon" aria-hidden="true">☾</span><span class="macos-theme-toggle-label">夜间</span>';

  const tools = document.querySelector('.sidebar-tools');
  if (!tools) return () => {};
  tools.append(button);

  function readMode() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'dark' || saved === 'light' ? saved : 'light';
    } catch {
      return 'light';
    }
  }

  function updateButton(mode) {
    const dark = mode === 'dark';
    root.dataset.nightwaveMacosTheme = mode;
    root.style.colorScheme = mode;
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? '切换到日间模式' : '切换到夜间模式';
    button.querySelector('.macos-theme-toggle-icon').textContent = dark ? '☀' : '☾';
    button.querySelector('.macos-theme-toggle-label').textContent = dark ? '日间' : '夜间';
  }

  function reveal(mode) {
    const rect = button.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'macos-theme-reveal';
    layer.style.setProperty('--theme-reveal-x', `${rect.left + rect.width / 2}px`);
    layer.style.setProperty('--theme-reveal-y', `${rect.top + rect.height / 2}px`);
    layer.style.setProperty('--theme-reveal-color', mode === 'dark' ? '#1c1c1e' : '#f5f5f7');
    document.body.append(layer);
    updateButton(mode);
    const animation = layer.animate([
      { clipPath: 'circle(0 at var(--theme-reveal-x) var(--theme-reveal-y))', opacity: 1 },
      { clipPath: 'circle(150vmax at var(--theme-reveal-x) var(--theme-reveal-y))', opacity: 1 },
    ], { duration: 560, easing: 'cubic-bezier(.2,.75,.2,1)' });
    animation.finished.catch(() => {}).finally(() => layer.remove());
  }

  function toggleMode() {
    const mode = root.dataset.nightwaveMacosTheme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* Theme preference is optional. */ }
    reveal(mode);
  }

  button.addEventListener('click', toggleMode);
  updateButton(readMode());

  return () => {
    button.removeEventListener('click', toggleMode);
    button.remove();
    document.querySelectorAll('.macos-theme-reveal').forEach((layer) => layer.remove());
    if (previousMode) root.dataset.nightwaveMacosTheme = previousMode;
    else delete root.dataset.nightwaveMacosTheme;
    root.style.colorScheme = previousColorScheme;
  };
}

export { activate };
