-- Shortform Reverse-Engineering Pipeline: Supabase Schema (v1.0)

-- 1. Enums for State Management (Make Illegal States Unrepresentable)
CREATE TYPE project_status AS ENUM ('PENDING', 'DOWNLOADING', 'EXTRACTING_FRAMES', 'ANALYZING', 'COMPLETED', 'FAILED');

-- 2. Video Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL UNIQUE, -- Idempotency check: No duplicate URLs
    title TEXT,
    platform TEXT, -- 'instagram', 'tiktok', 'youtube'
    status project_status NOT NULL DEFAULT 'PENDING',
    storage_folder TEXT, -- Path in Supabase Storage
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message TEXT, -- Store failure reason
    gemini_file_uri TEXT -- Gemini File API URI for video analysis
);

-- 3. Frames Table
CREATE TABLE IF NOT EXISTS public.frames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    timestamp_seconds FLOAT NOT NULL,
    storage_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Analysis Insights Table
CREATE TABLE IF NOT EXISTS public.analysis_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    frame_id UUID REFERENCES public.frames(id),
    original_script TEXT,
    translated_script TEXT,
    hook_analysis TEXT,
    visual_cues JSONB, -- Strategic cues (string array)
    strategic_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Error Logs for Observability
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id),
    trace_id TEXT, -- For correlation with API logs
    stage TEXT NOT NULL, -- e.g., 'INGESTION', 'DOWNLOAD', 'EXTRACT'
    message TEXT NOT NULL,
    context JSONB, -- Store full request payload or environment state
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (Security First)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (or specific service roles) to manage data
-- For MVP, we will assume service-role usage from Next.js, but policy setup is crucial.
CREATE POLICY "Enable all access for service role" ON public.projects 
    FOR ALL USING (auth.role() = 'service_role');
