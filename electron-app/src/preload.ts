const { contextBridge, ipcRenderer } = require('electron');

export interface Track {
  index: number;
  name: string;
}

export interface ProgressEvent {
  step: string;
  percent: number;
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectVideo: () => ipcRenderer.invoke('select-video'),
  getTracks: () => ipcRenderer.invoke('get-tracks'),
  pingReaper: () => ipcRenderer.invoke('ping-reaper'),
  processVideo: (videoPath: string, trackIndex: number) =>
    ipcRenderer.invoke('process-video', { videoPath, trackIndex }),
  onProgress: (callback: (event: ProgressEvent) => void) => {
    ipcRenderer.on('progress', (_: unknown, data: ProgressEvent) => callback(data));
    return () => ipcRenderer.removeAllListeners('progress');
  }
});
