import { NextResponse } from "next/server";
import { getRoutingGroupForPlatform, isSupportedPlatform } from "@/lib/riot/platformRouting";
import { getPuuidByRiotId, getRankByPuuid } from "@/lib/riot/account";
import { getMatchDetails, getRankedMatchIds } from "@/lib/riot/matches";
import { computeNemesisSorted, computePlayerTopChampions } from "@/lib/stats/rankedStats";
import { getChampionMeta } from "@/lib/ddragon/championMeta";
import type { ChampionAggregate } from "@/lib/stats/rankedStats";

export const runtime = "nodejs";

const SOLO_QUEUE_ID = 420;
const FLEX_QUEUE_ID = 440;
const TOP_CHAMPS_N = 5;
const ALL_RANKED_MATCH_CAP = 50;
const RECENT_RANKED_MATCH_CAP = 20;

function parseHistoryMode(input: string | null) {
  switch (input) {
    case "all_solo":
      return "all_solo" as const;
    case "recent_flex":
      return "recent_flex" as const;
    case "all_flex":
      return "all_flex" as const;
    case "recent_solo":
    default:
      return "recent_solo" as const;
  }
}

function normalizeRankKey(args: { tier: string; division: string; queue: "SOLO" | "FLEX" }) {
  return `${args.queue}_${args.tier.toUpperCase()}_${args.division.toUpperCase()}`;
}

function toChampionWin(meta: Record<number, { name: string; imageUrl: string }>, agg: ChampionAggregate) {
  const m = meta[agg.championId];
  return {
    championId: agg.championId,
    name: m?.name,
    imageUrl: m?.imageUrl,
    winRate: agg.winRate,
    wins: agg.wins,
    losses: agg.losses,
    games: agg.games,
  };
}

