import { currentTheme, toggleTheme } from './theme';
import { boom, click, ding, impact, isMuted, setMuted, unlock } from './audio';
import { MATERIALS, PICKABLE } from './materials';
import { icon } from './icons';
import { fitView, render, toWorld, type View } from './render';
import { CATS, labelBoxes, type Runtime, type Scene } from './scenes';
import { D, Sim } from './sim';
import { PLANET_G } from './units';
import { Probe } from './probe';
import { Experiment } from './experiment';
import { buildHash, clampToStep, type Shared } from './share';
import { ALL_TOOLS, SIZES, TOOLS, ToolController, type ToolId, type ToolState } from './tools';

const GRAVITY = [
  { id: 'earth', label: '지구', g: { x: 0, y: 1 } },
  { id: 'moon', label: '달', g: { x: 0, y: PLANET_G.moon } },
  { id: 'jupiter', label: '목성', g: { x: 0, y: PLANET_G.jupiter } },
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

const deepList = (title: string, items: string[], cls = '') =>
  items.length ? `<h4>${esc(title)}</h4><ul class="${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';

export function mountPlay(root: HTMLElement, scene: Scene, shared?: Shared) {
  const cat = CATS[scene.cat];
  root.innerHTML = `
  <div class="play" style="--c:${cat.color}">
    <header class="pbar">
      <a href="#/" class="back" aria-label="실험 목록으로" title="실험 목록으로">${icon('back', 20)}</a>
      <div class="ptitle">
        <span class="crumb">${icon('cat-' + scene.cat, 14)}${cat.name}</span>
        <h1>${esc(scene.title)}</h1>
      </div>
      <div class="subbar"></div>
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
          <button class="ib" data-act="measure" title="측정: 속도·에너지·그래프 (M)" aria-label="측정">${icon('chart')}</button>
          <button class="ib" data-act="share" title="지금 실험 조건으로 링크 복사" aria-label="링크 복사">${icon('link')}</button>
        </div>
        <div class="btngroup">
          <button class="ib" data-act="sound" title="소리 켜기/끄기" aria-label="소리">${icon('sound')}</button>
          <button class="ib" data-act="settings" title="환경 설정: 중력·공기·표시" aria-label="환경 설정">${icon('settings')}</button>
        </div>
      </div>
    </header>
    <div class="pmain">
      <nav class="tools" aria-label="도구"></nav>
      <div class="stage">
        <canvas></canvas>
        <div class="hint">
          <button class="hint-toggle" aria-expanded="true">${icon('guide', 16)}<span>실험 가이드</span></button>
          <div class="hint-body">
            <ol>${scene.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
            <details class="why"><summary>${icon('bulb', 15)}왜 그럴까?</summary><p>${esc(scene.why)}</p>
              <details class="deep"><summary>자세히: 식 · 가정 · 한계</summary>
                ${deepList('핵심 식', scene.deep.law, 'law')}
                ${deepList('이 시뮬레이션의 가정', scene.deep.assume)}
                ${deepList('실제와 다른 점', scene.deep.limit)}
              </details>
            </details>
          </div>
        </div>
        <div class="hud" hidden></div>
        <div class="actions"></div>
        <div class="panbar" hidden aria-hidden="true"><i></i></div>
        <div class="notices">
          <div class="paused-badge" hidden>${icon('pause', 14)} 일시정지됨 · Space 키로 재생</div>
          <div class="toast" role="status" hidden></div>
        </div>
        <aside class="settings" hidden>
          <div class="set-head"><b>환경 설정</b><button class="ib sm" data-act="close-settings" aria-label="닫기">${icon('close', 16)}</button></div>
          <div class="set-group"><span>중력</span><div class="chips" data-set="gravity">${GRAVITY.map((g) => `<button class="chipbtn" data-v="${g.id}">${g.label}</button>`).join('')}</div></div>
          <div class="set-group"><span>공기 저항</span><div class="chips" data-set="air">${AIR.map((a) => `<button class="chipbtn" data-v="${a.v}">${a.label}</button>`).join('')}</div></div>
          <div class="set-group"><span>시뮬레이션 속도</span><div class="chips" data-set="speed">${SPEEDS.map((s) => `<button class="chipbtn" data-v="${s}">${SPEED_LABEL[s]}</button>`).join('')}</div></div>
          <div class="set-group"><span>표시</span>
            <button class="switch" data-toggle="trails"><span>이동 경로</span><i></i></button>
            <button class="switch" data-toggle="field"><span>힘 화살표</span><i></i></button>
            <button class="switch" data-toggle="sound"><span>소리</span><i></i></button>
            <button class="switch" data-toggle="light"><span>밝은 화면</span><i></i></button>
          </div>
          <p class="set-note"><kbd>Space</kbd> 일시정지 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>M</kbd> 측정 · <kbd>1</kbd>–<kbd>9</kbd> 도구 선택</p>
        </aside>
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
  const panbar = $<HTMLDivElement>('.panbar');
  const hint = $<HTMLDivElement>('.hint');

  const state: ToolState = { tool: scene.tool, mat: scene.mat ?? 'rubber', size: 1, variant: {} };
  let sim!: Sim;
  let rt: Runtime = {};
  let ctrl!: ToolController;
  let view: View = fitView(1, 1, 1, 1, 1);
  let shake = 0;
  let showAll = false;
  /** 세로 화면에서 장면을 확대해 보여줄 때 카메라 중심(세상 x) */
  let camX = (scene.W ?? 1600) / 2;
  let canPan = false;
  let panTold = false;
  const probe = new Probe(stage, () => sim, (m) => showToast(m));
  const exp = new Experiment(stage);
  exp.onStart = () => { sim.paused = false; closeSettings(); syncSettings(); };
  exp.onParam = () => { if (rt.hud) hud.textContent = rt.hud(); syncUrl(); };
  /** 주소에 담긴(또는 바꾼) 실험 조건. 처음 상태로 되돌려도 이 조건은 그대로예요 */
  const cond: Shared = { params: { ...(shared?.params ?? {}) }, g: shared?.g, air: shared?.air };
  let defaults: Record<string, number> = {};

  /** 지금 조건 중 기본값과 다른 것만 주소에 남겨요 */
  function syncUrl() {
    cond.params = {};
    for (const p of rt.params ?? []) if (p.value !== defaults[p.id]) cond.params[p.id] = p.value;
    const g0 = scene.gravity ?? { x: 0, y: 1 };
    const g = GRAVITY.find((x) => x.g.x === sim.gravity.x && x.g.y === sim.gravity.y);
    cond.g = g && (g.g.x !== g0.x || g.g.y !== g0.y) ? g.id : undefined;
    cond.air = sim.air !== (scene.air ?? 1) ? sim.air : undefined;
    const hash = buildHash(scene.id, cond);
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  /** 주소로 받은 조건을 새로 만든 장면에 적용해요 */
  function applyCond() {
    defaults = Object.fromEntries((rt.params ?? []).map((p) => [p.id, p.value]));
    for (const p of rt.params ?? []) {
      const v = cond.params[p.id];
      if (v === undefined) continue;
      p.value = clampToStep(v, p.min, p.max, p.step);
      p.onChange?.(p.value);
    }
    const g = cond.g && GRAVITY.find((x) => x.id === cond.g);
    if (g) sim.gravity = { ...g.g };
    if (cond.air !== undefined && AIR.some((a) => a.v === cond.air)) sim.setAir(cond.air);
  }

  async function copyLink() {
    syncUrl();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크를 복사했어요. 같은 실험 조건으로 열려요');
    } catch {
      window.prompt('이 링크를 복사하세요', url);
    }
  }
  probe.onChange = () => {
    $<HTMLButtonElement>('[data-act="measure"]').classList.toggle('on', probe.open);
    stage.classList.toggle('probing', probe.open);
    placeGuide();
  };

  // ───────────────────── 장면 만들기 ─────────────────────
  function build() {
    sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
    sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
    sim.air = scene.air ?? 1;
    sim.trails = !!scene.trails;
    sim.field = !!scene.field;
    rt = scene.build(sim) ?? {};
    applyCond();
    if (import.meta.env.DEV) (window as unknown as { __sim: Sim }).__sim = sim;
    sim.onImpact = impact;
    sim.onGoal = (b, g) => { ding(); rt.onGoal?.(b, g); };
    sim.onTick = () => { rt.tick?.(); probe.sample(); };
    probe.reset();
    exp.mount(sim, rt.params, rt.predict);
    ctrl = new ToolController(sim, state);
    ctrl.cueBall = rt.cue;
    ctrl.onAction = (k) => {
      if (k === 'blast') { boom(); shake = 14; }
      if (k === 'cue') click();
    };
    renderActions();
    syncSettings();
    camX = scene.focusX ?? sim.W / 2;
    resize();
  }

  // ───────────────────── 도구 상자 ─────────────────────
  function renderTools() {
    const list = showAll ? [...scene.tools, ...ALL_TOOLS.filter((t) => !scene.tools.includes(t))] : scene.tools;
    toolsEl.innerHTML = list
      .map((id, i) => {
        const t = TOOLS[id];
        const extra = !scene.tools.includes(id);
        return `<button class="tool${id === state.tool ? ' on' : ''}${extra ? ' extra' : ''}" data-tool="${id}" aria-pressed="${id === state.tool}" title="${esc(t.name)}${i < 9 ? ` (${i + 1})` : ''} — ${esc(t.tip)}">
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
        return `<button class="mat${m === state.mat ? ' on' : ''}" data-mat="${m}" aria-pressed="${m === state.mat}" title="${mat.name}: ${mat.blurb}" style="--m:${mat.color};--ms:${mat.stroke}"><i></i>${mat.name}</button>`;
      }).join('')}</div>`;
    }
    if (def.usesSize) {
      html += `<div class="seg">${SIZES.map((s) => `<button class="size${s.id === state.size ? ' on' : ''}" data-size="${s.id}" aria-pressed="${s.id === state.size}">${s.label}</button>`).join('')}</div>`;
    }
    if (def.variants) {
      const cur = state.variant[def.id] ?? def.variants[0].id;
      html += `<div class="seg">${def.variants.map((v) => `<button class="size${v.id === cur ? ' on' : ''}" data-variant="${v.id}" aria-pressed="${v.id === cur}">${v.label}</button>`).join('')}</div>`;
    }
    if (def.usesMat) {
      const m = MATERIALS[state.mat];
      html += `<div class="matinfo">${esc(m.name)} — ${esc(m.blurb)}</div>`;
    }
    subbar.innerHTML = html;
    subbarFade();
  }

  /** 도구 옵션 줄이 화면보다 길면 오른쪽 끝을 흐리게 (더 넘길 수 있다는 표시) */
  function subbarFade() {
    subbar.classList.toggle('more-r', subbar.scrollLeft + subbar.clientWidth < subbar.scrollWidth - 4);
  }
  subbar.addEventListener('scroll', subbarFade, { passive: true });

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
      settings.querySelectorAll<HTMLButtonElement>(`[data-set="${sel}"] button`).forEach((b) => {
        const on = match(b.dataset.v!);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
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
    sw('sound', !isMuted());
    sw('light', currentTheme() === 'light');
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
    if (group === 'gravity' || group === 'air') syncUrl();
    if (group === 'speed') sim.speed = Number(el.dataset.v);
    if (el.dataset.toggle === 'trails') sim.trails = !sim.trails;
    if (el.dataset.toggle === 'field') sim.field = !sim.field;
    if (el.dataset.toggle === 'sound') setMuted(!isMuted());
    if (el.dataset.toggle === 'light') toggleTheme();
    switch (el.dataset.act) {
      case 'pause': togglePause(); return;
      case 'speed': sim.speed = SPEEDS[(SPEEDS.indexOf(sim.speed) + 1) % SPEEDS.length]; showToast(`시뮬레이션 속도 ${SPEED_LABEL[sim.speed]}`); break;
      case 'undo': sim.undo(); break;
      case 'reset': build(); showToast('처음 상태로 되돌렸어요'); break;
      case 'sound': setMuted(!isMuted()); break;
      case 'settings': settings.hidden = !settings.hidden; break;
      case 'measure': probe.toggle(); break;
      case 'share': void copyLink(); break;
      case 'close-settings': settings.hidden = true; break;
    }
    syncSettings();
  };
  root.addEventListener('click', onClick);

  const hintToggle = $<HTMLButtonElement>('.hint-toggle');
  const setHint = (open: boolean) => {
    hint.classList.toggle('closed', !open);
    hintToggle.setAttribute('aria-expanded', String(open));
    if (open) placeGuide();
  };
  /** 사람이 직접 가이드를 열고 닫았으면 자동으로 접지 않아요 */
  let hintByUser = false;
  hintToggle.addEventListener('click', () => { hintByUser = true; setHint(hint.classList.contains('closed')); });
  // "왜 그럴까?"·"자세히"를 펼치면 카드가 커지니 자리를 다시 골라요
  hint.addEventListener('toggle', () => placeGuide(), true);
  // 낮은 가로 화면(휴대폰 가로)에서는 공간이 없어 접어 두고 시작해요
  if (window.innerHeight < 500) setHint(false);

  let activePointer: number | null = null;
  let touched = false;
  /** 화면 좌표로 누르고 있는 손가락들 (두 손가락 밀기용) */
  const pts = new Map<number, number>();
  let pan: { baseX: number; camX: number } | null = null;
  const midX = () => [...pts.values()].reduce((a, b) => a + b, 0) / Math.max(1, pts.size);
  const startPan = () => { pan = { baseX: midX(), camX }; };
  const worldPos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return toWorld(view, e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', (e) => {
    unlock();
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, e.clientX);
    e.preventDefault();
    closeSettings();
    // 처음 만지면 설명 카드는 살짝 접어서 실험 화면을 넓게
    if (!touched) { touched = true; setHint(false); }
    if (pan) { startPan(); return; }
    if (canPan && pts.size === 2) {
      // 두 번째 손가락: 하던 동작은 취소하고 화면 밀기
      if (activePointer !== null) { ctrl.cancel(); activePointer = null; }
      startPan();
      return;
    }
    if (activePointer !== null) return;
    const p = worldPos(e);
    // 측정 패널이 열려 있으면 누른 물체를 측정 대상으로 골라요 (도구 동작은 그대로)
    probe.pick(p);
    // 잡기 도구로 빈 곳을 끌면 화면을 옆으로 밀어요
    if (canPan && state.tool === 'hand' && !sim.bodyAt(p, 8)) { startPan(); return; }
    activePointer = e.pointerId;
    ctrl.down(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, e.clientX);
    if (pan) {
      if (pts.has(e.pointerId)) setCam(pan.camX - (midX() - pan.baseX) / view.scale);
      return;
    }
    if (activePointer !== null && e.pointerId !== activePointer) return;
    ctrl.move(worldPos(e));
  });
  const lift = (e: PointerEvent, cancelled: boolean) => {
    if (!pts.delete(e.pointerId)) return;
    if (pan) {
      if (pts.size === 0) pan = null;
      else startPan();
      return;
    }
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (cancelled) ctrl.cancel();
    else ctrl.up(worldPos(e));
  };
  canvas.addEventListener('pointerup', (e) => lift(e, false));
  canvas.addEventListener('pointercancel', (e) => lift(e, true));
  canvas.addEventListener('pointerleave', () => { if (activePointer === null) ctrl.hover = undefined; });

  // 위쪽 막대를 끌어도 화면을 밀 수 있어요
  panbar.addEventListener('pointerdown', (e) => {
    panbar.setPointerCapture(e.pointerId);
    const r = panbar.getBoundingClientRect();
    const go = (x: number) => setCam(((x - r.left) / r.width) * sim.W);
    go(e.clientX);
    const mv = (ev: PointerEvent) => go(ev.clientX);
    const up = () => { panbar.removeEventListener('pointermove', mv); panbar.removeEventListener('pointerup', up); };
    panbar.addEventListener('pointermove', mv);
    panbar.addEventListener('pointerup', up);
    e.preventDefault();
  });

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); sim.undo(); return; }
    if (e.key === 'Escape') { ctrl.cancel(); closeSettings(); exp.close(); return; }
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) { probe.toggle(); return; }
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
    updateView(r.width, r.height, dpr);
    placeGuide();
    subbarFade();
  }

  /**
   * 화면이 장면보다 훨씬 세로로 길면(휴대폰 세로) 그냥 맞추면 장면이 손톱만 해져요.
   * 그럴 땐 장면을 확대해서 땅을 화면 아래에 붙이고, 양옆은 밀어서 둘러보게 해요.
   */
  function updateView(cw: number, ch: number, dpr: number) {
    const { W, H } = sim;
    const fit = fitView(cw, ch, W, H, dpr);
    const tall = cw / ch < 1 && fit.oy > ch * 0.15;
    if (!tall) {
      view = fit;
      canPan = false;
    } else {
      // 장면 폭의 60% 이상은 보이게, 높이는 화면의 90%까지만
      const scale = Math.max(fit.scale, Math.min((ch * 0.9) / H, cw / (W * 0.6)));
      const visW = cw / scale;
      canPan = visW < W - 1;
      camX = Math.min(W - visW / 2, Math.max(visW / 2, camX));
      view = { scale, ox: cw / 2 - camX * scale, oy: ch - H * scale, cw, ch, dpr };
      if (canPan && !panTold) { panTold = true; showToast('양옆으로 밀면 장면을 둘러볼 수 있어요'); }
    }
    stage.style.setProperty('--world-top', `${Math.max(0, view.oy)}px`);
    stage.classList.toggle('tall', tall);
    panbar.hidden = !canPan;
    if (canPan) {
      const visW = cw / view.scale;
      const th = panbar.firstElementChild as HTMLElement;
      th.style.width = `${(visW / W) * 100}%`;
      th.style.left = `${((camX - visW / 2) / W) * 100}%`;
    }
  }

  function setCam(x: number) {
    camX = x;
    updateView(view.cw, view.ch, view.dpr);
  }

  type Corner = 'tl' | 'tr' | 'bl' | 'br';
  /**
   * 실험 가이드 카드가 물체·이름표·패널을 가리지 않는 모서리를 골라요.
   * 돌려주는 값은 고른 자리에서 가리는 넓이를 카드 넓이로 나눈 비율이에요 (0 = 아무것도 안 가림)
   */
  function placeGuide(): number {
    if (hint.classList.contains('closed')) return 0;
    const sr = stage.getBoundingClientRect();
    const hw = hint.offsetWidth, hh = hint.offsetHeight, m = 12;
    const rects: Record<Corner, [number, number, number, number]> = {
      tl: [m, m, hw, hh],
      tr: [sr.width - m - hw, m, hw, hh],
      bl: [m, sr.height - m - hh, hw, hh],
      br: [sr.width - m - hw, sr.height - m - hh, hw, hh],
    };
    const act = actionsEl.getBoundingClientRect();
    // 측정 패널·실험 조건 카드도 가리지 않게
    const panels = ['.probe', '.params'].flatMap((sel) => {
      const el = stage.querySelector<HTMLElement>(sel);
      if (!el || el.hidden) return [];
      const r = el.getBoundingClientRect();
      return [[r.left - sr.left, r.top - sr.top, r.width, r.height]];
    });
    const overlap = (a: number[], b: number[]) =>
      Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const boxes: number[][] = [];
    for (const b of sim.bodies()) {
      const d = D(b);
      if (!d || d.kind === 'drop') continue;
      const w = b.bounds.max.x - b.bounds.min.x, h = b.bounds.max.y - b.bounds.min.y;
      // 바깥 벽·바닥처럼 장면을 가로지르는 건 빼요
      if (d.kind === 'wall' && (w > sim.W * 0.6 || h > sim.H * 0.6)) continue;
      boxes.push([b.bounds.min.x * view.scale + view.ox, b.bounds.min.y * view.scale + view.oy, w * view.scale, h * view.scale]);
    }
    // 장면 이름표("나무 μs 0.40", "왼쪽으로 휘는 자기장" 등)는 글자라서 조금만 가려도 못 읽어요
    const labels = labelBoxes.map(([x, y, w, h]) => [x * view.scale + view.ox, y * view.scale + view.oy, w * view.scale, h * view.scale]);
    const order: Corner[] = scene.guideAt ? [scene.guideAt] : ['tl', 'tr', 'bl', 'br'];
    let best: Corner = order[0], bestScore = Infinity;
    for (const c of order) {
      const r = rects[c];
      let score = boxes.reduce((a, bx) => a + overlap(r, bx), 0);
      for (const lb of labels) score += overlap(r, lb) * 3;
      if (act.width) score += overlap(r, [act.left - sr.left, act.top - sr.top, act.width, act.height]) * 2;
      for (const pr of panels) score += overlap(r, pr) * 4;
      // 장면 밖(빈 하늘)에 있으면 더 좋아요
      score += overlap(r, [view.ox, view.oy, sim.W * view.scale, sim.H * view.scale]) * 0.02;
      if (score < bestScore - 1) { best = c; bestScore = score; }
    }
    stage.dataset.guide = best;
    // 같은 세로줄에 실험 조건 카드가 있으면 그 카드에 닿기 전까지만 늘어나요
    const r = rects[best];
    let maxH = sr.height - 2 * m;
    for (const pr of panels) {
      if (pr[0] >= r[0] + r[2] || pr[0] + pr[2] <= r[0]) continue;
      maxH = best[0] === 't' ? Math.min(maxH, pr[1] - 2 * m) : Math.min(maxH, sr.height - (pr[1] + pr[3]) - 2 * m);
    }
    hint.style.maxHeight = `${Math.max(160, maxH)}px`;
    // 빈 하늘 가산점(0.02)은 빼고, 실제로 가리는 것만 비율로
    const sky = overlap(r, [view.ox, view.oy, sim.W * view.scale, sim.H * view.scale]) * 0.02;
    return Math.max(0, bestScore - sky) / Math.max(1, hw * hh);
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
    labelBoxes.length = 0;
    render(ctx, sim, view, {
      theme: scene.theme,
      back: rt.back,
      front: rt.front,
      overlay: (c) => { probe.overlay(c); ctrl.overlay(c); },
      shake,
      skyAbove: Math.max(0, view.oy / view.scale),
    });
    shake *= 0.85;
    if (shake < 0.5) shake = 0;
    if (probe.open && frame % 6 === 0) probe.render();
    if (frame % 10 === 5) exp.poll();
    // 첫 화면이 그려진 뒤(이름표 자리를 안 뒤): 어느 모서리에 두어도 장면을 많이 가리면 접어서 시작해요
    // 휴대폰처럼 좁은 화면은 카드가 장면 위쪽을 통째로 덮으니 늘 접어서 시작해요
    if (frame === 2 && !hintByUser && !touched && (stage.clientWidth < 600 || placeGuide() > 0.06)) setHint(false);
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
