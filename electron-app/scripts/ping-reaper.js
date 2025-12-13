/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distMain = path.join(__dirname, '..', 'dist', 'main', 'reaper.js');
if (!fs.existsSync(distMain)) {
  console.error('Missing build output: dist/main/reaper.js');
  console.error('Run: npm run build:main');
  process.exit(2);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ReaperBridge } = require(distMain);

async function main() {
  const rb = new ReaperBridge();
  const res = await rb.sendCommand({ command: 'PING' }, 5000);
  console.log(JSON.stringify(res));
}

main().catch((err) => {
  const message = err && err.message ? String(err.message) : String(err);
  if (/timeout/i.test(message)) {
    try {
      const out = execSync('tasklist /NH /FI "IMAGENAME eq reaper.exe"', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString('utf8')
        .trim();
      if (!out || /No tasks/i.test(out) || /INFO:/i.test(out)) {
        console.error('REAPER çalışmıyor gibi görünüyor. Önce REAPER’ı aç ve tekrar dene.');
      } else {
        console.error('REAPER açık ama bridge yanıt vermedi. Extension yüklü mü? (%APPDATA%\\REAPER\\UserPlugins)');
      }
    } catch {
      // ignore
    }
  }

  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
