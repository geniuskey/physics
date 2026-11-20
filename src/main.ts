import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { mountHome } from './home';
import { mountPlay } from './play';
import { sceneById } from './scenes';
import { parseHash } from './share';

const app = document.getElementById('app')!;
let cleanup: (() => void) | undefined;
let homeScroll = 0;

function route() {
  const m = parseHash(location.hash);
  const scene = m ? sceneById(m.id) : undefined;
  if (!scene && location.hash.startsWith('#experiments') && cleanup) return;
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
    requestAnimationFrame(() => window.scrollTo(0, homeScroll));
  }
}

window.addEventListener('hashchange', route);
route();
