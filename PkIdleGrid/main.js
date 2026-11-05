const { app, BrowserWindow, ipcMain, safeStorage, session, dialog, Notification, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const GAME_ORIGIN = 'https://poke.idleworld.online';

// Trava de instância única: impede múltiplos processos do Electron acumulando na memória RAM
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Otimizações de Memória RAM e CPU (leve, rápido e estável)
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256'); // Limita o uso de memória por processo V8
app.commandLine.appendSwitch('disable-breakpad'); // Desativa relatórios pesados de crash dump
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess');

let mainWindow = null;
let powerSaveId = null;

// Foca a janela existente caso o usuário tente abrir outro processo
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const credFile = () => path.join(app.getPath('userData'), 'accounts.enc');

// IPC Security: garante que pedidos venham da janela principal
const isMainWindow = (e) => {
  try {
    return !!mainWindow && !!e.sender && e.sender === mainWindow.webContents;
  } catch {
    return false;
  }
};

const safeHandle = (channel, handler) => {
  ipcMain.handle(channel, (e, ...args) => {
    if (!isMainWindow(e)) {
      console.warn(`[IPC] Pedido recusado no canal ${channel}: origem inválida.`);
      return null;
    }
    return handler(e, ...args);
  });
};

// Gerenciamento de credenciais com criptografia nativa (safeStorage)
safeHandle('creds:load', () => {
  try {
    const f = credFile();
    if (!fs.existsSync(f)) return [];
    const buf = fs.readFileSync(f);
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return JSON.parse(safeStorage.decryptString(buf));
      } catch {
        return JSON.parse(buf.toString('utf8'));
      }
    }
    return JSON.parse(buf.toString('utf8'));
  } catch (err) {
    console.error('[Creds] Erro ao carregar credenciais:', err.message);
    return [];
  }
});

safeHandle('creds:save', (_e, accounts) => {
  try {
    if (!Array.isArray(accounts)) return false;
    // Never persist account credentials in plaintext when OS encryption is unavailable.
    if (!safeStorage.isEncryptionAvailable()) return false;
    const json = JSON.stringify(accounts);
    const data = safeStorage.encryptString(json);
    const f = credFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', data);
    fs.renameSync(f + '.tmp', f);
    return true;
  } catch (err) {
    console.error('[Creds] Erro ao salvar credenciais:', err.message);
    return false;
  }
});

// Limpeza de cache de conta específica
safeHandle('conta:limpar', async (_e, i) => {
  const index = Math.trunc(+i);
  if (index < 0 || index > 3) return false;
  try {
    const ses = session.fromPartition(`persist:conta${index + 1}`);
    await ses.clearStorageData();
    await ses.clearCache();
    return true;
  } catch (err) {
    console.error(`[Conta] Erro ao limpar conta ${index + 1}:`, err.message);
    return false;
  }
});

// Impede suspensão do PC
safeHandle('awake:set', (_e, active) => {
  if (active && powerSaveId === null) {
    powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!active && powerSaveId !== null) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
  return true;
});

// Envio de Webhook Discord
safeHandle('webhook:send', async (_e, url, content) => {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('https://discord.com/api/webhooks/')) return false;
    const body = JSON.stringify(typeof content === 'object' ? content : { content: String(content) });
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
    return true;
  } catch {
    return false;
  }
});

// Notificações do Sistema
safeHandle('notify', (_e, title, body) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: String(title), body: String(body) }).show();
      return true;
    }
  } catch {}
  return false;
});

// Abrir link externo no navegador padrão
safeHandle('shell:openExternal', (_e, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
      return true;
    }
  } catch {}
  return false;
});

// Salvar backup de dados
safeHandle('backup:save', (_e, name, content) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const cleanName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '');
    fs.writeFileSync(path.join(dir, cleanName), content, 'utf8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.on('app:version', (e) => {
  e.returnValue = app.getVersion();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    title: 'PkIdleGrid',
    webPreferences: {
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Configuração de segurança de sessão: bloquear câmera/mic/notificações dos webviews do jogo
  const blockPerms = (_webContents, permission, callback) => {
    if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
      callback(true);
    } else {
      callback(false);
    }
  };
  session.defaultSession.setPermissionRequestHandler(blockPerms);

  for (let i = 1; i <= 4; i++) {
    const s = session.fromPartition(`persist:conta${i}`);
    s.setPermissionRequestHandler(blockPerms);
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

