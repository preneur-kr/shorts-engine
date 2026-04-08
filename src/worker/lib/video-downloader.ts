import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5분

export async function downloadVideo(videoUrl: string, outputPath: string): Promise<void> {
  console.log(`Downloading video from ${videoUrl}...`);
  await execAsync(`curl -L --max-time 300 -o "${outputPath}" "${videoUrl}"`, {
    timeout: DOWNLOAD_TIMEOUT_MS,
  });
  console.log('Download complete.');
}
