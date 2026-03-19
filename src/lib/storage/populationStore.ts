import fs from "node:fs/promises";
import path from "node:path";
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

let inMemory: PopulationData | null = null;
let loaded = false;
let writeLock = Promise.resolve();

function getDataFile() {
  return path.join(process.cwd(), "data", "population.json");
}

async function ensureLoaded(): Promise<PopulationData> {
  if (loaded && inMemory) return inMemory;

  const filePath = getDataFile();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    inMemory = JSON.parse(raw) as PopulationData;
  } catch {
    inMemory = {};
  }
  loaded = true;
  return inMemory!;
}

async function persist(data: PopulationData) {
  const filePath = getDataFile();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), "utf-8");
  await fs.rename(tmp, filePath);
}

export async function ingestPopulationFromRankedMatches(args: {
  region: string;
  rankKey: string;
  rankedMatches: RankedMatchDetails[];
}): Promise<{ gamesIngested: number }> {
  const { region, rankKey, rankedMatches } = args;

  // Serialize writes to avoid clobbering the JSON file during concurrent requests.
  writeLock = writeLock.then(async () => {
    const data = await ensureLoaded();
    data[region] = data[region] ?? {};
    data[region][rankKey] = data[region][rankKey] ?? {};

    for (const match of rankedMatches) {
      for (const p of match.info.participants) {
        const champId = String(p.championId);
        const cur = data[region][rankKey][champId] ?? { wins: 0, losses: 0 };
        if (p.win) cur.wins += 1;
        else cur.losses += 1;
        data[region][rankKey][champId] = cur;
      }
    }

    await persist(data);
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
  const data = await ensureLoaded();

  const rankBucket = data[region]?.[rankKey];
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

