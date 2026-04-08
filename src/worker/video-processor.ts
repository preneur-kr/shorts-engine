import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { runApifyScraper, extractVideoUrl } from '../services/apify';
import { updateStatus } from './lib/project-status';
import { downloadVideo } from './lib/video-downloader';
import { extractFrames } from './lib/frame-extractor';
import { uploadFrames, saveFrameRecords } from './lib/frame-uploader';
import { uploadVideoToGemini } from './lib/gemini-file-uploader';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const projectId = process.argv[2];
const inputVideoUrl = process.argv[3];
const traceId = process.argv[4];

if (!projectId || !inputVideoUrl) {
  console.error('Missing required arguments: projectId and videoUrl');
  process.exit(1);
}

const TEMP_DIR = path.join(process.cwd(), 'tmp_video_process');

async function runVideoProcessor() {
  console.log(`[Worker Started] Project ID: ${projectId}, Trace: ${traceId}`);

  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apifyToken) throw new Error('Missing APIFY_API_TOKEN environment variable.');
    if (!geminiApiKey) throw new Error('Missing GOOGLE_AI_API_KEY environment variable.');

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const videoPath = path.join(TEMP_DIR, 'video.mp4');
    const framesDir = path.join(TEMP_DIR, 'frames');

    // 1. 영상 URL 스크래핑
    await updateStatus(supabase, projectId, 'DOWNLOADING');
    const { item } = await runApifyScraper(inputVideoUrl, apifyToken);
    const directVideoUrl = extractVideoUrl(item);
    if (!directVideoUrl) throw new Error('Could not extract direct video URL from Apify response.');

    // 2. 영상 다운로드
    await downloadVideo(directVideoUrl, videoPath);

    // 3. 프레임 추출
    await updateStatus(supabase, projectId, 'EXTRACTING_FRAMES');
    await extractFrames(videoPath, framesDir);

    // 4. Supabase 프레임 업로드 & Gemini 영상 업로드 병렬 실행
    const [records, geminiFileUri] = await Promise.all([
      uploadFrames(supabase, framesDir, projectId).then(async (r) => {
        await saveFrameRecords(supabase, projectId, r);
        return r;
      }),
      uploadVideoToGemini(geminiApiKey, videoPath),
    ]);
    await supabase
      .from('projects')
      .update({ gemini_file_uri: geminiFileUri, updated_at: new Date().toISOString() })
      .eq('id', projectId);

    await updateStatus(supabase, projectId, 'ANALYZING');
    console.log('[Worker Completed] Ready for AI Analysis.');

  } catch (error: any) {
    console.error(`[Worker Failed] ${error.message}`);
    await updateStatus(supabase, projectId, 'FAILED', error.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log('Cleaned up temporary files.');
    }
  }
}

runVideoProcessor();
