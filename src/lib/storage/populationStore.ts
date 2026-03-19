import type { RankedMatchDetails } from "../riot/matches";
import type { ChampionAggregate } from "../stats/rankedStats";

type ChampionWl = { wins: number; losses: number };

export type PopulationData = {
  [region: string]: {
    [rankKey: string]: {
      [championId: string]: ChampionWl;
    };
  };
};

// Cloudflare Workers don't support Node filesystem APIs. Keep this store in-memory.
// (If you later need persistence, re-introduce it using a Workers KV/D1 adapter.)
let inMemory: PopulationData = {};
let writeLock = Promise.resolve();

export async function ingestPopulationFromRankedMatches(args: {
  region: string;
  rankKey: string;
  rankedMatches: RankedMatchDetails[];
}): Promise<{ gamesIngested: number }> {
  const { region, rankKey, rankedMatches } = args;

  // Serialize writes to avoid clobbering the JSON file during concurrent requests.
  writeLock = writeLock.then(async () => {
    inMemory[region] = inMemory[region] ?? {};
    inMemory[region][rankKey] = inMemory[region][rankKey] ?? {};

    for (const match of rankedMatches) {
      for (const p of match.info.participants) {
        const champId = String(p.championId);
        const cur = inMemory[region][rankKey][champId] ?? { wins: 0, losses: 0 };
        if (p.win) cur.wins += 1;
        else cur.losses += 1;
        inMemory[region][rankKey][champId] = cur;
      }
    }
  });

  await writeLock;
  return { gamesIngested: rankedMatches.length };
}

export async function getPopulationTopChampions(args: {
  region: string;
  rankKey: string;
  topN: number;
}): Promise<ChampionAggregate[]> {
  const { region, rankKey, topN } = args;

  const rankBucket = inMemory[region]?.[rankKey];
  if (!rankBucket) return [];

  const result: ChampionAggregate[] = [];
  for (const [championIdStr, wl] of Object.entries(rankBucket)) {
    const championId = Number(championIdStr);
    const wins = wl.wins;
    const losses = wl.losses;
    const games = wins + losses;
    if (games <= 0) continue;
    result.push({
      championId,
      wins,
      losses,
      games,
      winRate: wins / games,
    });
  }

  result.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.games - a.games;
  });

  return result.slice(0, topN);
}

