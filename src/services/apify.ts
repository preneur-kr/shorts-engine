import axios from 'axios';

const APIFY_BASE = 'https://api.apify.com/v2';
const WAIT_SECS = 30;
const REQUEST_TIMEOUT_MS = 60_000; // 60초

export interface ApifyRunResult {
  item: Record<string, unknown> | undefined;
  runId: string;
  computeUnits: number;
}

interface ApifyRun {
  id: string;
  defaultDatasetId: string;
  stats?: { computeUnits?: number };
}

// --- Platform detection ---
function detectPlatform(url: string): string {
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('tiktok.com')) return 'tiktok';
  return 'other';
}

// --- Platform-specific Actor Config ---
interface ActorConfig {
  actorId: string;
  input: Record<string, unknown>;
}

function buildActorConfig(platform: string, url: string): ActorConfig {
  if (platform === 'instagram') {
    return {
      actorId: 'apify~instagram-scraper',
      input: { directUrls: [url], resultsType: 'posts', resultsLimit: 1 },
    };
  }
  if (platform === 'youtube') {
    return {
      actorId: 'apify~youtube-scraper',
      input: { startUrls: [{ url }], maxResults: 1 },
    };
  }
  return {
    actorId: 'apify~tiktok-scraper',
    input: { startUrls: [{ url }], resultsLimit: 1 },
  };
}

// --- Start Apify Run ---
async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  token: string
): Promise<ApifyRun> {
  const url = `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=${WAIT_SECS}`;
  const res = await axios.post(url, input, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Apify run failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data.data;
}

// --- Fetch Dataset Items ---
async function fetchDatasetItems(
  datasetId: string,
  token: string
): Promise<Record<string, unknown>[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.status !== 200) {
    throw new Error(`Apify dataset fetch failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

// --- Public API ---
export async function runApifyScraper(url: string, token: string): Promise<ApifyRunResult> {
  const platform = detectPlatform(url);
  const { actorId, input } = buildActorConfig(platform, url);
  const run = await startActorRun(actorId, input, token);
  const items = await fetchDatasetItems(run.defaultDatasetId, token);

  return {
    item: items?.[0],
    runId: run.id,
    computeUnits: run.stats?.computeUnits ?? 0,
  };
}

export function extractVideoUrl(item: Record<string, unknown> | undefined): string | null {
  if (!item) return null;
  return (
    (typeof item.videoUrl === 'string' && item.videoUrl) ||
    (typeof item.url === 'string' && item.url) ||
    (typeof item.link === 'string' && item.link) ||
    null
  );
}
