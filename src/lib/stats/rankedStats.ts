import type { RankedMatchDetails } from "../riot/matches";

export type ChampionAggregate = {
  championId: number;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
};

export function computePlayerTopChampions(args: {
  puuid: string;
  rankedMatches: RankedMatchDetails[];
  topN: number;
}): ChampionAggregate[] {
  const { puuid, rankedMatches, topN } = args;

  const agg = new Map<number, { wins: number; losses: number }>();

  for (const match of rankedMatches) {
    const player = match.info.participants.find((p) => p.puuid === puuid);
    if (!player) continue;

    const entry = agg.get(player.championId) ?? { wins: 0, losses: 0 };
    if (player.win) entry.wins += 1;
    else entry.losses += 1;
    agg.set(player.championId, entry);
  }

  const result: ChampionAggregate[] = [];
  for (const [championId, v] of agg.entries()) {
    const games = v.wins + v.losses;
    if (games <= 0) continue;
    result.push({
      championId,
      wins: v.wins,
      losses: v.losses,
      games,
      winRate: v.wins / games,
    });
  }

  result.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.games - a.games;
  });

  return result.slice(0, topN);
}

export type PersonalCounter = {
  championId: number;
  lossesAgainst: number;
};

export function computePersonalCounter(args: { puuid: string; rankedMatches: RankedMatchDetails[] }) {
  const { puuid, rankedMatches } = args;

  const lossesAgainst = new Map<number, number>();

  for (const match of rankedMatches) {
    const player = match.info.participants.find((p) => p.puuid === puuid);
    if (!player) continue;

    if (player.win) continue; // only count losses

    const opponents = match.info.participants.filter((p) => p.teamId !== player.teamId);
    for (const opp of opponents) {
      lossesAgainst.set(opp.championId, (lossesAgainst.get(opp.championId) ?? 0) + 1);
    }
  }

  let best: PersonalCounter | null = null;
  for (const [championId, count] of lossesAgainst.entries()) {
    if (!best || count > best.lossesAgainst) best = { championId, lossesAgainst: count };
  }

  // If the player has no losses in the sample (rare), pick the first champion (or 0).
  return best ?? { championId: 0, lossesAgainst: 0 };
}

export function computeNemesisTopEnemies(args: {
  puuid: string;
  rankedMatches: RankedMatchDetails[];
  topN: number;
}) {
  const { puuid, rankedMatches, topN } = args;

  // For each enemy champion, count:
  // - wins: number of matches where the player won and that champ was on the enemy team
  // - losses: number of matches where the player lost and that champ was on the enemy team
  // Then sort by losses desc (most frequent nemesis), as requested.
  const agg = new Map<number, { wins: number; losses: number }>();

  for (const match of rankedMatches) {
    const player = match.info.participants.find((p) => p.puuid === puuid);
    if (!player) continue;

    const opponents = match.info.participants.filter((p) => p.teamId !== player.teamId);
    for (const opp of opponents) {
      const entry = agg.get(opp.championId) ?? { wins: 0, losses: 0 };
      if (player.win) entry.wins += 1;
      else entry.losses += 1;
      agg.set(opp.championId, entry);
    }
  }

  const result: ChampionAggregate[] = [];
  for (const [championId, v] of agg.entries()) {
    const games = v.wins + v.losses;
    if (games <= 0) continue;
    result.push({
      championId,
      wins: v.wins,
      losses: v.losses,
      games,
      winRate: v.wins / games,
    });
  }

  result.sort((a, b) => {
    const aLossRate = a.games > 0 ? a.losses / a.games : 0;
    const bLossRate = b.games > 0 ? b.losses / b.games : 0;

    // Primary: higher loss-rate (negative winrate) should rank higher.
    if (bLossRate !== aLossRate) return bLossRate - aLossRate;

    // Secondary: more losses.
    if (b.losses !== a.losses) return b.losses - a.losses;

    // Tertiary: more games.
    return b.games - a.games;
  });

  return result.slice(0, topN);
}

export function computeNemesisSorted(args: {
  puuid: string;
  rankedMatches: RankedMatchDetails[];
}): ChampionAggregate[] {
  const { puuid, rankedMatches } = args;

  const agg = new Map<number, { wins: number; losses: number }>();

  for (const match of rankedMatches) {
    const player = match.info.participants.find((p) => p.puuid === puuid);
    if (!player) continue;

    const opponents = match.info.participants.filter((p) => p.teamId !== player.teamId);
    for (const opp of opponents) {
      const entry = agg.get(opp.championId) ?? { wins: 0, losses: 0 };
      if (player.win) entry.wins += 1;
      else entry.losses += 1;
      agg.set(opp.championId, entry);
    }
  }

  const result: ChampionAggregate[] = [];
  for (const [championId, v] of agg.entries()) {
    const games = v.wins + v.losses;
    if (games <= 0) continue;
    result.push({
      championId,
      wins: v.wins,
      losses: v.losses,
      games,
      winRate: v.wins / games,
    });
  }

  result.sort((a, b) => {
    const aLossRate = a.games > 0 ? a.losses / a.games : 0;
    const bLossRate = b.games > 0 ? b.losses / b.games : 0;

    if (bLossRate !== aLossRate) return bLossRate - aLossRate;
    if (b.losses !== a.losses) return b.losses - a.losses;
    return b.games - a.games;
  });

  return result;
}

