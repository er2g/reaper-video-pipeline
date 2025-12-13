import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ReaperCommand {
  command: string;
  trackIndex?: number;
  audioPath?: string;
  outputPath?: string;
}

interface ReaperResponse {
  success: boolean;
  message?: string;
  tracks?: Array<{ index: number; name: string }>;
  outputPath?: string;
}

export class ReaperBridge {
  private commDir: string;
  private commandFile: string;
  private responseFile: string;

  constructor() {
    this.commDir = path.join(os.tmpdir(), 'reaper-video-fx');
    this.commandFile = path.join(this.commDir, 'command.json');
    this.responseFile = path.join(this.commDir, 'response.json');
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.commDir)) {
      fs.mkdirSync(this.commDir, { recursive: true });
    }
  }

  private cleanup() {
    try {
      if (fs.existsSync(this.commandFile)) {
        fs.unlinkSync(this.commandFile);
      }
      if (fs.existsSync(this.responseFile)) {
        fs.unlinkSync(this.responseFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  async sendCommand(command: ReaperCommand, timeout = 30000): Promise<ReaperResponse> {
    this.ensureDir();
    this.cleanup();

    // Komutu yaz
    const commandJson = JSON.stringify(command);
    fs.writeFileSync(this.commandFile, commandJson, 'utf-8');

    // Yanıt bekle
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.sleep(100);

      if (fs.existsSync(this.responseFile)) {
        try {
          const responseContent = fs.readFileSync(this.responseFile, 'utf-8');
          const response = JSON.parse(responseContent) as ReaperResponse;

          // Yanıt dosyasını sil
          fs.unlinkSync(this.responseFile);

          return response;
        } catch {
          // JSON parse hatası, tekrar dene
          continue;
        }
      }
    }

    throw new Error('REAPER yanıt vermedi (timeout)');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
