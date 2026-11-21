import { describe, expect, it } from 'vitest';
import { SCENES } from '../src/scenes';
import { sceneBody, sceneDescription, sceneHead, sitemap } from '../src/seo';

describe('검색엔진용 페이지', () => {
  it('모든 실험에 미리보기 이미지가 있다 (없으면 scripts/og.sh)', () => {
    const files = Object.keys(import.meta.glob('../public/og/*.jpg'));
    for (const id of ['home', ...SCENES.map((s) => s.id)]) expect(files, id).toContain(`../public/og/${id}.jpg`);
  });
  it('설명은 160자 안쪽이고, 실험마다 제목·canonical·본문이 있다', () => {
    for (const s of SCENES) {
      expect(sceneDescription(s).length, s.id).toBeLessThanOrEqual(160);
      const h = sceneHead(s);
      expect(h).toContain(`<link rel="canonical" href="https://physics.euiyun.com/play/${s.id}/" />`);
      expect(sceneBody(s)).toContain(`<h1>`);
    }
  });
  it('사이트맵에 모든 실험이 있다', () => {
    const xml = sitemap('2026-01-01');
    for (const s of SCENES) expect(xml).toContain(`/play/${s.id}/`);
  });
});
