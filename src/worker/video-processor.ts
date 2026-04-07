import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { runApifyScraper, extractVideoUrl } from '../services/apify';

const execAsync = util.promisify(exec);

// Environment setup (Injected by GitHub Actions)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const apifyToken = process.env.APIFY_API_TOKEN || '';

// Inputs passed as arguments by GitHub Actions
const projectId = process.argv[2];
const inputVideoUrl = process.argv[3];
const traceId = process.argv[4];

if (!projectId || !inputVideoUrl) {
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
    
    // 2. Scrape direct video URL using Apify
    console.log(`Scraping direct video URL from ${inputVideoUrl} using Apify...`);
    if (!apifyToken) {
      throw new Error("Missing APIFY_API_TOKEN environment variable.");
    }

    const { item } = await runApifyScraper(inputVideoUrl, apifyToken);
    const directVideoUrl = extractVideoUrl(item);
    
    if (!directVideoUrl) {
      throw new Error("Could not extract direct video URL from Apify response.");
    }
    
    console.log(`Direct video URL found: ${directVideoUrl}`);

    // 3. Download using yt-dlp or curl (using direct URL often works without cookies)
    console.log("Downloading video...");
    // Using yt-dlp on the direct URL to handle potential format issues, or just curl
    // But yt-dlp is good for ensuring the best compatible format if needed.
    // Given the user wants to avoid yt-dlp session issues, using directUrl with curl is safer.
    await execAsync(`curl -L -o "${videoPath}" "${directVideoUrl}"`);
    console.log("Download complete.");

    // 4. Extract frames using FFmpeg (fps=2 -> 0.5s intervals)
    await updateStatus('EXTRACTING_FRAMES');
    const framesDir = path.join(TEMP_DIR, 'frames');
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    
    console.log("Extracting frames...");
    await execAsync(`ffmpeg -i "${videoPath}" -vf "fps=1" "${framesDir}/frame_%04d.jpg"`);
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
      const timestamp = i * 1.0;
      
      const { data: publicUrlData } = supabase.storage
        .from('shortform-assets')
        .getPublicUrl(storagePath);

      uploadedFrameRecords.push({
        project_id: projectId,
        timestamp_seconds: timestamp,
        storage_url: publicUrlData.publicUrl
      });
    }

    // 5. Save frame metadata to DB (delete existing frames first to prevent duplicates)
    await supabase.from('frames').delete().eq('project_id', projectId);

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
