import type { MatId } from './materials';
import type { Theme } from './render';
import { B_DEMO, PLANET_G } from './units';
import { D, Matter, type MBody, type Sim, type Vec } from './sim';
import type { ToolId } from './tools';

const { Body, Bodies } = Matter;

export type Cat = 'gravity' | 'friction' | 'fluid' | 'em' | 'collision' | 'free';

export const CATS: Record<Cat, { name: string; emoji: string; color: string }> = {
  gravity: { name: '중력', emoji: '🌍', color: '#5b5bd6' },
  friction: { name: '마찰', emoji: '🛷', color: '#d4691b' },
  fluid: { name: '물과 바람', emoji: '💧', color: '#0d82c4' },
  em: { name: '전기와 자석', emoji: '⚡', color: '#b7860b' },
  collision: { name: '충돌', emoji: '💥', color: '#d33f5f' },
  free: { name: '자유', emoji: '🧪', color: '#13946f' },
};

type Hook = (ctx: CanvasRenderingContext2D, sim: Sim, t: number) => void;

export interface Action { label: string | (() => string); icon: string; run: () => void; primary?: boolean }

export interface Runtime {
  actions?: Action[];
  hud?: () => string;
  back?: Hook;
  front?: Hook;
  onGoal?: (b: MBody, goal: string) => void;
  cue?: () => MBody | undefined;
  tick?: () => void;
}

export interface Scene {
  id: string;
  title: string;
  emoji: string;
  cat: Cat;
  blurb: string;
  theme: Theme;
  W?: number;
  H?: number;
  tools: ToolId[];
  tool: ToolId;
  mat?: MatId;
  gravity?: Vec;
  air?: number;
  field?: boolean;
  trails?: boolean;
  tips: string[];
  why: string;
  /** 처음 온 사람에게 추천하는 실험 */
  starter?: boolean;
  /** 실험 가이드 카드 위치를 직접 정할 때 (기본은 물체를 피해 자동) */
  guideAt?: 'tl' | 'tr' | 'bl' | 'br';
  /** 세로 화면에서 확대할 때 처음 보여줄 곳(세상 x) */
  focusX?: number;
  build(sim: Sim): Runtime | void;
}

const FLOOR = 860;
const clear = { color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)' };
/** 시뮬레이션 시간(ms) → 초. 재생 속도와 상관없이 실제 물리 시간이에요 */
const secs = (ms: number) => (ms / 1000).toFixed(2);

