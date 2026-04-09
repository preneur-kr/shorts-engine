import { GoogleGenerativeAI } from '@google/generative-ai';
import { SHORTFORM_ANALYSIS_PROMPT } from '../../services/ai-prompts';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.1-pro-preview'];
const GEMINI_TIMEOUT_MS = 5 * 60 * 1000; // 5분 (영상 분석은 오래 걸림)

export interface AnalysisResult {
  hook_sentence: string;
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
  let lastError: unknown;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`Requesting Gemini video analysis... (model: ${modelName})`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await withTimeout(
        model.generateContent([
          { fileData: { mimeType: 'video/mp4', fileUri } },
          SHORTFORM_ANALYSIS_PROMPT,
        ]),
        GEMINI_TIMEOUT_MS,
        `Gemini API (${modelName})`
      );

      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse JSON from Gemini response.');

      console.log(`[Gemini] Success with model: ${modelName}`);
      return JSON.parse(jsonMatch[0]) as AnalysisResult;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = message.includes('503') || message.includes('Service Unavailable') || message.includes('429');

      if (isRetryable) {
        console.warn(`[Gemini] ${modelName} unavailable, trying next model...`);
        lastError = err;
        continue;
      }
      // 503/429 이외의 오류는 즉시 throw
      throw err;
    }
  }

  throw lastError ?? new Error('All Gemini models failed.');
}
