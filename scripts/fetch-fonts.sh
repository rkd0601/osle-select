#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../public/fonts"
curl -sSL -o PretendardVariable.woff2 "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"
curl -sSL -o SUIT-Variable.woff2 "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.woff2"
curl -sSL -o NotoSansSC-Variable.woff2 "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/Variable/OTF/Subset/NotoSansSC-VF.otf" || echo "NotoSansSC: woff2 변환은 수동 (pnpm dlx glyphhanger 또는 fonttools subset → woff2)"
echo "done: $(ls)"
