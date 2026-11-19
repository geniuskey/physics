import { unlock, impact } from './audio';
import type { MatId } from './materials';
import { icon } from './icons';
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
    <header class="topnav">
      <a class="brand" href="#/">${logo()}<span>물리 놀이터</span></a>
      <nav class="topnav-links">
        <a href="#experiments">실험 목록</a>
        <a class="btn sm primary" href="#/play/${free.id}">자유 실험 열기</a>
      </nav>
    </header>

    <section class="hero">
      <canvas class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-text">
          <p class="eyebrow">인터랙티브 물리 샌드박스</p>
          <h1>손으로 만져 보며<br/>이해하는 물리</h1>
          <p class="lead">중력, 마찰, 부력, 전기와 자석, 충돌. 공식을 몰라도 괜찮아요.
            물체를 놓고, 던지고, 조건을 바꿔 보면 원리가 눈에 보입니다.</p>
          <div class="cta">
            <a class="btn primary" href="#experiments">실험 둘러보기 ${icon('down', 18)}</a>
            <a class="btn" href="#/play/${free.id}">자유 실험 열기</a>
          </div>
          <p class="tap-hint">배경을 클릭하면 물체가 떨어져요</p>
        </div>
      </div>
    </section>

    <section class="how">
      <div class="step"><span class="num">01</span><h3>실험 고르기</h3><p>궁금한 주제를 고르세요. 각 실험은 하나의 원리에 집중해요.</p></div>
      <div class="step"><span class="num">02</span><h3>직접 조작하기</h3><p>클릭하면 놓이고, 끌었다 놓으면 날아가요. 중력·공기 같은 조건도 바꿀 수 있어요.</p></div>
      <div class="step"><span class="num">03</span><h3>원리 확인하기</h3><p>실험 가이드의 “왜 그럴까?”에서 일어난 일을 쉬운 말로 설명해 드려요.</p></div>
    </section>

    <section class="experiments" id="experiments">
      <div class="sec-head">
        <div>
          <h2>실험 목록</h2>
          <p class="sec-sub">${SCENES.length}개의 실험 · 설치나 가입 없이 브라우저에서 바로 실행돼요</p>
        </div>
        <div class="filters" role="tablist">
          <button class="filter" data-f="all">전체</button>
          ${cats.map((c) => `<button class="filter" data-f="${c}" style="--c:${CATS[c].color}">${icon('cat-' + c, 15)}${CATS[c].name}</button>`).join('')}
        </div>
      </div>
      <div class="grid">
        ${SCENES.map((s) => card(s)).join('')}
      </div>
    </section>

    <footer class="foot">
      <div class="foot-inner">
        <span class="brand">${logo()}<span>물리 놀이터</span></span>
        <p class="muted">현실을 단순화한 교육용 시뮬레이션입니다. 수치는 근사값이지만 원리는 실제와 같아요.</p>
      </div>
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
  root.querySelectorAll('a[href="#experiments"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    root.querySelector('#experiments')!.scrollIntoView({ behavior: 'smooth' });
  }));

  const stopHero = hero(root.querySelector<HTMLCanvasElement>('.hero-canvas')!);
  const stopThumbs = thumbnails(root);
  return () => { stopHero(); stopThumbs(); };
}

function card(s: Scene) {
  const c = CATS[s.cat];
  return `<a class="card${s.cat === 'free' ? ' free' : ''}" href="#/play/${s.id}" data-cat="${s.cat}" style="--c:${c.color}">
    <div class="thumb"><canvas data-scene="${s.id}" width="480" height="270"></canvas></div>
    <div class="card-body">
      <span class="tag">${icon('cat-' + s.cat, 14)}${c.name}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.blurb)}</p>
      <span class="open">실험 열기 ${icon('arrow', 16)}</span>
    </div>
  </a>`;
}

function logo() {
  return `<svg class="logo" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><circle cx="32" cy="34" r="18" fill="#ff6b6b" stroke="#fff" stroke-width="3"/><circle cx="26" cy="31" r="4.2" fill="#fff"/><circle cx="38" cy="31" r="4.2" fill="#fff"/><circle cx="26.8" cy="31.8" r="2.2" fill="#222"/><circle cx="38.8" cy="31.8" r="2.2" fill="#222"/><path d="M26 40q6 5 12 0" stroke="#3a1f1f" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`;
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
  // 화면 폭만큼만 바닥이 있고 양옆은 낭떠러지
  sim.wall(sim.W / 2, 640 + 100, sim.W, 200, { color: '#6b7282', stroke: '#4c5262', friction: 0.8 });
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
    // 낭떠러지로 떨어진 물체는 지워요
    for (const b of sim.bodies()) if (!b.isStatic && b.position.y > sim.H + 300) sim.remove(b);
    render(ctx, sim, view, { theme: 'sky', clip: false });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}