/** 가만히 붙잡혀 있다가 놓아주는 물체들 */
function release(bodies: MBody[]) {
  for (const b of bodies) if (b.isStatic) Body.setStatic(b, false);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = 'rgba(40,30,70,0.7)', size = 24) {
  ctx.font = `700 ${size}px Pretendard, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export const SCENES: Scene[] = [
  // ───────────────────────────── 중력 ─────────────────────────────
  {
    id: 'drop-race',
    starter: true,
    title: '누가 먼저 떨어질까?',
    emoji: '🪶',
    cat: 'gravity',
    blurb: '볼링공, 사과, 깃털 — 동시에 떨어뜨리면? 공기를 없애면 놀라운 일이!',
    theme: 'sky',
    tools: ['hand', 'ball', 'box', 'erase'],
    tool: 'hand',
    tips: ['“떨어뜨리기”를 눌러 경주를 시작해요', '공기를 없애고 다시 떨어뜨려 보세요', '깃털이 볼링공을 따라잡을 수 있을까요?'],
    why: '모든 물체는 중력 때문에 똑같이 빨라지며 떨어져요. 깃털이 느린 건 공기가 붙잡기 때문이에요. 공기가 없는 달에서 실제로 해봤더니 망치와 깃털이 동시에 떨어졌대요!',
    build(sim) {
      sim.bounds();
      const defs = [
        { name: '볼링공', x: 400, make: (x: number) => sim.ball(x, 150, 36, 'stone', { label: '볼링공', color: '#3c3c64', stroke: '#22223a', face: true, static: true, nopin: true }) },
        { name: '사과', x: 800, make: (x: number) => sim.ball(x, 150, 26, 'wood', { label: '사과', color: '#e63946', stroke: '#9d0208', deco: 'apple', static: true, nopin: true }) },
        { name: '깃털', x: 1200, make: (x: number) => sim.ball(x, 150, 26, 'feather', { label: '깃털', ...clear, deco: 'feather', static: true, nopin: true }) },
      ];
      let items: MBody[] = [];
      let start = 0;
      let results: string[] = [];
      let landed = new Set<MBody>();
      const setup = () => {
        items.forEach((b) => sim.remove(b));
        items = defs.map((d) => d.make(d.x));
        results = [];
        landed = new Set();
      };
      setup();
      return {
        actions: [
          {
            label: '떨어뜨리기!', icon: '⬇️', primary: true,
            run: () => { if (!items.every((b) => b.isStatic)) setup(); release(items); start = sim.time; },
          },
          { label: () => (sim.air > 0 ? '공기 없애기' : '공기 되살리기'), icon: '🌬️', run: () => sim.setAir(sim.air > 0 ? 0 : 1) },
        ],
        tick: () => {
          items.forEach((b, i) => {
            if (b.isStatic || landed.has(b)) return;
            if (b.bounds.max.y >= FLOOR - 2) {
              landed.add(b);
              results.push(`${defs[i].name} ${secs(sim.time - start)}초`);
              sim.text(b.position.x, b.position.y - 70, `${landed.size}등!`, '#e85d04');
            }
          });
        },
        hud: () => `${sim.air > 0 ? '공기 있음' : '공기 없음 (진공)'}${results.length ? ' · ' + results.join(' · ') : ''}`,
        back: (ctx) => {
          ctx.strokeStyle = 'rgba(80,60,120,0.35)';
          ctx.setLineDash([12, 10]);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(200, 150); ctx.lineTo(1400, 150); ctx.stroke();
          ctx.setLineDash([]);
          label(ctx, '출발선', 130, 150);
          for (let y = 250; y < FLOOR; y += 100) {
            ctx.fillStyle = 'rgba(80,60,120,0.25)';
            ctx.fillRect(40, y, 30, 3);
          }
        },
      };
    },
  },
  {
    id: 'planets',
    title: '행성마다 다른 점프',
    emoji: '🪐',
    cat: 'gravity',
    blurb: '달, 화성, 지구, 목성에서 똑같이 점프하면 누가 제일 높이 뛸까요?',
    theme: 'sky',
    tools: ['hand', 'ball', 'box', 'blast', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    tips: ['“모두 점프”를 눌러보세요', '같은 힘으로 뛰어도 높이가 달라요', '공을 던져서 포물선을 비교해 보세요'],
    why: '행성이 무겁고 클수록 끌어당기는 힘(중력)이 세요. 달의 중력은 지구의 6분의 1이라 훨씬 높이, 훨씬 천천히 떨어져요. 목성에서는 2.5배나 무거워져요!',
    build(sim) {
      sim.bounds();
      const cols = [
        { n: '달 1.62 m/s²', g: PLANET_G.moon, c: 'rgba(215,215,240,0.45)' },
        { n: '화성 3.71 m/s²', g: PLANET_G.mars, c: 'rgba(255,160,120,0.22)' },
        { n: '지구 9.81 m/s²', g: 1, c: 'rgba(120,210,150,0.2)' },
        { n: '목성 24.8 m/s²', g: PLANET_G.jupiter, c: 'rgba(255,190,110,0.28)' },
      ];
      const cw = sim.W / 4;
      cols.forEach((c, i) => {
        sim.zone({ kind: 'gravity', x: i * cw, y: -3000, w: cw, h: sim.H + 3000, g: { x: 0, y: c.g }, label: c.n, color: c.c, removable: false });
        if (i) sim.wall(i * cw, (260 + FLOOR) / 2, 12, FLOOR - 260, { color: '#b4bac6', stroke: '#8a91a0' });
      });
      const colors = ['#c9c9e8', '#ff8a5b', '#4dabf7', '#ffb347'];
      const add = () => cols.forEach((_, i) => sim.ball(i * cw + cw / 2, FLOOR - 40, 26, 'rubber', { face: true, color: colors[i], stroke: '#555' }));
      add();
      return {
        actions: [
          {
            label: '모두 점프!', icon: '🦘', primary: true,
            run: () => sim.bodies().forEach((b) => { if (!b.isStatic) Body.setVelocity(b, { x: b.velocity.x, y: -15 }); }),
          },
          { label: '공 하나씩 더', icon: '⚽', run: add },
        ],
        back: (ctx) => {
          for (let i = 0; i < 4; i++) {
            for (let y = FLOOR - 100, k = 1; y > 80; y -= 100, k++) {
              ctx.fillStyle = 'rgba(60,40,110,0.25)';
              ctx.fillRect(i * cw + 14, y, 24, 3);
              ctx.font = '600 14px Pretendard, system-ui';
              ctx.textAlign = 'left';
              ctx.fillText(`${k} m`, i * cw + 42, y + 5);
            }
          }
        },
      };
    },
  },
  {
    id: 'solar',
    title: '작은 태양계',
    emoji: '☀️',
    cat: 'gravity',
    blurb: '별 주위를 빙글빙글. 행성을 직접 던져서 궤도에 올려보세요!',
    theme: 'space',
    tools: ['ball', 'star', 'hand', 'pin', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    gravity: { x: 0, y: 0 },
    air: 0,
    trails: true,
    tips: ['빈 곳을 누르고 뒤로 당겼다 놓아 행성을 던져요', '너무 약하면 별로 떨어지고, 너무 세면 멀리 날아가요', '별을 하나 더 놓으면 어떻게 될까요?'],
    why: '행성은 사실 별을 향해 계속 떨어지고 있어요. 그런데 옆으로 달리는 속도가 딱 알맞으면, 떨어지는 만큼 옆으로 비켜 가서 영원히 빙글빙글 돌게 돼요. 이게 궤도예요!',
    build(sim) {
      const sun = sim.star(800, 450, 48, 70, { removable: false });
      void sun;
      let planets: MBody[] = [];
      const place = () => {
        planets.forEach((p) => sim.remove(p));
        const defs = [
          { r: 140, size: 13, c: '#adb5bd' },
          { r: 240, size: 20, c: '#4dabf7' },
          { r: 350, size: 24, c: '#ff922b' },
        ];
        planets = defs.map((d, i) => {
          const a = i * 2.1;
          const v = Math.sqrt(70 / d.r) * (1000 / 60);
          const b = sim.ball(800 + Math.cos(a) * d.r, 450 + Math.sin(a) * d.r, d.size, 'rubber', { color: d.c, stroke: '#223', face: true, air: 0 });
          Body.setVelocity(b, { x: -Math.sin(a) * v, y: Math.cos(a) * v });
          return b;
        });
      };
      place();
      return {
        actions: [{ label: '행성 다시 놓기', icon: '🔄', run: place }],
      };
    },
  },
  {
    id: 'hoops',
    title: '포물선 슛!',
    emoji: '🏀',
    cat: 'gravity',
    blurb: '공은 날아가면서 아래로 휘어요. 점선을 보며 골대에 쏙 넣어보세요.',
    theme: 'sky',
    tools: ['ball', 'hand', 'box', 'plank', 'wall', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    tips: ['빈 곳을 누르고 뒤로 당겼다 놓으면 슛!', '점선이 공이 날아갈 길이에요', '설정에서 중력을 달로 바꾸고 쏴보세요'],
    why: '던진 공은 앞으로 나아가는 동안 중력이 계속 아래로 끌어당겨요. 그래서 곧게 날아가지 않고 무지개 모양(포물선)으로 휘어져요.',
    build(sim) {
      sim.bounds();
      sim.wall(1392, 330, 14, 180, { color: '#f8f9fa', stroke: '#adb5bd' });
      sim.wall(1406, 640, 16, 440, { color: '#868e96', stroke: '#495057' });
      sim.wall(1240, 440, 12, 12, { color: '#f03e3e', stroke: '#c92a2a' });
      sim.wall(1374, 440, 26, 10, { color: '#f03e3e', stroke: '#c92a2a' });
      sim.goal(1308, 468, 100, 16, 'hoop');
      const ball = (x: number, y: number) => sim.ball(x, y, 24, 'rubber', { color: '#f77f00', stroke: '#9c4a00', face: true });
      ball(180, FLOOR - 30); ball(240, FLOOR - 30); ball(300, FLOOR - 30);
      let score = 0;
      return {
        onGoal: (b) => {
          const d = D(b);
          if (!d || d.scored || b.velocity.y <= 0) return;
          d.scored = true;
          score++;
          sim.confetti(1308, 470);
          sim.text(1308, 380, score % 5 === 0 ? `${score}골! 대단해요!` : '골인!', '#f77f00');
        },
        hud: () => `골: ${score}`,
        actions: [{ label: '공 더 주기', icon: '🏀', run: () => { ball(200, 500); ball(260, 500); } }],
        back: (ctx) => {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 3;
          ctx.strokeRect(1392 - 7 - 40, 290, 40, 40);
        },
        front: (ctx) => {
          // 그물
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = 2;
          for (let i = 0; i <= 6; i++) {
            const x1 = 1240 + (i * 140) / 6, x2 = 1270 + (i * 80) / 6;
            ctx.beginPath(); ctx.moveTo(x1, 444); ctx.lineTo(x2, 520); ctx.stroke();
          }
          for (const y of [470, 495, 520]) {
            const k = (y - 444) / 76;
            ctx.beginPath(); ctx.moveTo(1240 + 30 * k, y); ctx.lineTo(1380 - 30 * k, y); ctx.stroke();
          }
        },
      };
    },
  },

  // ───────────────────────────── 마찰 ─────────────────────────────
  {
    id: 'slide-race',
    title: '미끄럼틀 대결',
    emoji: '🛷',
    cat: 'friction',
    blurb: '얼음, 나무, 고무 블록이 같은 미끄럼틀에서 출발! 누가 제일 멀리 갈까요?',
    theme: 'sky',
    tools: ['box', 'ball', 'hand', 'erase'],
    tool: 'box',
    mat: 'ice',
    tips: ['“출발”을 눌러보세요', '세 레인은 바닥이 각각 얼음·나무·고무예요', '상자를 다른 레인에 던져 넣어 보세요. 어디서 제일 멀리 갈까요?'],
    why: '맞닿은 면이 서로 붙잡는 힘을 마찰이라고 해요. 매끈한 얼음은 마찰이 거의 없어 쭉 미끄러지고, 고무는 마찰이 커서 꽉 붙잡고 버텨요. 겨울에 신발 밑창이 고무인 이유죠!',
    build(sim) {
      sim.bounds({ ceiling: false });
      // 엔진의 마찰은 '붙느냐 마느냐'에 가까워서, 스르륵 미끄러지는 나무는 레인 전체에 일정한 감속을 줘서 흉내 내요
      const lanes: { mat: MatId; name: string; friction: number; decel: number; band: string }[] = [
        { mat: 'ice', name: '얼음', friction: 0, decel: 0, band: 'rgba(190,235,255,0.25)' },
        { mat: 'wood', name: '나무', friction: 0, decel: 0.015, band: 'rgba(224,169,109,0.16)' },
        { mat: 'rubber', name: '고무', friction: 0.9, decel: 0.25, band: 'rgba(255,107,107,0.1)' },
      ];
      const ang = Math.atan2(190, 420);
      lanes.forEach((l, i) => {
        const y0 = 130 + i * 255;
        sim.zone({ kind: 'drag', x: 0, y: y0 - 63, w: sim.W, h: 245, decel: l.decel, color: l.band, removable: false });
        const ramp = { friction: 1, frictionStatic: 0, color: '#9c89b8', stroke: '#6f5d94' };
        sim.line(40, y0, 460, y0 + 190, 16, ramp);
        sim.line(460, y0 + 190, 1560, y0 + 190, 16, ramp);
        sim.wall(1560, y0 + 140, 16, 100, { color: '#8f96a4', stroke: '#646b7a' });
      });
      let blocks: MBody[] = [];
      let start = 0;
      let rest: Vec | undefined;
      const setup = () => {
        rest = undefined;
        blocks.forEach((b) => sim.remove(b));
        blocks = lanes.map((l, i) => {
          const y0 = 130 + i * 255;
          const x = 110, ry = y0 + ((x - 40) * 190) / 420;
          const nx = Math.sin(ang), ny = -Math.cos(ang);
          return sim.box(x + nx * 30, ry + ny * 30, 64, 40, l.mat, { angle: ang, static: true, nopin: true, friction: l.friction });
        });
      };
      setup();
      return {
        actions: [
          {
            label: '출발!', icon: '🏁', primary: true,
            run: () => { if (!blocks.every((b) => b.isStatic)) setup(); release(blocks); start = sim.steps; },
          },
        ],
        tick: () => {
          // 고무는 꽉! (엔진이 조금씩 밀려 내려가게 하는 걸 막아요)
          const r = blocks[2];
          if (!r || r.isStatic) return;
          const held = Matter.Composite.allConstraints(sim.world).some((c) => c.bodyB === r);
          if (!held && r.speed < 0.3 && rest) { Body.setPosition(r, rest); Body.setVelocity(r, { x: 0, y: 0 }); Body.setAngularVelocity(r, 0); }
          else rest = { ...r.position };
        },
        hud: () => {
          if (!start || blocks.some((b) => b.isStatic)) return '세 블록이 출발을 기다려요';
          return blocks.map((b, i) => `${lanes[i].name} ${Math.max(0, Math.round((b.position.x - 110) / 10))}cm`).join(' · ');
        },
        back: (ctx) => {
          lanes.forEach((l, i) => label(ctx, l.name, 1250, 130 + i * 255 + 120, 'rgba(60,40,110,0.55)', 30));
        },
      };
    },
  },
  {
    id: 'curling',
    title: '바닥 위 컬링',
    emoji: '🥌',
    cat: 'friction',
    blurb: '얼음판, 나무 마루, 잔디밭. 같은 힘으로 밀어도 멈추는 곳이 달라요.',
    theme: 'ice',
    tools: ['ball', 'hand', 'box', 'erase'],
    tool: 'ball',
    mat: 'stone',
    gravity: { x: 0, y: 0 },
    air: 0,
    tips: ['왼쪽 빈 곳에서 당겼다 놓아 돌을 밀어요', '과녁 한가운데에 멈추게 해보세요', '같은 힘으로 세 바닥에 밀어보세요'],
    why: '바닥이 거칠수록 마찰이 커서 돌을 더 빨리 멈춰 세워요. 컬링 선수들이 얼음을 솔로 문지르는 건 마찰을 줄여서 돌을 더 멀리 보내려는 거예요.',
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#8aa9c4' });
      const lanes = [
        { name: '얼음판', decel: 0.045, c: 'rgba(190,230,255,0.55)' },
        { name: '나무 마루', decel: 0.12, c: 'rgba(222,184,135,0.6)' },
        { name: '잔디밭', decel: 0.3, c: 'rgba(130,200,100,0.55)' },
      ];
      const lh = sim.H / 3;
      lanes.forEach((l, i) => {
        sim.zone({ kind: 'drag', x: 0, y: i * lh, w: sim.W, h: lh, decel: l.decel, color: l.c, label: l.name, removable: false });
        if (i) sim.wall(sim.W / 2, i * lh, sim.W, 12, { color: '#8aa9c4', stroke: '#5f7f9c' });
      });
      const stones = () => lanes.forEach((_, i) => sim.ball(160, i * lh + lh / 2, 26, 'stone', { face: true, color: '#ced4da', stroke: '#495057', air: 0 }));
      stones();
      return {
        actions: [{ label: '돌 다시 놓기', icon: '🥌', run: () => { sim.bodies().forEach((b) => { if (!b.isStatic) sim.remove(b); }); stones(); } }],
        back: (ctx) => {
          lanes.forEach((_, i) => {
            const cx = 1300, cy = i * lh + lh / 2;
            for (const [r, c] of [[110, '#4d96ff'], [80, '#fff'], [50, '#ef476f'], [20, '#fff']] as const) {
              ctx.fillStyle = c; ctx.globalAlpha = 0.75;
              ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
            ctx.beginPath(); ctx.moveTo(260, i * lh + 20); ctx.lineTo(260, (i + 1) * lh - 20); ctx.stroke();
            ctx.setLineDash([]);
          });
        },
      };
    },
  },

  // ───────────────────────────── 물과 바람 ─────────────────────────────
  {
    id: 'float-sink',
    starter: true,
    title: '뜰까, 가라앉을까?',
    emoji: '🛁',
    cat: 'fluid',
    blurb: '커다란 물통에 이것저것 넣어봐요. 나무는 둥둥, 쇠는 꼬르륵. 얼음은?',
    theme: 'lab',
    tools: ['box', 'ball', 'tri', 'plank', 'hand', 'water', 'blast', 'erase'],
    tool: 'box',
    mat: 'wood',
    tips: ['아래에서 재료를 바꿔가며 물에 넣어보세요', '얼음은 얼마나 잠길까요?', '나무 판자 위에 쇠공을 올리면?'],
    why: '물은 잠긴 부분만큼 물체를 위로 밀어 올려요(부력). 물보다 가벼운 나무·얼음은 밀어 올리는 힘이 이겨서 떠요. 같은 크기라도 훨씬 무거운 쇠와 돌은 가라앉아요.',
    build(sim) {
      sim.bounds({ ceiling: true });
      const glass = { color: 'rgba(170,210,235,0.85)', stroke: '#7fb0cc' };
      sim.line(240, 300, 240, FLOOR, 16, glass);
      sim.line(1360, 300, 1360, FLOOR, 16, glass);
      sim.zone({ kind: 'water', x: 248, y: 420, w: 1104, h: FLOOR - 420, density: 0.001, removable: false });
      sim.box(380, 250, 70, 70, 'wood');
      sim.box(540, 250, 60, 60, 'ice');
      sim.ball(700, 250, 30, 'metal', { face: true });
      sim.ball(860, 250, 30, 'rubber', { face: true });
      sim.box(1020, 250, 60, 60, 'stone');
      sim.box(1180, 240, 200, 20, 'wood');
      sim.ball(1500, 700, 34, 'balloon', { face: true });
      return {
        back: (ctx) => {
          label(ctx, '물보다 가벼우면 둥둥 · 무거우면 꼬르륵', 800, 360, 'rgba(60,90,140,0.45)', 22);
        },
      };
    },
  },
  {
    id: 'pour',
    title: '물 붓기 놀이',
    emoji: '💧',
    cat: 'fluid',
    blurb: '물을 콸콸 부어 물레방아를 돌리고, 나무배를 띄워봐요.',
    theme: 'sky',
    tools: ['drop', 'ball', 'box', 'hand', 'wall', 'erase', 'blast'],
    tool: 'drop',
    tips: ['깔때기 위에서 꾹 누르고 있으면 물이 쏟아져요', '나무배에 상자를 실어보세요. 몇 개까지 버틸까요?', '벽 긋기로 물길을 만들어 보세요'],
    why: '물은 정해진 모양이 없어서 그릇 모양대로 흘러가요. 흐르는 물이 물레방아 날개를 밀면 바퀴가 돌아요. 배는 물을 밀어낸 만큼 떠오르는 힘을 받아요.',
    build(sim) {
      sim.bounds();
      sim.line(250, 230, 375, 370, 14, { color: '#adb5bd', stroke: '#868e96' });
      sim.line(555, 230, 435, 370, 14, { color: '#adb5bd', stroke: '#868e96' });
      // 물레방아
      const cx = 405, cy = 560;
      const parts = [0, 1, 2, 3].map((k) => Bodies.rectangle(cx, cy, 230, 14, { angle: (k * Math.PI) / 4, chamfer: { radius: 5 } }));
      const wheel = sim.compound(parts, 'wood', { color: '#e9c46a', stroke: '#b08a2e' });
      sim.link({ point: { x: cx, y: cy } }, { body: wheel, point: { x: cx, y: cy } }, 'rope', { stiffness: 1, length: 0 });
      sim.wall(620, 760, 16, 200, { color: '#adb5bd', stroke: '#868e96' });
      // 미리 채워둔 물
      for (let y = FLOOR - 10; y > FLOOR - 120; y -= 15) {
        for (let x = 650; x < 1550; x += 16) sim.drop(x + (Math.random() - 0.5) * 3, y);
      }
      // 나무배
      const bx = 1100, by = 650;
      const boat = sim.compound([
        Bodies.rectangle(bx, by, 220, 16),
        Bodies.rectangle(bx - 104, by - 28, 14, 60),
        Bodies.rectangle(bx + 104, by - 28, 14, 60),
      ], 'wood', { color: '#bc6c25', stroke: '#7f4310' });
      void boat;
      return {
        actions: [{ label: '물 비우기', icon: '🫗', run: () => [...sim.drops].forEach((b) => sim.remove(b)) }],
        hud: () => `물방울 ${sim.drops.length}개`,
      };
    },
  },
  {
    id: 'wind',
    title: '바람 터널',
    emoji: '🌬️',
    cat: 'fluid',
    blurb: '선풍기 바람에 무엇이 날아갈까? 바람을 타고 바구니에 골인시켜요.',
    theme: 'sky',
    tools: ['ball', 'box', 'wind', 'hand', 'blast', 'erase'],
    tool: 'ball',
    mat: 'feather',
    tips: ['깃털 공을 선풍기 위에 떨어뜨려 보세요', '쇠공은 바람에 날아갈까요?', '바람 도구로 끌어서 새 바람길을 만들어요'],
    why: '바람은 움직이는 공기예요. 공기가 물체에 부딪히며 밀어요. 가볍고 넓은 물체일수록 잘 밀려나고, 무겁고 작은 물체는 꿈쩍도 안 해요.',
    build(sim) {
      sim.bounds({ ceiling: true });
      sim.zone({ kind: 'wind', x: 100, y: 120, w: 260, h: FLOOR - 120, dir: { x: 0, y: -1 }, strength: 2.6, removable: false });
      sim.zone({ kind: 'wind', x: 360, y: 120, w: 760, h: 260, dir: { x: 1, y: 0 }, strength: 2, removable: false });
      const cup = { color: '#c08552', stroke: '#8c5a2b' };
      sim.line(1330, 150, 1345, 300, 14, cup);
      sim.line(1345, 300, 1505, 300, 14, cup);
      sim.line(1505, 300, 1520, 150, 14, cup);
      sim.goal(1425, 260, 140, 50, 'basket');
      const pal = ['#ffadad', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff'];
      for (let i = 0; i < 5; i++) sim.ball(500 + i * 90, FLOOR - 30, 20, 'feather', { face: true, color: pal[i], stroke: '#999' });
      sim.ball(1000, FLOOR - 30, 22, 'wood', { face: true });
      sim.ball(1100, FLOOR - 30, 22, 'metal', { face: true });
      let n = 0;
      return {
        onGoal: (b) => {
          const d = D(b);
          if (!d || d.scored) return;
          d.scored = true; n++;
          sim.confetti(1425, 260);
          sim.text(1425, 120, '골인!', '#2a9d8f');
        },
        hud: () => `바구니: ${n}`,
        back: (ctx, _s, t) => {
          // 선풍기
          const fx = 230, fy = FLOOR - 10;
          ctx.fillStyle = '#495057';
          ctx.fillRect(fx - 90, fy - 24, 180, 24);
          ctx.save();
          ctx.translate(fx, fy - 30);
          ctx.scale(1, 0.25);
          ctx.rotate(t / 60);
          ctx.fillStyle = '#74c0fc';
          for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(55, 0, 55, 18, 0, 0, 7); ctx.fill(); }
          ctx.restore();
          label(ctx, '여기로!', 1425, 110, 'rgba(140,90,43,0.8)', 26);
        },
      };
    },
  },

  // ───────────────────────────── 전기와 자석 ─────────────────────────────
  {
    id: 'charges',
    title: '밀고 당기는 전기',
    emoji: '⚡',
    cat: 'em',
    blurb: '빨강(+)과 파랑(−) 구슬. 다르면 끌리고, 같으면 밀어내요.',
    theme: 'night',
    tools: ['plus', 'minus', 'hand', 'pin', 'blast', 'erase'],
    tool: 'plus',
    gravity: { x: 0, y: 0 },
    field: true,
    tips: ['+ 와 − 구슬을 여기저기 놓아보세요', '주황 화살표는 + 구슬이 밀려가는 방향이에요', '구슬을 옆으로 휙 던지면 빙글빙글 궤도를 돌아요'],
    why: '전기에는 +와 − 두 종류가 있어요. 서로 다르면 끌어당기고, 같으면 밀어내요. 머리카락이 풍선에 달라붙는 것도 바로 이 힘이에요!',
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#3d3a6b' });
      // 고정된 구슬 주위를 반대 전기 구슬이 빙글빙글 (원자처럼!)
      const orbit = (cx: number, cy: number, q: number) => {
        sim.charge(cx, cy, q, { static: true });
        [0, Math.PI].forEach((a, k) => {
          const r = 130 + k * 40;
          const b = sim.charge(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -q, { air: 0 });
          const m = b.mass;
          const acc = 30 / (r * r + 600) / m; // 끌어당기는 가속도
          const v = Math.sqrt(acc * r) * (1000 / 60) * 0.95;
          Body.setVelocity(b, { x: -Math.sin(a) * v, y: Math.cos(a) * v });
        });
      };
      orbit(450, 450, 1);
      orbit(1150, 450, -1);
      return {
        actions: [{ label: () => (sim.field ? '화살표 숨기기' : '화살표 보기'), icon: '🧭', run: () => { sim.field = !sim.field; } }],
      };
    },
  },
  {
    id: 'magnets',
    title: '자석 놀이',
    emoji: '🧲',
    cat: 'em',
    blurb: '막대자석과 쇠구슬로 놀아요. N극과 S극, 철컥 붙거나 휙 밀어내요.',
    theme: 'lab',
    tools: ['magnet', 'ball', 'box', 'hand', 'pin', 'erase'],
    tool: 'magnet',
    mat: 'metal',
    gravity: { x: 0, y: 0 },
    air: 5,
    field: true,
    tips: ['자석 끝을 잡고 돌려서 N극끼리 마주 보게 해보세요', '공 도구로 쇠구슬을 더 뿌려보세요', '나무 상자는 자석에 붙을까요?'],
    why: '자석에는 N극과 S극이 있어요. 다른 극끼리는 끌어당기고, 같은 극끼리는 밀어내요. 쇠는 자석 가까이 가면 잠깐 자석처럼 변해서 철썩 달라붙어요. 나무나 고무는 그렇지 않아요.',
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#b5a48a' });
      sim.magnet(480, 450, 0, { size: 140 });
      sim.magnet(1120, 450, Math.PI, { size: 140 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        sim.ball(800 + Math.cos(a) * 280, 450 + Math.sin(a) * 280, 12, 'metal', { face: false });
      }
      sim.box(800, 150, 50, 50, 'wood');
      sim.box(800, 750, 50, 50, 'wood');
      return {
        actions: [
          { label: '자석 뒤집기', icon: '🔄', run: () => sim.bodies().forEach((b) => { if (D(b)?.magnet) Body.setAngle(b, b.angle + Math.PI); }) },
          { label: () => (sim.field ? '화살표 숨기기' : '화살표 보기'), icon: '🧭', run: () => { sim.field = !sim.field; } },
        ],
      };
    },
  },
  {
    id: 'swirl',
    title: '자기장 회오리',
    emoji: '🌀',
    cat: 'em',
    blurb: '자기장 속으로 전기 구슬을 쏘면 빙글빙글 휘어요. 오로라의 비밀!',
    theme: 'space',
    tools: ['plus', 'minus', 'field', 'hand', 'pin', 'erase'],
    tool: 'plus',
    gravity: { x: 0, y: 0 },
    air: 0,
    trails: true,
    tips: ['구슬을 당겼다 놓아 자기장 속으로 쏘아보세요', '세게 쏠수록 크게 돌아요. 아주 세게 쏘면 빠져나가요', '+ 구슬을 오른쪽 자기장에 쏘면 어느 쪽으로 휠까요?'],
    why: '자기장은 그 속을 달리는 전기 구슬을 옆으로 밀어요. 계속 옆으로 밀리니까 빙글빙글 원을 그리게 돼요. 태양에서 날아온 전기 알갱이가 지구 자기장에 휘어 들어가 빛나는 게 오로라예요.',
    build(sim) {
      sim.zone({ kind: 'magnetic', x: 160, y: 80, w: 640, h: 740, strength: B_DEMO, removable: false });
      sim.zone({ kind: 'magnetic', x: 800, y: 80, w: 640, h: 740, strength: -B_DEMO, removable: false });
      const shoot = () => {
        const a = sim.charge(480, 600, 1, { air: 0 });
        Body.setVelocity(a, { x: 0, y: -7 });
        const b = sim.charge(1120, 600, -1, { air: 0 });
        Body.setVelocity(b, { x: 0, y: -7 });
      };
      shoot();
      return {
        actions: [{ label: '구슬 쏘기', icon: '🚀', primary: true, run: shoot }],
        back: (ctx) => {
          label(ctx, '⊙ 왼쪽으로 휘는 자기장', 480, 120, 'rgba(200,160,255,0.8)', 22);
          label(ctx, '⊗ 오른쪽으로 휘는 자기장', 1120, 120, 'rgba(255,190,110,0.8)', 22);
        },
      };
    },
  },

  // ───────────────────────────── 충돌 ─────────────────────────────
  {
    id: 'cradle',
    title: '뉴턴의 요람',
    emoji: '🔔',
    cat: 'collision',
    blurb: '한쪽 공을 탁! 반대편 공만 튀어나가는 신기한 장난감.',
    theme: 'lab',
    tools: ['hand', 'erase'],
    tool: 'hand',
    air: 0,
    tips: ['공 하나를 잡아 옆으로 당겼다 놓아보세요', '두 개를 들어 올리면 몇 개가 튀어나갈까요?', '아래 버튼으로 정확하게 들어 올릴 수 있어요'],
    why: '부딪힌 공은 받은 힘을 옆 공에 그대로 전달하고 멈춰요. 힘이 줄줄이 전해져서 맨 끝 공만 튀어나가요. 두 개를 부딪치면 두 개가 튀어나가요!',
    build(sim) {
      const r = 36, L = 400, top = 150, n = 5;
      const x0 = 800 - ((n - 1) * r * 1.98) / 2;
      const anchors: Vec[] = [];
      const balls: MBody[] = [];
      for (let i = 0; i < n; i++) {
        const ax = x0 + i * r * 1.98;
        anchors.push({ x: ax, y: top });
        const b = sim.ball(ax, top + L, r, 'metal', { inertia: Infinity, restitution: 1, friction: 0, air: 0, removable: false, face: true });
        b.slop = r * 0.02;
        sim.link({ point: { x: ax, y: top } }, { body: b, point: { x: ax, y: top + L } }, 'rope', { stiffness: 1, color: '#495057' });
        balls.push(b);
      }
      const lift = (left: number, right = 0) => {
        balls.forEach((b, i) => {
          let th = 0;
          if (i < left) th = -0.8;
          if (i >= n - right) th = 0.8;
          Body.setPosition(b, { x: anchors[i].x + Math.sin(th) * L, y: top + Math.cos(th) * L });
          Body.setVelocity(b, { x: 0, y: 0 });
        });
      };
      return {
        actions: [
          { label: '1개 들기', icon: '☝️', primary: true, run: () => lift(1) },
          { label: '2개 들기', icon: '✌️', run: () => lift(2) },
          { label: '3개 들기', icon: '🤟', run: () => lift(3) },
          { label: '양쪽 1개씩', icon: '↔️', run: () => lift(1, 1) },
        ],
        back: (ctx) => {
          ctx.strokeStyle = '#495057'; ctx.lineWidth = 14; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0 - 160, FLOOR); ctx.lineTo(x0 - 160, top); ctx.lineTo(x0 + (n - 1) * r * 1.98 + 160, top); ctx.lineTo(x0 + (n - 1) * r * 1.98 + 160, FLOOR);
          ctx.stroke();
          ctx.fillStyle = '#6c757d';
          ctx.fillRect(x0 - 260, FLOOR - 10, (n - 1) * r * 1.98 + 520, 30);
        },
      };
    },
  },
  {
    id: 'domino',
    title: '도미노 대행진',
    emoji: '🁢',
    cat: 'collision',
    blurb: '작은 도미노가 점점 큰 도미노를 쓰러뜨려요. 진자 공으로 톡!',
    theme: 'sky',
    tools: ['domino', 'ball', 'box', 'plank', 'hand', 'blast', 'erase'],
    tool: 'domino',
    tips: ['“진자 공 놓기”를 눌러 시작해요', '도미노 도구로 나만의 길을 만들어 보세요', '간격이 너무 넓으면 어떻게 될까요?'],
    why: '쓰러지는 도미노는 옆 도미노를 톡 밀어요. 작은 도미노도 자기보다 1.5배쯤 큰 도미노를 쓰러뜨릴 수 있어서, 점점 큰 것까지 쓰러뜨릴 수 있어요.',
    build(sim) {
      sim.bounds();
      // 진자 공이 휙 내려와 첫 도미노 윗부분을 톡!
      const anchor = { x: 262, y: FLOOR - 300 };
      const L = 255;
      let ball: MBody | undefined;
      let dominos: MBody[] = [];
      const setup = () => {
        dominos.forEach((d) => sim.remove(d));
        if (ball) sim.remove(ball);
        const th = -1.25;
        ball = sim.ball(anchor.x + Math.sin(th) * L, anchor.y + Math.cos(th) * L, 20, 'stone', { face: true, static: true, nopin: true });
        sim.link({ point: anchor }, { body: ball, point: { ...ball.position } }, 'rope', { stiffness: 1, color: '#495057' });
        dominos = [];
        let x = 300, h = 56;
        const colors = ['#2b2d42', '#ef476f', '#118ab2', '#06d6a0', '#ffd166'];
        for (let i = 0; x < 1400; i++) {
          const w = Math.max(10, h * 0.2);
          dominos.push(sim.box(x, FLOOR - h / 2, w, h, 'wood', { color: colors[i % 5], stroke: '#111', deco: 'domino', density: 0.002, friction: 0.3, frictionStatic: 0.1, label: 'domino' }));
          x += h * 0.55 + 4;
          h *= 1.05;
        }
      };
      setup();
      return {
        actions: [
          { label: '진자 공 놓기!', icon: '🎳', primary: true, run: () => { if (ball?.isStatic) release([ball]); else { setup(); release([ball!]); } } },
          { label: '다시 세우기', icon: '🔄', run: setup },
        ],
        tick: () => {
          // 기울어진 도미노가 끝까지 넘어지도록 살짝 도와줘요 (엔진은 기대어 멈추는 경우가 많아서)
          for (const b of sim.bodies()) {
            if (b.isStatic || D(b)?.label !== 'domino') continue;
            const a = Math.atan2(Math.sin(b.angle), Math.cos(b.angle));
            // 오른쪽(줄 세운 방향)으로 기운 것만 도와줘요
            if (a < 0.1 || a > 1.2) continue;
            // 윗부분을 넘어지는 방향으로 살짝 밀기 (밑동은 마찰로 버팀)
            const half = (b.bounds.max.y - b.bounds.min.y) / 2;
            const top = { x: b.position.x + Math.sin(a) * half, y: b.position.y - Math.cos(a) * half };
            const f = b.mass * 0.0002;
            Body.applyForce(b, top, { x: Math.cos(a) * f, y: Math.sin(a) * f });
          }
        },
        hud: () => {
          const down = dominos.filter((d) => Math.abs(d.angle) > 0.6).length;
          return `쓰러진 도미노: ${down} / ${dominos.length}`;
        },
      };
    },
  },
  {
    id: 'tower',
    starter: true,
    title: '탑 무너뜨리기',
    emoji: '🏗️',
    cat: 'collision',
    blurb: '거대한 철거 공으로 상자 탑을 와르르! 무거운 공일수록 세게 부딪혀요.',
    theme: 'sky',
    tools: ['box', 'ball', 'plank', 'hand', 'rope', 'blast', 'erase'],
    tool: 'box',
    mat: 'wood',
    tips: ['“철거 공 놓기”를 눌러보세요', '상자로 나만의 탑을 쌓아보세요', '쇠공을 던지면 나무공보다 얼마나 셀까요?'],
    why: '무겁고 빠른 물체일수록 부딪힐 때 더 큰 힘을 줘요(운동량). 그래서 무거운 쇠공이 흔들리며 내려오면 탑이 와르르 무너져요.',
    build(sim) {
      sim.bounds();
      const anchor = { x: 640, y: 20 };
      const L = 640;
      let ball: MBody | undefined;
      let boxes: MBody[] = [];
      let starts: Vec[] = [];
      const setup = () => {
        if (ball) sim.remove(ball);
        boxes.forEach((b) => sim.remove(b));
        const th = -1;
        ball = sim.ball(anchor.x + Math.sin(th) * L, anchor.y + Math.cos(th) * L, 56, 'metal', { static: true, nopin: true, face: true });
        sim.link({ point: anchor }, { body: ball, point: { ...ball.position } }, 'rope', { stiffness: 1, color: '#343a40' });
        boxes = [];
        const s = 58;
        for (let row = 0; row < 6; row++) {
          for (let i = 0; i < 6 - row; i++) {
            boxes.push(sim.box(900 - ((5 - row) * s) / 2 + i * s, FLOOR - s / 2 - row * s, s - 2, s - 2, 'wood'));
          }
        }
        for (let k = 0; k < 10; k++) boxes.push(sim.box(1360, FLOOR - 27 - k * 54, 52, 52, k % 2 ? 'wood' : 'stone'));
        starts = boxes.map((b) => ({ ...b.position }));
      };
      setup();
      return {
        actions: [
          { label: '철거 공 놓기!', icon: '⛓️', primary: true, run: () => { if (ball?.isStatic) release([ball]); else { setup(); release([ball!]); } } },
          { label: '다시 쌓기', icon: '🔄', run: setup },
        ],
        hud: () => {
          const fell = boxes.filter((b, i) => b.position.y - starts[i].y > 30 || Math.abs(b.position.x - starts[i].x) > 40).length;
          return `무너진 상자: ${fell} / ${boxes.length}`;
        },
        back: (ctx) => {
          ctx.fillStyle = '#495057';
          ctx.fillRect(anchor.x - 80, 0, 160, 26);
        },
      };
    },
  },
  {
    id: 'billiards',
    title: '당구대',
    emoji: '🎱',
    cat: 'collision',
    blurb: '흰 공으로 탁! 공끼리 부딪히며 힘을 나눠 갖는 모습을 봐요.',
    theme: 'table',
    tools: ['cue', 'hand', 'ball', 'blast', 'erase'],
    tool: 'cue',
    mat: 'stone',
    gravity: { x: 0, y: 0 },
    tips: ['아무 곳이나 누르고 뒤로 당겼다 놓으면 흰 공을 쳐요', '정면으로 맞히면 흰 공이 멈추고 맞은 공이 달려가요', '구멍에 공을 모두 넣어보세요'],
    why: '부딪힐 때 흰 공의 움직임이 다른 공으로 옮겨 가요. 정면으로 맞으면 흰 공은 거의 멈추고, 비스듬히 맞으면 두 공이 서로 다른 방향으로 갈라져요.',
    build(sim) {
      const rail = { color: '#1b5e3b', stroke: '#0f3d26', restitution: 0.8, friction: 0.05, frictionStatic: 0 };
      const t = 36;
      sim.wall(sim.W / 2, t / 2, sim.W, t, rail);
      sim.wall(sim.W / 2, sim.H - t / 2, sim.W, t, rail);
      sim.wall(t / 2, sim.H / 2, t, sim.H, rail);
      sim.wall(sim.W - t / 2, sim.H / 2, t, sim.H, rail);
      const pockets: Vec[] = [
        { x: 58, y: 58 }, { x: sim.W / 2, y: 46 }, { x: sim.W - 58, y: 58 },
        { x: 58, y: sim.H - 58 }, { x: sim.W / 2, y: sim.H - 46 }, { x: sim.W - 58, y: sim.H - 58 },
      ];
      pockets.forEach((p) => sim.goal(p.x, p.y, 70, 70, 'pocket', 'circle'));
      const R = 20;
      const opts = { restitution: 0.95, friction: 0.005, frictionStatic: 0, air: 0.0035 };
      const colors = ['#ffd43b', '#4dabf7', '#ff6b6b', '#845ef7', '#ff922b', '#51cf66', '#c92a2a', '#212529', '#fcc419', '#1c7ed6', '#f03e3e', '#7048e8', '#e8590c', '#2f9e44', '#a61e4d'];
      let cue: MBody | undefined;
      let potted = 0;
      let respawnAt = 0;
      // 흰 공 자리에 다른 공이 있으면 겹치지 않는 곳을 찾아서 놓아요
      const freeSpot = (): Vec => {
        const others = sim.bodies().filter((b) => !b.isStatic && !b.isSensor);
        for (const dx of [0, -70, -140, -210]) {
          for (let k = 0; k < 15; k++) {
            const dy = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (R * 2 + 8); // 0, +, −, ++, −− …
            const p = { x: 420 + dx, y: 450 + dy };
            if (p.y < 90 || p.y > sim.H - 90) continue;
            if (others.every((b) => Math.hypot(b.position.x - p.x, b.position.y - p.y) > R * 2 + 4)) return p;
          }
        }
        return { x: 420, y: 450 };
      };
      const placeCue = () => {
        const p = freeSpot();
        cue = sim.ball(p.x, p.y, R, 'stone', { ...opts, color: '#fdfdfd', stroke: '#ccc', face: true });
      };
      const rack = () => {
        sim.bodies().forEach((b) => { if (!b.isStatic) sim.remove(b); });
        potted = 0;
        let k = 0;
        for (let row = 0; row < 5; row++) {
          for (let j = 0; j <= row; j++) {
            sim.ball(1100 + row * (R * 1.8 + 3), 450 + (j - row / 2) * (R * 2 + 4), R, 'stone', { ...opts, color: colors[k], stroke: 'rgba(0,0,0,0.35)', number: k + 1 });
            k++;
          }
        }
        placeCue();
      };
      rack();
      return {
        cue: () => cue,
        onGoal: (b) => {
          const p = { ...b.position };
          sim.remove(b);
          if (b === cue) {
            cue = undefined;
            respawnAt = sim.steps + 50;
            sim.text(p.x, p.y, '앗, 흰 공이!', '#fff');
          } else {
            potted++;
            sim.confetti(p.x, p.y);
            sim.text(p.x, p.y + (p.y < 450 ? 60 : -60), potted === 15 ? '전부 넣었어요!' : '쏙!', '#ffe066');
          }
        },
        tick: () => { if (!cue && respawnAt && sim.steps >= respawnAt) { respawnAt = 0; placeCue(); } },
        hud: () => `넣은 공: ${potted} / 15`,
        actions: [{ label: '다시 놓기', icon: '🔺', run: rack }],
        back: (ctx) => {
          for (const p of pockets) {
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 7); ctx.fill();
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(420, 40); ctx.lineTo(420, sim.H - 40); ctx.stroke();
          ctx.beginPath(); ctx.arc(420, 450, 6, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        },
      };
    },
  },

  // ───────────────────────────── 자유 ─────────────────────────────
  {
    id: 'free',
    title: '자유 놀이터',
    emoji: '🧪',
    cat: 'free',
    blurb: '모든 도구가 다 있어요. 상상하는 건 무엇이든 만들어 보세요!',
    theme: 'lab',
    tools: ['hand', 'ball', 'box', 'tri', 'plank', 'domino', 'drop', 'plus', 'minus', 'magnet', 'star', 'wall', 'rope', 'spring', 'water', 'wind', 'field', 'gzone', 'blast', 'pin', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    tips: ['막대 줄로 공을 빈 곳에 매달면 그네가 돼요', '용수철로 상자 두 개를 이어보세요', '중력 구역으로 둥실 떠오르는 방을 만들어요'],
    why: '여기서는 정답이 없어요. "이렇게 하면 어떻게 될까?" 하고 궁금해하는 것, 그게 바로 과학자가 하는 일이에요.',
    build(sim) {
      sim.bounds();
      sim.line(120, 420, 620, 600, 16, { removable: true, color: '#8e7cc3', stroke: '#5e4b94' });
      sim.ball(180, 360, 26, 'rubber', { face: true });
      for (let i = 0; i < 4; i++) sim.box(1100, FLOOR - 28 - i * 56, 54, 54, 'wood');
      const seat = sim.box(1400, 560, 120, 16, 'wood');
      sim.link({ point: { x: 1350, y: 200 } }, { body: seat, point: { x: 1350, y: 560 } }, 'rope');
      sim.link({ point: { x: 1450, y: 200 } }, { body: seat, point: { x: 1450, y: 560 } }, 'rope');
      sim.ball(1400, 520, 22, 'rubber', { face: true, color: '#74c0fc', stroke: '#1c7ed6' });
    },
  },
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id);
