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
  const first = SCENES.find((s) => s.starter)!;
  // 처음 온 사람을 위한 추천 실험이 목록 맨 앞에 와요
  const ordered = [...SCENES.filter((s) => s.starter), ...SCENES.filter((s) => !s.starter)];
  const cats = (Object.keys(CATS) as Cat[]).filter((c) => c !== 'free');
  root.innerHTML = `
  <div class="home">
    <header class="topnav">
      <a class="brand" href="#/">${logo()}<span>물리 실험실</span></a>
      <nav class="topnav-links">
        <a href="#experiments">실험 목록</a>
        <a class="btn sm primary" href="#/play/${free.id}">자유 실험 열기</a>
      </nav>
    </header>

    <section class="hero">
      <canvas class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-text">
          <p class="eyebrow">중·고등 물리 인터랙티브 실험실</p>
          <h1>예측하고, 측정하고,<br/>이론과 비교하는 물리</h1>
          <p class="lead">낙하, 포물선, 마찰, 부력, 전기력, 자기장, 충돌.
            조건을 바꿔 결과를 먼저 예측하고, 실제 단위(m, s, kg, J)로 측정한 값을 이론식과 비교해 보세요.</p>
          <div class="cta">
            <a class="btn primary" href="#/play/${first.id}">${icon('play', 18)}첫 실험 시작하기</a>
            <a class="btn" href="#experiments">실험 둘러보기 ${icon('down', 18)}</a>
          </div>
          <ol class="steps">
            <li><b>예측</b><span>결과를 먼저 골라요</span></li>
            <li><b>측정</b><span>속도·에너지를 그래프로</span></li>
            <li><b>설명</b><span>식과 가정, 한계까지</span></li>
          </ol>
          <p class="tap-hint">배경을 클릭하면 물체가 떨어져요</p>
        </div>
      </div>
    </section>

    <section class="experiments" id="experiments">
      <div class="sec-head">
        <div>
          <h2>실험 목록</h2>
          <p class="sec-sub">${SCENES.length}개의 실험 · 설치나 가입 없이 브라우저에서 바로 실행돼요</p>
        </div>
        <div class="filters" role="tablist" aria-label="주제별로 보기">
          <button class="filter" role="tab" data-f="all">전체</button>
          ${cats.map((c) => `<button class="filter" role="tab" data-f="${c}" style="--c:${CATS[c].color}">${icon('cat-' + c, 15)}${CATS[c].name}</button>`).join('')}
        </div>
      </div>
      <div class="grid">
        ${ordered.map((s) => card(s)).join('')}
      </div>
    </section>

    <footer class="foot">
      <div class="foot-inner">
        <span class="brand">${logo()}<span>물리 실험실</span></span>
        <p class="muted">교육용 2D 시뮬레이션입니다. 중력·마찰·전기력·자기장 속 운동은 SI 단위 식으로 계산하고, 각 실험의 ‘자세히’에 가정과 한계를 적어 두었어요.</p>
      </div>
    </footer>
  </div>`;

  // 카테고리 필터
  const grid = root.querySelector('.grid')!;
  const applyFilter = (f: Cat | 'all') => {
    lastFilter = f;
    root.querySelectorAll<HTMLButtonElement>('.filter').forEach((b) => {
      b.classList.toggle('on', b.dataset.f === f);
      b.setAttribute('aria-selected', String(b.dataset.f === f));
    });
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
    <div class="thumb"><canvas data-scene="${s.id}" width="480" height="270"></canvas>${s.starter ? `<span class="badge">${icon('star-badge', 13)}처음이라면 추천</span>` : ''}</div>
    <div class="card-body">
      <span class="tag">${icon('cat-' + s.cat, 14)}${c.name}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.blurb)}</p>
      <span class="open">실험 열기 ${icon('arrow', 16)}</span>
    </div>
  </a>`;
}

function logo() {
  // 포물선 궤적과 공: 던진 물체의 운동
  return `<svg class="logo" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><path d="M12 50Q28 2 50 40" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-dasharray="1 7"/><circle cx="50" cy="42" r="7" fill="#ff8a5b"/><path d="M10 52h44" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></svg>`;
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

/** 첫 화면 배경: 떨어지고 튀는 물체들 */
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
      : sim.ball(x, y, r, m === 'balloon' ? 'rubber' : m, { color: colors[k % colors.length], stroke: 'rgba(0,0,0,0.25)' });
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
