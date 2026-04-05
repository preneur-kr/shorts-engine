import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * --- Figma Bridge: Detailed Analysis API ---
 * Returns frames and AI analysis insights for a specific project.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const traceId = crypto.randomUUID();

  try {
    // 1. Fetch Project & Analysis Insight
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('*, analysis_insights(*)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found', traceId }, { status: 404 });
    }

    // 2. Fetch Frames
    const { data: frames, error: framesError } = await supabaseAdmin
      .from('frames')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp_seconds', { ascending: true });

    if (framesError) {
      return NextResponse.json({ error: 'Failed to fetch frames', traceId }, { status: 500 });
    }

    return NextResponse.json({
      project,
      analysis: project.analysis_insights?.[0] || null,
      frames,
      traceId
    });

  } catch (error) {
    console.error(`[Unhandled API Error] Trace: ${traceId}`, error);
    return NextResponse.json({ error: 'Internal Server Error', traceId }, { status: 500 });
  }
}
