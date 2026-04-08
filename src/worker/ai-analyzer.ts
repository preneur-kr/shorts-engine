import { createClient } from '@supabase/supabase-js';
import { updateStatus } from './lib/project-status';
import { analyzeWithGemini } from './lib/gemini-client';
import { saveAnalysis } from './lib/analysis-saver';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const projectId = process.argv[2];

if (!projectId) {
  console.error('Missing required argument: projectId');
  process.exit(1);
}

// 프로세스 하드킬: SDK 내부 HTTP 연결이 event loop을 막아도 강제 종료
const hardKillTimer = setTimeout(() => {
  console.error('[AI Worker] Hard kill: process exceeded 6 minute limit');
  process.exit(1);
}, 6 * 60 * 1000);
hardKillTimer.unref(); // 정상 완료 시 프로세스 자연 종료 허용

async function runAIAnalyzer() {
  console.log(`[AI Worker Started] Analyzing Project: ${projectId}`);

  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('gemini_file_uri')
      .eq('id', projectId)
      .single();

    if (error || !project?.gemini_file_uri) {
      throw new Error(`Missing gemini_file_uri for project: ${error?.message || 'not found'}`);
    }

    const analysis = await analyzeWithGemini(
      process.env.GOOGLE_AI_API_KEY || '',
      project.gemini_file_uri
    );

    await saveAnalysis(supabase, projectId, analysis);
    await updateStatus(supabase, projectId, 'COMPLETED');

    console.log(`[AI Worker Completed] Project ${projectId} is now COMPLETED.`);
    process.exit(0);

  } catch (error: any) {
    console.error(`[AI Worker Failed] ${error.message}`);
    await updateStatus(supabase, projectId, 'FAILED', error.message);
    process.exit(1);
  }
}

runAIAnalyzer();
