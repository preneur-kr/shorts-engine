import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { discordWebhookSchema, videoUrlPattern } from '@/lib/validations';

/**
 * --- Ingestion Layer (Discord Webhook Gateway) ---
 * Responsible for receiving URL triggers and initializing the pipeline.
 * Adheres to Coding_Standards_Master_Template.md (Idempotency, Fail-Fast).
 */
export async function POST(request: Request) {
  const traceId = crypto.randomUUID();

  try {
    // 0. Security Check: Verify Webhook Secret
    const incomingSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.DISCORD_WEBHOOK_SECRET;

    if (expectedSecret && incomingSecret !== expectedSecret) {
      console.warn(`[Security Warning] Unauthorized access attempt. Trace: ${traceId}`);
      return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });
    }

    // 1. Fail-Fast: Validate Input
    const rawBody = await request.json();
    const result = discordWebhookSchema.safeParse(rawBody);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid payload', details: result.error.format(), traceId }, { status: 400 });
    }

    const { content } = result.data;
    const urls = content.match(videoUrlPattern);

    if (!urls || urls.length === 0) {
      return NextResponse.json({ message: 'No valid video URL found in message.', traceId }, { status: 200 });
    }

    const videoUrl = urls[0];

    // 2. Idempotency Check & Create Project
    // We attempt to insert a new project. If it exists (due to UNIQUE source_url), we handle it.
    const { data: project, error: insertError } = await supabaseAdmin
      .from('projects')
      .upsert(
        { source_url: videoUrl, status: 'PENDING' },
        { onConflict: 'source_url' }
      )
      .select('id, status')
      .single();

    if (insertError) {
      console.error(`[Ingestion Error] Trace: ${traceId}`, insertError);
      return NextResponse.json({ error: 'Failed to create/update project', traceId }, { status: 500 });
    }

    // 3. Asynchronous Decoupling: Trigger GitHub Actions Worker
    const githubPat = process.env.GITHUB_PAT;
    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;

    if (githubPat && repoOwner && repoName) {
      const dispatchResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${githubPat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'process-video',
          client_payload: {
            project_id: project.id,
            video_url: videoUrl,
            trace_id: traceId,
          }
        }),
      });

      if (!dispatchResponse.ok) {
        const errText = await dispatchResponse.text();
        console.error(`[Dispatch Error] Trace: ${traceId}, Status: ${dispatchResponse.status}, Error: ${errText}`);
        // Log to Supabase error_logs table conceptually (omitted for brevity)
        return NextResponse.json({ error: 'Failed to trigger worker', traceId }, { status: 500 });
      }
    } else {
      console.warn(`[Dispatch Warning] GitHub credentials not found. Project ${project.id} is PENDING but worker was not triggered.`);
    }

    // 4. Fast Response (202 Accepted)
    console.log(`[Ingestion Success] Project ${project.id} is now ${project.status}. Worker Dispatched. Trace: ${traceId}`);

    return NextResponse.json({
      message: 'Processing started in background worker.',
      projectId: project.id,
      traceId,
    }, { status: 202 });

  } catch (error) {
    console.error(`[Unhandled API Error] Trace: ${traceId}`, error);
    return NextResponse.json({ error: 'Internal Server Error', traceId }, { status: 500 });
  }
}
