/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
import * as path from 'path';
import { extractAudio, mergeAudioVideo } from './ffmpeg';
import { ReaperBridge } from './reaper';

let mainWindow: any = null;
const reaperBridge = new ReaperBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'REAPER Video FX'
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }
    ]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-tracks', async () => {
  try {
    const response = await reaperBridge.sendCommand({ command: 'GET_TRACKS' });
    if (response.success) {
      return { success: true, tracks: response.tracks };
    }
    return { success: false, error: response.message || 'Track listesi alınamadı' };
  } catch (error) {
    return { success: false, error: 'REAPER ile bağlantı kurulamadı. Script çalışıyor mu?' };
  }
});

ipcMain.handle('ping-reaper', async () => {
  try {
    const response = await reaperBridge.sendCommand({ command: 'PING' });
    return response.success;
  } catch {
    return false;
  }
});

ipcMain.handle('process-video', async (_event: any, { videoPath, trackIndex }: { videoPath: string; trackIndex: number }) => {
  const sendProgress = (step: string, percent: number) => {
    mainWindow?.webContents.send('progress', { step, percent });
  };

  try {
    const tempDir = path.join(app.getPath('temp'), 'reaper-video-fx');
    const audioPath = path.join(tempDir, 'extracted.flac');
    const renderedPath = path.join(tempDir, 'rendered.wav');

    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const outputPath = path.join(videoDir, `${videoName}_processed.mp4`);

    // 1. Videodan ses çıkar
    sendProgress('Videodan ses çıkarılıyor...', 10);
    await extractAudio(videoPath, audioPath);
    sendProgress('Ses çıkarıldı', 25);

    // 2. Track'i temizle
    sendProgress('Track hazırlanıyor...', 30);
    await reaperBridge.sendCommand({
      command: 'CLEAR_TRACK',
      trackIndex
    });

    // 3. Sesi REAPER'a yükle
    sendProgress('Ses REAPER\'a yükleniyor...', 40);
    const loadResult = await reaperBridge.sendCommand({
      command: 'LOAD_AUDIO',
      trackIndex,
      audioPath
    });

    if (!loadResult.success) {
      throw new Error(loadResult.message || 'Ses yüklenemedi');
    }
    sendProgress('Ses yüklendi', 55);

    // 4. Track'i renderla
    sendProgress('Track render ediliyor...', 60);
    const renderResult = await reaperBridge.sendCommand({
      command: 'RENDER_TRACK',
      trackIndex,
      outputPath: renderedPath
    });

    if (!renderResult.success) {
      throw new Error(renderResult.message || 'Render başarısız');
    }
    sendProgress('Render tamamlandı', 80);

    // 5. Sesi videoya göm
    sendProgress('Video oluşturuluyor...', 85);
    await mergeAudioVideo(videoPath, renderedPath, outputPath);
    sendProgress('Tamamlandı!', 100);

    return { success: true, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return { success: false, error: message };
  }
});
