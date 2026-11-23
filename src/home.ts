import { unlock, impact } from './audio';
import { icon } from './icons';
import { fitView, render, syncLight, toWorld, type View } from './render';
import { CATS, SCENES, type Cat, type Scene } from './scenes';
import { D, Matter, Sim, type MBody } from './sim';
import { currentTheme, themeLabel, toggleTheme } from './theme';
import { scenePath } from './share';

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
      <a class="brand" href="/">${logo()}<span>물리 실험실</span><small>LABORATORY</small></a>
      <nav class="topnav-links">
        <a href="#experiments">실험 목록</a>
        <button class="theme-btn" type="button"></button>
        <a class="btn sm primary" href="${scenePath(free.id)}">자유 실험 열기</a>
      </nav>
    </header>

    <section class="hero">
      <canvas class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-text">
          <p class="eyebrow">Interactive Physics Laboratory</p>
          <h1>예측하고, 측정하고,<br/><em>이론으로 확인하는</em> 물리</h1>
          <p class="lead">낙하, 포물선, 마찰, 부력, 전기력, 자기장, 충돌.
            조건을 정하고 결과를 먼저 예측한 다음, SI 단위로 측정한 값을 이론식과 나란히 놓고 비교합니다.</p>
          <div class="cta">
            <a class="btn primary" href="${scenePath(first.id)}">${icon('play', 18)}첫 실험 시작하기</a>
            <a class="btn" href="#experiments">실험 둘러보기 ${icon('down', 18)}</a>
          </div>
          <ol class="steps">
            <li><b>예측</b><span>결과를 먼저 골라요</span></li>
            <li><b>측정</b><span>속도·에너지를 그래프로</span></li>
            <li><b>설명</b><span>식과 가정, 한계까지</span></li>
          </ol>
          <p class="tap-hint">오른쪽 구슬을 잡아 끌었다 놓아 보세요 · 운동량과 에너지 보존</p>
        </div>
      </div>
    </section>

    <section class="experiments" id="experiments">
      <div class="sec-head">
        <div>
          <span class="sec-kicker">Experiments</span>
          <h2>실험 목록</h2>
          <p class="sec-sub">${SCENES.length}개의 실험 · 설치나 가입 없이 브라우저에서 바로 실행됩니다</p>
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
        <p class="muted">교육용 2D 시뮬레이션입니다. 중력·마찰·전기력·자기장 속 운동은 SI 단위 식으로 계산하며, 각 실험의 ‘자세히’에 가정과 한계를 밝혀 두었습니다.<br />© 2026 <a href="https://euiyun.com">Euiyun Lab</a></p>
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

  // 밝은/어두운 화면 바꾸기
  const themeBtn = root.querySelector<HTMLButtonElement>('.theme-btn')!;
  const syncTheme = () => {
    themeBtn.innerHTML = icon(currentTheme() === 'light' ? 'moon' : 'sun', 17);
    themeBtn.title = themeBtn.ariaLabel = themeLabel();
  };
  syncTheme();
  themeBtn.addEventListener('click', toggleTheme);
  window.addEventListener('themechange', syncTheme);

  const stopHero = hero(root.querySelector<HTMLCanvasElement>('.hero-canvas')!);
  const stopThumbs = thumbnails(root);
  return () => { stopHero(); stopThumbs(); window.removeEventListener('themechange', syncTheme); };
}

function card(s: Scene) {
  const c = CATS[s.cat];
  return `<a class="card${s.cat === 'free' ? ' free' : ''}" href="${scenePath(s.id)}" data-cat="${s.cat}" style="--c:${c.color}">
    <div class="thumb"><canvas data-scene="${s.id}" width="480" height="270"></canvas>${s.starter ? `<span class="badge">${icon('star-badge', 11)}추천</span>` : ''}</div>
    <div class="card-body">
      <span class="tag">${icon('cat-' + s.cat, 14)}${c.name}</span>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.blurb)}</p>
      <span class="open">실험 열기 ${icon('arrow', 14)}</span>
    </div>
  </a>`;
}

function logo() {
  // 진자: 고정점, 줄, 추
  return `<svg class="logo" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect x="1" y="1" width="62" height="62" rx="9" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2"/><path d="M14 16h36" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M32 16l9 20" stroke="currentColor" stroke-width="1.75"/><circle cx="43" cy="41" r="7" fill="currentColor"/></svg>`;
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
      setTimeout(() => { if (!cancelled) { drawThumb(cv); drawn.add(cv); } }, 0);
    }
  }, { rootMargin: '200px' });
  canvases.forEach((c) => io.observe(c));
  // 테마를 바꾸면 이미 그린 미리보기도 새 바탕으로 다시 그려요
  const drawn = new Set<HTMLCanvasElement>();
  const redraw = () => drawn.forEach((cv) => drawThumb(cv));
  window.addEventListener('themechange', redraw);
  return () => { cancelled = true; io.disconnect(); window.removeEventListener('themechange', redraw); };
}

