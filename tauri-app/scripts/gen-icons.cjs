#!/usr/bin/env node
/* Generate Tauri icons from assets/logo-mark.png */

const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const iconsDir = path.join(repoRoot, 'tauri-app', 'src-tauri', 'icons');
const source = path.join(repoRoot, 'assets', 'logo-mark.png');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run(`convert "${source}" -resize 32x32 "${path.join(iconsDir, '32x32.png')}"`);
  run(`convert "${source}" -resize 128x128 "${path.join(iconsDir, '128x128.png')}"`);
  run(`convert "${source}" -resize 256x256 "${path.join(iconsDir, '128x128@2x.png')}"`);
  run(`python3 -c "from PIL import Image; b=Image.open(r'${source}').convert('RGBA'); b.save(r'${path.join(iconsDir, 'icon.ico')}', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]); b.resize((512,512), Image.Resampling.LANCZOS).save(r'${path.join(iconsDir, 'icon.icns')}', format='ICNS')"`); // eslint-disable-line max-len
  console.log('Icons generated successfully.');
} catch (error) {
  console.error('Failed to generate icons. Ensure ImageMagick (convert) and Python Pillow are installed.');
  process.exit(1);
}
