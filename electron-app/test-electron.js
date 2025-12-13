const electron = require('electron');
console.log('electron:', electron);
console.log('app:', electron.app);

const { app, BrowserWindow } = electron;

app.whenReady().then(() => {
  console.log('Electron is ready!');
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL('data:text/html,<h1>Test</h1>');
});
