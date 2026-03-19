import { NextResponse } from "next/server";
import { getRoutingGroupForPlatform, isSupportedPlatform } from "@/lib/riot/platformRouting";
import { getPuuidByRiotId } from "@/lib/riot/account";
import { riotFetch } from "@/lib/riot/client";

export const runtime = "nodejs";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: Request) {
  try {
    const apiKey = process.env.RIOT_API_KEY ?? "";
    const keyFingerprint = apiKey.length > 0 ? (await sha256Hex(apiKey)).slice(0, 12) : null;

    const url = new URL(request.url);
    let region = url.searchParams.get("region");
    let gameName = url.searchParams.get("gameName");
    let tagLine = url.searchParams.get("tagLine");

    // Some browsers/copy-paste flows can accidentally double-encode the query string,
    // turning `?region=LA1&gameName=Omni Man&tagLine=KG54`
    // into something like `?region%3DLA1%26gameName%3DOmni+Man%26tagLine%3DKG54=`.
    // If we detect that, decode and re-parse.
    if (!region || !gameName || !tagLine) {
      const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
      if (raw.includes("%3D") && raw.includes("%26")) {
        try {
          const decoded = decodeURIComponent(raw);
          const decodedParams = new URLSearchParams(decoded);
          region = decodedParams.get("region");
          gameName = decodedParams.get("gameName");
          tagLine = decodedParams.get("tagLine");
        } catch {
          // ignore; fall back to original values
        }
      }
    }

    const sanitize = (v: string | null) => (v ? v.trim().replace(/=+$/, "") : v);
    region = sanitize(region);
    gameName = sanitize(gameName);
    tagLine = sanitize(tagLine);

    if (!region || !gameName || !tagLine) {
      const received = { region, gameName, tagLine };
      return NextResponse.json(
        {
          error: "Missing required query params: region, gameName, tagLine.",
          received,
          // Helps debug double-encoded URLs (e.g. `region%3D...` instead of `region=...`).
          rawQuery: url.search,
        },
        { status: 400 }
      );
    }

    if (!isSupportedPlatform(region)) {
      return NextResponse.json({ error: "Unsupported region/server." }, { status: 400 });
    }

    const routingGroup = getRoutingGroupForPlatform(region);
    if (!routingGroup) {
      return NextResponse.json({ error: "Could not resolve routing group for region." }, { status: 400 });
    }

    // 1) Riot ID -> puuid
    const account = await getPuuidByRiotId({
      routingGroup,
      gameName: gameName.trim(),
      tagLine: tagLine.trim(),
    });

    // 2) puuid -> summoner (encrypted summoner id should be `id`)
    const platformLower = region.toLowerCase();
    const rawSummoner = await riotFetch<any>({
      baseUrl: `https://${platformLower}.api.riotgames.com`,
      path: `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(account.puuid)}`,
    });

    return NextResponse.json({
      routingGroup,
      platform: region,
      puuid: account.puuid,
      keyFingerprint,
      summonerKeys: rawSummoner && typeof rawSummoner === "object" ? Object.keys(rawSummoner) : [],
      summoner: {
        idPresent: Boolean(rawSummoner?.id),
        accountIdPresent: Boolean(rawSummoner?.accountId),
        namePresent: Boolean(rawSummoner?.name),
        // Avoid dumping full payload; keys are enough for access debugging.
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

