import { icon } from './icons';
import type { Param, Predict } from './scenes';
import type { Sim } from './sim';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const show = (v: number, step: number) => v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));

/** 예측 실험이 이 시간(물리 시간) 안에 끝나지 않으면 포기해요 */
const TIMEOUT_MS = 30000;

/**
 * 실험 조건(슬라이더)과 예측 → 관찰 → 설명 카드.
 * 장면이 바뀔 때마다 mount() 로 새 Runtime 의 params / predict 를 붙여요.
 */
export class Experiment {
  private paramsEl: HTMLElement;
  private predictEl: HTMLElement;
  private params: Param[] = [];
  private predict?: Predict;
  private state: { phase: 'ask' } | { phase: 'run'; choice: number; t0: number } | { phase: 'done' } | undefined;
  private sim!: Sim;
  /** 예측 실험을 시작할 때 (일시정지 풀기 등) */
  onStart?: () => void;
  /** 조건이 바뀌었을 때 */
  onParam?: () => void;

  constructor(stage: HTMLElement) {
    this.paramsEl = document.createElement('div');
    this.paramsEl.className = 'params';
    this.paramsEl.hidden = true;
    this.predictEl = document.createElement('div');
    this.predictEl.className = 'predict';
    this.predictEl.hidden = true;
    this.predictEl.setAttribute('role', 'dialog');
    this.predictEl.setAttribute('aria-label', '예측하고 실험하기');
    stage.append(this.paramsEl, this.predictEl);

    this.paramsEl.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const p = this.params.find((q) => q.id === el.dataset.param);
      if (!p) return;
      p.value = Number(el.value);
      p.onChange?.(p.value);
      el.closest('.param')!.querySelector('output')!.textContent = `${show(p.value, p.step)} ${p.unit}`;
      this.onParam?.();
    });
    this.paramsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.p === 'toggle') {
        const closed = this.paramsEl.classList.toggle('closed');
        b.setAttribute('aria-expanded', String(!closed));
      }
      if (b.dataset.p === 'predict') this.ask();
    });
    this.predictEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.choice !== undefined) this.run(Number(b.dataset.choice));
      if (b.dataset.p === 'again') this.ask();
      if (b.dataset.p === 'close') this.close();
    });
  }

  mount(sim: Sim, params: Param[] = [], predict?: Predict) {
    this.sim = sim;
    this.params = params;
    this.predict = predict;
    this.close();
    const has = params.length > 0 || !!predict;
    this.paramsEl.hidden = !has;
    if (!has) return;
    // 좁은 화면에서는 접어 두고 시작해요
    const closed = window.innerWidth <= 720;
    this.paramsEl.classList.toggle('closed', closed);
    this.paramsEl.innerHTML = `
      <button class="params-toggle" data-p="toggle" aria-expanded="${!closed}">${icon('settings', 15)}<span>실험 조건</span></button>
      <div class="params-body">
        ${params.map((p) => `
          <label class="param">
            <span>${esc(p.label)}</span><output>${show(p.value, p.step)} ${esc(p.unit)}</output>
            <input type="range" data-param="${p.id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" aria-label="${esc(p.label)}">
          </label>`).join('')}
        ${predict ? `<button class="predict-btn" data-p="predict">${icon('guide', 16)}예측하고 실험하기</button>` : ''}
      </div>`;
  }

  /** 다른 곳에서 값을 바꿨을 때 슬라이더도 맞춰요 */
  private syncInputs() {
    for (const p of this.params) {
      const el = this.paramsEl.querySelector<HTMLInputElement>(`[data-param="${p.id}"]`);
      if (!el) continue;
      el.value = String(p.value);
      el.closest('.param')!.querySelector('output')!.textContent = `${show(p.value, p.step)} ${p.unit}`;
    }
  }

  get busy() {
    return this.state?.phase === 'run';
  }

  private ask() {
    const p = this.predict;
    if (!p) return;
    this.state = { phase: 'ask' };
    this.predictEl.hidden = false;
    this.predictEl.innerHTML = `
      <div class="pr-head"><span class="pr-step">1 · 예측</span><button class="ib sm" data-p="close" aria-label="닫기">${icon('close', 16)}</button></div>
      <p class="pr-q">${esc(p.question)}</p>
      <div class="pr-opts">${p.options.map((o, i) => `<button class="pr-opt" data-choice="${i}">${esc(o)}</button>`).join('')}</div>
      <p class="pr-note">먼저 생각한 답을 고르면 실험이 시작돼요.</p>`;
    (this.predictEl.querySelector('.pr-opt') as HTMLButtonElement | null)?.focus();
  }

  private run(choice: number) {
    const p = this.predict!;
    p.start();
    this.syncInputs();
    this.state = { phase: 'run', choice, t0: this.sim.time };
    this.predictEl.innerHTML = `
      <div class="pr-head"><span class="pr-step">2 · 관찰</span><button class="ib sm" data-p="close" aria-label="닫기">${icon('close', 16)}</button></div>
      <p class="pr-q">${esc(p.question)}</p>
      <p class="pr-mine">내 예측: <b>${esc(p.options[choice])}</b></p>
      <p class="pr-note pr-live">실험하는 중… 화면을 지켜보세요.</p>`;
    this.predictEl.classList.add('mini');
    this.onStart?.();
  }

  /** 몇 프레임마다 불러서 결과가 나왔는지 봐요 */
  poll() {
    const s = this.state;
    if (s?.phase !== 'run') return;
    const p = this.predict!;
    const r = p.result();
    if (!r) {
      if (this.sim.time - s.t0 > TIMEOUT_MS) this.finish(s.choice, undefined);
      return;
    }
    this.finish(s.choice, r);
  }

  private finish(choice: number, r: ReturnType<Predict['result']>) {
    const p = this.predict!;
    this.state = { phase: 'done' };
    this.predictEl.classList.remove('mini');
    const right = r && r.pick === choice;
    this.predictEl.innerHTML = `
      <div class="pr-head"><span class="pr-step">3 · 설명</span><button class="ib sm" data-p="close" aria-label="닫기">${icon('close', 16)}</button></div>
      ${r ? `
        <p class="pr-verdict ${right ? 'ok' : 'no'}">${right ? '예측이 맞았어요' : '예측과 결과가 달라요'}</p>
        <dl class="pr-cmp"><div><dt>내 예측</dt><dd>${esc(p.options[choice])}</dd></div><div><dt>실험 결과</dt><dd>${esc(p.options[r.pick])}</dd></div></dl>
        <p class="pr-detail">${esc(r.detail)}</p>
        <p class="pr-explain">${esc(p.explain)}</p>`
      : `<p class="pr-q">실험이 제대로 끝나지 않았어요. 물체를 건드렸다면 다시 해 보세요.</p>`}
      <div class="pr-actions"><button class="btn sm" data-p="again">다시 예측하기</button><button class="btn sm primary" data-p="close">닫기</button></div>`;
  }

  close() {
    this.state = undefined;
    this.predictEl.hidden = true;
    this.predictEl.classList.remove('mini');
    this.predictEl.innerHTML = '';
  }
}
