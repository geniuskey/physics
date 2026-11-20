export type MatId = 'rubber' | 'wood' | 'metal' | 'ice' | 'balloon' | 'stone' | 'feather';

export interface Material {
  id: MatId;
  name: string;
  emoji: string;
  /** 한 줄 성격 소개 (초심자용) */
  blurb: string;
  density: number;
  friction: number;
  frictionStatic: number;
  restitution: number;
  /** 공기 저항 기본값 (frictionAir) */
  air: number;
  color: string;
  stroke: string;
  /** 위로 뜨는 힘 (풍선 속 헬륨처럼) — 밀도 단위 */
  lift?: number;
  magnetic?: boolean;
  /** 부딪힐 때 소리 음높이 */
  pitch: number;
}

export const MATERIALS: Record<MatId, Material> = {
  rubber: {
    id: 'rubber', name: '고무', emoji: '🔴', blurb: '반발 계수 0.8 · 잘 튀어 올라요',
    density: 0.0012, friction: 0.9, frictionStatic: 1.2, restitution: 0.82, air: 0.01,
    color: '#9a4248', stroke: '#561f25', pitch: 520,
  },
  wood: {
    id: 'wood', name: '나무', emoji: '🪵', blurb: '600 kg/m³ · 물보다 가벼워 떠요',
    density: 0.0006, friction: 0.6, frictionStatic: 0.8, restitution: 0.25, air: 0.01,
    color: '#8a5e3b', stroke: '#4a3020', pitch: 300,
  },
  metal: {
    id: 'metal', name: '쇠', emoji: '⚙️', blurb: '6500 kg/m³ · 자석에 끌려요',
    density: 0.0065, friction: 0.35, frictionStatic: 0.5, restitution: 0.12, air: 0.01,
    color: '#9ba0a6', stroke: '#4e5359', magnetic: true, pitch: 900,
  },
  ice: {
    id: 'ice', name: '얼음', emoji: '🧊', blurb: 'μ ≈ 0 · 마찰 없이 미끄러져요',
    density: 0.0009, friction: 0.0, frictionStatic: 0.0, restitution: 0.1, air: 0.005,
    color: '#a9cbdb', stroke: '#5f8ea6', pitch: 1200,
  },
  balloon: {
    id: 'balloon', name: '풍선', emoji: '🎈', blurb: '공기보다 가벼워 떠올라요',
    density: 0.0002, friction: 0.4, frictionStatic: 0.5, restitution: 0.6, air: 0.04,
    color: '#c79f94', stroke: '#7d5a51', lift: 0.0003, pitch: 700,
  },
  stone: {
    id: 'stone', name: '돌', emoji: '🪨', blurb: '2800 kg/m³ · 무겁고 단단해요',
    density: 0.0028, friction: 0.7, frictionStatic: 0.9, restitution: 0.15, air: 0.01,
    color: '#8c8780', stroke: '#4f4b46', pitch: 240,
  },
  feather: {
    id: 'feather', name: '깃털', emoji: '🪶', blurb: '공기 저항을 크게 받아요',
    density: 0.0003, friction: 0.5, frictionStatic: 0.6, restitution: 0.05, air: 0.16,
    color: '#e6ddc9', stroke: '#9a8d72', pitch: 1400,
  },
};

/** 도구 상자에서 고를 수 있는 재료 */
export const PICKABLE: MatId[] = ['rubber', 'wood', 'metal', 'ice', 'stone', 'balloon', 'feather'];
