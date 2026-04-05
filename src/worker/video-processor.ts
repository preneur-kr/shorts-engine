import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const execAsync = util.promisify(exec);

// Environment setup (Injected by GitHub Actions)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Inputs passed as arguments by GitHub Actions
const projectId = process.argv[2];
const videoUrl = process.argv[3];
const traceId = process.argv[4];

if (!projectId || !videoUrl) {
  console.error("Missing required arguments: projectId and videoUrl");
  process.exit(1);
}

const TEMP_DIR = path.join(process.cwd(), 'tmp_video_process');

async function updateStatus(status: string, errorMsg?: string) {
  await supabase
    .from('projects')
    .update({ status, error_message: errorMsg, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

async function runVideoProcessor() {
  console.log(`[Worker Started] Project ID: ${projectId}, Trace: ${traceId}`);
  
  try {
    await updateStatus('DOWNLOADING');
    
    // 1. Prepare temp directory
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const videoPath = path.join(TEMP_DIR, 'video.mp4');
    
    // 2. Download using yt-dlp
    console.log(`Downloading video from ${videoUrl}...`);
    // Using best quality mp4, max resolution 720p to save time/space
    await execAsync(`yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${videoPath}" "${videoUrl}"`);
    console.log("Download complete.");

    // 3. Extract frames using FFmpeg (fps=2 -> 0.5s intervals)
    await updateStatus('EXTRACTING_FRAMES');
    const framesDir = path.join(TEMP_DIR, 'frames');
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    
    console.log("Extracting frames...");
    await execAsync(`ffmpeg -i "${videoPath}" -vf "fps=2" "${framesDir}/frame_%04d.jpg"`);
    console.log("Extraction complete.");

    // 4. Upload frames to Supabase Storage
    const files = fs.readdirSync(framesDir).filter(file => file.endsWith('.jpg')).sort();
    console.log(`Uploading ${files.length} frames to Supabase Storage...`);
    
    const uploadedFrameRecords = [];
    const storagePathBase = `projects/${projectId}/frames`;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(framesDir, file);
      const fileBuffer = fs.readFileSync(filePath);
      
      const storagePath = `${storagePathBase}/${file}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('shortform-assets')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw new Error(`Upload failed for ${file}: ${uploadError.message}`);

      // Calculate timestamp based on fps=2 (0.5s per frame)
      const timestamp = i * 0.5; 
      
      const { data: publicUrlData } = supabase.storage
        .from('shortform-assets')
        .getPublicUrl(storagePath);

      uploadedFrameRecords.push({
        project_id: projectId,
        timestamp_seconds: timestamp,
        storage_url: publicUrlData.publicUrl
      });
    }

    // 5. Save frame metadata to DB
    const { error: dbError } = await supabase
      .from('frames')
      .insert(uploadedFrameRecords);

    if (dbError) throw new Error(`Failed to save frame metadata: ${dbError.message}`);

    // 6. Finish (Next phase would be ANALYZING)
    await updateStatus('ANALYZING');
    console.log("[Worker Completed] Download and Extraction successful. Ready for AI Analysis.");

  } catch (error: any) {
    console.error(`[Worker Failed] ${error.message}`);
    await updateStatus('FAILED', error.message);
    process.exit(1);
  } finally {
    // Cleanup local files
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log("Cleaned up temporary files.");
    }
  }
}

runVideoProcessor();
