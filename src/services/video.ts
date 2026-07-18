import type { VideoService } from "@/services/contracts";
import { getSupabaseVideoService } from "@/services/supabase/video";

export function getVideoService(): VideoService {
  return getSupabaseVideoService();
}
