import { riotFetch } from "./client";

export type MatchParticipant = {
  puuid: string;
  teamId: number;
  championId: number;
  win: boolean;
};

export type RankedMatchDetails = {
  info: {
    queueId: number;
    participants: MatchParticipant[];
  };
};

export async function getRankedMatchIds(args: {
  routingGroup: string;
  puuid: string;
  start: number;
  count: number;
}): Promise<string[]> {
  const { routingGroup, puuid, start, count } = args;
  const baseUrl = `https://${routingGroup}.api.riotgames.com`;
  const path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`;
  return riotFetch<string[]>({ baseUrl, path });
}

export async function getMatchDetails(args: {
  routingGroup: string;
  matchId: string;
}): Promise<RankedMatchDetails> {
  const { routingGroup, matchId } = args;
  const baseUrl = `https://${routingGroup}.api.riotgames.com`;
  const path = `/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return riotFetch<RankedMatchDetails>({ baseUrl, path });
}

