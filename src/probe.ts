import { icon } from './icons';
import { measurable, nameOf, read, Recorder, type Sample } from './measure';
import { D, type Sim, type Vec } from './sim';
import { PX_PER_M } from './units';

/** 그래프 계열 색 (범주형 1–3번, 고정 순서) */
const SERIES = ['#d6b874', '#79b4c8', '#c98a8f'];

type Tab = 'pos' | 'vel' | 'energy';
interface Series { key: keyof Sample; name: string }
const TABS: Record<Tab, { label: string; unit: string; series: Series[] }> = {
  pos: { label: '위치', unit: 'm', series: [{ key: 'h', name: '높이 h' }, { key: 'x', name: '가로 x' }] },
  vel: { label: '속도', unit: 'm/s', series: [{ key: 'vy', name: '세로 vᵧ' }, { key: 'vx', name: '가로 vₓ' }, { key: 'speed', name: '속력 |v|' }] },
  energy: { label: '에너지', unit: 'J', series: [{ key: 'ke', name: '운동 K' }, { key: 'pe', name: '위치 U' }, { key: 'e' as keyof Sample, name: '합 K+U' }] },
};
/** 그래프에 보여줄 시간 폭 (s) */
const WINDOW = 10;

const fmt = (n: number, unit = '') => {
  const a = Math.abs(n);
  // 가만히 있는 물체의 아주 작은 떨림(10⁻⁶ 정도)은 0 으로 보여요
  const s = a >= 1000 ? n.toFixed(0) : a >= 100 ? n.toFixed(1) : a >= 0.005 ? n.toFixed(2) : '0.00';
  return unit ? `${s} ${unit}` : s;
};
const val = (s: Sample, k: keyof Sample) => (k === ('e' as keyof Sample) ? s.ke + s.pe : (s[k] as number));

/** 보기 좋은 눈금 간격 */
function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/**
 * 측정 패널: 물체를 하나 골라 SI 단위 값과 시간 그래프를 보여줘요.
 * 화면에서 고른 물체를 따라다니며 기록하고, CSV 로 내보낼 수 있어요.
 */
export class Probe {
  rec = new Recorder();
  open = false;
  private tab: Tab = 'pos';
  private el: HTMLElement;
  private stats: HTMLElement;
  private title: HTMLElement;
  private graph: HTMLCanvasElement;
  private legend: HTMLElement;
  private empty: HTMLElement;
  private hoverX: number | null = null;
  onChange?: () => void;

