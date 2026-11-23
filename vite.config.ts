import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { SCENES } from './src/scenes';
import { homeBody, homeHead, robots, sceneBody, sceneHead, sitemap } from './src/seo';

const HEAD = '<!--seo:head-->';
const BODY = '<!--seo:body-->';

/**
 * 실험마다 진짜 HTML 페이지(dist/play/<id>/index.html)를 만들어요.
 * 제목·설명·og 태그·구조화 데이터와 읽을 수 있는 본문이 들어 있어서
 * 검색엔진과 링크 미리보기가 실험별로 내용을 알 수 있어요. 앱이 뜨면 본문은 실제 화면으로 바뀌어요.
 */
function prerender(): Plugin {
  let outDir = 'dist';
  const fill = (tpl: string, h: string, b: string) => tpl.replace(HEAD, h).replace(BODY, b);
  return {
    name: 'prerender-seo',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    // 개발 서버에서는 표시만 지워요 (화면은 앱이 그려요)
    transformIndexHtml: { order: 'pre', handler: (html, ctx) => (ctx.server ? fill(html, homeHead(), '') : html) },
    closeBundle() {
      const file = resolve(outDir, 'index.html');
      const tpl = readFileSync(file, 'utf8');
      if (!tpl.includes(HEAD)) return;
      const write = (rel: string, text: string) => {
        const p = resolve(outDir, rel);
        mkdirSync(resolve(p, '..'), { recursive: true });
        writeFileSync(p, text);
      };
      write('index.html', fill(tpl, homeHead(), homeBody()));
      write('404.html', fill(tpl, homeHead({ noindex: true }), homeBody()));
      for (const s of SCENES) write(`play/${s.id}/index.html`, fill(tpl, sceneHead(s), sceneBody(s)));
      write('sitemap.xml', sitemap(new Date().toISOString().slice(0, 10)));
      write('robots.txt', robots);
    },
  };
}

export default defineConfig({
  plugins: [prerender()],
  // tailscale serve(https://macstudio.….ts.net:4200)로 열 때 호스트 이름을 막지 않게
  server: { port: 4200, strictPort: true, allowedHosts: ['.ts.net'] },
});
