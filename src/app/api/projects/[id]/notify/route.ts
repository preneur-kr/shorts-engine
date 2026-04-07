import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { figmaUrl } = await request.json();

  // Fetch analysis from DB
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('*, analysis_insights(*)')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const analysis = project.analysis_insights?.[0];
  const webhookUrl = process.env.DISCORD_NOTIFY_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
  }

  const visualCues = Array.isArray(analysis?.visual_cues)
    ? analysis.visual_cues.map((c: string) => `• ${c}`).join('\n')
    : 'N/A';

  const message = {
    embeds: [
      {
        title: '✅ 숏폼 분석 완료',
        color: 0x5865F2,
        fields: [
          {
            name: '🔗 원본 URL',
            value: project.source_url,
            inline: false,
          },
          {
            name: '📝 원본 대본',
            value: (analysis?.original_script || 'N/A').slice(0, 1024),
            inline: false,
          },
          {
            name: '🇰🇷 한국어 대본',
            value: (analysis?.translated_script || 'N/A').slice(0, 1024),
            inline: false,
          },
          {
            name: '💡 Hook 분석',
            value: (analysis?.hook_analysis || 'N/A').slice(0, 1024),
            inline: false,
          },
          {
            name: '👁 Visual Cues',
            value: visualCues.slice(0, 1024),
            inline: false,
          },
          {
            name: '🎯 전략 노트',
            value: (analysis?.strategic_note || 'N/A').slice(0, 1024),
            inline: false,
          },
          ...(figmaUrl
            ? [{ name: '🎨 Figma 스토리보드', value: figmaUrl, inline: false }]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to send Discord notification' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
