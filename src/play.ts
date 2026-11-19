import { boom, click, ding, impact, isMuted, setMuted, unlock } from './audio';
import { MATERIALS, PICKABLE } from './materials';
import { icon } from './icons';
import { fitView, render, toWorld, type View } from './render';
import { CATS, type Runtime, type Scene } from './scenes';
import { Sim } from './sim';
import { ALL_TOOLS, SIZES, TOOLS, ToolController, type ToolId, type ToolState } from './tools';

const GRAVITY = [
  { id: 'earth', label: '지구', g: { x: 0, y: 1 } },
  { id: 'moon', label: '달', g: { x: 0, y: 0.17 } },
  { id: 'jupiter', label: '목성', g: { x: 0, y: 2.5 } },
  { id: 'zero', label: '무중력', g: { x: 0, y: 0 } },
  { id: 'up', label: '거꾸로', g: { x: 0, y: -1 } },
];
const AIR = [
  { v: 0, label: '진공' },
  { v: 1, label: '보통' },
  { v: 4, label: '진하게' },
];
const SPEEDS = [0.25, 0.5, 1, 2];
const SPEED_LABEL: Record<number, string> = { 0.25: '0.25×', 0.5: '0.5×', 1: '1×', 2: '2×' };

const ACT_ICON: Record<string, string> = { '🔄': 'reset', '🧭': 'arrow', '🌬️': 'wind', '🚀': 'play' };
const actIcon = (a: { icon: string; primary?: boolean }) => {
  const name = a.primary ? 'play' : ACT_ICON[a.icon];
  return name ? icon(name, 16) : '';
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mountPlay(root: HTMLElement, scene: Scene) {
  const cat = CATS[scene.cat];
  root.innerHTML = `
  <div class="play" style="--c:${cat.color}">
    <header class="pbar">
      <a href="#/" class="back" aria-label="실험 목록으로" title="실험 목록으로">${icon('back', 20)}</a>
      <div class="ptitle">
        <span class="crumb">${icon('cat-' + scene.cat, 14)}${cat.name}</span>
        <h1>${esc(scene.title)}</h1>
      </div>
      <div class="pctl">
        <div class="btngroup">
          <button class="ib" data-act="pause" title="일시정지 / 재생 (Space)" aria-label="일시정지">${icon('pause')}</button>
          <button class="ib wide" data-act="speed" title="시뮬레이션 속도">1×</button>
        </div>
        <div class="btngroup">
          <button class="ib" data-act="undo" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">${icon('undo')}</button>
          <button class="ib" data-act="reset" title="처음 상태로" aria-label="처음 상태로">${icon('reset')}</button>
        </div>
        <div class="btngroup">
          <button class="ib" data-act="sound" title="소리 켜기/끄기" aria-label="소리">${icon('sound')}</button>
          <button class="ib" data-act="settings" title="환경 설정: 중력·공기·표시" aria-label="환경 설정">${icon('settings')}</button>
        </div>
      </div>
    </header>
    <div class="pmain">
      <nav class="tools" aria-label="도구"></nav>
      <div class="stagecol">
      <div class="subbar"></div>
      <div class="stage">
        <canvas></canvas>
        <div class="hint">
          <button class="hint-toggle" aria-expanded="true">${icon('guide', 16)}<span>실험 가이드</span></button>
          <div class="hint-body">
            <ol>${scene.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
            <details><summary>${icon('bulb', 15)}왜 그럴까?</summary><p>${esc(scene.why)}</p></details>
          </div>
        </div>
        <div class="hud" hidden></div>
        <div class="actions"></div>
        <div class="toast" hidden></div>
        <div class="paused-badge" hidden>${icon('pause', 14)} 일시정지됨 · Space 키로 재생</div>
        <aside class="settings" hidden>
          <div class="set-head"><b>환경 설정</b><button class="ib sm" data-act="close-settings" aria-label="닫기">${icon('close', 16)}</button></div>
          <div class="set-group"><span>중력</span><div class="chips" data-set="gravity">${GRAVITY.map((g) => `<button class="chipbtn" data-v="${g.id}">${g.label}</button>`).join('')}</div></div>
          <div class="set-group"><span>공기 저항</span><div class="chips" data-set="air">${AIR.map((a) => `<button class="chipbtn" data-v="${a.v}">${a.label}</button>`).join('')}</div></div>
          <div class="set-group"><span>시뮬레이션 속도</span><div class="chips" data-set="speed">${SPEEDS.map((s) => `<button class="chipbtn" data-v="${s}">${SPEED_LABEL[s]}</button>`).join('')}</div></div>
          <div class="set-group"><span>표시</span>
            <button class="switch" data-toggle="trails"><span>이동 경로</span><i></i></button>
            <button class="switch" data-toggle="field"><span>힘 화살표</span><i></i></button>
          </div>
          <p class="set-note"><kbd>Space</kbd> 일시정지 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>1</kbd>–<kbd>9</kbd> 도구 선택</p>
        </aside>
      </div>
      </div>
    </div>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d')!;
  const stage = $<HTMLDivElement>('.stage');
  const toolsEl = $<HTMLElement>('.tools');
  const subbar = $<HTMLDivElement>('.subbar');
  const hud = $<HTMLDivElement>('.hud');
  const actionsEl = $<HTMLDivElement>('.actions');
  const toast = $<HTMLDivElement>('.toast');
  const settings = $<HTMLElement>('.settings');
  const pausedBadge = $<HTMLDivElement>('.paused-badge');

  const state: ToolState = { tool: scene.tool, mat: scene.mat ?? 'rubber', size: 1, variant: {} };
  let sim!: Sim;
  let rt: Runtime = {};
  let ctrl!: ToolController;
  let view: View = fitView(1, 1, 1, 1, 1);
  let shake = 0;
  let showAll = false;

  // ───────────────────── 장면 만들기 ─────────────────────
  function build() {
    sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
    sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
    sim.air = scene.air ?? 1;
    sim.trails = !!scene.trails;
    sim.field = !!scene.field;
    rt = scene.build(sim) ?? {};
    if (import.meta.env.DEV) (window as unknown as { __sim: Sim }).__sim = sim;
    sim.onImpact = impact;
    sim.onGoal = (b, g) => { ding(); rt.onGoal?.(b, g); };
    sim.onTick = rt.tick;
    ctrl = new ToolController(sim, state);
    ctrl.cueBall = rt.cue;
    ctrl.onAction = (k) => {
      if (k === 'blast') { boom(); shake = 14; }
      if (k === 'cue') click();
    };
    renderActions();
    syncSettings();
    resize();
  }

  // ───────────────────── 도구 상자 ─────────────────────
  function renderTools() {
    const list = showAll ? [...scene.tools, ...ALL_TOOLS.filter((t) => !scene.tools.includes(t))] : scene.tools;
    toolsEl.innerHTML = list
      .map((id, i) => {
        const t = TOOLS[id];
        const extra = !scene.tools.includes(id);
        return `<button class="tool${id === state.tool ? ' on' : ''}${extra ? ' extra' : ''}" data-tool="${id}" title="${esc(t.name)}${i < 9 ? ` (${i + 1})` : ''} — ${esc(t.tip)}">
          ${i < 9 ? `<kbd class="tk">${i + 1}</kbd>` : ''}<span class="ti">${icon(id, 22)}</span><span class="tn">${esc(t.name)}</span></button>`;
      })
      .join('') +
      (scene.tools.length < ALL_TOOLS.length
        ? `<button class="tool more" data-more="1" title="${showAll ? '추천 도구만 보기' : '모든 도구 보기'}"><span class="ti">${icon(showAll ? 'less' : 'more', 20)}</span><span class="tn">${showAll ? '접기' : '모든 도구'}</span></button>`
        : '');
  }

  function renderSubbar() {
    const def = TOOLS[state.tool];
    let html = `<div class="toolinfo">${icon(def.id, 16)}<b>${esc(def.name)}</b><span>${esc(def.tip)}</span></div>`;
    if (def.usesMat) {
      html += `<div class="seg">${PICKABLE.map((m) => {
        const mat = MATERIALS[m];
        return `<button class="mat${m === state.mat ? ' on' : ''}" data-mat="${m}" title="${mat.name}: ${mat.blurb}" style="--m:${mat.color};--ms:${mat.stroke}"><i></i>${mat.name}</button>`;
      }).join('')}</div>`;
    }
    if (def.usesSize) {
      html += `<div class="seg">${SIZES.map((s) => `<button class="size${s.id === state.size ? ' on' : ''}" data-size="${s.id}">${s.label}</button>`).join('')}</div>`;
    }
    if (def.variants) {
      const cur = state.variant[def.id] ?? def.variants[0].id;
      html += `<div class="seg">${def.variants.map((v) => `<button class="size${v.id === cur ? ' on' : ''}" data-variant="${v.id}">${v.label}</button>`).join('')}</div>`;
    }
    if (def.usesMat) {
      const m = MATERIALS[state.mat];
      html += `<div class="matinfo">${esc(m.name)} — ${esc(m.blurb)}</div>`;
    }
    subbar.innerHTML = html;
  }

  function selectTool(id: ToolId, announce = true) {
    ctrl?.cancel();
    state.tool = id;
    renderTools();
    renderSubbar();
    canvas.dataset.tool = id;
    if (announce) click();
  }

  let toastTimer = 0;
  function showToast(msg: string) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.remove('fade');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('fade'), 2600);
  }

  function renderActions() {
    const acts = rt.actions ?? [];
    actionsEl.innerHTML = acts
      .map((a, i) => `<button class="act${a.primary ? ' primary' : ''}" data-i="${i}">${actIcon(a)}<span>${esc(typeof a.label === 'function' ? a.label() : a.label)}</span></button>`)
      .join('');
  }

  function refreshActionLabels() {
    (rt.actions ?? []).forEach((a, i) => {
      if (typeof a.label !== 'function') return;
      const el = actionsEl.querySelector(`[data-i="${i}"]`);
      if (el) el.innerHTML = `${actIcon(a)}<span>${esc(a.label())}</span>`;
    });
  }

  // ───────────────────── 설정 ─────────────────────
  function syncSettings() {
    const mark = (sel: string, match: (v: string) => boolean) =>
      settings.querySelectorAll<HTMLButtonElement>(`[data-set="${sel}"] button`).forEach((b) => b.classList.toggle('on', match(b.dataset.v!)));
    mark('gravity', (v) => {
      const g = GRAVITY.find((x) => x.id === v)!.g;
      return g.x === sim.gravity.x && g.y === sim.gravity.y;
    });
    mark('air', (v) => Number(v) === sim.air);
    mark('speed', (v) => Number(v) === sim.speed);
    const sw = (k: string, on: boolean) => {
      const b = settings.querySelector(`[data-toggle="${k}"]`)!;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    };
    sw('trails', sim.trails);
    sw('field', sim.field);
    $<HTMLButtonElement>('[data-act="speed"]').textContent = SPEED_LABEL[sim.speed];
    const pb = $<HTMLButtonElement>('[data-act="pause"]');
    if (pb.dataset.state !== String(sim.paused)) {
      pb.dataset.state = String(sim.paused);
      pb.innerHTML = icon(sim.paused ? 'play' : 'pause');
      pb.setAttribute('aria-label', sim.paused ? '재생' : '일시정지');
    }
    pb.classList.toggle('hot', sim.paused);
    const sb = $<HTMLButtonElement>('[data-act="sound"]');
    sb.innerHTML = icon(isMuted() ? 'mute' : 'sound');
    $<HTMLButtonElement>('[data-act="settings"]').classList.toggle('on', !settings.hidden);
    pausedBadge.hidden = !sim.paused;
    refreshActionLabels();
  }

  function closeSettings() {
    settings.hidden = true;
    $<HTMLButtonElement>('[data-act="settings"]').classList.remove('on');
  }

  function togglePause() {
    sim.paused = !sim.paused;
    syncSettings();
  }

  // ───────────────────── 이벤트 ─────────────────────
  // root(#app)는 화면을 바꿔도 남아 있으니, 나갈 때 꼭 떼어 내야 해요
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || !root.contains(el)) return;
    unlock();
    if (el.dataset.tool) { selectTool(el.dataset.tool as ToolId); return; }
    if (el.dataset.more) { showAll = !showAll; renderTools(); return; }
    if (el.dataset.mat) { state.mat = el.dataset.mat as ToolState['mat']; renderSubbar(); return; }
    if (el.dataset.size) { state.size = Number(el.dataset.size); renderSubbar(); return; }
    if (el.dataset.variant) { state.variant[state.tool] = el.dataset.variant; renderSubbar(); return; }
    if (el.dataset.i !== undefined && el.classList.contains('act')) {
      const a = rt.actions?.[Number(el.dataset.i)];
      if (a) { a.run(); click(); if (sim.paused) { sim.paused = false; } syncSettings(); }
      return;
    }
    const group = el.parentElement?.dataset.set;
    if (group === 'gravity') sim.gravity = { ...GRAVITY.find((g) => g.id === el.dataset.v)!.g };
    if (group === 'air') sim.setAir(Number(el.dataset.v));
    if (group === 'speed') sim.speed = Number(el.dataset.v);
    if (el.dataset.toggle === 'trails') sim.trails = !sim.trails;
    if (el.dataset.toggle === 'field') sim.field = !sim.field;
    switch (el.dataset.act) {
      case 'pause': togglePause(); return;
      case 'speed': sim.speed = SPEEDS[(SPEEDS.indexOf(sim.speed) + 1) % SPEEDS.length]; showToast(`시뮬레이션 속도 ${SPEED_LABEL[sim.speed]}`); break;
      case 'undo': sim.undo(); break;
      case 'reset': build(); showToast('처음 상태로 되돌렸어요'); break;
      case 'sound': setMuted(!isMuted()); break;
      case 'settings': settings.hidden = !settings.hidden; break;
      case 'close-settings': settings.hidden = true; break;
    }
    syncSettings();
  };
  root.addEventListener('click', onClick);

  const hintToggle = $<HTMLButtonElement>('.hint-toggle');
  const hint = $<HTMLDivElement>('.hint');
  hintToggle.addEventListener('click', () => {
    const open = hint.classList.toggle('closed');
    hintToggle.setAttribute('aria-expanded', String(!open));
  });
  if (window.innerWidth < 720) hint.classList.add('closed');

  let activePointer: number | null = null;
  let touched = false;
  const worldPos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return toWorld(view, e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', (e) => {
    unlock();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    closeSettings();
    // 처음 만지면 설명 카드는 살짝 접어서 놀이터를 넓게
    if (!touched) { touched = true; hint.classList.add('closed'); }
    ctrl.down(worldPos(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (activePointer !== null && e.pointerId !== activePointer) return;
    ctrl.move(worldPos(e));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    ctrl.up(worldPos(e));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === activePointer) { activePointer = null; ctrl.cancel(); } });
  canvas.addEventListener('pointerleave', () => { if (activePointer === null) ctrl.hover = undefined; });

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); sim.undo(); return; }
    if (e.key === 'Escape') { ctrl.cancel(); closeSettings(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const btn = toolsEl.querySelectorAll<HTMLButtonElement>('[data-tool]')[n - 1];
      if (btn) selectTool(btn.dataset.tool as ToolId);
    }
  };
  window.addEventListener('keydown', onKey);

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    view = fitView(r.width, r.height, sim.W, sim.H, dpr);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);

  // ───────────────────── 돌리기 ─────────────────────
  let raf = 0;
  let last = performance.now();
  let frame = 0;
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (!sim.paused) ctrl.tick();
    sim.frame(dt);
    render(ctx, sim, view, {
      theme: scene.theme,
      back: rt.back,
      front: rt.front,
      overlay: (c) => ctrl.overlay(c),
      shake,
    });
    shake *= 0.85;
    if (shake < 0.5) shake = 0;
    if (frame++ % 10 === 0 && rt.hud) {
      const txt = rt.hud();
      if (hud.textContent !== txt) hud.textContent = txt;
      hud.hidden = false;
    }
    raf = requestAnimationFrame(loop);
  };

  build();
  selectTool(state.tool, false);
  raf = requestAnimationFrame(loop);

  const onVis = () => { last = performance.now(); };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    root.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    clearTimeout(toastTimer);
  };
}
