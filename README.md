# REAPER Video FX

REAPER içindeki FX chain’i kullanarak videoların sesini işleyen bir Windows uygulaması.

Uygulama:
1) Videodan sesi çıkarır (FFmpeg).
2) Sesi REAPER’a yükler.
3) Seçtiğin track’i (üzerindeki FX’lerle) render alır.
4) Render edilen sesi tekrar videoya gömer.

Bu repo iki parçadan oluşur:
- **Electron uygulaması**: `reaper-video-fx/electron-app`
- **REAPER bridge (native extension)**: `reaper-video-fx/reaper-extension` (REAPER SDK ile)

Alternatif/geri-dönüş olarak Lua bridge de var: `reaper-video-fx/reaper-scripts/video_fx_bridge.lua`.

---

## Kurulum (Windows)

### 1) Uygulama (MSI)

- MSI çıktısı: `reaper-video-fx/electron-app/release/REAPER Video FX 1.0.0.msi`
- İndirip çalıştır: `REAPER Video FX 1.0.0.msi`

> Not: NSIS kurulum da üretilir: `reaper-video-fx/electron-app/release/REAPER Video FX Setup 1.0.0.exe`

### 2) REAPER extension’ı kur

Uygulamanın REAPER ile konuşması için native extension DLL gerekir:

- DLL adı: `reaper_video_fx_bridge.dll`
- Kaynak (repo içi): `reaper-video-fx/reaper-extension/dist/reaper_video_fx_bridge.dll`

REAPER’ın plugin dizinlerinden birine kopyala (genelde en doğrusu):
- `%APPDATA%\\REAPER\\UserPlugins\\reaper_video_fx_bridge.dll`

Alternatif dizinler (REAPER kurulumuna göre):
- `%APPDATA%\\REAPER\\Plugins\\`
- `%LOCALAPPDATA%\\REAPER\\UserPlugins\\`

Sonra REAPER’ı kapat/aç.

**Extension yüklendi mi kontrol:**
- REAPER açıldıktan sonra `Extensions` menüsünde eklentiye ait bir menü görmeyebilirsin (bu extension arka planda “timer” ile çalışır).
- En hızlı kontrol: `npm run ping:reaper` (aşağıda).

### 3) REAPER tarafını hazırla

1) REAPER’ı aç.
2) Bir track oluştur, istediğin FX chain’i o track’e ekle.
3) Uygulamayı aç, listeden track’i seç.

---

## Kullanım

1) REAPER açık kalsın.
2) REAPER Video FX’i aç.
3) Video seç.
4) FX uygulanacak track’i seç.
5) “Process” başlat.

Çıktı video, giriş dosyanın yanına `*_processed.mp4` olarak kaydedilir.

---

## Geliştirme (Repo’dan çalıştırma)

### Prerequisite

- Windows 10/11
- REAPER (test edildi: 7.49)
- Node.js (repo/lockfile ile uyumlu)
- FFmpeg (uygulama `fluent-ffmpeg` kullanıyor; sistemde ffmpeg erişilebilir olmalı)

### Electron dev

```powershell
cd reaper-video-fx/electron-app
npm ci
npm run dev
```

### REAPER bridge (native extension) build

Visual Studio 2022 Build Tools / MSVC ve CMake gerekir.

```powershell
cd reaper-video-fx/reaper-extension
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

Çıktı: `reaper-video-fx/reaper-extension/dist/reaper_video_fx_bridge.dll`

> Uyumluluk notu: SDK header’ları yeni REAPER sürümü ile üretildiği için extension “minimal API load” ile derlenir; bu sayede daha eski REAPER sürümlerinde de açılışta takılmaz.

---

## Paketleme (Installer)

```powershell
cd reaper-video-fx/electron-app
npm ci
npm run dist
```

`npm run dist` otomatik olarak `build/icon.ico` üretir (MSI için gerekli).

Çıktılar:
- `reaper-video-fx/electron-app/release/REAPER Video FX 1.0.0.msi`
- `reaper-video-fx/electron-app/release/REAPER Video FX Setup 1.0.0.exe`
- `reaper-video-fx/electron-app/release/win-unpacked/`

---

## Smoke Test / Hızlı kontrol

REAPER açıkken:

```powershell
cd reaper-video-fx/electron-app
npm run build:main
npm run ping:reaper
```

Beklenen:
- `{"success":true,"message":"pong"}` (native extension aktifse)

---

## Sorun giderme

### Uygulama açılmıyor / hemen kapanıyor

- Sistem ortam değişkenlerinde `ELECTRON_RUN_AS_NODE=1` varsa Electron uygulamaları GUI açmadan çıkabilir. Bu değişkeni kaldırıp tekrar dene.

### “REAPER yanıt vermedi (timeout)”

- REAPER açık mı?
- `reaper_video_fx_bridge.dll` doğru dizinde mi ve REAPER yeniden başlatıldı mı?
- `%TEMP%\\reaper-video-fx` altında `command.json/response.json` oluşuyor mu?

### Render “yanlış yerden” alıyor gibi

Bridge, hedef track dışındaki track’leri geçici olarak mute eder ve time selection üzerinden render alır. Proje render ayarlarını ve time selection davranışını kontrol et.

---

## Klasör yapısı

- `reaper-video-fx/electron-app`: Electron main + renderer (Vite/React)
- `reaper-video-fx/reaper-extension`: REAPER SDK ile native bridge DLL
- `reaper-video-fx/reaper-scripts`: Lua bridge (fallback)
- `reaper-video-fx/reaper-sdk-main`: REAPER SDK snapshot (vendor)
