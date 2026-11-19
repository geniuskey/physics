import { describe, expect, it } from 'vitest';
import { SCENES } from '../src/scenes';
import { Matter, Sim } from '../src/sim';

const FRAME = 1000 / 60;

/** 실제 화면처럼 한 프레임씩 돌려요 */
function run(sim: Sim, frames: number) {
  for (let i = 0; i < frames; i++) sim.frame(FRAME);
}

/** 조건이 될 때까지 돌리고, 그때의 시뮬레이션 시간(ms)을 돌려줘요 */
function timeUntil(sim: Sim, done: () => boolean, maxFrames = 20000) {
  for (let i = 0; i < maxFrames && !done(); i++) sim.frame(FRAME);
  return sim.time;
}

describe('중력', () => {
  it('진공에서는 쇠공과 깃털이 똑같이 떨어진다', () => {
    const sim = new Sim(1600, 900);
    sim.setAir(0);
    const iron = sim.ball(400, 100, 30, 'metal');
    const feather = sim.ball(1200, 100, 30, 'feather');
    run(sim, 40);
    expect(iron.position.y).toBeGreaterThan(200);
    expect(Math.abs(iron.position.y - feather.position.y)).toBeLessThan(0.5);
  });

  it('공기가 있으면 깃털이 더 늦게 떨어진다', () => {
    const sim = new Sim(1600, 900);
    const iron = sim.ball(400, 100, 30, 'metal');
    const feather = sim.ball(1200, 100, 30, 'feather');
    run(sim, 40);
    expect(iron.position.y - feather.position.y).toBeGreaterThan(50);
  });
});

describe('재생 속도', () => {
  const fallTime = (speed: number) => {
    const sim = new Sim(1600, 900);
    sim.setAir(0);
    sim.speed = speed;
    const b = sim.ball(800, 100, 20, 'stone');
    return timeUntil(sim, () => b.position.y > 600);
  };

  it('느린 재생에서도 떨어지는 데 걸린 물리 시간은 같다', () => {
    const t1 = fallTime(1);
    expect(t1).toBeGreaterThan(500);
    for (const s of [0.25, 0.5, 2]) expect(Math.abs(fallTime(s) - t1)).toBeLessThan(FRAME * 1.5);
  });

  it('물 저항(감쇠)도 재생 속도와 상관없이 같은 만큼 줄어든다', () => {
    const slowDown = (speed: number) => {
      const sim = new Sim(1600, 900);
      sim.gravity = { x: 0, y: 0 };
      sim.setAir(0);
      sim.speed = speed;
      sim.zone({ kind: 'drag', x: 0, y: 0, w: 1600, h: 900, drag: 0.05 });
      const b = sim.ball(200, 450, 20, 'stone');
      Matter.Body.setVelocity(b, { x: 10, y: 0 });
      timeUntil(sim, () => sim.time >= 500);
      return b.position.x;
    };
    const x1 = slowDown(1);
    expect(Math.abs(slowDown(0.25) - x1)).toBeLessThan(3);
  });
});

describe('되돌리기', () => {
  it('지우개로 이미 지운 것은 건너뛰고 그 앞의 것을 되돌린다', () => {
    const sim = new Sim(1600, 900);
    const a = sim.ball(400, 400, 20, 'rubber', { user: true });
    const b = sim.ball(800, 400, 20, 'rubber', { user: true });
    sim.remove(b); // 지우개
    expect(sim.undo()).toBe(true);
    expect(sim.bodies()).not.toContain(a);
    expect(sim.undo()).toBe(false);
  });

  it('줄과 구역도 되돌릴 수 있다', () => {
    const sim = new Sim(1600, 900);
    const a = sim.ball(400, 400, 20);
    const c = sim.link({ body: a, point: a.position }, { point: { x: 400, y: 200 } }, 'rope', { user: true });
    const z = sim.zone({ kind: 'water', x: 0, y: 500, w: 400, h: 300, user: true });
    sim.undo();
    expect(sim.zones).not.toContain(z);
    sim.undo();
    expect(Matter.Composite.allConstraints(sim.world)).not.toContain(c);
  });
});

describe('부력', () => {
  it('나무는 뜨고 돌은 가라앉는다', () => {
    const sim = new Sim(1600, 900);
    sim.bounds();
    sim.zone({ kind: 'water', x: 0, y: 400, w: 1600, h: 460, density: 0.001 });
    const wood = sim.box(500, 450, 60, 60, 'wood');
    const stone = sim.box(1100, 450, 60, 60, 'stone');
    run(sim, 600);
    expect(wood.position.y).toBeLessThan(450);
    expect(stone.position.y).toBeGreaterThan(780);
  });
});

describe('끌개 별', () => {
  it('고정되지 않은 별도 끌어당긴 물체 쪽으로 끌려간다 (작용·반작용)', () => {
    const sim = new Sim(1600, 900);
    sim.gravity = { x: 0, y: 0 };
    sim.setAir(0);
    const star = sim.star(600, 450, 30, 60, { static: false });
    sim.ball(1000, 450, 20, 'metal');
    run(sim, 30);
    expect(star.position.x).toBeGreaterThan(600.01);
  });
});

describe('놀이터', () => {
  for (const scene of SCENES) {
    it(`${scene.id}: 만들고 2초 동안 돌려도 문제없다`, () => {
      const sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
      sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
      sim.air = scene.air ?? 1;
      const rt = scene.build(sim) ?? {};
      sim.onTick = rt.tick;
      run(sim, 120);
      for (const b of sim.bodies()) {
        expect(Number.isFinite(b.position.x) && Number.isFinite(b.position.y)).toBe(true);
      }
      rt.hud?.();
    });
  }
});
