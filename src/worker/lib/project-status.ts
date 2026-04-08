import { SupabaseClient } from '@supabase/supabase-js';

export async function updateStatus(
  supabase: SupabaseClient,
  projectId: string,
  status: string,
  errorMsg?: string
): Promise<void> {
  await supabase
    .from('projects')
    .update({ status, error_message: errorMsg, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}
