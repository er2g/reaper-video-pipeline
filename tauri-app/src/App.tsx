import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

interface Track {
  index: number;
  name: string;
}

interface ProgressEvent {
  step: string;
  percent: number;
}

interface ExtensionStatus {
  installed: boolean;
  path: string | null;
  bundled_available: boolean;
}

interface RenderSettings {
  video_codec: string;
  video_bitrate: string;
  audio_codec: string;
  audio_bitrate: string;
  sample_rate: number;
}

const defaultSettings: RenderSettings = {
  video_codec: "copy",
  video_bitrate: "0",
  audio_codec: "aac",
  audio_bitrate: "320k",
  sample_rate: 48000,
};

function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [reaperConnected, setReaperConnected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<RenderSettings>(defaultSettings);

  // Check extension status
  const checkExtension = useCallback(async () => {
    try {
      const status = await invoke<ExtensionStatus>("check_extension_status");
      setExtensionStatus(status);
    } catch (e) {
      console.error("Extension check failed:", e);
    }
  }, []);

  // Check REAPER connection
  const checkReaperConnection = useCallback(async () => {
    try {
      const connected = await invoke<boolean>("ping_reaper");
      setReaperConnected(connected);
      if (connected && tracks.length === 0) {
        loadTracks();
      }
    } catch {
      setReaperConnected(false);
    }
  }, [tracks.length]);

  // Load tracks
  const loadTracks = async () => {
    try {
      const trackList = await invoke<Track[]>("get_tracks");
      setTracks(trackList);
      if (trackList.length > 0 && selectedTrack === null) {
        setSelectedTrack(trackList[0].index);
      }
    } catch (e) {
      console.error("Failed to load tracks:", e);
    }
  };

  // Install extension
  const installExtension = async () => {
    setInstalling(true);
    try {
      await invoke<string>("install_extension");
      await checkExtension();
      setError(null);
    } catch (e) {
      setError(`Extension yuklenemedi: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  // Select video file
  const selectVideo = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "mkv", "avi", "mov", "webm"],
          },
        ],
      });
      if (file) {
        setVideoPath(file);
        setError(null);
        setResult(null);
      }
    } catch (e) {
      console.error("File selection failed:", e);
    }
  };

  // Process video
  const processVideo = async () => {
    if (!videoPath || selectedTrack === null) return;

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ step: "Baslatiliyor...", percent: 0 });

    try {
      const outputPath = await invoke<string>("process_video", {
        videoPath,
        trackIndex: selectedTrack,
        settings,
      });
      setResult(outputPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  // Effects
  useEffect(() => {
    checkExtension();
    checkReaperConnection();
    const interval = setInterval(checkReaperConnection, 5000);
    return () => clearInterval(interval);
  }, [checkExtension, checkReaperConnection]);

  useEffect(() => {
    const unlisten = listen<ProgressEvent>("progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            REAPER Video FX
          </h1>
          <p className="text-slate-400 text-sm">
            Video seslerini REAPER FX zincirinizle isleyin
          </p>
        </header>

        {/* Extension Status Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  extensionStatus?.installed
                    ? "bg-emerald-500/20"
                    : "bg-amber-500/20"
                }`}
              >
                {extensionStatus?.installed ? (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6 text-amber-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-white">REAPER Extension</h3>
                <p
                  className={`text-sm ${
                    extensionStatus?.installed
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {extensionStatus?.installed ? "Kurulu" : "Kurulu Degil"}
                </p>
              </div>
            </div>
            {!extensionStatus?.installed && extensionStatus?.bundled_available && (
              <button
                onClick={installExtension}
                disabled={installing}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-700 rounded-xl font-medium text-white transition-all duration-200 flex items-center gap-2"
              >
                {installing ? (
                  <>
                    <svg
                      className="animate-spin w-4 h-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Kuruluyor...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Tek Tikla Kur
                  </>
                )}
              </button>
            )}
          </div>
          {extensionStatus?.path && (
            <p className="mt-3 text-xs text-slate-500 truncate">
              Konum: {extensionStatus.path}
            </p>
          )}
        </div>

        {/* REAPER Connection Status */}
        <div
          className={`rounded-2xl p-5 border transition-all duration-300 animate-fadeIn ${
            reaperConnected
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-3 h-3 rounded-full ${
                  reaperConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-red-400"
                }`}
              />
              <span
                className={
                  reaperConnected ? "text-emerald-300" : "text-red-300"
                }
              >
                {reaperConnected
                  ? "REAPER Bagli"
                  : "REAPER Bagli Degil - Extension'i yukleyin ve REAPER'i yeniden baslatin"}
              </span>
            </div>
            {reaperConnected && (
              <button
                onClick={loadTracks}
                className="text-sm bg-slate-700/50 hover:bg-slate-600/50 px-4 py-2 rounded-lg transition-colors"
              >
                Yenile
              </button>
            )}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 space-y-6 animate-fadeIn">
          {/* Video Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Video Dosyasi
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={videoPath || ""}
                readOnly
                placeholder="Video secilmedi..."
                className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <button
                onClick={selectVideo}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Sec
              </button>
            </div>
          </div>

          {/* Track Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              REAPER Track
            </label>
            <select
              value={selectedTrack ?? ""}
              onChange={(e) => setSelectedTrack(Number(e.target.value))}
              disabled={!reaperConnected || tracks.length === 0}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tracks.length === 0 ? (
                <option>Track yok</option>
              ) : (
                tracks.map((track) => (
                  <option key={track.index} value={track.index}>
                    {track.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Settings Toggle */}
          <div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${
                  showSettings ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Render Ayarlari
            </button>

            {showSettings && (
              <div className="mt-4 p-4 bg-slate-900/30 rounded-xl border border-slate-700/50 space-y-4 animate-fadeIn">
                {/* Video Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Video Codec
                    </label>
                    <select
                      value={settings.video_codec}
                      onChange={(e) =>
                        setSettings({ ...settings, video_codec: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
                    >
                      <option value="copy">Kopyala (Degistirme)</option>
                      <option value="libx264">H.264</option>
                      <option value="libx265">H.265 (HEVC)</option>
                      <option value="libvpx-vp9">VP9</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Video Bitrate
                    </label>
                    <select
                      value={settings.video_bitrate}
                      onChange={(e) =>
                        setSettings({ ...settings, video_bitrate: e.target.value })
                      }
                      disabled={settings.video_codec === "copy"}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
                    >
                      <option value="0">Otomatik</option>
                      <option value="2M">2 Mbps</option>
                      <option value="5M">5 Mbps</option>
                      <option value="10M">10 Mbps</option>
                      <option value="20M">20 Mbps</option>
                      <option value="50M">50 Mbps</option>
                    </select>
                  </div>
                </div>

                {/* Audio Settings */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Ses Codec
                    </label>
                    <select
                      value={settings.audio_codec}
                      onChange={(e) =>
                        setSettings({ ...settings, audio_codec: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
                    >
                      <option value="aac">AAC</option>
                      <option value="libmp3lame">MP3</option>
                      <option value="flac">FLAC</option>
                      <option value="libopus">Opus</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Ses Bitrate
                    </label>
                    <select
                      value={settings.audio_bitrate}
                      onChange={(e) =>
                        setSettings({ ...settings, audio_bitrate: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
                    >
                      <option value="128k">128 kbps</option>
                      <option value="192k">192 kbps</option>
                      <option value="256k">256 kbps</option>
                      <option value="320k">320 kbps</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Ornekleme Hizi
                    </label>
                    <select
                      value={settings.sample_rate}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sample_rate: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
                    >
                      <option value={44100}>44.1 kHz</option>
                      <option value={48000}>48 kHz</option>
                      <option value={96000}>96 kHz</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Process Button */}
          <button
            onClick={processVideo}
            disabled={
              !videoPath || selectedTrack === null || !reaperConnected || processing
            }
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Isleniyor...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Video'yu Isle
              </>
            )}
          </button>

          {/* Progress Bar */}
          {progress && (
            <div className="animate-fadeIn">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">{progress.step}</span>
                <span className="text-cyan-400">{progress.percent}%</span>
              </div>
              <div className="bg-slate-900/50 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300 relative overflow-hidden"
                  style={{ width: `${progress.percent}%` }}
                >
                  <div className="absolute inset-0 animate-shimmer" />
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 animate-fadeIn">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-red-300">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {result && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 animate-fadeIn">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-emerald-300 font-medium">
                    Islem tamamlandi!
                  </p>
                  <p className="text-emerald-400/70 text-sm mt-1 break-all">
                    {result}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-slate-800/30 rounded-2xl p-5 border border-slate-700/30 animate-fadeIn">
          <h3 className="font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Nasil Kullanilir
          </h3>
          <ol className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs flex-shrink-0">
                1
              </span>
              <span>
                Extension kurulu degilse "Tek Tikla Kur" butonuna tiklayin ve
                REAPER'i yeniden baslatin
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs flex-shrink-0">
                2
              </span>
              <span>
                REAPER'da FX uygulamak istediginiz track'i hazirlayin (FX Chain'i
                ayarlayin)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs flex-shrink-0">
                3
              </span>
              <span>Video dosyasini secin ve hedef track'i belirleyin</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs flex-shrink-0">
                4
              </span>
              <span>"Video'yu Isle" butonuna basin</span>
            </li>
          </ol>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-600">
          REAPER Video FX v1.0.0 - Tauri ile gelistirildi
        </footer>
      </div>
    </div>
  );
}

export default App;
