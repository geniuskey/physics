import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { mountHome } from './home';
import { mountPlay } from './play';
import { sceneById } from './scenes';
import { legacyHashToPath, parseRoute } from './share';
import { initTheme } from './theme';

initTheme();

const app = document.getElementById('app')!;
let cleanup: (() => void) | undefined;
let homeScroll = 0;

// 예전 해시 주소(#/play/…)로 들어오면 새 주소로 바꿔요
const legacy = legacyHashToPath(location.hash);
if (legacy) history.replaceState(null, '', legacy);

function route() {
  const m = parseRoute(location.pathname, location.search);
  const scene = m ? sceneById(m.id) : undefined;
  // 목록에서 실험으로 들어갈 때 스크롤 위치를 기억해 두었다가 돌아오면 복원
  if (scene && !document.body.classList.contains('playing')) homeScroll = window.scrollY;
  cleanup?.();
  app.innerHTML = '';
  if (scene) {
    document.body.classList.add('playing');
    document.title = `${scene.title} — 물리 실험실`;
    cleanup = mountPlay(app, scene, m!.shared);
    window.scrollTo(0, 0);
  } else {
    document.body.classList.remove('playing');
    document.title = '물리 실험실 — 예측하고 측정하는 인터랙티브 물리';
    cleanup = mountHome(app);
    if (location.hash === '#experiments') app.querySelector('#experiments')?.scrollIntoView();
    else requestAnimationFrame(() => window.scrollTo(0, homeScroll));
  }
}

export function navigate(path: string) {
  if (path === location.pathname + location.search) return;
  history.pushState(null, '', path);
  route();
}

// 사이트 안 링크는 페이지를 새로 불러오지 않고 바꿔요
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.('a');
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.hash) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});

window.addEventListener('popstate', route);
route();
