import { SIM_USERS } from "@/lib/mock-data";
import { MatchmakingService } from "@/services/contracts";
import { SimUser } from "@/types";

function shuffled<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function candidates(ageBracket: SimUser["ageBracket"], blockedIds: string[]) {
  return SIM_USERS.filter((user) => user.ageBracket === ageBracket && !blockedIds.includes(user.id));
}

export const mockMatchmakingService: MatchmakingService = {
  findSolo(ageBracket, blockedIds, previousId) {
    const pool = candidates(ageBracket, blockedIds);
    const withoutPrevious = pool.filter((user) => user.id !== previousId);
    const eligible = withoutPrevious.length ? withoutPrevious : pool;
    return eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null;
  },
  findGroup(ageBracket, blockedIds, previousIds) {
    const pool = candidates(ageBracket, blockedIds);
    const previousKey = [...previousIds].sort().join("|");
    let selected = shuffled(pool).slice(0, Math.min(6, pool.length));
    let attempts = 0;
    while ([...selected.map((user) => user.id)].sort().join("|") === previousKey && attempts < 8) {
      selected = shuffled(pool).slice(0, Math.min(6, pool.length));
      attempts += 1;
    }
    return selected;
  },
};
