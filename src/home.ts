import { unlock, impact } from './audio';
import type { MatId } from './materials';
import { fitView, render, toWorld } from './render';
import { CATS, SCENES, type Cat, type Scene } from './scenes';
import { Matter, Sim } from './sim';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let lastFilter: Cat | 'all' = 'all';

export function mountHome(root: HTMLElement) {
  const free = SCENES.find((s) => s.id === 'free')!;
  const cats = (Object.keys(CATS) as Cat[]).filter((c) => c !== 'free');
  root.innerHTML = `
  <div class="home">
    <section class="hero">
      <canvas class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-text">
        <p class="eyebrow">⚛️ physics.euiyun.com</p>
        <h1>물리 놀이터</h1>
        <p class="lead">던지고, 띄우고, 부딪혀 보세요.<br/>공식을 몰라도 괜찮아요. 손으로 만지면 저절로 알게 되니까요.</p>
        <div class="cta">
          <a class="btn primary" href="#/play/${free.id}">🧪 자유 놀이터 바로 가기</a>
          <a class="btn" href="#experiments">실험 골라보기 ↓</a>
        </div>
        <p class="tap-hint">👆 배경을 눌러보세요</p>
      </div>
    </section>

    <section class="how">
      <div class="step"><b>1</b><span class="big">🎯</span><h3>놀이터 고르기</h3><p>중력, 마찰, 물, 전기, 충돌… 궁금한 걸 골라요.</p></div>
      <div class="step"><b>2</b><span class="big">✋</span><h3>놓고, 던지고, 잡아당기기</h3><p>톡 누르면 놓이고, 당겼다 놓으면 날아가요.</p></div>
      <div class="step"><b>3</b><span class="big">💡</span><h3>“왜 그럴까?” 알아보기</h3><p>신기한 일이 생기면 한 줄 설명을 펼쳐 보세요.</p></div>
    </section>

    <section class="experiments" id="experiments">
      <div class="sec-head">
        <h2>실험 놀이터 <small>${SCENES.length}곳</small></h2>
        <div class="filters">
          <button class="filter" data-f="all">전체</button>
          ${cats.map((c) => `<button class="filter" data-f="${c}" style="--c:${CATS[c].color}">${CATS[c].emoji} ${CATS[c].name}</button>`).join('')}
        </div>
      </div>
      <div class="grid">
        ${SCENES.map((s) => card(s)).join('')}
      </div>
    </section>

    <footer class="foot">
      <p>🧪 물리 놀이터 · 모든 실험은 브라우저 안에서 돌아가요. 설치도, 가입도 필요 없어요.</p>
      <p class="muted">진짜 세상을 아주 단순하게 흉내 낸 놀이용 시뮬레이션이에요. 숫자는 정확하지 않아도, 원리는 진짜예요.</p>
    </footer>
  </div>`;

  // 카테고리 필터
  const grid = root.querySelector('.grid')!;
  const applyFilter = (f: Cat | 'all') => {
    lastFilter = f;
    root.querySelectorAll<HTMLButtonElement>('.filter').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    grid.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      c.hidden = f !== 'all' && c.dataset.cat !== f && c.dataset.cat !== 'free';
    });
  };
  root.querySelectorAll<HTMLButtonElement>('.filter').forEach((b) =>
    b.addEventListener('click', () => applyFilter(b.dataset.f as Cat | 'all')),
  );
  applyFilter(lastFilter);
  root.querySelector('a[href="#experiments"]')!.addEventListener('click', (e) => {
    e.preventDefault();
    root.querySelector('#experiments')!.scrollIntoView({ behavior: 'smooth' });
  });

  const stopHero = hero(root.querySelector<HTMLCanvasElement>('.hero-canvas')!);
  const stopThumbs = thumbnails(root);
  return () => { stopHero(); stopThumbs(); };
}

function card(s: Scene) {
  const c = CATS[s.cat];
  return `<a class="card${s.cat === 'free' ? ' free' : ''}" href="#/play/${s.id}" data-cat="${s.cat}" style="--c:${c.color}">
    <div class="thumb"><canvas data-scene="${s.id}" width="480" height="270"></canvas><span class="badge">${s.emoji}</span></div>
    <div class="card-body">
      <span class="tag">${c.emoji} ${c.name}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.blurb)}</p>
    </div>
  </a>`;
}

/** 카드 미리보기: 실제 장면을 한 번 만들어 그려요 */
function thumbnails(root: HTMLElement) {
  let cancelled = false;
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const cv = e.target as HTMLCanvasElement;
      setTimeout(() => { if (!cancelled) drawThumb(cv); }, 0);
    }
  }, { rootMargin: '200px' });
  canvases.forEach((c) => io.observe(c));
  return () => { cancelled = true; io.disconnect(); };
}

function drawThumb(cv: HTMLCanvasElement) {
  const scene = SCENES.find((s) => s.id === cv.dataset.scene);
  if (!scene) return;
  const sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
  sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
  sim.air = scene.air ?? 1;
  sim.field = !!scene.field;
  sim.trails = !!scene.trails;
  const rt = scene.build(sim) ?? {};
  const steps = scene.id === 'solar' || scene.id === 'swirl' ? 160 : scene.id === 'charges' ? 40 : 20;
  for (let i = 0; i < steps; i++) sim.step();
  const ctx = cv.getContext('2d')!;
  render(ctx, sim, fitView(cv.width, cv.height, sim.W, sim.H, 1), { theme: scene.theme, back: rt.back, front: rt.front });
}

/** 첫 화면 배경: 얼굴 달린 공들이 통통 */
function hero(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const sim = new Sim(1600, 640);
  sim.bounds({ floor: 640 });
  sim.onImpact = impact;
  const mats: MatId[] = ['rubber', 'wood', 'ice', 'balloon', 'stone'];
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f1c'];
  let n = 0;
  const spawn = (x: number, y: number, vx = 0) => {
    const k = n++;
    const m = mats[k % mats.length];
    const r = 16 + Math.random() * 22;
    const b = k % 3 === 2
      ? sim.box(x, y, r * 2, r * 2, m === 'balloon' ? 'wood' : m)
      : sim.ball(x, y, r, m === 'balloon' ? 'rubber' : m, { face: true, color: colors[k % colors.length], stroke: 'rgba(0,0,0,0.25)' });
    Matter.Body.setVelocity(b, { x: vx, y: 0 });
    const live = sim.bodies().filter((q) => !q.isStatic);
    if (live.length > 34) sim.remove(live[0]);
  };
  for (let i = 0; i < 12; i++) spawn(100 + Math.random() * 1400, -100 - i * 80);

  let view = fitView(1, 1, 1, 1, 1);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    // 화면 폭에 맞추고 바닥은 아래에 붙여요
    const scale = r.width / sim.W;
    view = { scale, ox: 0, oy: r.height - sim.H * scale, cw: r.width, ch: r.height, dpr };
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  canvas.addEventListener('pointerdown', (e) => {
    unlock();
    const r = canvas.getBoundingClientRect();
    const p = toWorld(view, e.clientX - r.left, e.clientY - r.top);
    if (Math.random() < 0.3) sim.blast(p, 0.6);
    else spawn(p.x, p.y, (Math.random() - 0.5) * 10);
  });

  let raf = 0, last = performance.now(), timer = 0;
  const loop = (now: number) => {
    const dt = now - last; last = now;
    timer += dt;
    if (timer > 1400) { timer = 0; spawn(100 + Math.random() * 1400, -60, (Math.random() - 0.5) * 6); }
    sim.frame(dt);
    render(ctx, sim, view, { theme: 'sky', clip: false });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}
