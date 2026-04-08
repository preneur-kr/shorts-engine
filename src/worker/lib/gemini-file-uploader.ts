import { GoogleAIFileManager } from '@google/generative-ai/server';

const FILE_UPLOAD_TIMEOUT_MS  = 10 * 60 * 1000; // 업로드 최대 10분
const FILE_POLL_INTERVAL_MS   = 5_000;           // 5초마다 상태 확인
const FILE_PROCESS_TIMEOUT_MS = 5 * 60 * 1000;  // 처리 대기 최대 5분

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export async function uploadVideoToGemini(apiKey: string, videoPath: string): Promise<string> {
  const fileManager = new GoogleAIFileManager(apiKey);

  console.log('Uploading video to Gemini File API...');
  const uploadResult = await withTimeout(
    fileManager.uploadFile(videoPath, {
      mimeType: 'video/mp4',
      displayName: `video_${Date.now()}`,
    }),
    FILE_UPLOAD_TIMEOUT_MS,
    'Gemini file upload'
  );

  console.log('Waiting for Gemini to process the video...');
  const start = Date.now();
  let file = await fileManager.getFile(uploadResult.file.name);

  while (file.state === 'PROCESSING') {
    if (Date.now() - start > FILE_PROCESS_TIMEOUT_MS) {
      throw new Error('Gemini file processing timed out after 5 minutes.');
    }
    await new Promise(r => setTimeout(r, FILE_POLL_INTERVAL_MS));
    file = await fileManager.getFile(uploadResult.file.name);
    console.log(`Gemini file state: ${file.state}`);
  }

  if (file.state === 'FAILED') {
    throw new Error('Gemini file processing failed.');
  }

  console.log(`Video ready. URI: ${file.uri}`);
  return file.uri;
}
