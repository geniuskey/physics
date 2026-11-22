/**
 * 검색엔진·링크 미리보기용 HTML. 빌드할 때(vite.config.ts) 실험마다 정적 페이지를 만들어
 * 제목·설명·대표 주소(canonical)·og 태그·구조화 데이터와 읽을 수 있는 본문을 넣어요.
 * 본문은 앱이 뜨면 실제 화면으로 바뀌어요. 자바스크립트를 실행하지 않는 검색엔진(네이버 등)도
 * 실험 내용을 읽을 수 있게 하려는 거예요.
 */
import { CATS, SCENES, type Cat, type Scene } from './scenes';
import { scenePath } from './share';
import { Sim } from './sim';

export const SITE = 'https://physics.euiyun.com';
export const SITE_NAME = '물리 실험실';
const HOME_TITLE = '물리 실험실 — 예측하고 측정하는 인터랙티브 물리';
const HOME_DESC =
  '낙하·포물선·마찰·부력·전기력·자기장·충돌을 예측하고, SI 단위로 측정해 이론과 비교하는 중·고등 물리 시뮬레이션. 설치 없이 브라우저에서 바로.';
const LEVEL = ['중학교', '고등학교'];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** <script> 안에 넣어도 태그가 닫히지 않게 */
const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

export const ogImage = (id: string) => `${SITE}/og/${id}.jpg`;

/** 설명문: 소개 다음에 원리 설명을 이어 붙이되 문장 단위로 160자 안쪽에서 끊어요 */
export function sceneDescription(s: Scene, max = 160) {
  let out = s.blurb;
  for (const sentence of s.why.split(/(?<=[.?!요다])\s+/)) {
    if ((out + ' ' + sentence).length > max) break;
    out += ' ' + sentence;
  }
  return out;
}

interface Meta { title: string; description: string; url?: string; image: string; imageAlt: string; type: string; ld: unknown[]; noindex?: boolean }

function head(m: Meta) {
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    m.noindex ? `<meta name="robots" content="noindex" />` : '',
    m.url ? `<link rel="canonical" href="${m.url}" />` : '',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    m.url ? `<meta property="og:url" content="${m.url}" />` : '',
    `<meta property="og:image" content="${m.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...m.ld.map((o) => `<script type="application/ld+json">${json(o)}</script>`),
  ].filter(Boolean).join('\n    ');
}

const website = { '@type': 'WebSite', name: SITE_NAME, url: `${SITE}/`, inLanguage: 'ko' };

export function homeHead(opts: { noindex?: boolean } = {}) {
  return head({
    title: HOME_TITLE,
    description: HOME_DESC,
    url: opts.noindex ? undefined : `${SITE}/`,
    image: ogImage('home'),
    imageAlt: '물리 실험실: 예측하고, 측정하고, 이론으로 확인하는 물리',
    type: 'website',
    noindex: opts.noindex,
    ld: [
      { '@context': 'https://schema.org', ...website, description: HOME_DESC },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: '실험 목록',
        itemListElement: SCENES.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + scenePath(s.id), name: s.title })),
      },
    ],
  });
}

export function sceneHead(s: Scene) {
  const url = SITE + scenePath(s.id);
  const description = sceneDescription(s);
  return head({
    title: `${s.title} — ${SITE_NAME}`,
    description,
    url,
    image: ogImage(s.id),
    imageAlt: `${s.title} 시뮬레이션 화면`,
    type: 'article',
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: s.title,
        description,
        url,
        image: ogImage(s.id),
        inLanguage: 'ko',
        learningResourceType: '인터랙티브 시뮬레이션',
        educationalLevel: LEVEL,
        isAccessibleForFree: true,
        about: { '@type': 'Thing', name: CATS[s.cat].name },
        teaches: s.deep.law,
        isPartOf: website,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: s.title, item: url },
        ],
      },
    ],
  });
}

const list = (items: string[]) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const sceneLink = (s: Scene) => `<li><a href="${scenePath(s.id)}">${esc(s.title)}</a> — ${esc(s.blurb)}</li>`;

function byCategory() {
  return (Object.keys(CATS) as Cat[])
    .map((c) => ({ c, scenes: SCENES.filter((s) => s.cat === c) }))
    .filter((g) => g.scenes.length);
}

const foot = `<footer><p>교육용 2D 시뮬레이션입니다. 중력·마찰·전기력·자기장 속 운동은 SI 단위 식으로 계산하며, 각 실험에 가정과 한계를 밝혀 두었습니다.</p><p>© 2026 <a href="https://euiyun.com">Euiyun Lab</a></p></footer>`;

export function homeBody() {
  return `<main class="pre">
      <p class="pre-brand"><a href="/">${SITE_NAME}</a></p>
      <h1>예측하고, 측정하고, 이론으로 확인하는 물리</h1>
      <p>낙하, 포물선, 마찰, 부력, 전기력, 자기장, 충돌. 조건을 정하고 결과를 먼저 예측한 다음, SI 단위로 측정한 값을 이론식과 나란히 놓고 비교합니다. 설치나 가입 없이 브라우저에서 바로 실행됩니다.</p>
      <h2>실험 목록</h2>
      ${byCategory().map((g) => `<h3>${esc(CATS[g.c].name)}</h3><ul>${g.scenes.map(sceneLink).join('')}</ul>`).join('\n      ')}
      ${foot}
    </main>`;
}

export function sceneBody(s: Scene) {
  // 예측 문제는 장면을 한 번 만들어야 알 수 있어요
  let question = '';
  try {
    const rt = s.build(new Sim(s.W ?? 1600, s.H ?? 900)) ?? {};
    if (rt.predict) question = `<h2>먼저 예측해 보세요</h2><p>${esc(rt.predict.question)}</p>${list(rt.predict.options)}`;
  } catch { /* 예측 문제 없이 만들어요 */ }
  const others = SCENES.filter((o) => o.id !== s.id);
  return `<main class="pre">
      <p class="pre-brand"><a href="/">${SITE_NAME}</a> › ${esc(CATS[s.cat].name)}</p>
      <h1>${esc(s.title)}</h1>
      <p>${esc(s.blurb)}</p>
      ${question}
      <h2>원리</h2><p>${esc(s.why)}</p>
      <h2>핵심 식</h2>${list(s.deep.law)}
      ${s.deep.assume.length ? `<h2>이 시뮬레이션의 가정</h2>${list(s.deep.assume)}` : ''}
      ${s.deep.limit.length ? `<h2>실제와 다른 점</h2>${list(s.deep.limit)}` : ''}
      <h2>해 볼 것</h2>${list(s.tips)}
      <h2>다른 실험</h2><ul>${others.map(sceneLink).join('')}</ul>
      ${foot}
    </main>`;
}

export function sitemap(lastmod: string) {
  const urls = [`${SITE}/`, ...SCENES.map((s) => SITE + scenePath(s.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}

export const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
