import { riotFetch } from "./client";

export type AccountByRiotIdResponse = {
  puuid: string;
};

export async function getPuuidByRiotId(args: {
  routingGroup: string;
  gameName: string;
  tagLine: string;
}): Promise<AccountByRiotIdResponse> {
  const { routingGroup, gameName, tagLine } = args;
  const baseUrl = `https://${routingGroup}.api.riotgames.com`;
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(
    tagLine
  )}`;
  return riotFetch<AccountByRiotIdResponse>({ baseUrl, path });
}

export type SummonerByPuuidResponse = {
  id: string; // encrypted summoner id
  accountId: string;
  puuid: string;
  name: string;
};

export async function getSummonerByPuuid(args: {
  platform: string;
  puuid: string;
}): Promise<SummonerByPuuidResponse> {
  const { platform, puuid } = args;
  const platformLower = platform.toLowerCase();
  const baseUrl = `https://${platformLower}.api.riotgames.com`;
  const path = `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;

  // Normalize Riot's payload shape defensively.
  const raw = await riotFetch<any>({ baseUrl, path });

  // Riot normally returns `id` (encryptedSummonerId), but if anything changes we want a clearer failure.
  const encryptedSummonerId = raw?.id ?? raw?.encryptedSummonerId ?? raw?.summonerId;
  if (typeof encryptedSummonerId !== "string" || encryptedSummonerId.length === 0) {
    const keys = raw && typeof raw === "object" ? Object.keys(raw).slice(0, 12).join(", ") : "";
    throw new Error(
      `Riot returned a summoner payload without an encrypted summoner id (\`id\`). Returned keys: ${keys}`
    );
  }

  return {
    id: encryptedSummonerId,
    accountId: String(raw?.accountId ?? ""),
    puuid: String(raw?.puuid ?? ""),
    name: String(raw?.name ?? ""),
  };
}

export type LeagueEntry = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
};

export type SoloRankResponse = {
  tier: string;
  division: string;
  queueType: string;
};

export async function getRankByPuuid(args: {
  platform: string; // e.g. LA1
  puuid: string;
  queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";
}): Promise<SoloRankResponse> {
  const { platform, puuid, queueType } = args;
  const platformLower = platform.toLowerCase();
  const baseUrl = `https://${platformLower}.api.riotgames.com`;
  const path = `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;

  const entries = await riotFetch<LeagueEntry[]>({ baseUrl, path });
  const q = entries.find((e) => e.queueType === queueType);
  if (!q) {
    throw new Error(`No ranked entry found for queueType ${queueType}.`);
  }

  return {
    tier: q.tier,
    division: q.rank,
    queueType: q.queueType,
  };
}

export async function getSoloRankByPuuid(args: {
  platform: string; // e.g. LA1
  puuid: string;
}): Promise<SoloRankResponse> {
  return getRankByPuuid({
    platform: args.platform,
    puuid: args.puuid,
    queueType: "RANKED_SOLO_5x5",
  });
}

export async function getSoloRank(args: {
  platform: string;
  encryptedSummonerId: string;
}): Promise<SoloRankResponse> {
  const { platform, encryptedSummonerId } = args;
  const platformLower = platform.toLowerCase();
  const baseUrl = `https://${platformLower}.api.riotgames.com`;
  const path = `/lol/league/v4/entries/by-summoner/${encodeURIComponent(encryptedSummonerId)}`;
  const entries = await riotFetch<LeagueEntry[]>({ baseUrl, path });

  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  if (!solo) {
    throw new Error("No ranked solo queue entry found for this player.");
  }

  return {
    tier: solo.tier,
    division: solo.rank, // e.g. "IV"
    queueType: solo.queueType,
  };
}

