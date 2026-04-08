import { GoogleGenerativeAI } from '@google/generative-ai';
import { SHORTFORM_ANALYSIS_PROMPT } from '../../services/ai-prompts';

const GEMINI_MODEL = 'gemini-1.5-pro';
const GEMINI_TIMEOUT_MS = 5 * 60 * 1000; // 5분 (영상 분석은 오래 걸림)

export interface AnalysisResult {
  original_script: string;
  translated_script: string;
  hook_analysis: string;
  visual_cues: string[];
  strategic_note: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export async function analyzeWithGemini(
  apiKey: string,
  fileUri: string
): Promise<AnalysisResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  console.log('Requesting Gemini video analysis...');

  const result = await withTimeout(
    model.generateContent([
      { fileData: { mimeType: 'video/mp4', fileUri } },
      SHORTFORM_ANALYSIS_PROMPT,
    ]),
    GEMINI_TIMEOUT_MS,
    'Gemini API'
  );

  const responseText = result.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse JSON from Gemini response.');

  return JSON.parse(jsonMatch[0]) as AnalysisResult;
}
