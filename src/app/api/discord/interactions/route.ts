import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifySignature(body: string, signature: string, timestamp: string, publicKey: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKey),
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

const URL_PATTERN = /https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/[^\s]+/;

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  const body = await request.text();

  // 1. Discord 서명 검증 (Fail-Fast)
  const isValid = await verifySignature(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY ?? '');
  if (!isValid) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(body);

  // 2. PING → PONG (Discord 엔드포인트 등록 검증용)
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // 3. 슬래시 커맨드 /analyze 처리
  if (interaction.type === 2) {
    const url = (interaction.data.options?.[0]?.value as string) ?? '';
    const match = url.match(URL_PATTERN);

    if (!match) {
      return NextResponse.json({
        type: 4,
        data: { content: '❌ 올바른 Instagram / TikTok / YouTube URL을 입력해주세요.' },
      });
    }

    const videoUrl = match[0];

    // 4. Supabase에 프로젝트 생성 (Idempotency)
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .upsert({ source_url: videoUrl, status: 'PENDING' }, { onConflict: 'source_url' })
      .select('id, status')
      .single();

    if (error) {
      console.error(`[Discord Interaction Error] Trace: ${traceId}`, error);
      return NextResponse.json({
        type: 4,
        data: { content: `❌ 오류가 발생했습니다. Trace: \`${traceId}\`` },
      });
    }

    // 5. GitHub Actions 워커 트리거 (Async Decoupling)
    const githubPat = process.env.GITHUB_PAT;
    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;

    if (githubPat && repoOwner && repoName) {
      await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${githubPat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'process-video',
          client_payload: { project_id: project.id, video_url: videoUrl, trace_id: traceId },
        }),
      });
    }

    return NextResponse.json({
      type: 4,
      data: {
        content: `✅ 분석을 시작합니다!\n🔗 **URL**: ${videoUrl}\n📋 **Project ID**: \`${project.id}\``,
      },
    });
  }

  return NextResponse.json({ type: 1 });
}
