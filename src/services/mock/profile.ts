import { ProfileService } from "@/services/contracts";

export const mockProfileService: ProfileService = {
  normalize(profile) {
    return {
      ...profile,
      username: profile.username.trim().replace(/\s+/g, "").slice(0, 20) || "NewVYBE",
      displayName: profile.displayName.trim().slice(0, 30) || "VYBE User",
      bio: profile.bio.trim().slice(0, 160),
    };
  },
};
