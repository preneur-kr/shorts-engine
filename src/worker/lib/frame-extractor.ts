import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';

const execAsync = util.promisify(exec);
const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000; // 3분

export async function extractFrames(videoPath: string, framesDir: string): Promise<void> {
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  console.log('Extracting frames...');
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "fps=1" "${framesDir}/frame_%04d.jpg"`,
    { timeout: FFMPEG_TIMEOUT_MS }
  );
  console.log('Extraction complete.');
}
