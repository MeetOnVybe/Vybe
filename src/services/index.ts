import { getDataMode } from "@/lib/data-mode";
export { mockMatchmakingService as matchmakingService } from "@/services/mock/matchmaking";
export { mockChatService as chatService } from "@/services/mock/chat";
export { mockProfileService as profileService } from "@/services/mock/profile";
export { mockVideoService as videoService } from "@/services/video";
export { supabaseAuthService, getSupabasePlatformService } from "@/services/supabase/platform";

export const dataMode = getDataMode();
