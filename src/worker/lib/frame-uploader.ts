import fs from 'fs';
import path from 'path';
import { SupabaseClient } from '@supabase/supabase-js';

export interface FrameRecord {
  project_id: string;
  timestamp_seconds: number;
  storage_url: string;
}

export async function uploadFrames(
  supabase: SupabaseClient,
  framesDir: string,
  projectId: string
): Promise<FrameRecord[]> {
  const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
  console.log(`Uploading ${files.length} frames to Supabase Storage...`);

  const storageBase = `projects/${projectId}/frames`;

  return Promise.all(
    files.map(async (file, i) => {
      const fileBuffer = fs.readFileSync(path.join(framesDir, file));
      const storagePath = `${storageBase}/${file}`;

      const { error } = await supabase.storage
        .from('shortform-assets')
        .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: true });

      if (error) throw new Error(`Upload failed for ${file}: ${error.message}`);

      const { data } = supabase.storage.from('shortform-assets').getPublicUrl(storagePath);

      return {
        project_id: projectId,
        timestamp_seconds: i * 1.0,
        storage_url: data.publicUrl,
      };
    })
  );
}

export async function saveFrameRecords(
  supabase: SupabaseClient,
  projectId: string,
  records: FrameRecord[]
): Promise<void> {
  await supabase.from('frames').delete().eq('project_id', projectId);
  const { error } = await supabase.from('frames').insert(records);
  if (error) throw new Error(`Failed to save frame metadata: ${error.message}`);
}
