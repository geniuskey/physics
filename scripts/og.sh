#!/bin/sh
# 링크 미리보기 이미지(public/og/<id>.jpg, 1200×630)를 다시 만들어요.
# 실험을 더하거나 제목·소개를 바꾸면 실행하세요. 개발 서버가 떠 있어야 해요 (npm run dev).
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BASE="${BASE:-http://127.0.0.1:4200}"
mkdir -p public/og
ids="home $(node --input-type=module -e "import('vite').then(async (v) => { const s = await v.createServer({ server: { middlewareMode: true }, logLevel: 'silent' }); const m = await s.ssrLoadModule('/src/scenes.ts'); console.log(m.SCENES.map((x) => x.id).join(' ')); await s.close(); })")"
for id in $ids; do
  "$CHROME" --headless=new --hide-scrollbars --window-size=1200,630 --virtual-time-budget=4000 \
    --screenshot="public/og/$id.png" "$BASE/scripts/og.html?id=$id" >/dev/null 2>&1
  # PNG 는 400 KB 가 넘어서 JPEG 로 줄여요 (macOS sips)
  sips -s format jpeg -s formatOptions 85 "public/og/$id.png" --out "public/og/$id.jpg" >/dev/null
  rm "public/og/$id.png"
  echo "public/og/$id.jpg"
done
