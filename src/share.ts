/**
 * 실험 조건을 주소(#/play/장면?h=3&air=0&g=moon)에 담아요.
 * 링크를 받은 사람은 같은 조건(슬라이더·중력·공기)으로 실험을 열어요.
 */
export interface Shared {
  /** 슬라이더 값: Param.id → 값 */
  params: Record<string, number>;
  /** 환경: 중력 프리셋 id */
  g?: string;
  /** 환경: 공기 저항 배율 */
  air?: number;
}

/** 환경 설정에서 쓰는 이름이라 슬라이더 id 로 쓰면 안 돼요 */
const RESERVED = new Set(['g', 'air']);

export function parseHash(hash: string): { id: string; shared: Shared } | undefined {
  const m = hash.match(/^#\/play\/([\w-]+)(?:\?(.*))?$/);
  if (!m) return undefined;
  const shared: Shared = { params: {} };
  for (const [k, v] of new URLSearchParams(m[2] ?? '')) {
    if (k === 'g') { if (/^[\w-]+$/.test(v)) shared.g = v; continue; }
    const n = Number(v);
    if (v === '' || !Number.isFinite(n)) continue;
    if (k === 'air') shared.air = n;
    else if (/^\w+$/.test(k)) shared.params[k] = n;
  }
  return { id: m[1], shared };
}

export function buildHash(id: string, s: Shared) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s.params)) if (!RESERVED.has(k)) q.set(k, String(Number(v.toFixed(4))));
  if (s.g) q.set('g', s.g);
  if (s.air !== undefined) q.set('air', String(s.air));
  const qs = q.toString();
  return `#/play/${id}${qs ? `?${qs}` : ''}`;
}

/** 슬라이더 범위·눈금에 맞춰요 (주소를 손으로 고쳐도 엉뚱한 값이 들어가지 않게) */
export function clampToStep(v: number, min: number, max: number, step: number) {
  const k = Math.round((Math.min(max, Math.max(min, v)) - min) / step);
  return Number((min + k * step).toFixed(6));
}