function validateInput(args: { region: string; gameName: string; tagLine: string }) {
  const { region, gameName, tagLine } = args;

  if (!isSupportedPlatform(region)) {
    throw new Error("Unsupported region/server. Please select a supported server from the dropdown.");
  }

  const gn = gameName.trim();
  const tl = tagLine.trim();

  if (gn.length < 2 || gn.length > 50) throw new Error("GameName must be between 2 and 50 characters.");
  if (tl.length < 2 || tl.length > 10) throw new Error("TagLine must be between 2 and 10 characters.");
  if (gn.includes("#") || tl.includes("#")) throw new Error("Riot ID format error. Do not include '#'.");

  // Very light safety constraints.
  const safe = /^[A-Za-z0-9 _-]+$/;
  if (!safe.test(gn) || !safe.test(tl)) {
    throw new Error("GameName/TagLine contains unsupported characters.");
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const region = url.searchParams.get("region");
    const gameName = url.searchParams.get("gameName");
    const tagLine = url.searchParams.get("tagLine");
    const historyMode = parseHistoryMode(url.searchParams.get("historyMode"));

    if (!region || !gameName || !tagLine) {
      return NextResponse.json({ error: "Missing required query params: region, gameName, tagLine." }, { status: 400 });
    }

    validateInput({ region, gameName, tagLine });

    const routingGroup = getRoutingGroupForPlatform(region);
    if (!routingGroup) throw new Error("Could not resolve routing group for this region.");

    // 1) Resolve Riot ID -> puuid
    const account = await getPuuidByRiotId({
      routingGroup,
      gameName: gameName.trim(),
      tagLine: tagLine.trim(),
    });

    if (!account?.puuid || typeof account.puuid !== "string") {
      return NextResponse.json(
        { error: "Riot account lookup returned no `puuid` for this Riot ID." },
        { status: 502 }
      );
    }

    const isSolo = historyMode.endsWith("_solo");
    const isRecent = historyMode.startsWith("recent_");

    // 2) Get ranked tier/division from league entries by PUUID.
    // This avoids relying on Summoner-V4 returning the encrypted summoner `id` field.
    const leagueQueueType = isSolo ? "RANKED_SOLO_5x5" : "RANKED_FLEX_SR";
    const rank = await getRankByPuuid({
      platform: region,
      puuid: account.puuid,
      queueType: leagueQueueType as "RANKED_SOLO_5x5" | "RANKED_FLEX_SR",
    });

    const rankKey = normalizeRankKey({
      tier: rank.tier,
      division: rank.division,
      queue: isSolo ? "SOLO" : "FLEX",
    });

    // 3) Fetch match ids + details, filter to ranked queue
    const queueId = isSolo ? SOLO_QUEUE_ID : FLEX_QUEUE_ID;
    // Riot match-v5 ids endpoint caps `count` to 100.
    const idsFetchCount = isRecent ? 80 : 80;
    const targetRankedMatches = isRecent ? RECENT_RANKED_MATCH_CAP : ALL_RANKED_MATCH_CAP;

    const matchIds = await getRankedMatchIds({
      routingGroup,
      puuid: account.puuid,
      start: 0,
      count: idsFetchCount,
    });

    const rankedMatches: Awaited<ReturnType<typeof getMatchDetails>>[] = [];

    // Fetch match details in small batches to avoid very slow sequential requests,
    // while keeping request pressure on Riot's API under control.
    const batchSize = isRecent ? 6 : 2;

    for (let i = 0; i < matchIds.length && rankedMatches.length < targetRankedMatches; i += batchSize) {
      const batchIds = matchIds.slice(i, i + batchSize);

      const detailsBatch = await Promise.all(
        batchIds.map(async (matchId) => {
          const maxAttempts = 3;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              return await getMatchDetails({ routingGroup, matchId });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const is429 = message.includes("(429)") || message.toLowerCase().includes("too many requests");
              if (!is429) return null;

              const retryMatch = message.match(/Retry-After:\s*([0-9]+(\.[0-9]+)?)s/i);
              const retrySeconds = retryMatch ? Number(retryMatch[1]) : 0;

              if (attempt === maxAttempts - 1) return null;

              // Small backoff. Add a buffer to avoid immediate re-throttling.
              const waitMs = (retrySeconds > 0 ? retrySeconds * 1000 : 600) + 250;
              await new Promise((r) => setTimeout(r, waitMs));
              continue;
            }
          }
          return null;
        })
      );

      for (const details of detailsBatch) {
        if (!details) continue;
        if (details.info.queueId !== queueId) continue;
        rankedMatches.push(details);
        if (rankedMatches.length >= targetRankedMatches) break;
      }
    }

    const capped = rankedMatches.length < targetRankedMatches;

    // 5) Player-based stats
    const playerTopChampionsAgg = computePlayerTopChampions({
      puuid: account.puuid,
      rankedMatches,
      topN: TOP_CHAMPS_N,
    });

    const nemesisSorted = computeNemesisSorted({
      puuid: account.puuid,
      rankedMatches,
    });

    // Qualification rules:
    // - Pyramid (#1..#3): at least 5 games vs champion
    // - List (#1..#5): at least 3 games vs champion
    const playerNemesisTop3Agg = isRecent
      ? nemesisSorted.slice(0, 3)
      : nemesisSorted.filter((c) => c.games >= 5).slice(0, 3);
    const playerNemesisTop5Agg = nemesisSorted.filter((c) => c.games >= 3).slice(0, TOP_CHAMPS_N);

    const personalCounterAgg = playerNemesisTop3Agg[0] ?? playerNemesisTop5Agg[0] ?? {
      championId: 0,
      wins: 0,
      losses: 0,
      games: 0,
      winRate: 0,
    };

    // Champion meta (names + icons) is independent of ingestion; fetch it in parallel to reduce latency.
    const locale = process.env.RIOT_DDRAGON_LOCALE || "en_US";
    const metaPromise: Promise<Record<number, { name: string; imageUrl: string }>> = getChampionMeta(locale).catch(() => ({}));

    // 6) Champion meta (names + icons)
    const meta = await metaPromise;

    return NextResponse.json(
      {
        summoner: {
          gameName: gameName.trim(),
          tagLine: tagLine.trim(),
          region,
          puuid: account.puuid,
        },
        rank: {
          tier: rank.tier,
          division: rank.division,
          queueType: rank.queueType,
          rankKey,
        },
        history: {
          mode: historyMode,
          requestedMatches: idsFetchCount,
          usedRankedMatches: rankedMatches.length,
          capped,
        },
        playerTopChampions: playerTopChampionsAgg.map((a) => toChampionWin(meta, a)),
        personalCounter: {
          championId: personalCounterAgg.championId,
          name: meta[personalCounterAgg.championId]?.name,
          imageUrl: meta[personalCounterAgg.championId]?.imageUrl,
          // Here `losses` == losses against this enemy champion.
          lossesAgainst: personalCounterAgg.losses,
        },
        playerNemesisTop3Champions: playerNemesisTop3Agg.map((a) => toChampionWin(meta, a)),
        playerNemesisTop5Champions: playerNemesisTop5Agg.map((a) => toChampionWin(meta, a)),
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("encrypted summoner id (`id`)")) {
      return NextResponse.json(
        {
          error:
            "Your Riot API key is not returning the encrypted summoner `id` needed for ranked stats. Register your product on the Riot Developer Portal to obtain proper League API access (development keys can be limited).",
          details: message,
        },
        { status: 403 }
      );
    }

    const status = message.includes("Missing RIOT_API_KEY") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

