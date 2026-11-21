import type { MatId } from './materials';
import { brass, gold, ink, isLight, type Theme } from './render';
import { B_DEMO, BASE_DT, G_EARTH, PLANET_G, PX_PER_M, Q_UNIT, toM, velFromSI } from './units';
import { D, Matter, type MBody, type Sim, type Vec } from './sim';
import type { ToolId } from './tools';

const { Body, Bodies } = Matter;

export type Cat = 'gravity' | 'friction' | 'fluid' | 'em' | 'collision' | 'free';

export const CATS: Record<Cat, { name: string; emoji: string; color: string }> = {
  gravity: { name: '중력', emoji: '🌍', color: '#93a3d4' },
  friction: { name: '마찰', emoji: '🛷', color: '#c99567' },
  fluid: { name: '물과 바람', emoji: '💧', color: '#7fb3c4' },
  em: { name: '전기와 자석', emoji: '⚡', color: '#cdb062' },
  collision: { name: '충돌', emoji: '💥', color: '#c98a90' },
  free: { name: '자유', emoji: '🧪', color: '#8fbca0' },
};

type Hook = (ctx: CanvasRenderingContext2D, sim: Sim, t: number) => void;

export interface Action { label: string | (() => string); icon: string; run: () => void; primary?: boolean }

/** 슬라이더로 바꾸는 실험 조건. 장면 코드는 실행할 때 value 를 읽어요 */
export interface Param {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange?: (v: number) => void;
}

/**
 * 예측 → 관찰 → 설명. 먼저 결과를 고르게 한 다음 실험을 돌리고,
 * result() 가 정답 번호를 돌려주면(결과가 나오면) 예측과 비교해 보여줘요.
 */
export interface Predict {
  question: string;
  options: string[];
  start: () => void;
  /** 아직 결과가 안 나왔으면 undefined. 나오면 실제로 일어난 보기 번호와 잰 값 설명 */
  result: () => { pick: number; detail: string } | undefined;
  explain: string;
}

/** 두 번째 단계 설명: 쉬운 설명(why) 다음에 펼쳐 보는 식·가정·한계 */
export interface Deep {
  /** 핵심 식 */
  law: string[];
  /** 이 시뮬레이션이 가정한 것 */
  assume: string[];
  /** 실제 세계와 다른 점 */
  limit: string[];
}

