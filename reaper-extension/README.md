# REAPER Video FX Bridge (Extension)

Bu klasör REAPER extension DLL'ini üretir. Electron uygulamasının kullandığı `%TEMP%\\reaper-video-fx\\command.json` / `response.json` protokolünü REAPER içinde native olarak çalıştırır (Lua script çalıştırma ihtiyacını azaltır).

## Build (Windows)

```powershell
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

Çıktı: `dist/reaper_video_fx_bridge.dll`

## Kurulum

DLL'i REAPER’ın `Plugins` klasörüne kopyalayın (örn. `%APPDATA%\\REAPER\\Plugins` veya portable kurulumun `REAPER\\Plugins` klasörü) ve REAPER’ı yeniden başlatın.

