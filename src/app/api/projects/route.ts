import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * --- Figma Bridge: Project List API ---
 * Returns all video projects with their current status.
 * Used by Figma Plugin to show the processing history.
 */
export async function GET() {
  const traceId = crypto.randomUUID();

  try {
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[API Error] Failed to fetch projects. Trace: ${traceId}`, error);
      return NextResponse.json({ error: 'Failed to fetch projects', traceId }, { status: 500 });
    }

    return NextResponse.json({ projects, traceId });
  } catch (error) {
    console.error(`[Unhandled API Error] Trace: ${traceId}`, error);
    return NextResponse.json({ error: 'Internal Server Error', traceId }, { status: 500 });
  }
}
