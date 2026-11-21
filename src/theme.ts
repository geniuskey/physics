/**
 * 밝은/어두운 화면. 처음에는 기기 설정을 따르고, 한 번 고르면 그 선택을 기억해요.
 * 실제 적용은 <html data-theme> 로 하고, CSS 변수가 나머지를 바꿔요.
 * (index.html 의 짧은 스크립트가 첫 그림 전에 같은 규칙으로 미리 적용해 깜빡임을 막아요.)
 */
export type Theme = 'light' | 'dark';

const KEY = 'theme';
const media = matchMedia('(prefers-color-scheme: light)');

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f1ea' : '#0b0c0e');
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  apply(t);
}

export function toggleTheme() {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

export function initTheme() {
  apply(stored() ?? (media.matches ? 'light' : 'dark'));
  // 직접 고른 적이 없으면 기기 설정이 바뀔 때 따라가요
  media.addEventListener('change', (e) => { if (!stored()) apply(e.matches ? 'light' : 'dark'); });
}

/** 단추 안 아이콘: 지금이 어두우면 해(밝게 바꾸기), 밝으면 달 */
export function themeLabel() {
  return currentTheme() === 'light' ? '어두운 화면으로' : '밝은 화면으로';
}
