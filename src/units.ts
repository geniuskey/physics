/**
 * 화면 단위 ↔ SI 단위
 *
 * 시뮬레이션은 matter-js 단위(px, ms, 한 걸음 = 1000/60 ms)로 돌지만,
 * 모든 힘은 SI 식(F = ma, F = kq₁q₂/r², F = qvB …)으로 계산하고 축척만 아래 상수로 바꿔요.
 *
 * - 길이: 100 px = 1 m (기본 장면 1600×900 px = 16 m × 9 m)
 * - 시간: 1 ms = 1 ms (재생 속도와 상관없이 sim.time 이 실제 물리 시간)
 * - 질량: matter-js 질량 1 = 1 kg.
 *   재료 밀도 × 10⁶ = kg/m³ (물 0.001 → 1000 kg/m³). 2D 시뮬레이션이라 물체를 두께 1 cm 판으로 봐요.
 * - 힘: matter-js 힘 1 (kg·px/ms²) = 10⁴ N
 */

export const PX_PER_M = 100;
/** matter-js 기준 한 걸음 (ms) — Body.getVelocity 는 "px / 한 걸음" 으로 돌려줘요 */
export const BASE_DT = 1000 / 60;

/** 표준 중력 가속도 (m/s²) */
export const G_EARTH = 9.81;
/** 1 m/s² 를 px/ms² 로 */
export const ACC_PER_SI = PX_PER_M / 1e6;
/** 지구 중력 1g (px/ms²) */
export const G_SCALE = G_EARTH * ACC_PER_SI;

/** 행성 표면 중력 (지구 = 1) */
export const PLANET_G = { moon: 1.62 / G_EARTH, mars: 3.71 / G_EARTH, earth: 1, jupiter: 24.79 / G_EARTH };

/** 쿨롱 상수 (N·m²/C²) */
export const K_COULOMB = 8.9875e9;
/** 전기 구슬 하나의 전하 (C). 1 kg 남짓한 구슬이 눈에 보이게 움직이려면 수십 μC 가 필요해요 */
export const Q_UNIT = 60e-6;
/**
 * "자기장" 도구가 만드는 자기장 (T).
 * 1 kg 짜리 구슬(60 μC)이 몇 m 크기의 원을 그리려면 r = mv/qB 에서 수만 T 가 필요해요.
 * 실제 실험실 자석(수 T)으로는 전자·양성자처럼 아주 가벼운 입자만 이렇게 휘어요.
 */
export const B_DEMO = 8.6e4;

export const toM = (px: number) => px / PX_PER_M;
export const toPx = (m: number) => m * PX_PER_M;
/** 속도: px/걸음 → m/s */
export const velToSI = (v: number) => (v * 1000) / BASE_DT / PX_PER_M;
/** 속도: m/s → px/걸음 */
export const velFromSI = (v: number) => (v * PX_PER_M * BASE_DT) / 1000;
/** 힘: matter-js 힘 → N */
export const forceToSI = (f: number) => f * 1e4;
/** 힘: N → matter-js 힘 */
export const forceFromSI = (f: number) => f / 1e4;

/** 쿨롱 힘 계수 (matter-js 힘 · px² / 전하 단위²) — F = K q₁q₂ / r_px² */
export const K_ELECTRIC = K_COULOMB * Q_UNIT * Q_UNIT;
/** 로런츠 힘 계수 — F(matter) = K q · v(px/걸음) · B(T) */
export const K_LORENTZ = forceFromSI(Q_UNIT * velToSI(1));