export interface Runtime {
  actions?: Action[];
  params?: Param[];
  predict?: Predict;
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
  /** "자세히" — 식, 시뮬레이션의 가정, 실제와 다른 점 */
  deep: Deep;
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

/** 이번 프레임에 그린 장면 이름표 자리(세상 좌표 [x, y, w, h]). 실험 가이드 카드가 이걸 피해서 자리를 골라요 */
export const labelBoxes: [number, number, number, number][] = [];

/** plate: 무늬(자기장 기호 등) 위에 쓸 때 글자 뒤에 까는 판 색 */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = ink(0.86), size = 24, plate?: string) {
  ctx.font = `500 ${size}px Pretendard, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  const box: [number, number, number, number] = [x - w / 2 - 14, y - size * 0.85, w + 28, size * 1.7];
  labelBoxes.push(box);
  if (plate) {
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.roundRect(...box, 4);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** 왼쪽 눈금자: 바닥에서 1 m 마다 */
function ruler(ctx: CanvasRenderingContext2D, x = 40) {
  ctx.fillStyle = ink(0.58);
  ctx.font = '400 15px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let k = 1; FLOOR - k * PX_PER_M > 40; k++) {
    const y = FLOOR - k * PX_PER_M;
    ctx.fillRect(x, y - 0.5, 24, 1);
    ctx.fillText(`${k} m`, x + 38, y);
  }
}

export const SCENES: Scene[] = [
  // ───────────────────────────── 중력 ─────────────────────────────
  {
    id: 'drop-race',
    starter: true,
    title: '자유 낙하와 공기 저항',
    emoji: '🪶',
    cat: 'gravity',
    blurb: '볼링공, 사과, 깃털을 같은 높이에서 떨어뜨려요. 공기를 없애면 결과가 어떻게 달라질까요?',
    theme: 'sky',
    tools: ['hand', 'ball', 'box', 'erase'],
    tool: 'hand',
    tips: ['“떨어뜨리기”를 눌러 경주를 시작해요', '공기를 없애고 다시 떨어뜨려 보세요. 이론값 √(2h/g) 와 비교해요', '“예측하고 실험하기”로 진공에서 누가 먼저 닿을지 맞혀보세요'],
    why: '모든 물체는 중력 때문에 똑같이 빨라지며 떨어져요. 깃털이 느린 건 공기 저항이 크게 작용하기 때문이에요. 1971년 공기가 없는 달에서 망치와 깃털을 함께 떨어뜨렸더니 실제로 동시에 닿았어요.',
    deep: {
      law: ['자유 낙하: h = ½gt², 떨어지는 시간 t = √(2h/g)', '중력 F = mg → 가속도 a = F/m = g (질량과 무관)', '공기 중에서는 저항 때문에 종단 속도 v = g/γ 에 가까워지면 더 빨라지지 않아요'],
      assume: ['g = 9.81 m/s², 화면 100 px = 1 m', '공기 저항은 속도에 비례하는 모델(F = −γmv)이고, 깃털처럼 가볍고 넓은 물체일수록 γ 가 커요'],
      limit: ['실제 공기 저항은 빠를수록 속도의 제곱에 가깝게 커져요', '2D 시뮬레이션이라 물체를 두께 1 cm 판으로 보고 질량을 계산해요'],
    },
    build(sim) {
      sim.bounds();
      const height: Param = {
        id: 'h', label: '떨어뜨리는 높이', unit: 'm', min: 1, max: 7, step: 0.5, value: 6.5,
        onChange: () => { if (items.every((b) => b.isStatic)) setup(); },
      };
      /** 물체 바닥이 땅에서 h 만큼 떠 있게 */
      const yAt = (r: number) => FLOOR - height.value * PX_PER_M - r;
      const defs = [
        { name: '볼링공', x: 400, make: (x: number) => sim.ball(x, yAt(36), 36, 'stone', { label: '볼링공', color: '#2a2b33', stroke: '#111216', face: true, static: true, nopin: true }) },
        { name: '사과', x: 800, make: (x: number) => sim.ball(x, yAt(26), 26, 'wood', { label: '사과', color: '#8e2f38', stroke: '#4a141a', deco: 'apple', static: true, nopin: true }) },
        { name: '깃털', x: 1200, make: (x: number) => sim.ball(x, yAt(26), 26, 'feather', { label: '깃털', ...clear, deco: 'feather', static: true, nopin: true }) },
      ];
      let items: MBody[] = [];
      let start = 0;
      let results: string[] = [];
      let landed = new Map<MBody, number>();
      const setup = () => {
        items.forEach((b) => sim.remove(b));
        items = defs.map((d) => d.make(d.x));
        results = [];
        landed = new Map();
      };
      const drop = () => { if (!items.every((b) => b.isStatic)) setup(); release(items); start = sim.time; };
      setup();
      return {
        params: [height],
        predict: {
          question: '공기를 모두 없앤 진공에서 볼링공과 깃털을 같은 높이에서 떨어뜨리면, 무엇이 먼저 땅에 닿을까요?',
          options: ['볼링공', '깃털', '동시에 닿는다'],
          start: () => { sim.setAir(0); setup(); drop(); },
          result: () => {
            const tb = landed.get(items[0]), tf = landed.get(items[2]);
            if (tb === undefined || tf === undefined) return undefined;
            const detail = `볼링공 ${secs(tb - start)}초 · 깃털 ${secs(tf - start)}초 (이론 √(2h/g) = ${Math.sqrt((2 * height.value) / G_EARTH).toFixed(2)}초)`;
            return { pick: Math.abs(tb - tf) < 40 ? 2 : tb < tf ? 0 : 1, detail };
          },
          explain: '중력 가속도 g 는 질량과 상관없이 모든 물체에 똑같아요(9.81 m/s²). 무거운 물체는 중력을 더 세게 받지만 그만큼 움직이기도 어려워서(F = ma) 가속도가 같아지거든요. 공기 중에서 깃털이 느린 건 공기 저항 때문이고, 1971년 아폴로 15호 우주인이 달에서 망치와 깃털을 떨어뜨려 동시에 닿는 걸 보여줬어요.',
        },
        actions: [
          { label: '떨어뜨리기', icon: '⬇️', primary: true, run: drop },
          { label: () => (sim.air > 0 ? '공기 없애기' : '공기 되살리기'), icon: '🌬️', run: () => sim.setAir(sim.air > 0 ? 0 : 1) },
        ],
        tick: () => {
          items.forEach((b, i) => {
            if (b.isStatic || landed.has(b)) return;
            if (b.bounds.max.y >= FLOOR - 2) {
              landed.set(b, sim.time);
              results.push(`${defs[i].name} ${secs(sim.time - start)}초`);
              sim.text(b.position.x, b.position.y - 70, `${landed.size}위`);
            }
          });
        },
        hud: () => {
          const air = sim.air > 0 ? '공기 있음' : `진공 · 이론 ${Math.sqrt((2 * height.value) / G_EARTH).toFixed(2)}초`;
          return `${air}${results.length ? ' · ' + results.join(' · ') : ''}`;
        },
        back: (ctx) => {
          const y = FLOOR - height.value * PX_PER_M;
          ctx.strokeStyle = brass(0.5);
          ctx.setLineDash([6, 8]);
          ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.moveTo(200, y); ctx.lineTo(1400, y); ctx.stroke();
          ctx.setLineDash([]);
          label(ctx, `출발 ${height.value} m`, 1490, y, ink(0.72), 22);
          ruler(ctx);
        },
      };
    },
  },
  {
    id: 'planets',
    title: '행성별 중력 가속도',
    emoji: '🪐',
    cat: 'gravity',
    blurb: '달, 화성, 지구, 목성에서 같은 속도로 점프하면 얼마나 높이 올라갈까요?',
    theme: 'sky',
    tools: ['hand', 'ball', 'box', 'blast', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    air: 0,
    tips: ['“모두 점프”를 눌러보세요. 점선은 이론 최고 높이 v²/2g 예요', '실험 조건에서 점프 속도를 바꿔 보세요. 두 배로 하면 높이는?', '“예측하고 실험하기”로 달과 지구의 높이 차이를 맞혀보세요'],
    why: '행성마다 표면의 중력 가속도 g 가 달라요. 달은 지구의 약 1/6이라 같은 속도로 뛰어도 훨씬 높이, 훨씬 천천히 올라갔다 내려와요. 목성에서는 g 가 지구의 약 2.5배라 몸무게도 2.5배가 돼요.',
    deep: {
      law: ['최고 높이 h = v²/2g (½mv² = mgh)', '체공 시간 t = 2v/g', '표면 중력 g = GM/R² — 질량 M 이 크면 세지고, 반지름 R 이 크면 약해져요'],
      assume: ['g: 달 1.62, 화성 3.71, 지구 9.81, 목성 24.79 m/s²', '공기 저항이 없는 진공이에요'],
      limit: ['목성은 단단한 땅이 없는 가스 행성이에요', '실제로는 중력이 세면 같은 다리 힘으로 낼 수 있는 점프 속도도 줄어요'],
    },
    build(sim) {
      sim.bounds();
      const cols = [
        { n: '달 1.62 m/s²', short: '달', g: PLANET_G.moon, c: 'rgba(215,215,240,0.3)' },
        { n: '화성 3.71 m/s²', short: '화성', g: PLANET_G.mars, c: 'rgba(255,160,120,0.22)' },
        { n: '지구 9.81 m/s²', short: '지구', g: 1, c: 'rgba(120,210,150,0.2)' },
        { n: '목성 24.8 m/s²', short: '목성', g: PLANET_G.jupiter, c: 'rgba(255,190,110,0.28)' },
      ];
      const cw = sim.W / 4;
      cols.forEach((c, i) => {
        sim.zone({ kind: 'gravity', x: i * cw, y: -3000, w: cw, h: sim.H + 3000, g: { x: 0, y: c.g }, label: c.n, color: c.c, removable: false });
        if (i) sim.wall(i * cw, (260 + FLOOR) / 2, 4, FLOOR - 260, { color: '#454850', stroke: '#4a4d55' });
      });
      const speed: Param = { id: 'v', label: '점프 속도', unit: 'm/s', min: 1, max: 6, step: 0.5, value: 4 };
      const colors = ['#b9b8c4', '#a8644a', '#5a7fa6', '#b98a5a'];
      const R = 26;
      const add = () => cols.forEach((_, i) => sim.ball(i * cw + cw / 2, FLOOR - R, R, 'rubber', { face: true, color: colors[i], stroke: '#222' }));
      add();
      /** 칸마다 첫 점프의 최고 높이 (m). 땅에 다시 닿으면 기록을 멈춰요 */
      let peaks: (number | undefined)[] = [];
      let done: boolean[] = [];
      let jumped = false;
      const colOf = (b: MBody) => Math.min(3, Math.max(0, Math.floor(b.position.x / cw)));
      const heightOf = (b: MBody) => toM(FLOOR - b.bounds.max.y);
      const jump = () => {
        peaks = [undefined, undefined, undefined, undefined];
        done = [false, false, false, false];
        jumped = true;
        const v = velFromSI(speed.value);
        sim.bodies().forEach((b) => { if (!b.isStatic) Body.setVelocity(b, { x: Body.getVelocity(b).x, y: -v }); });
      };
      return {
        params: [speed],
        predict: {
          question: '같은 속도로 점프하면, 달에서는 지구보다 몇 배 높이 올라갈까요? (달의 중력은 지구의 약 1/6)',
          options: ['약 2.5배 (√6)', '약 6배', '약 36배 (6²)'],
          start: () => {
            sim.bodies().forEach((b) => { if (!b.isStatic) sim.remove(b); });
            add();
            jump();
          },
          result: () => {
            if (!done[0] || !done[2] || !peaks[0] || !peaks[2]) return undefined;
            const ratio = peaks[0] / peaks[2];
            const opts = [Math.sqrt(6), 6, 36];
            const pick = opts.reduce((best, o, i) => (Math.abs(Math.log(o / ratio)) < Math.abs(Math.log(opts[best] / ratio)) ? i : best), 0);
            return { pick, detail: `달 ${peaks[0].toFixed(2)} m ÷ 지구 ${peaks[2].toFixed(2)} m = ${ratio.toFixed(1)}배` };
          },
          explain: '올라가는 동안 운동에너지가 위치에너지로 바뀌어요: ½mv² = mgh, 그래서 최고 높이 h = v²/2g. 높이는 g 에 반비례하니 중력이 1/6 이면 6배 높이 올라가요. 대신 올라갔다 내려오는 시간(2v/g)도 6배라서 달에서는 아주 느긋하게 떨어져요.',
        },
        actions: [
          { label: '모두 점프', icon: '🦘', primary: true, run: jump },
          { label: '공 하나씩 더', icon: '⚽', run: add },
        ],
        tick: () => {
          if (!jumped) return;
          for (const b of sim.bodies()) {
            if (b.isStatic || D(b)?.kind !== 'shape') continue;
            const i = colOf(b);
            if (done[i]) continue;
            const h = heightOf(b);
            peaks[i] = Math.max(peaks[i] ?? 0, h);
            if (peaks[i]! > 0.2 && h < 0.02) done[i] = true;
          }
        },
        hud: () => {
          if (!jumped) return `점프 속도 ${speed.value} m/s · 최고 높이 이론값 h = v²/2g`;
          return cols.map((c, i) => `${c.short} ${peaks[i] !== undefined ? peaks[i]!.toFixed(2) : '–'} m`).join(' · ');
        },
        back: (ctx) => {
          for (let i = 0; i < 4; i++) {
            // 이론 최고 높이 v²/2g 를 점선으로
            const h = (speed.value * speed.value) / (2 * G_EARTH * cols[i].g);
            const y = FLOOR - h * PX_PER_M;
            if (y > 40) {
              ctx.strokeStyle = brass(0.55);
              ctx.setLineDash([5, 6]);
              ctx.lineWidth = 1.25;
              ctx.beginPath(); ctx.moveTo(i * cw + 60, y); ctx.lineTo(i * cw + cw - 20, y); ctx.stroke();
              ctx.setLineDash([]);
              ctx.font = '400 14px "IBM Plex Mono", ui-monospace, monospace';
              ctx.textAlign = 'right';
              ctx.fillStyle = gold(0.8);
              ctx.fillText(`이론 ${h.toFixed(2)} m`, i * cw + cw - 20, y - 10);
            }
            for (let y2 = FLOOR - 100, k = 1; y2 > 80; y2 -= 100, k++) {
              ctx.fillStyle = ink(0.3);
              ctx.fillRect(i * cw + 14, y2, 20, 1);
              ctx.font = '400 13px "IBM Plex Mono", ui-monospace, monospace';
              ctx.textAlign = 'left';
              ctx.fillText(`${k} m`, i * cw + 42, y2 + 5);
            }
          }
        },
      };
    },
  },
  {
    id: 'solar',
    title: '궤도 운동',
    emoji: '☀️',
    cat: 'gravity',
    blurb: '별 주위를 도는 행성. 직접 던져서 원 궤도와 타원 궤도를 만들어 보세요.',
    theme: 'space',
    tools: ['ball', 'star', 'hand', 'pin', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    gravity: { x: 0, y: 0 },
    air: 0,
    trails: true,
    tips: ['빈 곳을 누르고 뒤로 당겼다 놓아 행성을 던져요', '너무 약하면 별로 떨어지고, 너무 세면 멀리 날아가요', '별을 하나 더 놓으면 어떻게 될까요?'],
    why: '행성은 사실 별을 향해 계속 떨어지고 있어요. 그런데 옆으로 달리는 속도가 알맞으면 떨어지는 만큼 옆으로 비켜 가서 계속 별 주위를 돌아요. 이것이 궤도예요.',
    deep: {
      law: ['만유인력 가속도 a = GM/r²', '원 궤도 속력 v = √(GM/r)', '케플러 제3법칙 T² ∝ r³', '탈출 속력 v = √(2GM/r) — 이보다 빠르면 돌아오지 않아요'],
      assume: ['별은 고정되어 있고 행성끼리 당기는 힘은 무시해요', 'GM 과 거리는 화면 크기에 맞춘 값이에요'],
      limit: ['실제 태양계보다 훨씬 작고 빨라요', '60 Hz 수치 적분이라 별을 아주 가까이 스치면 에너지 오차가 커져요'],
    },
    build(sim) {
      const sun = sim.star(800, 450, 48, 70, { removable: false });
      void sun;
      let planets: MBody[] = [];
      const place = () => {
        planets.forEach((p) => sim.remove(p));
        const defs = [
          { r: 140, size: 13, c: '#a7a39b' },
          { r: 240, size: 20, c: '#5a7fa6' },
          { r: 350, size: 24, c: '#b07a4f' },
        ];
        planets = defs.map((d, i) => {
          const a = i * 2.1;
          const v = Math.sqrt(70 / d.r) * (1000 / 60);
          const b = sim.ball(800 + Math.cos(a) * d.r, 450 + Math.sin(a) * d.r, d.size, 'rubber', { color: d.c, stroke: '#111', face: true, air: 0 });
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
    title: '포물선 운동',
    emoji: '🏀',
    cat: 'gravity',
    blurb: '각도와 속력을 정해 공을 던져요. 점선 궤적을 보며 골대를 노려 보세요.',
    theme: 'sky',
    tools: ['ball', 'hand', 'box', 'plank', 'wall', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    tips: ['실험 조건에서 각도와 속력을 정하고 “발사”로 골대를 노려요', '점선은 공기 저항이 없을 때의 궤적이에요. 실제 공은 조금 짧게 떨어져요', '“예측하고 실험하기”로 가장 멀리 가는 각도를 맞혀보세요'],
    why: '던진 공은 앞으로 나아가는 동안 중력이 계속 아래로 끌어당겨요. 가로 방향 속도는 그대로인데 세로 방향만 점점 바뀌어서 포물선을 그려요.',
    deep: {
      law: ['x = v·cosθ·t, y = v·sinθ·t − ½gt²', '사거리 R = v²·sin2θ / g (같은 높이로 떨어질 때)', '최고 높이 H = (v·sinθ)² / 2g'],
      assume: ['던진 공은 농구공 정도의 공기 저항(γ ≈ 0.2 /s)을 받아요', '점선은 공기 저항이 없을 때의 이론 궤적이에요'],
      limit: ['공의 회전(마그누스 효과)은 없어요', '공기 저항을 속도에 비례하는 모델로 단순화했어요'],
    },
    build(sim) {
      sim.bounds();
      sim.wall(1392, 330, 14, 180, { color: '#454850', stroke: '#6a6d75' });
      sim.wall(1406, 640, 16, 440, { color: '#2a2c31', stroke: '#45484f' });
      sim.wall(1240, 440, 12, 12, { color: '#9c7f45', stroke: '#6a5530' });
      sim.wall(1374, 440, 26, 10, { color: '#9c7f45', stroke: '#6a5530' });
      sim.goal(1308, 468, 100, 16, 'hoop');
      const ball = (x: number, y: number) => sim.ball(x, y, 24, 'rubber', { color: '#a8643a', stroke: '#4f2c16', face: true });
      ball(180, FLOOR - 30); ball(240, FLOOR - 30); ball(300, FLOOR - 30);
      let score = 0;
      const angle: Param = { id: 'deg', label: '던지는 각도', unit: '°', min: 10, max: 80, step: 1, value: 50 };
      const speed: Param = { id: 'v', label: '던지는 속력', unit: 'm/s', min: 3, max: 15, step: 0.1, value: 11 };
      const L0 = { x: 420, y: FLOOR - 140 };
      const launch = (deg: number, v: number, color = '#a8643a', ghost = false, from = L0) => {
        // 농구공 정도의 공기 저항: ½ρC_dA/m ≈ 0.02 /m → 10 m/s 에서 γ ≈ 0.2 /s (frictionAir = γ/60)
        const b = sim.ball(from.x, from.y, 18, 'rubber', { color, stroke: '#3d2210', face: true, air: 0.0035 });
        if (ghost) b.collisionFilter.group = -7; // 동시에 던진 공끼리는 부딪히지 않게
        const th = (deg * Math.PI) / 180;
        Body.setVelocity(b, { x: velFromSI(v * Math.cos(th)), y: -velFromSI(v * Math.sin(th)) });
        return b;
      };
      /** 예측 실험: 30°·45°·60° 를 같은 속력으로. 처음 땅에 닿은 곳(m)을 기록 */
      const PRED_V = 8;
      /** 예측 실험은 땅에서 던져요 (같은 높이로 돌아와야 R = v²sin2θ/g) */
      const G0 = { x: 520, y: FLOOR - 19 };
      let race: { b: MBody; deg: number; rose: boolean; x?: number }[] = [];
      return {
        params: [angle, speed],
        predict: {
          question: `같은 속력(${PRED_V} m/s)으로 30°, 45°, 60° 로 동시에 던지면, 어느 공이 가장 멀리 날아갈까요?`,
          options: ['30°', '45°', '60°', '셋 다 같다'],
          start: () => {
            race.forEach((r) => sim.remove(r.b));
            race = ([30, 45, 60] as const).map((deg, i) => ({ b: launch(deg, PRED_V, ['#5a7fa6', '#b07a4f', '#6e9a7f'][i], true, G0), deg, rose: false }));
          },
          result: () => {
            if (!race.length || race.some((r) => r.x === undefined)) return undefined;
            const best = race.reduce((a, r) => (r.x! > a.x! ? r : a));
            const close = race.every((r) => Math.abs(r.x! - best.x!) < 0.05);
            return {
              pick: close ? 3 : [30, 45, 60].indexOf(best.deg),
              detail: race.map((r) => `${r.deg}° ${r.x!.toFixed(2)} m`).join(' · ') + ` (진공 이론: 30°·60° ${((PRED_V ** 2 * Math.sin(Math.PI / 3)) / G_EARTH).toFixed(2)} m, 45° ${((PRED_V ** 2) / G_EARTH).toFixed(2)} m)`,
            };
          },
          explain: '사거리 R = v²·sin2θ / g 예요. sin2θ 는 2θ = 90°, 즉 θ = 45° 일 때 가장 커요. 30° 와 60° 는 sin60° = sin120° 라서 진공에서는 똑같이 날아가요. 공기 저항이 있으면 오래 떠 있는 60° 공이 더 손해를 봐서 30° 보다 조금 짧아져요.',
        },
        onGoal: (b) => {
          const d = D(b);
          if (!d || d.scored || b.velocity.y <= 0) return;
          d.scored = true;
          score++;
          sim.confetti(1308, 470);
          sim.text(1308, 380, `${score}`);
        },
        tick: () => {
          for (const r of race) {
            if (r.x !== undefined) continue;
            const h = toM(FLOOR - r.b.bounds.max.y);
            if (h > 0.3) r.rose = true;
            else if (r.rose && h < 0.02) r.x = toM(r.b.position.x - G0.x);
          }
        },
        hud: () => {
          const th = (angle.value * Math.PI) / 180, v = speed.value;
          return `골: ${score} · 최고 높이 ${((v * Math.sin(th)) ** 2 / (2 * G_EARTH)).toFixed(2)} m · 발사대 높이까지 사거리 ${((v * v * Math.sin(2 * th)) / G_EARTH).toFixed(2)} m (진공 이론)`;
        },
        actions: [
          { label: '발사', icon: '🚀', primary: true, run: () => { launch(angle.value, speed.value); } },
          { label: '공 더 주기', icon: '🏀', run: () => { ball(200, 500); ball(260, 500); } },
        ],
        back: (ctx) => {
          ctx.strokeStyle = brass(0.7);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(1392 - 7 - 40, 290, 40, 40);
          // 발사대와 공기 저항이 없을 때의 궤적(점선)
          const th = (angle.value * Math.PI) / 180, v = speed.value;
          ctx.fillStyle = '#26282d';
          ctx.fillRect(L0.x - 30, L0.y + 18, 60, FLOOR - L0.y - 18);
          ctx.strokeStyle = brass(0.55);
          ctx.lineWidth = 1.25;
          ctx.setLineDash([5, 7]);
          ctx.beginPath();
          for (let t = 0; t < 4; t += 0.02) {
            const x = L0.x + v * Math.cos(th) * t * PX_PER_M;
            const y = L0.y - (v * Math.sin(th) * t - 0.5 * G_EARTH * t * t) * PX_PER_M;
            if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            if (y > FLOOR || x > sim.W) break;
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = gold(0.9);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(L0.x, L0.y); ctx.lineTo(L0.x + Math.cos(th) * 70, L0.y - Math.sin(th) * 70); ctx.stroke();
          label(ctx, `${angle.value}° · ${speed.value.toFixed(1)} m/s`, L0.x, L0.y - 110, ink(0.75), 20);
        },
        front: (ctx) => {
          // 그물
          ctx.strokeStyle = ink(0.55);
          ctx.lineWidth = 1;
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
    title: '경사면과 정지 마찰',
    emoji: '🛷',
    cat: 'friction',
    blurb: '얼음, 나무, 고무 블록을 같은 경사면에 올려요. 어느 각도부터 미끄러지기 시작할까요?',
    theme: 'sky',
    tools: ['box', 'ball', 'hand', 'erase'],
    tool: 'box',
    mat: 'ice',
    air: 0,
    tips: ['“출발”을 눌러 세 블록을 놓아 보세요', '실험 조건에서 경사각을 바꿔요. tanθ 가 정지 마찰계수 μs 보다 커지는 순간 미끄러져요', '“예측하고 실험하기”로 20° 에서 어떤 블록이 미끄러질지 맞혀보세요'],
    why: '맞닿은 면이 미끄러지지 않게 붙잡는 힘이 마찰력이에요. 가만히 있는 물체는 정지 마찰이 버텨 주다가, 경사가 가팔라져 버틸 수 있는 한계를 넘으면 미끄러지기 시작해요. 미끄러지는 동안에는 그보다 조금 작은 운동 마찰이 속도를 줄여요.',
    deep: {
      law: ['최대 정지 마찰력 f ≤ μs·N, 운동 마찰력 f = μk·N', '경사면의 수직항력 N = mg·cosθ', '미끄러지기 시작하는 조건: mg·sinθ > μs·mg·cosθ → tanθ > μs', '미끄러질 때 가속도 a = g(sinθ − μk·cosθ), 바닥에서 감속도 μk·g'],
      assume: ['마찰계수는 속도·넓이와 상관없이 일정해요(쿨롱 마찰 모델)', '블록마다 정해진 값: 얼음 μs 0.05 / μk 0.03, 나무 0.40 / 0.30, 고무 1.0 / 0.8'],
      limit: ['경사면과 바닥이 꺾이는 곳에서 블록이 부딪히며 속도를 조금 잃어요', '실제 마찰계수는 표면 상태·습기·온도에 따라 크게 달라요'],
    },
    build(sim) {
      sim.bounds({ ceiling: false });
      const lanes: { mat: MatId; name: string; muS: number; mu: number; band: string }[] = [
        { mat: 'ice', name: '얼음', muS: 0.05, mu: 0.03, band: 'rgba(170,205,225,0.25)' },
        { mat: 'wood', name: '나무', muS: 0.4, mu: 0.3, band: 'rgba(224,169,109,0.16)' },
        { mat: 'rubber', name: '고무', muS: 1.0, mu: 0.8, band: 'rgba(255,107,107,0.1)' },
      ];
      const X0 = 40, X1 = 460, RUN = X1 - X0;
      const laneY = (i: number) => 130 + i * 255 + 190; // 평평한 바닥 높이
      const slope: Param = {
        id: 'deg', label: '경사각 θ', unit: '°', min: 8, max: 28, step: 1, value: 24,
        onChange: () => { ramps(); setup(); },
      };
      lanes.forEach((l, i) => {
        sim.zone({ kind: 'drag', x: 0, y: laneY(i) - 253, w: sim.W, h: 245, color: l.band, removable: false });
        sim.line(X1 + 60, laneY(i), 1560, laneY(i), 16, { friction: 0, color: '#3d4048', stroke: '#666a73' });
        sim.wall(1560, laneY(i) - 50, 16, 100, { color: '#454850', stroke: '#6d7179' });
      });
      let rampBodies: MBody[] = [];
      const ang = () => (slope.value * Math.PI) / 180;
      /** 경사면 + 바닥으로 부드럽게 이어지는 곡면(반지름 R) — 꺾인 모서리에서 속도를 잃지 않게 */
      function ramps() {
        rampBodies.forEach((b) => sim.remove(b));
        rampBodies = [];
        const a = ang(), R = 400, d = R * Math.tan(a / 2), N = 10;
        const o = { friction: 0, color: '#3d4048', stroke: '#666a73' };
        lanes.forEach((_, i) => {
          const y = laneY(i);
          const cx = X1 + d, cy = y - R;
          const pts = Array.from({ length: N + 1 }, (_, k) => {
            const f = -a + (a * k) / N;
            return { x: cx + R * Math.sin(f), y: cy + R * Math.cos(f) };
          });
          rampBodies.push(sim.line(X0, y - RUN * Math.tan(a), pts[0].x, pts[0].y, 16, o));
          for (let k = 0; k < N; k++) rampBodies.push(sim.line(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, 16, o));
        });
      }
      ramps();

      let blocks: MBody[] = [];
      let from: Vec[] = [];
      let hold: (Vec | undefined)[] = [];
      /** 막 놓은 블록: 처음 닿을 때까지는 '가만히 놓인' 상태로 봐요 */
      let fresh: boolean[] = [];
      let start = -1;
      const setup = () => {
        blocks.forEach((b) => sim.remove(b));
        start = -1;
        hold = [];
        const a = ang();
        blocks = lanes.map((l, i) => {
          // 경사면 위쪽, 표면에 딱 닿게 (상자 반 높이 20 + 경사면 반 두께 8)
          const x = 110, ry = laneY(i) - (X1 - x) * Math.tan(a);
          const b = sim.box(x + Math.sin(a) * 28.5, ry - Math.cos(a) * 28.5, 64, 40, l.mat, { angle: a, static: true, nopin: true, friction: 0 });
          return b;
        });
        from = blocks.map((b) => ({ ...b.position }));
      };
      const go = () => { if (!blocks.every((b) => b.isStatic)) setup(); release(blocks); fresh = blocks.map(() => true); start = sim.time; };
      setup();

      /** 바닥(경사면)과 닿아 있으면 위쪽을 향한 접촉면 법선 */
      const contactNormal = (b: MBody): Vec | undefined => {
        for (const pair of sim.engine.pairs.list) {
          if (!pair.isActive) continue;
          const A = pair.bodyA.parent, B = pair.bodyB.parent;
          if (A !== b && B !== b) continue;
          const other = A === b ? B : A;
          if (!other.isStatic) continue;
          let n = pair.collision.normal;
          if (n.y > 0) n = { x: -n.x, y: -n.y };
          if (n.y < -0.3) return n;
        }
        return undefined;
      };

      const blockNames = lanes.map((l) => l.name);
      return {
        params: [slope],
        predict: {
          question: '경사각을 20° 로 하고 블록을 놓으면 어떤 블록이 미끄러져 내려갈까요? (정지 마찰계수 μs: 얼음 0.05, 나무 0.40, 고무 1.0)',
          options: ['얼음만', '얼음과 나무', '셋 다'],
          start: () => { slope.value = 20; ramps(); setup(); go(); },
          result: () => {
            if (start < 0 || sim.time - start < 2000) return undefined;
            const moved = blocks.map((b, i) => Math.hypot(b.position.x - from[i].x, b.position.y - from[i].y) > 20);
            const n = moved.filter(Boolean).length;
            const detail = `tan 20° = ${Math.tan(ang()).toFixed(2)} · 미끄러진 블록: ${blockNames.filter((_, i) => moved[i]).join(', ') || '없음'}`;
            return { pick: n >= 3 ? 2 : n === 2 ? 1 : 0, detail };
          },
          explain: '미끄러지게 하는 힘은 mg·sinθ, 정지 마찰이 버틸 수 있는 최대 힘은 μs·mg·cosθ 예요. 둘을 비교하면 질량은 지워지고 tanθ > μs 일 때만 미끄러져요. tan 20° ≈ 0.36 은 얼음(0.05)보다 크지만 나무(0.40)보다 작아서 얼음만 내려가요. 경사를 22°(tan ≈ 0.40) 넘게 올리면 나무도 미끄러지기 시작해요.',
        },
        actions: [{ label: '출발', icon: '🏁', primary: true, run: go }],
        tick: () => {
          // 쿨롱 마찰: 엔진 마찰은 끄고(friction 0) 여기서 직접 계산해요
          const dt = (BASE_DT * sim.engine.timing.timeScale) / 1000;
          const grabbed = new Set(Matter.Composite.allConstraints(sim.world).map((c) => c.bodyB));
          blocks.forEach((b, i) => {
            if (b.isStatic || grabbed.has(b)) { hold[i] = undefined; return; }
            const n = contactNormal(b);
            if (!n) { hold[i] = undefined; return; }
            const l = lanes[i];
            const cos = -n.y;
            const tan = Math.sqrt(Math.max(0, 1 - cos * cos)) / cos;
            const t = { x: -n.y, y: n.x };
            const v = Body.getVelocity(b);
            const vt = v.x * t.x + v.y * t.y;
            const gN = G_EARTH * cos * dt * sim.gravity.y;
            // 한 걸음 동안 정지 마찰이 막을 수 있는 속도 안이면 멈춰 있어요
            const resting = fresh[i] || hold[i] || Math.abs(vt) <= velFromSI(l.muS * gN);
            fresh[i] = false;
            if (tan <= l.muS && resting) {
              hold[i] ??= { ...b.position };
              Body.setPosition(b, hold[i]!);
              Body.setVelocity(b, { x: 0, y: 0 });
              Body.setAngularVelocity(b, 0);
              return;
            }
            hold[i] = undefined;
            const dv = velFromSI(l.mu * gN);
            const nvt = Math.sign(vt) * Math.max(0, Math.abs(vt) - dv);
            Body.setVelocity(b, { x: v.x + (nvt - vt) * t.x, y: v.y + (nvt - vt) * t.y });
          });
        },
        hud: () => {
          const head = `θ = ${slope.value}° · tanθ = ${Math.tan(ang()).toFixed(2)}`;
          if (start < 0) return `${head} · 세 블록이 출발을 기다려요`;
          return `${head} · ` + blocks.map((b, i) => `${lanes[i].name} ${toM(Math.max(0, b.position.x - from[i].x)).toFixed(2)} m`).join(' · ');
        },
        back: (ctx) => {
          const tan = Math.tan(ang());
          lanes.forEach((l, i) => {
            const y = laneY(i) - 70;
            label(ctx, l.name, 1250, y, ink(0.78), 28);
            label(ctx, `μs ${l.muS.toFixed(2)} · μk ${l.mu.toFixed(2)} · ${tan > l.muS ? '미끄러짐' : '멈춰 있음'}`, 1250, y + 36, gold(0.8), 17);
          });
        },
      };
    },
  },
  {
    id: 'curling',
    title: '운동 마찰과 제동 거리',
    emoji: '🥌',
    cat: 'friction',
    blurb: '얼음판, 나무 마루, 잔디밭. 같은 속력으로 밀어도 멈추는 곳이 달라요.',
    theme: 'ice',
    tools: ['ball', 'hand', 'box', 'erase'],
    tool: 'ball',
    mat: 'stone',
    gravity: { x: 0, y: 0 },
    air: 0,
    tips: ['“세 돌 밀기”로 같은 속력에서 멈추는 거리를 비교해요. 점선은 이론값 v²/2μg 예요', '미는 속력을 바꿔서 과녁 한가운데에 세워 보세요', '“예측하고 실험하기”로 속력을 두 배로 할 때 멈추는 거리를 맞혀보세요'],
    why: '미끄러지는 돌에는 운동 방향 반대로 마찰력이 작용해서 점점 느려져요. 바닥이 거칠수록 마찰계수가 커서 더 빨리 멈춰요. 컬링 선수들이 얼음을 솔로 문지르는 건 마찰을 줄여서 돌을 더 멀리 보내려는 거예요.',
    deep: {
      law: ['위에서 내려다본 평평한 바닥: 수직항력 N = mg', '운동 마찰력 f = μk·mg → 감속도 a = μk·g (질량과 무관)', '멈출 때까지 거리 d = v² / (2μk·g) — 속력의 제곱에 비례'],
      assume: ['마찰계수: 얼음판 0.05, 나무 마루 0.20, 잔디밭 0.50', '돌이 구르지 않고 미끄러지기만 해요', '공기 저항은 없어요'],
      limit: ['실제 컬링 얼음은 μ ≈ 0.01 정도로 훨씬 미끄러워서, 화면(16 m) 안에 멈추도록 크게 잡았어요', '돌이 벽에 부딪히면 이론 거리와 달라져요'],
    },
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#2a3038' });
      const lanes = [
        { name: '얼음판', mu: 0.05, c: 'rgba(170,205,225,0.4)' },
        { name: '나무 마루', mu: 0.2, c: 'rgba(170,125,80,0.45)' },
        { name: '잔디밭', mu: 0.5, c: 'rgba(100,140,90,0.45)' },
      ];
      const X0 = 160;
      const lh = sim.H / 3;
      const speed: Param = { id: 'v', label: '미는 속력', unit: 'm/s', min: 1, max: 10, step: 0.5, value: 4 };
      lanes.forEach((l, i) => {
        sim.zone({ kind: 'drag', x: 0, y: i * lh, w: sim.W, h: lh, mu: l.mu, color: l.c, label: `${l.name} μ = ${l.mu.toFixed(2)}`, removable: false });
        if (i) sim.wall(sim.W / 2, i * lh, sim.W, 6, { color: '#2a3038', stroke: '#3d444e' });
      });
      const stone = (y: number) => sim.ball(X0, y, 26, 'stone', { face: true, color: '#8c8780', stroke: '#2a2826', air: 0 });
      let shots: { b: MBody; lane: number; v: number }[] = [];
      const clearAll = () => { sim.bodies().forEach((b) => { if (!b.isStatic) sim.remove(b); }); shots = []; };
      const place = () => { clearAll(); lanes.forEach((_, i) => stone(i * lh + lh / 2)); };
      const push = () => {
        clearAll();
        shots = lanes.map((_, i) => {
          const b = stone(i * lh + lh / 2);
          Body.setVelocity(b, { x: velFromSI(speed.value), y: 0 });
          return { b, lane: i, v: speed.value };
        });
      };
      const dist = (b: MBody) => toM(b.position.x - X0);
      const stopAt = (v: number, mu: number) => (v * v) / (2 * mu * G_EARTH);
      place();
      return {
        params: [speed],
        predict: {
          question: '나무 마루에서 돌을 3 m/s 와 6 m/s 로 밀면, 빠른 돌은 느린 돌보다 몇 배 멀리 미끄러질까요?',
          options: ['같은 거리', '2배', '4배'],
          start: () => {
            clearAll();
            const cy = lh * 1.5;
            shots = [3, 6].map((v, k) => {
              const b = stone(cy + (k ? 70 : -70));
              Body.setVelocity(b, { x: velFromSI(v), y: 0 });
              return { b, lane: 1, v };
            });
          },
          result: () => {
            if (shots.length !== 2 || shots.some((s) => s.b.speed > 0 || !sim.world.bodies.includes(s.b))) return undefined;
            const [d1, d2] = shots.map((s) => dist(s.b));
            const ratio = d2 / d1;
            const opts = [1, 2, 4];
            const pick = opts.reduce((bi, o, i) => (Math.abs(Math.log(ratio / o)) < Math.abs(Math.log(ratio / opts[bi])) ? i : bi), 0);
            return { pick, detail: `3 m/s → ${d1.toFixed(2)} m · 6 m/s → ${d2.toFixed(2)} m · ${ratio.toFixed(2)}배 (이론 ${stopAt(3, 0.2).toFixed(2)} m, ${stopAt(6, 0.2).toFixed(2)} m)` };
          },
          explain: '마찰력이 하는 일만큼 운동에너지가 없어져요: μmg·d = ½mv². 그래서 d = v²/(2μg), 멈추는 거리는 속력의 제곱에 비례해요. 속력이 두 배면 4배 멀리 가요. 자동차 제동 거리도 같은 원리라서 속도를 조금만 올려도 제동 거리는 훨씬 길어져요.',
        },
        actions: [
          { label: '세 돌 밀기', icon: '🚀', primary: true, run: push },
          { label: '돌 다시 놓기', icon: '🔄', run: place },
        ],
        hud: () => {
          if (!shots.length) return `미는 속력 ${speed.value} m/s · 이론 거리 ${lanes.map((l) => `${l.name} ${stopAt(speed.value, l.mu).toFixed(1)} m`).join(' · ')}`;
          return shots.map((s) => `${lanes[s.lane].name} ${s.v} m/s → ${dist(s.b).toFixed(2)} m${s.b.speed > 0 ? '' : ' 멈춤'}`).join(' · ');
        },
        back: (ctx) => {
          lanes.forEach((l, i) => {
            const cx = 1300, cy = i * lh + lh / 2;
            const gap = isLight() ? '#f2f0ea' : '#1a1c20';
            for (const [r, c] of [[110, isLight() ? '#6683aa' : '#2f4a6e'], [80, gap], [50, isLight() ? '#b25661' : '#6e2a32'], [20, gap]] as const) {
              ctx.fillStyle = c; ctx.globalAlpha = 0.85;
              ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = ink(0.2); ctx.lineWidth = 1; ctx.setLineDash([5, 7]);
            ctx.beginPath(); ctx.moveTo(X0, i * lh + 20); ctx.lineTo(X0, (i + 1) * lh - 20); ctx.stroke();
            // 이론상 멈추는 곳
            const x = X0 + stopAt(speed.value, l.mu) * PX_PER_M;
            if (x < sim.W - 30) {
              ctx.strokeStyle = brass(0.6); ctx.setLineDash([5, 6]);
              ctx.beginPath(); ctx.moveTo(x, i * lh + 40); ctx.lineTo(x, (i + 1) * lh - 40); ctx.stroke();
              label(ctx, `${stopAt(speed.value, l.mu).toFixed(1)} m`, x, (i + 1) * lh - 26, gold(0.85), 18);
            }
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
    title: '부력과 밀도',
    emoji: '🛁',
    cat: 'fluid',
    blurb: '물통에 여러 재료를 넣어 봐요. 나무는 뜨고 쇠는 가라앉아요. 얼음은 얼마나 잠길까요?',
    theme: 'lab',
    tools: ['box', 'ball', 'tri', 'plank', 'hand', 'water', 'blast', 'erase'],
    tool: 'box',
    mat: 'wood',
    tips: ['아래에서 재료를 바꿔가며 물에 넣어보세요', '얼음은 얼마나 잠길까요?', '나무 판자 위에 쇠공을 올리면?'],
    why: '물은 물체가 밀어낸 물의 무게만큼 위로 밀어 올려요(부력). 밀도가 물보다 작은 나무와 얼음은 일부만 잠긴 채 떠요. 밀도가 큰 쇠와 돌은 무게가 부력보다 커서 가라앉아요.',
    deep: {
      law: ['아르키메데스 원리: 부력 F = ρ물·V잠김·g', '뜨는 조건: 물체 밀도 < 물 밀도(1000 kg/m³)', '떠 있을 때 잠긴 비율 = ρ물체 / ρ물 (얼음 0.9 → 90 % 잠겨요)'],
      assume: ['재료 밀도: 나무 600, 얼음 900, 돌 2800, 쇠 6500 kg/m³', '물속에서는 움직임을 늦추는 저항이 더해져요'],
      limit: ['물을 움직이지 않는 영역으로 계산해서 물결과 출렁임이 없어요', '2D라 잠긴 부피 대신 잠긴 넓이로 계산해요'],
    },
    build(sim) {
      sim.bounds({ ceiling: true });
      const glass = { color: 'rgba(170,205,225,0.35)', stroke: 'rgba(220,238,246,0.6)' };
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
          label(ctx, '밀도 < 1000 kg/m³ 이면 뜨고, 크면 가라앉아요', 800, 360, ink(0.5), 20);
        },
      };
    },
  },
  {
    id: 'pour',
    title: '물의 흐름과 부력',
    emoji: '💧',
    cat: 'fluid',
    blurb: '물을 부어 물레방아를 돌리고 나무배를 띄워요. 배에 상자를 몇 개까지 실을 수 있을까요?',
    theme: 'sky',
    tools: ['drop', 'ball', 'box', 'hand', 'wall', 'erase', 'blast'],
    tool: 'drop',
    tips: ['깔때기 위를 누르고 있으면 물이 쏟아져요', '나무배에 상자를 실어보세요. 몇 개까지 버틸까요?', '벽 긋기로 물길을 만들어 보세요'],
    why: '물은 정해진 모양이 없어서 그릇 모양대로 흘러가요. 흐르는 물이 물레방아 날개를 밀면 바퀴가 돌아요. 배는 밀어낸 물의 무게만큼 떠받쳐져요.',
    deep: {
      law: ['흐르는 물이 날개에 부딪히며 운동량을 넘겨줘 돌림힘이 생겨요', '배가 받는 부력 = 밀어낸 물의 무게', '짐이 무거워질수록 배가 더 깊이 잠겨 더 많은 물을 밀어내요'],
      assume: ['물을 작은 입자 수백 개로 나타내요', '배는 물 입자들이 직접 부딪히며 떠받쳐요(부력 식을 따로 쓰지 않아요)'],
      limit: ['입자 수가 적어 실제 물보다 거칠고, 점성과 표면 장력은 없어요', '입자 사이에 틈이 있어 물의 밀도와 압력이 정확하지 않아요'],
    },
    build(sim) {
      sim.bounds();
      sim.line(250, 230, 375, 370, 14, { color: '#454850', stroke: '#6d7179' });
      sim.line(555, 230, 435, 370, 14, { color: '#454850', stroke: '#6d7179' });
      // 물레방아
      const cx = 405, cy = 560;
      const parts = [0, 1, 2, 3].map((k) => Bodies.rectangle(cx, cy, 230, 14, { angle: (k * Math.PI) / 4, chamfer: { radius: 5 } }));
      const wheel = sim.compound(parts, 'wood', { color: '#b8995a', stroke: '#5e4b28' });
      sim.link({ point: { x: cx, y: cy } }, { body: wheel, point: { x: cx, y: cy } }, 'rope', { stiffness: 1, length: 0 });
      sim.wall(620, 760, 16, 200, { color: '#454850', stroke: '#6d7179' });
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
      ], 'wood', { color: '#7a4f2c', stroke: '#3f2814' });
      void boat;
      return {
        actions: [{ label: '물 비우기', icon: '🫗', run: () => [...sim.drops].forEach((b) => sim.remove(b)) }],
        hud: () => `물방울 ${sim.drops.length}개`,
      };
    },
  },
  {
    id: 'wind',
    title: '풍동',
    emoji: '🌬️',
    cat: 'fluid',
    blurb: '선풍기 바람에 어떤 물체가 밀려날까요? 바람을 이용해 바구니에 넣어 보세요.',
    theme: 'sky',
    tools: ['ball', 'box', 'wind', 'hand', 'blast', 'erase'],
    tool: 'ball',
    mat: 'feather',
    tips: ['깃털 공을 선풍기 위에 떨어뜨려 보세요', '쇠공은 바람에 날아갈까요?', '바람 도구로 끌어서 새 바람길을 만들어요'],
    why: '바람은 움직이는 공기예요. 공기가 물체에 부딪히며 밀어요. 넓고 가벼운 물체일수록 잘 밀려나고, 작고 무거운 물체는 거의 움직이지 않아요.',
    deep: {
      law: ['바람이 미는 힘은 바람을 맞는 넓이에 비례해요', '가속도 a = F/m → 넓이에 비해 가벼운 물체일수록 많이 밀려요'],
      assume: ['바람 구역 안에서는 넓이에 비례하는 일정한 힘을 줘요'],
      limit: ['실제 바람의 힘은 ½ρC·A·v² 처럼 상대 속도의 제곱에 비례하고, 물체가 바람만큼 빨라지면 더 밀지 않아요', '소용돌이와 난류는 없고, 세기는 SI 단위가 아니에요'],
    },
    build(sim) {
      sim.bounds({ ceiling: true });
      sim.zone({ kind: 'wind', x: 100, y: 120, w: 260, h: FLOOR - 120, dir: { x: 0, y: -1 }, strength: 2.6, removable: false });
      sim.zone({ kind: 'wind', x: 360, y: 120, w: 760, h: 260, dir: { x: 1, y: 0 }, strength: 2, removable: false });
      const cup = { color: '#8a6c3c', stroke: '#4f3d20' };
      sim.line(1330, 150, 1345, 300, 14, cup);
      sim.line(1345, 300, 1505, 300, 14, cup);
      sim.line(1505, 300, 1520, 150, 14, cup);
      sim.goal(1425, 260, 140, 50, 'basket');
      const pal = ['#c9a39c', '#cdb48c', '#a9bfa4', '#9fbcc6', '#aaa3c2'];
      for (let i = 0; i < 5; i++) sim.ball(500 + i * 90, FLOOR - 30, 20, 'feather', { face: true, color: pal[i], stroke: '#555' });
      sim.ball(1000, FLOOR - 30, 22, 'wood', { face: true });
      sim.ball(1100, FLOOR - 30, 22, 'metal', { face: true });
      let n = 0;
      return {
        onGoal: (b) => {
          const d = D(b);
          if (!d || d.scored) return;
          d.scored = true; n++;
          sim.confetti(1425, 260);
          sim.text(1425, 120, `${n}`);
        },
        hud: () => `바구니: ${n}`,
        back: (ctx, _s, t) => {
          // 선풍기
          const fx = 230, fy = FLOOR - 10;
          ctx.fillStyle = '#2a2c31';
          ctx.fillRect(fx - 90, fy - 24, 180, 24);
          ctx.save();
          ctx.translate(fx, fy - 30);
          ctx.scale(1, 0.25);
          ctx.rotate(t / 60);
          ctx.fillStyle = 'rgba(184,153,90,0.7)';
          for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(55, 0, 55, 18, 0, 0, 7); ctx.fill(); }
          ctx.restore();
          label(ctx, '목표', 1425, 110, gold(0.85), 22);
        },
      };
    },
  },

  // ───────────────────────────── 전기와 자석 ─────────────────────────────
  {
    id: 'charges',
    title: '쿨롱 힘',
    emoji: '⚡',
    cat: 'em',
    blurb: '+ 구슬과 − 구슬을 놓아 봐요. 부호가 다르면 당기고, 같으면 밀어내요.',
    theme: 'night',
    tools: ['plus', 'minus', 'hand', 'pin', 'blast', 'erase'],
    tool: 'plus',
    gravity: { x: 0, y: 0 },
    field: true,
    tips: ['+ 와 − 구슬을 여기저기 놓아보세요', '주황 화살표는 + 구슬이 밀려가는 방향이에요', '고정한 구슬 옆으로 반대 부호 구슬을 던지면 궤도를 돌아요(만유인력과 같은 1/r² 법칙)'],
    why: '전기에는 +와 − 두 종류가 있어요. 서로 다르면 끌어당기고, 같으면 밀어내요. 문지른 풍선에 머리카락이 달라붙는 것도 이 힘 때문이에요.',
    deep: {
      law: ['쿨롱 법칙 F = k·q₁q₂ / r² (k = 8.99×10⁹ N·m²/C²)', '거리가 두 배가 되면 힘은 1/4', '옆으로 던진 구슬은 만유인력처럼 궤도를 돌 수 있어요(같은 1/r² 법칙)'],
      assume: ['구슬 하나의 전하 60 μC, 질량 약 1 kg', '구슬은 고르게 대전된 공이라 바깥에서는 점전하처럼 작용하고, 닿으면 더 가까워지지 않아요'],
      limit: ['실제로 1 kg 물체에 60 μC 를 모으면 주변 공기가 방전돼요', '움직이는 전하가 만드는 자기장과 전자기파는 무시해요'],
    },
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#1c1e28' });
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
    title: '막대자석과 자기력',
    emoji: '🧲',
    cat: 'em',
    blurb: '막대자석과 쇠구슬로 자기력을 살펴봐요. 극을 돌려 가며 붙고 밀어내는 모습을 비교해요.',
    theme: 'lab',
    tools: ['magnet', 'ball', 'box', 'hand', 'pin', 'erase'],
    tool: 'magnet',
    mat: 'metal',
    gravity: { x: 0, y: 0 },
    air: 5,
    field: true,
    tips: ['자석 끝을 잡고 돌려서 N극끼리 마주 보게 해보세요', '공 도구로 쇠구슬을 더 뿌려보세요', '나무 상자는 자석에 붙을까요?'],
    why: '자석에는 N극과 S극이 있어요. 다른 극끼리는 끌어당기고, 같은 극끼리는 밀어내요. 쇠는 자석 가까이 가면 잠깐 자석처럼 변해서(자기 유도) 달라붙어요. 나무나 고무는 그렇지 않아요.',
    deep: {
      law: ['같은 극은 밀고 다른 극은 당겨요', '자석 사이의 힘은 거리가 멀어질수록 빠르게 약해져요', '쇠(강자성체)는 자기장 안에서 자화되어 늘 끌려가요'],
      assume: ['막대자석을 양 끝의 N, S 두 점(자극)으로 보고 거리 제곱에 반비례하는 힘을 줬어요', '쇠구슬이 받는 힘은 단순한 끌림 모델이에요'],
      limit: ['실제 두 막대자석 사이의 힘은 멀리서 거리의 네제곱에 반비례할 만큼 빨리 약해져요', '힘의 세기는 SI 단위가 아니라 화면에 맞춰 정한 값이에요'],
    },
    build(sim) {
      sim.bounds({ ceiling: true, floor: sim.H, color: '#2a2925' });
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
    title: '자기장 속 원운동',
    emoji: '🌀',
    cat: 'em',
    blurb: '자기장 속으로 전하를 띤 구슬을 쏘면 원을 그려요. 속력과 자기장에 따라 반지름이 어떻게 바뀔까요?',
    theme: 'space',
    tools: ['plus', 'minus', 'field', 'hand', 'pin', 'erase'],
    tool: 'plus',
    gravity: { x: 0, y: 0 },
    air: 0,
    trails: true,
    tips: ['“구슬 쏘기”를 누르면 점선(r = mv/qB)을 따라 돌아요', '속력과 자기장 B 를 바꿔 원의 크기가 어떻게 변하는지 보세요', '“예측하고 실험하기”로 속력을 두 배로 할 때 반지름을 맞혀보세요'],
    why: '자기장은 그 속을 움직이는 전하를 운동 방향의 옆으로 밀어요. 계속 옆으로 밀리니까 원을 그리게 돼요. 태양에서 날아온 전하 입자가 지구 자기장을 따라 휘어 들어와 빛나는 것이 오로라예요.',
    deep: {
      law: ['로런츠 힘 F = qvB (속도에 수직)', '원운동: qvB = mv²/r → r = mv/qB', '주기 T = 2πm/qB — 속력과 상관없어요'],
      assume: ['구슬 전하 60 μC, 질량 약 1 kg, 자기장 B ≈ 8.6×10⁴ T', '자기력은 일을 하지 않아 속력이 그대로예요'],
      limit: ['실제 자석은 수 T 정도라 이렇게 무거운 구슬은 거의 휘지 않아요. 전자·양성자처럼 가벼운 입자에서 일어나는 일을 크게 키워 보여 줘요', '구슬끼리 전기력도 작용해서 원이 조금 어긋날 수 있어요'],
    },
    build(sim) {
      const zl = sim.zone({ kind: 'magnetic', x: 160, y: 80, w: 640, h: 740, strength: B_DEMO, removable: false });
      const zr = sim.zone({ kind: 'magnetic', x: 800, y: 80, w: 640, h: 740, strength: -B_DEMO, removable: false });
      const field: Param = {
        id: 'B', label: '자기장 B', unit: '×10⁴ T', min: 2, max: 12, step: 0.2, value: B_DEMO / 1e4,
        onChange: (v) => { zl.strength = v * 1e4; zr.strength = -v * 1e4; },
      };
      const speed: Param = { id: 'v', label: '쏘는 속력', unit: 'm/s', min: 1, max: 6, step: 0.1, value: 4.2 };
      /** 전기 구슬 하나의 질량 (kg) — sim.charge 와 같은 크기·밀도 */
      const m = Bodies.circle(0, 0, 18, { density: 0.0012 }).mass;
      /** r = mv / qB (m) */
      const radius = (v: number) => (m * v) / (Q_UNIT * field.value * 1e4);
      const period = () => (2 * Math.PI * m) / (Q_UNIT * field.value * 1e4);
      const SHOTS = [{ x: 480, y: 600, q: 1 }, { x: 1120, y: 600, q: -1 }];
      const fire = (x: number, y: number, q: number, v: number) => {
        const b = sim.charge(x, y, q, { air: 0 });
        Body.setVelocity(b, { x: 0, y: -velFromSI(v) });
        return b;
      };
      const shoot = () => SHOTS.forEach((p) => fire(p.x, p.y, p.q, speed.value));
      shoot();

      // 예측 실험: 같은 자리에서 v, 2v 로 차례로 한 바퀴씩 (동시에 쏘면 구슬끼리 밀어내서 차례로)
      const P0 = { x: 700, y: 560 }, V1 = 2;
      let run: { phase: number; t0: number; b?: MBody; maxD: number; d: number[] } | undefined;
      const launchPhase = () => {
        run!.b = fire(P0.x, P0.y, 1, V1 * (run!.phase + 1));
        run!.t0 = sim.time;
        run!.maxD = 0;
      };
      return {
        params: [speed, field],
        predict: {
          question: '같은 자기장에서 전기 구슬을 두 배 빠르게 쏘면, 그리는 원의 반지름은 어떻게 될까요?',
          options: ['그대로', '2배', '4배'],
          start: () => {
            sim.bodies().forEach((b) => { if (D(b)?.kind === 'charge') sim.remove(b); });
            field.value = B_DEMO / 1e4;
            field.onChange!(field.value);
            run = { phase: 0, t0: 0, maxD: 0, d: [] };
            launchPhase();
          },
          result: () => {
            if (!run || run.d.length < 2) return undefined;
            const [r1, r2] = run.d.map((d) => d / 2);
            const ratio = r2 / r1;
            const opts = [1, 2, 4];
            const pick = opts.reduce((best, o, i) => (Math.abs(Math.log(o / ratio)) < Math.abs(Math.log(opts[best] / ratio)) ? i : best), 0);
            return { pick, detail: `${V1} m/s → 반지름 ${r1.toFixed(2)} m · ${V1 * 2} m/s → ${r2.toFixed(2)} m · ${ratio.toFixed(2)}배 (이론 r = mv/qB = ${radius(V1).toFixed(2)} m, ${radius(V1 * 2).toFixed(2)} m)` };
          },
          explain: '자기력 qvB 가 원운동에 필요한 구심력 mv²/r 이 돼요. qvB = mv²/r 을 풀면 r = mv/qB, 그래서 속력이 두 배면 반지름도 두 배예요. 한 바퀴 도는 시간 T = 2πm/qB 에는 v 가 없어서 빠른 구슬도 같은 시간에 한 바퀴를 돌아요. 이 성질로 입자를 가속하는 장치가 사이클로트론이에요.',
        },
        actions: [{ label: '구슬 쏘기', icon: '🚀', primary: true, run: shoot }],
        tick: () => {
          if (!run || !run.b || run.d.length >= 2) return;
          const b = run.b;
          run.maxD = Math.max(run.maxD, toM(Math.hypot(b.position.x - P0.x, b.position.y - P0.y)));
          if (sim.time - run.t0 >= period() * 1000) {
            run.d.push(run.maxD);
            sim.remove(b);
            run.phase++;
            if (run.phase < 2) launchPhase();
          }
        },
        hud: () => `B ${field.value.toFixed(1)}×10⁴ T · v ${speed.value.toFixed(1)} m/s → r = mv/qB = ${radius(speed.value).toFixed(2)} m · 한 바퀴 ${period().toFixed(2)} s`,
        back: (ctx) => {
          label(ctx, '⊙ 왼쪽으로 휘는 자기장', 480, 120, 'rgba(205,194,236,0.95)', 21, 'rgba(14,13,22,0.92)');
          label(ctx, '⊗ 오른쪽으로 휘는 자기장', 1120, 120, 'rgba(232,208,155,0.95)', 21, 'rgba(18,15,10,0.92)');
          // 예상 궤도: 위로 쏜 구슬은 qB > 0 이면 왼쪽으로 돌아요 (두 구슬 모두 qB > 0)
          const r = radius(speed.value) * PX_PER_M;
          ctx.strokeStyle = brass(0.45);
          ctx.lineWidth = 1.25;
          ctx.setLineDash([5, 7]);
          for (const p of SHOTS) { ctx.beginPath(); ctx.arc(p.x - r, p.y, r, 0, Math.PI * 2); ctx.stroke(); }
          ctx.setLineDash([]);
          for (const p of SHOTS) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
          }
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
    blurb: '한쪽 공을 들어 부딪치면 반대쪽 끝 공만 튀어나가요. 두 개를 들면 어떻게 될까요?',
    theme: 'lab',
    tools: ['hand', 'erase'],
    tool: 'hand',
    air: 0,
    tips: ['공 하나를 잡아 옆으로 당겼다 놓아보세요', '두 개를 들어 올리면 몇 개가 튀어나갈까요? 운동량과 에너지로 설명해 보세요', '아래 버튼으로 정확하게 들어 올릴 수 있어요'],
    why: '공이 부딪칠 때 운동량과 운동에너지가 모두 보존돼요. 질량이 같은 공이 정면으로 탄성 충돌하면 두 공의 속도가 서로 바뀌어서, 부딪친 공은 멈추고 옆 공이 그 속도를 이어받아요. 이 일이 줄줄이 일어나 맨 끝 공만 튀어나가요. 두 개를 부딪치면 두 개가 나가야 운동량과 에너지를 함께 맞출 수 있어요.',
    deep: {
      law: ['운동량 보존 Σmv = 일정', '탄성 충돌: 운동에너지도 보존 Σ½mv² = 일정', '같은 질량의 정면 탄성 충돌 → 두 공의 속도가 서로 바뀜'],
      assume: ['반발 계수 1(완전 탄성), 공기 저항과 마찰 없음', '줄은 늘어나지 않아요'],
      limit: ['실제 요람은 충돌이 조금 비탄성이라 점점 멈추고, 가운데 공들도 살짝 흔들려요', '엔진은 충돌을 한 쌍씩 차례로 풀어서 실제(동시에 눌리는 충격파)와 과정이 달라요'],
    },
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
        sim.link({ point: { x: ax, y: top } }, { body: b, point: { x: ax, y: top + L } }, 'rope', { stiffness: 1, color: '#c9c3b6' });
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
          ctx.strokeStyle = '#a88a52'; ctx.lineWidth = 7; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0 - 160, FLOOR); ctx.lineTo(x0 - 160, top); ctx.lineTo(x0 + (n - 1) * r * 1.98 + 160, top); ctx.lineTo(x0 + (n - 1) * r * 1.98 + 160, FLOOR);
          ctx.stroke();
          ctx.fillStyle = '#1c1d21';
          ctx.fillRect(x0 - 260, FLOOR - 10, (n - 1) * r * 1.98 + 520, 30);
        },
      };
    },
  },
  {
    id: 'domino',
    title: '도미노 연쇄',
    emoji: '🁢',
    cat: 'collision',
    blurb: '작은 도미노가 점점 큰 도미노를 쓰러뜨려요. 진자 공으로 첫 도미노를 밀어 보세요.',
    theme: 'sky',
    tools: ['domino', 'ball', 'box', 'plank', 'hand', 'blast', 'erase'],
    tool: 'domino',
    tips: ['“진자 공 놓기”를 눌러 시작해요', '도미노 도구로 나만의 길을 만들어 보세요', '간격이 너무 넓으면 어떻게 될까요?'],
    why: '넘어지는 도미노는 무게중심이 내려가며 위치에너지를 내놓고, 그 에너지로 옆 도미노를 밀어요. 도미노 하나는 자기보다 1.5배쯤 큰 도미노도 쓰러뜨릴 수 있어서, 점점 큰 것까지 쓰러뜨릴 수 있어요.',
    deep: {
      law: ['위치에너지 mgh → 운동에너지 → 다음 도미노를 미는 일', '세운 도미노는 무게중심이 받침면을 벗어나면 넘어져요', '조건이 맞으면 약 1.5배 큰 도미노까지 넘어뜨릴 수 있어요'],
      assume: ['도미노는 나무 재질의 단단한 직사각형이에요', '바닥과 도미노 사이 마찰은 물리 엔진의 근사 모델이에요'],
      limit: ['엔진 마찰이 단순해서 미끄러짐이 실제와 조금 달라요', '간격과 크기에 따라 결과가 민감하게 바뀌어요'],
    },
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
        sim.link({ point: anchor }, { body: ball, point: { ...ball.position } }, 'rope', { stiffness: 1, color: '#c9c3b6' });
        dominos = [];
        let x = 300, h = 56;
        const colors = ['#1c1d21', '#6e2a32', '#2f4a6e', '#2f5a48', '#8a6c3c'];
        for (let i = 0; x < 1400; i++) {
          const w = Math.max(10, h * 0.2);
          dominos.push(sim.box(x, FLOOR - h / 2, w, h, 'wood', { color: colors[i % 5], stroke: '#000', deco: 'domino', density: 0.002, friction: 0.3, frictionStatic: 0.1, label: 'domino' }));
          x += h * 0.55 + 4;
          h *= 1.05;
        }
      };
      setup();
      return {
        actions: [
          { label: '진자 공 놓기', icon: '🎳', primary: true, run: () => { if (ball?.isStatic) release([ball]); else { setup(); release([ball!]); } } },
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
    title: '진자와 구조물 붕괴',
    emoji: '🏗️',
    cat: 'collision',
    blurb: '철거 공으로 상자 탑을 무너뜨려요. 공의 재료와 높이를 바꾸면 결과가 어떻게 달라질까요?',
    theme: 'sky',
    tools: ['box', 'ball', 'plank', 'hand', 'rope', 'blast', 'erase'],
    tool: 'box',
    mat: 'wood',
    tips: ['“철거 공 놓기”를 눌러보세요', '상자로 나만의 탑을 쌓아보세요', '측정 패널(M)로 철거 공의 운동량 p = mv 를 재 보세요'],
    why: '무겁고 빠른 물체일수록 운동량(p = mv)과 운동에너지가 커요. 이런 물체를 멈추려면 큰 충격량이 필요해서, 부딪칠 때 탑을 세게 밀어내요.',
    deep: {
      law: ['운동량 p = mv', '충격량 F·Δt = Δp — 같은 운동량도 짧은 시간에 멈출수록 힘이 커요', '진자 최저점의 속력 v = √(2gh)'],
      assume: ['상자는 나무, 철거 공은 쇠예요', '줄은 늘어나지 않아요'],
      limit: ['상자가 부서지지 않고 통째로 날아가요', '쌓인 상자 사이 마찰은 엔진 근사라 실제보다 쉽게 흔들릴 수 있어요'],
    },
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
        sim.link({ point: anchor }, { body: ball, point: { ...ball.position } }, 'rope', { stiffness: 1, color: '#c9c3b6' });
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
          { label: '철거 공 놓기', icon: '⛓️', primary: true, run: () => { if (ball?.isStatic) release([ball]); else { setup(); release([ball!]); } } },
          { label: '다시 쌓기', icon: '🔄', run: setup },
        ],
        hud: () => {
          const fell = boxes.filter((b, i) => b.position.y - starts[i].y > 30 || Math.abs(b.position.x - starts[i].x) > 40).length;
          return `무너진 상자: ${fell} / ${boxes.length}`;
        },
        back: (ctx) => {
          ctx.fillStyle = '#a88a52';
          ctx.fillRect(anchor.x - 80, 0, 160, 8);
        },
      };
    },
  },
  {
    id: 'billiards',
    title: '2차원 탄성 충돌',
    emoji: '🎱',
    cat: 'collision',
    blurb: '흰 공으로 다른 공을 맞혀요. 부딪친 뒤 두 공이 어느 방향으로 갈라지는지 봐요.',
    theme: 'table',
    tools: ['cue', 'hand', 'ball', 'blast', 'erase'],
    tool: 'cue',
    mat: 'stone',
    gravity: { x: 0, y: 0 },
    tips: ['아무 곳이나 누르고 뒤로 당겼다 놓으면 흰 공을 쳐요', '정면으로 맞히면 흰 공이 멈추고 맞은 공이 달려가요', '구멍에 공을 모두 넣어보세요'],
    why: '부딪칠 때 흰 공의 운동량이 다른 공으로 옮겨 가요. 정면으로 맞으면 흰 공은 거의 멈추고, 비스듬히 맞으면 두 공이 거의 직각으로 갈라져요.',
    deep: {
      law: ['운동량 보존(벡터): m·v₁ = m·v₁′ + m·v₂′', '같은 질량의 탄성 충돌에서 정지한 공을 비스듬히 치면 두 공이 90° 로 갈라져요', '공끼리 반발 계수 e = 0.95'],
      assume: ['위에서 내려다본 원판으로, 회전(스핀)은 없어요', '천 위 구름 저항은 속도에 비례하는 작은 감속으로 근사해요'],
      limit: ['실제 당구는 공의 회전과 미끄러짐이 결과를 크게 바꿔요'],
    },
    build(sim) {
      const rail = { color: '#3a2618', stroke: '#1e130b', restitution: 0.8, friction: 0.05, frictionStatic: 0 };
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
      const colors = ['#c9a24e', '#2f4f86', '#9b3038', '#4b3a7a', '#b0602e', '#2f6b4b', '#6e1f28', '#141518', '#c9a24e', '#2f4f86', '#9b3038', '#4b3a7a', '#b0602e', '#2f6b4b', '#6e1f28'];
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
        cue = sim.ball(p.x, p.y, R, 'stone', { ...opts, color: '#efe9dc', stroke: '#8a8478', face: true });
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
            sim.text(p.x, p.y, '흰 공 낙구');
          } else {
            potted++;
            sim.confetti(p.x, p.y);
            sim.text(p.x, p.y + (p.y < 450 ? 60 : -60), potted === 15 ? '15 / 15' : `${potted}`);
          }
        },
        tick: () => { if (!cue && respawnAt && sim.steps >= respawnAt) { respawnAt = 0; placeCue(); } },
        hud: () => `넣은 공: ${potted} / 15`,
        actions: [{ label: '다시 놓기', icon: '🔺', run: rack }],
        back: (ctx) => {
          for (const p of pockets) {
            ctx.fillStyle = '#050505';
            ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 7); ctx.fill();
          }
          ctx.strokeStyle = brass(0.22); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(420, 40); ctx.lineTo(420, sim.H - 40); ctx.stroke();
          ctx.beginPath(); ctx.arc(420, 450, 6, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        },
      };
    },
  },

  // ───────────────────────────── 자유 ─────────────────────────────
  {
    id: 'free',
    title: '자유 실험',
    emoji: '🧪',
    cat: 'free',
    blurb: '모든 도구를 쓸 수 있어요. 직접 장치를 만들고 측정 패널로 재 보세요.',
    theme: 'lab',
    tools: ['hand', 'ball', 'box', 'tri', 'plank', 'domino', 'drop', 'plus', 'minus', 'magnet', 'star', 'wall', 'rope', 'spring', 'water', 'wind', 'field', 'gzone', 'blast', 'pin', 'erase'],
    tool: 'ball',
    mat: 'rubber',
    tips: ['막대 줄로 공을 빈 곳에 매달면 그네가 돼요', '용수철로 상자 두 개를 이어보세요', '중력 구역으로 중력이 다른 공간을 만들고 측정 패널(M)로 재 보세요'],
    why: '정답이 정해진 실험은 없어요. 조건을 하나씩 바꿔 보고 결과를 측정해 보세요. 가설을 세우고 확인하는 것, 그게 과학자가 하는 일이에요.',
    deep: {
      law: ['뉴턴 제2법칙 F = ma', '운동량 보존, 에너지 보존', '측정 패널(M 키)로 위치·속도·에너지를 시간 그래프로 확인해요'],
      assume: ['100 px = 1 m, g = 9.81 m/s²', '중력·전기력·자기장 속 원운동·마찰 구역은 SI 식, 자석과 바람은 단순화한 모델이에요'],
      limit: ['2D 강체 시뮬레이션이라 물체가 휘거나 부서지지 않아요', '60 Hz 수치 적분이라 아주 빠른 물체는 얇은 벽을 통과할 수 있어요'],
    },
    build(sim) {
      sim.bounds();
      sim.line(120, 420, 620, 600, 16, { removable: true, color: '#3b3a37', stroke: '#5a554b' });
      sim.ball(180, 360, 26, 'rubber', { face: true });
      for (let i = 0; i < 4; i++) sim.box(1100, FLOOR - 28 - i * 56, 54, 54, 'wood');
      const seat = sim.box(1400, 560, 120, 16, 'wood');
      sim.link({ point: { x: 1350, y: 200 } }, { body: seat, point: { x: 1350, y: 560 } }, 'rope');
      sim.link({ point: { x: 1450, y: 200 } }, { body: seat, point: { x: 1450, y: 560 } }, 'rope');
      sim.ball(1400, 520, 22, 'rubber', { face: true, color: '#5a7fa6', stroke: '#22344d' });
    },
  },
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id);
