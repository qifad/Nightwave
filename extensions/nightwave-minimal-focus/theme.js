function activate() {
  const root = document.documentElement;
  const tools = document.querySelector('.sidebar-tools');
  if (!tools) return () => {};
  const button = document.createElement('button');
  button.className = 'minimal-focus-button';
  button.type = 'button';
  button.textContent = 'MIN';
  button.title = '切换极简专注布局';
  const saved = localStorage.getItem('nightwave-minimal-focus') === '1';

  function setMode(enabled) {
    root.classList.toggle('minimal-focus-mode', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }
  function toggleMode() {
    const enabled = !root.classList.contains('minimal-focus-mode');
    localStorage.setItem('nightwave-minimal-focus', enabled ? '1' : '0');
    setMode(enabled);
  }

  button.addEventListener('click', toggleMode);
  tools.append(button);
  setMode(saved);
  return () => { button.removeEventListener('click', toggleMode); button.remove(); root.classList.remove('minimal-focus-mode'); };
}

export { activate };