export function drawThumb(cv: HTMLCanvasElement) {
  const scene = SCENES.find((s) => s.id === cv.dataset.scene);
  if (!scene) return;
  // 장면을 만들 때 정해지는 색(물체·장식)이 이전 테마로 남지 않게 먼저 맞춰요
  syncLight();
  const sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
  sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
  sim.air = scene.air ?? 1;
  sim.field = !!scene.field;
  sim.trails = !!scene.trails;
  const rt = scene.build(sim) ?? {};
  const steps = scene.id === 'solar' || scene.id === 'swirl' ? 160 : scene.id === 'charges' ? 40 : 20;
  for (let i = 0; i < steps; i++) sim.step();
  const ctx = cv.getContext('2d')!;
  render(ctx, sim, thumbView(sim, cv.width, cv.height), { theme: scene.theme, back: rt.back, front: rt.front });
}

/**
 * 썸네일은 장면 전체 대신 물체가 모인 곳을 확대해 보여 줘요 (작은 카드에서 물체가 손톱만 해지지 않게).
 * 너무 확대하면 무슨 실험인지 모르니 장면 폭의 절반보다는 넓게 잡아요.
 */
function thumbView(sim: Sim, cw: number, ch: number): View {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
  };
  for (const b of sim.bodies()) {
    const d = D(b);
    if (!d) continue;
    const { min, max } = b.bounds;
    // 바닥·바깥 벽처럼 장면을 가로지르는 건 빼요
    if (d.kind === 'wall' && (max.x - min.x > sim.W * 0.6 || max.y - min.y > sim.H * 0.6)) continue;
    add(min.x, min.y, max.x, max.y);
  }
  for (const z of sim.zones) add(z.x, z.y, z.x + z.w, z.y + z.h);
  // 진자 줄의 고정점(틀 위쪽)도 보이게
  for (const c of Matter.Composite.allConstraints(sim.world)) {
    for (const [body, pt] of [[c.bodyA, c.pointA], [c.bodyB, c.pointB]] as const) {
      if (body || !pt) continue;
      add(pt.x - 30, pt.y - 40, pt.x + 30, pt.y + 10);
    }
  }
  if (!isFinite(x0)) return fitView(cw, ch, sim.W, sim.H, 1);
  const pad = 70;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const aspect = cw / ch;
  let w = Math.max(x1 - x0, (y1 - y0) * aspect, sim.W * 0.5);
  w = Math.min(w, sim.W, sim.H * aspect);
  const h = w / aspect;
  const cx = Math.min(sim.W - w / 2, Math.max(w / 2, (x0 + x1) / 2));
  const cy = Math.min(sim.H - h / 2, Math.max(h / 2, (y0 + y1) / 2));
  const scale = cw / w;
  return { scale, ox: -(cx - w / 2) * scale, oy: -(cy - h / 2) * scale, cw, ch, dpr: 1 };
}

