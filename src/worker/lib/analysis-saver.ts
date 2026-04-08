import { SupabaseClient } from '@supabase/supabase-js';
import { AnalysisResult } from './gemini-client';

export async function saveAnalysis(
  supabase: SupabaseClient,
  projectId: string,
  analysis: AnalysisResult
): Promise<void> {
  const { error } = await supabase.from('analysis_insights').insert({
    project_id: projectId,
    original_script: analysis.original_script,
    translated_script: analysis.translated_script,
    hook_analysis: analysis.hook_analysis,
    visual_cues: analysis.visual_cues,
    strategic_note: analysis.strategic_note,
  });
  if (error) throw new Error(`Failed to save insights: ${error.message}`);
}
