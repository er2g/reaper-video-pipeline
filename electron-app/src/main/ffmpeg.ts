import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDir(outputPath);

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('flac')
      .audioFrequency(48000)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`Ses çıkarma hatası: ${err.message}`)))
      .run();
  });
}

export function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDir(outputPath);

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v copy',
        '-c:a aac',
        '-b:a 320k',
        '-map 0:v:0',
        '-map 1:a:0',
        '-shortest'
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new Error(`Video birleştirme hatası: ${err.message}`)))
      .run();
  });
}
