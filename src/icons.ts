/** 선 아이콘 모음 (24×24, 선 굵기 1.75) — 이모지 대신 일관된 UI 아이콘 */
const P: Record<string, string> = {
  // ── 화면 조작 ──
  back: '<path d="M15 18l-6-6 6-6"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 5.5v13a.6.6 0 0 0 .9.5l10.4-6.5a.6.6 0 0 0 0-1L7.9 5a.6.6 0 0 0-.9.5z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  sound: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  more: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  less: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  // ── 도구 ──
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  cue: '<circle cx="7" cy="17" r="4"/><path d="M11 13l10-10"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="1.5"/>',
  tri: '<path d="M12 4l9 16H3z"/>',
  plank: '<rect x="2.5" y="10" width="19" height="4" rx="1"/>',
  domino: '<rect x="8" y="2.5" width="8" height="19" rx="1.5"/><path d="M8 12h8"/><circle cx="12" cy="7" r=".6"/><circle cx="12" cy="17" r=".6"/>',
  drop: '<path d="M12 2.7s7 7.6 7 12.3a7 7 0 0 1-14 0C5 10.3 12 2.7 12 2.7z"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3"/><path d="M6 3h4v9M14 12V3h4M6 7h4M14 7h4"/>',
  star: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  wall: '<path d="M3 21L21 3"/><path d="M3 15l6 6M9 9l6 6M15 3l6 6" opacity=".45"/>',
  rope: '<circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="M7 17L17 7"/>',
  spring: '<path d="M3 12h2l1.5-5 3 10 3-10 3 10 3-10L20 12h1"/>',
  water: '<path d="M2 9c2 0 2-1.5 4-1.5S8 9 10 9s2-1.5 4-1.5S16 9 18 9s2-1.5 4-1.5"/><path d="M2 15c2 0 2-1.5 4-1.5S8 15 10 15s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  field: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
  gzone: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path d="M12 7v10M8 13l4 4 4-4"/>',
  blast: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5"/>',
  pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
  erase: '<path d="M7 21L3 17a1.5 1.5 0 0 1 0-2L14 4a1.5 1.5 0 0 1 2 0l5 5a1.5 1.5 0 0 1 0 2L11 21z"/><path d="M7 21h14M9 10l6 6"/>',
  // ── 주제 ──
  'cat-gravity': '<circle cx="12" cy="6" r="3"/><path d="M12 11v7M8.5 14.5L12 18l3.5-3.5M4 21h16"/>',
  'cat-friction': '<path d="M3 20h18M3 20L21 8"/><path d="M10 12.5l4-2.7 2.2 3.3-4 2.7z"/>',
  'cat-fluid': '<path d="M12 2.7s7 7.6 7 12.3a7 7 0 0 1-14 0C5 10.3 12 2.7 12 2.7z"/>',
  'cat-em': '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  'cat-collision': '<circle cx="9" cy="12" r="5"/><circle cx="18" cy="12" r="4"/><path d="M1.5 9.5h1.5M1.5 14.5h1.5"/>',
  'cat-free': '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
};

export function icon(name: string, size = 20) {
  const body = P[name] ?? P.ball;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
