// 링크 미리보기 이미지 그리기 (?id=<실험 id> 또는 ?id=home). scripts/og.sh 참고
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { drawThumb } from '../src/home';
import { CATS, SCENES } from '../src/scenes';

const id = new URLSearchParams(location.search).get('id') ?? 'home';
const home = id === 'home';
const scene = SCENES.find((s) => s.id === (home ? 'cradle' : id))!;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

$('.brand').innerHTML = `<svg width="34" height="34" viewBox="0 0 64 64"><rect x="1" y="1" width="62" height="62" rx="9" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2"/><path d="M14 16h36" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M32 16l9 20" stroke="currentColor" stroke-width="1.75"/><circle cx="43" cy="41" r="7" fill="currentColor"/></svg>물리 실험실`;
if (home) {
  $('h1').innerHTML = '예측하고, 측정하고,<br/>이론으로 확인하는 물리';
  $('h1').classList.add('long');
  $('p').textContent = '낙하·포물선·마찰·부력·전기력·자기장·충돌. 설치 없이 브라우저에서 바로.';
  $('.cat').remove();
} else {
  const c = CATS[scene.cat];
  $('.og').style.setProperty('--c', c.color);
  $('.cat').textContent = c.name;
  $('h1').textContent = scene.title;
  if (scene.title.length > 9) $('h1').classList.add('long');
  $('p').textContent = scene.blurb;
}

const cv = document.querySelector('canvas')!;
cv.dataset.scene = scene.id;
document.fonts.ready.then(() => {
  drawThumb(cv);
  document.title = 'ready';
});