/** 첫 화면 배경: 황동 틀의 뉴턴의 요람 */
function hero(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const sim = new Sim(1600, 640);
  sim.air = 0;
  sim.onImpact = impact;
  const n = 5, r = 30, L = 300, top = 110, cx = 1180;
  const gap = r * 1.98;
  const x0 = cx - ((n - 1) * gap) / 2;
  const anchors = Array.from({ length: n }, (_, i) => ({ x: x0 + i * gap, y: top }));
  // 밝은 바탕에서는 줄이 묻히지 않게 짙게
  const ropeColor = () => (currentTheme() === 'light' ? '#6f685b' : '#c9c3b6');
  const ropes: ReturnType<Sim['link']>[] = [];
  const balls: MBody[] = anchors.map((a) => {
    const b = sim.ball(a.x, top + L, r, 'metal', { inertia: Infinity, restitution: 1, friction: 0, air: 0, removable: false, face: false });
    b.slop = r * 0.02;
    ropes.push(sim.link({ point: a }, { body: b, point: { x: a.x, y: top + L } }, 'rope', { stiffness: 1, color: ropeColor() }));
    return b;
  });
  const patterns: [number, number][] = [[1, 0], [2, 0], [1, 1], [1, 0], [3, 0]];
  let pi = 0;
  const lift = () => {
    const [left, right] = patterns[pi++ % patterns.length];
    balls.forEach((b, i) => {
      let th = 0;
      if (i < left) th = -0.72;
      if (i >= n - right) th = 0.72;
      Matter.Body.setPosition(b, { x: anchors[i].x + Math.sin(th) * L, y: top + Math.cos(th) * L });
      Matter.Body.setVelocity(b, { x: 0, y: 0 });
    });
  };
  lift();
  const recolor = () => ropes.forEach((c) => { (c as unknown as { plugin: { d: { color?: string } } }).plugin.d.color = ropeColor(); });
  window.addEventListener('themechange', recolor);

  const frame = (c: CanvasRenderingContext2D) => {
    const w = (n - 1) * gap + 240, fx = cx - w / 2, base = top + L + r + 46;
    // 대리석 받침
    const g = c.createLinearGradient(0, base, 0, base + 22);
    g.addColorStop(0, '#24252a'); g.addColorStop(1, '#111215');
    c.fillStyle = g;
    c.fillRect(fx - 40, base, w + 80, 22);
    c.fillStyle = 'rgba(200,169,106,0.55)';
    c.fillRect(fx - 40, base, w + 80, 1);
    // 황동 틀
    const brass = c.createLinearGradient(0, top - 10, 0, base);
    brass.addColorStop(0, '#e2c88f'); brass.addColorStop(0.5, '#a88a52'); brass.addColorStop(1, '#6e5a33');
    c.strokeStyle = brass;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(fx, base); c.lineTo(fx, top); c.lineTo(fx + w, top); c.lineTo(fx + w, base);
    c.stroke();
    // 받침 위에 떨어지는 부드러운 빛
    c.save();
    c.translate(cx, base);
    c.scale(1, 0.12);
    const sh = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
    sh.addColorStop(0, 'rgba(200,169,106,0.16)'); sh.addColorStop(1, 'rgba(200,169,106,0)');
    c.fillStyle = sh;
    c.beginPath(); c.arc(0, 0, w * 0.55, Math.PI, 0); c.fill();
    c.restore();
  };

  let view = fitView(1, 1, 1, 1, 1);
  const resize = () => {
    const rc = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rc.width * dpr);
    canvas.height = Math.round(rc.height * dpr);
    if (rc.width < 720) {
      // 좁은 화면: 요람만 위쪽 가운데에 크게
      const scale = rc.width / 720;
      view = { scale, ox: rc.width / 2 - cx * scale, oy: 8 - (top - 60) * scale, cw: rc.width, ch: rc.height, dpr };
    } else {
      const scale = Math.min(rc.width / sim.W, rc.height / (sim.H - 20));
      view = { scale, ox: rc.width - sim.W * scale - Math.max(0, (rc.width - 1192) / 2) * 0.6, oy: (rc.height - sim.H * scale) / 2, cw: rc.width, ch: rc.height, dpr };
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let idle = 0;

  // ── 구슬 잡아 끌기 ──
  // 잡은 구슬을 바깥쪽으로 끌면 그 바깥의 구슬들도 같이 들려요 (실제 요람처럼 붙어서).
  // 끄는 동안 줄 길이를 지키며 고정점 둘레의 호를 따라 움직이고, 놓으면 그 자리에서 떨어져요.
  let drag: { id: number; i: number; th: number } | null = null;
  const MAX_TH = 0.95;
  const pos = (e: PointerEvent) => {
    const rc = canvas.getBoundingClientRect();
    return toWorld(view, e.clientX - rc.left, e.clientY - rc.top);
  };
  const ballAt = (p: { x: number; y: number }) =>
    balls.findIndex((b) => Math.hypot(b.position.x - p.x, b.position.y - p.y) < r * 1.35);
  /** 잡은 구슬 i 가 각도 th 일 때 같이 들리는 구슬들 */
  const group = (i: number, th: number) => (th < 0 ? balls.slice(0, i + 1) : balls.slice(i));
  const hold = () => {
    if (!drag) return;
    const set = group(drag.i, drag.th);
    for (const b of set) {
      const a = anchors[balls.indexOf(b)];
      Matter.Body.setPosition(b, { x: a.x + Math.sin(drag.th) * L, y: top + Math.cos(drag.th) * L });
      Matter.Body.setVelocity(b, { x: 0, y: 0 });
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    unlock();
    const i = ballAt(pos(e));
    if (i < 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const b = balls[i];
    drag = { id: e.pointerId, i, th: Math.atan2(b.position.x - anchors[i].x, b.position.y - top) };
    canvas.style.cursor = 'grabbing';
    idle = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      const p = pos(e);
      const a = anchors[drag.i];
      drag.th = Math.max(-MAX_TH, Math.min(MAX_TH, Math.atan2(p.x - a.x, Math.max(1, p.y - top))));
      hold();
      idle = 0;
    } else if (!drag && e.pointerType === 'mouse') {
      canvas.style.cursor = ballAt(pos(e)) >= 0 ? 'grab' : '';
    }
  });
  const drop = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    hold();
    drag = null;
    canvas.style.cursor = '';
    idle = 0;
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);

  let raf = 0, last = performance.now();
  const loop = (now: number) => {
    const dt = now - last; last = now;
    idle += dt;
    if (idle > 11000 && !drag) { idle = 0; lift(); }
    hold();
    sim.frame(dt);
    hold();
    render(ctx, sim, view, { theme: 'void', clip: false, back: frame });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('themechange', recolor); };
}
