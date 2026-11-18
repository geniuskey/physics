import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { mountHome } from './home';
import { mountPlay } from './play';
import { sceneById } from './scenes';

const app = document.getElementById('app')!;
let cleanup: (() => void) | undefined;
let homeScroll = 0;

function route() {
  const m = location.hash.match(/^#\/play\/([\w-]+)/);
  const scene = m ? sceneById(m[1]) : undefined;
  if (!scene && location.hash.startsWith('#experiments') && cleanup) return;
  // 목록에서 실험으로 들어갈 때 스크롤 위치를 기억해 두었다가 돌아오면 복원
  if (scene && !document.body.classList.contains('playing')) homeScroll = window.scrollY;
  cleanup?.();
  app.innerHTML = '';
  if (scene) {
    document.body.classList.add('playing');
    document.title = `${scene.title} — 물리 놀이터`;
    cleanup = mountPlay(app, scene);
    window.scrollTo(0, 0);
  } else {
    document.body.classList.remove('playing');
    document.title = '물리 놀이터 — 던지고 띄우고 부딪혀 보는 물리 샌드박스';
    cleanup = mountHome(app);
    requestAnimationFrame(() => window.scrollTo(0, homeScroll));
  }
}

window.addEventListener('hashchange', route);
route();
