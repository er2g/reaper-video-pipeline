#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SOURCE_ICON="${ROOT_DIR}/assets/logo-mark.png"
cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f "${SOURCE_ICON}" ]]; then
  echo "Missing source icon: ${SOURCE_ICON}"
  exit 1
fi

convert "${SOURCE_ICON}" -resize 32x32 32x32.png
convert "${SOURCE_ICON}" -resize 128x128 128x128.png
convert "${SOURCE_ICON}" -resize 256x256 "128x128@2x.png"

python3 - <<'PY'
from PIL import Image

base = Image.open("../../../assets/logo-mark.png").convert("RGBA")
base.save("icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
base.resize((512, 512), Image.Resampling.LANCZOS).save("icon.icns", format="ICNS")
print("Generated icon.ico and icon.icns")
PY

echo "Icons generated from assets/logo-mark.png"
