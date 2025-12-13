import React, { useState, useEffect } from 'react';

interface Track {
  index: number;
  name: string;
}

interface ProgressEvent {
  step: string;
  percent: number;
}

declare global {
  interface Window {
    electronAPI: {
      selectVideo: () => Promise<string | null>;
      getTracks: () => Promise<{ success: boolean; tracks?: Track[]; error?: string }>;
      pingReaper: () => Promise<boolean>;
      processVideo: (videoPath: string, trackIndex: number) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      onProgress: (callback: (event: ProgressEvent) => void) => () => void;
    };
  }
}

export default function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [reaperConnected, setReaperConnected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onProgress((event) => {
      setProgress(event);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    checkReaperConnection();
    const interval = setInterval(checkReaperConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  async function checkReaperConnection() {
    const connected = await window.electronAPI.pingReaper();
    setReaperConnected(connected);
    if (connected && tracks.length === 0) {
      loadTracks();
    }
  }

  async function loadTracks() {
    const result = await window.electronAPI.getTracks();
    if (result.success && result.tracks) {
      setTracks(result.tracks);
      if (result.tracks.length > 0 && selectedTrack === null) {
        setSelectedTrack(result.tracks[0].index);
      }
    }
  }

  async function selectVideo() {
    const path = await window.electronAPI.selectVideo();
    if (path) {
      setVideoPath(path);
      setError(null);
      setResult(null);
    }
  }

  async function processVideo() {
    if (!videoPath || selectedTrack === null) return;

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ step: 'Başlatılıyor...', percent: 0 });

    const response = await window.electronAPI.processVideo(videoPath, selectedTrack);

    setProcessing(false);
    setProgress(null);

    if (response.success) {
      setResult(response.outputPath || 'İşlem tamamlandı');
    } else {
      setError(response.error || 'Bilinmeyen hata');
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">REAPER Video FX</h1>

        {/* REAPER Bağlantı Durumu */}
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          reaperConnected ? 'bg-green-900/50' : 'bg-red-900/50'
        }`}>
          <div className={`w-3 h-3 rounded-full ${
            reaperConnected ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span>
            {reaperConnected
              ? 'REAPER bağlı'
              : 'REAPER bağlı değil - Script\'i çalıştırın'}
          </span>
          {reaperConnected && (
            <button
              onClick={loadTracks}
              className="ml-auto text-sm bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
            >
              Track'leri Yenile
            </button>
          )}
        </div>

        {/* Video Seçimi */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Video Dosyası</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={videoPath || ''}
              readOnly
              placeholder="Video seçilmedi..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-300"
            />
            <button
              onClick={selectVideo}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition"
            >
              Seç
            </button>
          </div>
        </div>

        {/* Track Seçimi */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">REAPER Track</label>
          <select
            value={selectedTrack ?? ''}
            onChange={(e) => setSelectedTrack(Number(e.target.value))}
            disabled={!reaperConnected || tracks.length === 0}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-300 disabled:opacity-50"
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

        {/* İşle Butonu */}
        <button
          onClick={processVideo}
          disabled={!videoPath || selectedTrack === null || !reaperConnected || processing}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-bold text-lg transition mb-6"
        >
          {processing ? 'İşleniyor...' : 'Video\'yu İşle'}
        </button>

        {/* İlerleme */}
        {progress && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span>{progress.step}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Hata */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Sonuç */}
        {result && (
          <div className="bg-green-900/50 border border-green-700 rounded-lg p-4">
            <p className="text-green-300 font-medium mb-1">İşlem tamamlandı!</p>
            <p className="text-green-400 text-sm break-all">{result}</p>
          </div>
        )}

        {/* Bilgi */}
        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg text-sm text-gray-400">
          <p className="font-medium text-gray-300 mb-2">Nasıl Kullanılır:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>REAPER'da <code className="bg-gray-700 px-1 rounded">video_fx_bridge.lua</code> script'ini çalıştırın</li>
            <li>FX eklemek istediğiniz track'i hazırlayın (FX Chain'i ayarlayın)</li>
            <li>Video dosyasını seçin</li>
            <li>Hedef track'i seçin</li>
            <li>"Video'yu İşle" butonuna basın</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