  constructor(stage: HTMLElement, private getSim: () => Sim, private toast: (m: string) => void) {
    const el = document.createElement('aside');
    el.className = 'probe';
    el.hidden = true;
    el.setAttribute('aria-label', '측정');
    el.innerHTML = `
      <div class="probe-head">
        <b>측정</b><span class="probe-target"></span>
        <button class="ib sm" data-probe="csv" title="기록을 CSV 파일로 저장" aria-label="CSV 저장">${icon('download', 16)}</button>
        <button class="ib sm" data-probe="clear" title="기록 지우기" aria-label="기록 지우기">${icon('reset', 16)}</button>
        <button class="ib sm" data-probe="close" title="닫기 (M)" aria-label="측정 닫기">${icon('close', 16)}</button>
      </div>
      <p class="probe-empty">측정할 물체를 화면에서 눌러 고르세요.<br><small>길이 100 px = 1 m · 질량은 두께 1 cm 판으로 계산</small></p>
      <dl class="probe-stats"></dl>
      <div class="probe-tabs" role="tablist">${(Object.keys(TABS) as Tab[]).map((t) =>
        `<button role="tab" class="chipbtn" data-tab="${t}">${TABS[t].label}</button>`).join('')}</div>
      <div class="probe-legend"></div>
      <canvas class="probe-graph" role="img" aria-label="시간에 따른 그래프"></canvas>`;
    stage.appendChild(el);
    this.el = el;
    this.stats = el.querySelector('.probe-stats')!;
    this.title = el.querySelector('.probe-target')!;
    this.graph = el.querySelector('.probe-graph')!;
    this.legend = el.querySelector('.probe-legend')!;
    this.empty = el.querySelector('.probe-empty')!;

    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.tab) { this.tab = b.dataset.tab as Tab; this.render(); }
      if (b.dataset.probe === 'close') this.toggle(false);
      if (b.dataset.probe === 'clear') { this.rec.clear(); this.render(); }
      if (b.dataset.probe === 'csv') this.download();
    });
    this.graph.addEventListener('pointermove', (e) => { this.hoverX = e.offsetX; this.drawGraph(); });
    this.graph.addEventListener('pointerleave', () => { this.hoverX = null; this.drawGraph(); });
    this.setTab();
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    if (on) {
      if (!this.rec.target) this.autoPick();
      this.render();
    }
    this.onChange?.();
  }

  /** 장면을 새로 만들면 고른 물체도 새로 */
  reset() {
    this.rec.select(undefined);
    if (this.open) { this.autoPick(); this.render(); }
  }

  /** 움직일 수 있는 물체가 하나뿐이면 그걸 바로 골라요 */
  private autoPick() {
    const list = this.getSim().bodies().filter((b) => measurable(b) && D(b).kind !== 'magnet' && D(b).kind !== 'star' && !b.isStatic);
    if (list.length === 1) this.rec.select(list[0]);
  }

  /** 측정 패널이 열려 있을 때 누른 물체를 골라요. 골랐으면 true */
  pick(p: Vec) {
    if (!this.open) return false;
    const hit = this.getSim().bodyAt(p, 8, measurable);
    if (!hit || hit === this.rec.target) return false;
    this.rec.select(hit);
    this.toast(`측정 대상: ${nameOf(hit)}`);
    this.render();
    return true;
  }

  sample() {
    if (this.rec.target) this.rec.sample(this.getSim());
  }

  private setTab() {
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const def = TABS[this.tab];
    this.legend.innerHTML = def.series.map((s, i) => `<span><i style="background:${SERIES[i]}"></i>${s.name}</span>`).join('') +
      `<em>${def.unit}</em>`;
  }

  /** 몇 프레임마다 불러서 숫자와 그래프를 새로 그려요 */
  render() {
    if (!this.open) return;
    const sim = this.getSim();
    const b = this.rec.target;
    this.empty.hidden = !!b;
    this.stats.hidden = !b;
    this.title.textContent = b ? nameOf(b) : '';
    this.setTab();
    if (b) {
      const r = read(sim, b);
      const last = this.rec.samples[this.rec.samples.length - 1];
      const a = last ? Math.hypot(last.ax, last.ay) : 0;
      const row = (k: string, v: string, sub = '') => `<div><dt>${k}</dt><dd>${v}${sub ? `<small>${sub}</small>` : ''}</dd></div>`;
      this.stats.innerHTML =
        row('질량', fmt(r.m, 'kg')) +
        row('높이', fmt(r.h, 'm'), `x ${fmt(r.x)} m`) +
        row('속력', fmt(r.speed, 'm/s'), `vₓ ${fmt(r.vx)} · vᵧ ${fmt(r.vy)}`) +
        row('가속도', fmt(a, 'm/s²')) +
        row('운동량', fmt(r.p, 'kg·m/s')) +
        row('에너지', fmt(r.ke + r.pe, 'J'), `K ${fmt(r.ke)} · U ${fmt(r.pe)}`);
    }
    this.drawGraph();
  }

  private drawGraph() {
    const c = this.graph;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(this.el);
    const ink = css.getPropertyValue('--muted').trim() || '#687082';
    const grid = css.getPropertyValue('--line').trim() || '#e3e6eb';
    const text = css.getPropertyValue('--ink').trim() || '#15171c';

    const all = this.rec.samples;
    const def = TABS[this.tab];
    const L = 44, R = 10, T = 8, B = 22;
    const pw = w - L - R, ph = h - T - B;
    ctx.font = '500 11px Pretendard, system-ui, sans-serif';

    if (all.length < 2) {
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.rec.target ? '기록하는 중…' : '물체를 고르면 그래프가 그려져요', w / 2, h / 2);
      return;
    }
    const tEnd = all[all.length - 1].t;
    const t0 = Math.max(all[0].t, tEnd - WINDOW);
    const t1 = Math.max(t0 + WINDOW, tEnd);
    const data = all.filter((s) => s.t >= t0);
    let lo = Infinity, hi = -Infinity;
    for (const s of data) for (const se of def.series) { const v = val(s, se.key); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (this.tab !== 'vel') lo = Math.min(lo, 0);
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    lo -= this.tab === 'vel' || lo < 0 ? pad : 0;
    hi += pad;
    const X = (t: number) => L + ((t - t0) / (t1 - t0)) * pw;
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;

    // 격자와 눈금
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ys = niceStep(hi - lo, 4);
    const dec = Math.max(0, -Math.floor(Math.log10(ys)));
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillText((Math.abs(v) < ys / 1e6 ? 0 : v).toFixed(dec), L - 6, y);
    }
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.moveTo(L, Math.round(Y(0)) + 0.5); ctx.lineTo(L + pw, Math.round(Y(0)) + 0.5); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xs = niceStep(t1 - t0, 5);
    // 오른쪽 끝은 축 이름 자리라 비워 둬요
    for (let t = Math.ceil(t0 / xs) * xs; t <= t1 + 1e-9; t += xs) if (X(t) < L + pw - 34) ctx.fillText(`${+t.toFixed(2)}`, X(t), T + ph + 5);
    ctx.textAlign = 'right';
    ctx.fillText('t (s)', L + pw, T + ph + 5);

    // 계열: 2px 선
    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    def.series.forEach((se, i) => {
      ctx.strokeStyle = SERIES[i];
      ctx.beginPath();
      data.forEach((s, j) => (j ? ctx.lineTo(X(s.t), Y(val(s, se.key))) : ctx.moveTo(X(s.t), Y(val(s, se.key)))));
      ctx.stroke();
    });
    ctx.restore();

    // 마우스를 올리면 그 시각의 값
    if (this.hoverX !== null && this.hoverX >= L && this.hoverX <= L + pw) {
      const t = t0 + ((this.hoverX - L) / pw) * (t1 - t0);
      let s = data[0];
      for (const d of data) if (Math.abs(d.t - t) < Math.abs(s.t - t)) s = d;
      const x = X(s.t);
      ctx.strokeStyle = ink;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x + 0.5, T); ctx.lineTo(x + 0.5, T + ph); ctx.stroke();
      ctx.setLineDash([]);
      const lines = [`t = ${s.t.toFixed(2)} s`, ...def.series.map((se) => `${se.name}  ${fmt(val(s, se.key), def.unit)}`)];
      def.series.forEach((se, i) => {
        ctx.fillStyle = SERIES[i];
        ctx.strokeStyle = '#121317';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, Y(val(s, se.key)), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.font = '600 11px Pretendard, system-ui, sans-serif';
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, bh = lines.length * 15 + 8;
      const bx = x + bw + 10 > L + pw ? x - bw - 8 : x + 8;
      ctx.fillStyle = 'rgba(16,17,21,0.96)';
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, T + 4, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, bx + 8, T + 9 + i * 15));
    }
  }

  private download() {
    if (this.rec.samples.length < 2) { this.toast('아직 기록이 없어요'); return; }
    const name = this.rec.target ? nameOf(this.rec.target) : 'data';
    const blob = new Blob(['﻿' + this.rec.csv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `측정-${name.replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** 고른 물체 둘레에 표시와 속도 화살표 (세상 좌표로 그려요) */
  overlay(ctx: CanvasRenderingContext2D) {
    const b = this.rec.target;
    if (!this.open || !b) return;
    const ext = Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2 + 8;
    const { x, y } = b.position;
    ctx.save();
    ctx.strokeStyle = SERIES[0];
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(x, y, ext, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const r = read(this.getSim(), b);
    if (r.speed > 0.05) {
      // 1 m/s 를 화면 0.25 m 길이로 (너무 길면 3 m 에서 멈춤)
      const len = Math.min(r.speed * 0.25 * PX_PER_M, 300);
      const ux = r.vx / r.speed, uy = -r.vy / r.speed;
      const ex = x + ux * len, ey = y + uy * len;
      ctx.strokeStyle = SERIES[1];
      ctx.fillStyle = SERIES[1];
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      const a = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 12);
      ctx.lineTo(ex + Math.cos(a + 2.4) * 14, ey + Math.sin(a + 2.4) * 14);
      ctx.lineTo(ex + Math.cos(a - 2.4) * 14, ey + Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      ctx.font = '500 16px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = `${r.speed.toFixed(2)} m/s`;
      const tw = ctx.measureText(label).width;
      const lx = ux >= 0 ? ex + 14 : ex - 14 - tw - 16;
      ctx.fillStyle = 'rgba(16,17,21,0.9)';
      ctx.beginPath(); ctx.roundRect(lx, ey - 14, tw + 16, 28, 3); ctx.fill();
      ctx.fillStyle = '#ece6da';
      ctx.fillText(label, lx + 8, ey + 1);
    }
    ctx.restore();
  }
}

