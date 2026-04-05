import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { SHORTFORM_ANALYSIS_PROMPT } from '../services/ai-prompts';

// Environment setup (Injected by GitHub Actions)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const geminiApiKey = process.env.GOOGLE_AI_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Inputs passed as arguments by GitHub Actions
const projectId = process.argv[2];

if (!projectId) {
  console.error("Missing required argument: projectId");
  process.exit(1);
}

async function fetchImageAsBase64(url: string) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return {
    inlineData: {
      data: Buffer.from(response.data).toString('base64'),
      mimeType: 'image/jpeg',
    },
  };
}

async function runAIAnalyzer() {
  console.log(`[AI Worker Started] Analyzing Project: ${projectId}`);
  
  try {
    // 1. Fetch all frames for this project
    const { data: frames, error: fetchError } = await supabase
      .from('frames')
      .select('storage_url, timestamp_seconds')
      .eq('project_id', projectId)
      .order('timestamp_seconds', { ascending: true });

    if (fetchError || !frames || frames.length === 0) {
      throw new Error(`Failed to fetch frames: ${fetchError?.message || 'No frames found'}`);
    }

    console.log(`Fetched ${frames.length} frames. Preparing multi-modal input...`);

    // 2. Sample frames to stay within token limits (e.g., every 4th frame if too many)
    const sampledFrames = frames.length > 30 
      ? frames.filter((_, i) => i % Math.ceil(frames.length / 30) === 0)
      : frames;

    const imageParts = await Promise.all(
      sampledFrames.map(f => fetchImageAsBase64(f.storage_url))
    );

    // 3. Request Gemini Analysis
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    console.log("Requesting Gemini 1.5 Pro analysis...");
    const result = await model.generateContent([
      SHORTFORM_ANALYSIS_PROMPT,
      ...imageParts
    ]);

    const responseText = result.response.text();
    
    // Attempt to parse JSON from response (handling potential markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse JSON from AI response.");
    
    const analysisData = JSON.parse(jsonMatch[0]);

    // 4. Save analysis to Database
    const { error: insertError } = await supabase
      .from('analysis_insights')
      .insert({
        project_id: projectId,
        original_script: analysisData.original_script,
        translated_script: analysisData.translated_script,
        hook_analysis: analysisData.hook_analysis,
        visual_cues: analysisData.visual_cues,
        strategic_note: analysisData.strategic_note
      });

    if (insertError) throw new Error(`Failed to save insights: ${insertError.message}`);

    // 5. Final Status Update
    await supabase
      .from('projects')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    console.log(`[AI Worker Completed] Project ${projectId} is now COMPLETED.`);

  } catch (error: any) {
    console.error(`[AI Worker Failed] ${error.message}`);
    // Log to DB and mark project as failed
    await supabase
      .from('projects')
      .update({ status: 'FAILED', error_message: error.message })
      .eq('id', projectId);
    process.exit(1);
  }
}

runAIAnalyzer();
