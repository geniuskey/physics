import { describe, expect, it } from 'vitest';
import { buildPath, clampToStep, legacyHashToPath, parseRoute } from '../src/share';
import { SCENES } from '../src/scenes';
import { Sim } from '../src/sim';

describe('링크로 실험 조건 공유', () => {
  it('주소를 만들고 다시 읽으면 같은 조건이 나온다', () => {
    const path = buildPath('hoops', { params: { deg: 45, v: 9.5 }, g: 'moon', air: 0 });
    expect(path).toBe('/play/hoops/?deg=45&v=9.5&g=moon&air=0');
    const [p, q] = path.split('?');
    expect(parseRoute(p, '?' + q)).toEqual({ id: 'hoops', shared: { params: { deg: 45, v: 9.5 }, g: 'moon', air: 0 } });
  });
  it('조건이 없으면 주소도 깔끔하다', () => {
    expect(buildPath('free', { params: {} })).toBe('/play/free/');
    expect(parseRoute('/play/free/')).toEqual({ id: 'free', shared: { params: {} } });
    expect(parseRoute('/play/free')).toEqual({ id: 'free', shared: { params: {} } });
  });
  it('엉뚱한 값은 버린다', () => {
    expect(parseRoute('/play/hoops/', '?deg=abc&v=&g=<x>&x.y=3')!.shared).toEqual({ params: {} });
    expect(parseRoute('/')).toBeUndefined();
    expect(parseRoute('/play/')).toBeUndefined();
  });
  it('예전 해시 링크를 새 주소로 옮긴다', () => {
    expect(legacyHashToPath('#/play/hoops?deg=45&g=moon')).toBe('/play/hoops/?deg=45&g=moon');
    expect(legacyHashToPath('#/play/free')).toBe('/play/free/');
    expect(legacyHashToPath('#/')).toBe('/');
    expect(legacyHashToPath('#experiments')).toBeUndefined();
    expect(legacyHashToPath('')).toBeUndefined();
  });
  it('슬라이더 범위와 눈금에 맞춘다', () => {
    expect(clampToStep(99, 10, 80, 1)).toBe(80);
    expect(clampToStep(4.26, 1, 6, 0.5)).toBe(4.5);
    expect(clampToStep(0.12, 0.1, 1, 0.1)).toBe(0.1);
  });
  it('슬라이더 id 는 환경 설정 이름(g, air)과 겹치지 않는다', () => {
    for (const s of SCENES) {
      const rt = s.build(new Sim(s.W ?? 1600, s.H ?? 900)) ?? {};
      for (const p of rt.params ?? []) expect(['g', 'air'], `${s.id}.${p.id}`).not.toContain(p.id);
    }
  });
  it('모든 실험에 식·가정·한계 설명이 있다', () => {
    for (const s of SCENES) {
      expect(s.deep.law.length, `${s.id} 핵심 식`).toBeGreaterThan(0);
      expect(s.deep.assume.length + s.deep.limit.length, `${s.id} 가정·한계`).toBeGreaterThan(1);
    }
  });
});
