"use client";

import { useEffect, useMemo, useState } from "react";

type HistoryMode = "recent_solo" | "all_solo" | "recent_flex" | "all_flex";

type ChampionWin = {
  championId: number;
  name?: string;
  imageUrl?: string;
  winRate: number; // 0..1
  wins: number;
  losses: number;
  games: number;
};

type PersonalCounter = {
  championId: number;
  name?: string;
  imageUrl?: string;
  lossesAgainst: number;
};

type PlayerStatsResponse = {
  summoner: {
    gameName: string;
    tagLine: string;
    region: string;
    puuid: string;
  };
  rank: {
    tier: string;
    division: string; // e.g. "IV"
    queueType: string;
    rankKey: string; // e.g. "SILVER_IV"
  };
  history: {
    mode: HistoryMode;
    requestedMatches: number;
    usedRankedMatches: number;
    capped: boolean;
  };
  playerTopChampions: ChampionWin[]; // top 5 by win rate (player-based)
  personalCounter: PersonalCounter;
  playerNemesisTop3Champions: ChampionWin[]; // pyramid (#1..#3) qualified by >=5 games
  playerNemesisTop5Champions: ChampionWin[]; // list top 5 qualified by >=3 games
};

const REGION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "NA1", label: "NA (NA1)" },
  { value: "EUW1", label: "EU West (EUW1)" },
  { value: "EUN1", label: "EU North & East (EUN1)" },
  { value: "KR", label: "Korea (KR)" },
  { value: "JP1", label: "Japan (JP1)" },
  { value: "BR1", label: "Brazil (BR1)" },
  { value: "LA1", label: "Latin America North (LA1)" },
  { value: "LA2", label: "Latin America South (LA2)" },
  { value: "OC1", label: "Oceania (OC1)" },
  { value: "TR1", label: "Turkey (TR1)" },
  { value: "RU1", label: "Russia (RU1)" },
  { value: "ME1", label: "Middle East (ME1)" },
  { value: "SG2", label: "Singapore (SG2)" },
];

function formatPct(x: number) {
  return `${Math.round(x * 1000) / 10}%`;
}

function formatLossPct(winRate: number) {
  const lossRate = Math.max(0, Math.min(1, 1 - winRate));
  return `${Math.round(lossRate * 1000) / 10}%`;
}

function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const cleaned = input.trim();
  const idx = cleaned.lastIndexOf("#");
  if (idx <= 0 || idx >= cleaned.length - 1) return null;
  return {
    gameName: cleaned.slice(0, idx).trim(),
    tagLine: cleaned.slice(idx + 1).trim(),
  };
}

export default function Home() {
  const [riotIdInput, setRiotIdInput] = useState("");
  const [region, setRegion] = useState("NA1");
  const [historyMode, setHistoryMode] = useState<HistoryMode>("recent_solo");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerStatsResponse | null>(null);

  const parsedRiotId = useMemo(() => parseRiotId(riotIdInput), [riotIdInput]);

  // Lightweight Riot ID autocomplete by remembering successful queries (per browser).
  const [riotIdHistory, setRiotIdHistory] = useState<string[]>([]);
  const RIOT_ID_HISTORY_KEY = "lolpage_riotId_history_v1";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RIOT_ID_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const values = parsed.filter((x) => typeof x === "string") as string[];
      setRiotIdHistory(values.slice(0, 10));
    } catch {
      // Non-fatal: history is a UX enhancement.
    }
  }, []);

  function saveRiotIdToHistory(value: string) {
    const normalized = value.trim();
    if (!normalized) return;

    setRiotIdHistory((prev) => {
      const lower = normalized.toLowerCase();
      const filtered = prev.filter((v) => v.toLowerCase() !== lower);
      const next = [normalized, ...filtered].slice(0, 10);
      try {
        window.localStorage.setItem(RIOT_ID_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }
  const canSubmit = useMemo(() => {
    return Boolean(parsedRiotId) && region.trim().length > 0;
  }, [parsedRiotId, region]);

  const topThree = data?.playerNemesisTop3Champions?.slice(0, 3) ?? [];
  const c1 = topThree[0];
  const c2 = topThree[1];
  const c3 = topThree[2];

  function getQueueLabel(mode: HistoryMode) {
    switch (mode) {
      case "recent_solo":
        return "Recent SoloQ Games";
      case "all_solo":
        return "All SoloQ Games";
      case "recent_flex":
        return "Recent FlexQ Games";
      case "all_flex":
        return "All FlexQ Games";
      default:
        return String(mode);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const parsed = parsedRiotId;
    if (!parsed) return;

    setLoading(true);
    setError(null);
    setData(null);

    let timeoutId: number | undefined;
    try {
      // Riot API calls can be slow; avoid leaving the UI stuck in `loading` forever.
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 25000);

      const url = new URL("/api/player-stats", window.location.origin);
      url.searchParams.set("region", region);
      url.searchParams.set("gameName", parsed.gameName);
      url.searchParams.set("tagLine", parsed.tagLine);
      url.searchParams.set("historyMode", historyMode);

      const res = await fetch(url.toString(), { method: "GET", signal: controller.signal });
      const json = (await res.json()) as { error?: string } & Partial<PlayerStatsResponse>;
      if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setData(json as PlayerStatsResponse);
      // Save the Riot ID that produced results to make subsequent usage easier.
      saveRiotIdToHistory(`${parsed.gameName}#${parsed.tagLine}`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out. Try again (or switch to a “Recent … Games” queue option).");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-yellow-400/20 bg-yellow-400/10 text-yellow-200 font-black">
              LoL
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-wide text-white">League Of Legends Stats</div>
              <div className="text-xs text-slate-300">Win-rate + Counter Finder</div>
            </div>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            {["Home", "Leaderboards", "Insights"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm font-semibold text-slate-200 hover:text-white"
                onClick={(e) => e.preventDefault()}
              >
                {item}
              </a>
            ))}
            <div className="text-sm font-semibold text-slate-200">Premium ▾</div>
            <div className="text-sm font-semibold text-slate-200">OBS Overlay</div>
          </div>

          <button
            type="button"
            className="hidden rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 lg:inline-flex items-center gap-2"
            onClick={() => {
              // Placeholder for future navigation.
              window.alert("Premium/Apps section coming soon.");
            }}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10">▣</span>
            Get the Apps
          </button>
        </div>
      </nav>

      <main className="relative overflow-hidden">
        {/* Swap this URL with your own LoL-themed background when you have an asset */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1520974735194-6f0b9c2e9b6b?auto=format&fit=crop&w=1600&q=60')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-slate-950/95" />

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <section>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/10 text-yellow-200 font-black">
                  L
                </div>
                <div className="text-sm font-bold text-white">LEAGUE OF LEGENDS STATS</div>
              </div>
              <div className="mt-2 text-slate-300">Check Detailed League of Legends Stats and Leaderboards</div>

              <form
                onSubmit={onSubmit}
                className="mt-7 rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-xl"
              >
                <label className="block text-sm font-semibold text-slate-200">Riot ID</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="w-full rounded-xl bg-white/95 px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-red-400/60"
                    value={riotIdInput}
                    placeholder="Enter Riot ID, ie player#NA1"
                    onChange={(e) => setRiotIdInput(e.target.value)}
                    autoComplete="off"
                    list="riot-id-history"
                    spellCheck={false}
                  />
                </div>
                <datalist id="riot-id-history">
                  {riotIdHistory.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full sm:w-[210px]">
                    <label className="block text-xs font-semibold text-slate-300">Server</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-white outline-none focus:border-cyan-400/50"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    >
                      {REGION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-full sm:w-[210px]">
                    <label className="block text-xs font-semibold text-slate-300">Queue</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-white outline-none focus:border-indigo-400/50"
                      value={historyMode}
                      onChange={(e) => setHistoryMode(e.target.value as HistoryMode)}
                    >
                      <option value="recent_solo">Recent SoloQ Games</option>
                      <option value="all_solo">All SoloQ Games</option>
                      <option value="recent_flex">Recent FlexQ Games</option>
                      <option value="all_flex">All FlexQ Games</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className="mt-4 w-full rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white shadow-lg disabled:opacity-60 hover:bg-red-500 transition-colors"
                >
                  {loading ? "Loading..." : "Submit"}
                </button>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  {error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {error}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-300">
                      {parsedRiotId ? (
                        <span>
                          Detected: <span className="font-bold text-white">{parsedRiotId.gameName}</span>
                          <span className="text-slate-400">#{parsedRiotId.tagLine}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Use format: GameName#TAGLINE</span>
                      )}
                    </div>
                  )}

                  {!error && (
                    <div className="text-xs text-slate-400">
                      Nemesis stats are computed from your selected queue/range matches.
                    </div>
                  )}
                </div>
              </form>
            </section>

            <aside>
              <div className="flex flex-col items-center gap-3">
                {/* #1 (top of the pyramid) */}
                <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                  <div className="absolute right-4 top-4 rounded-xl bg-yellow-400/90 px-3 py-1 text-xs font-extrabold text-slate-950">
                    #1
                  </div>

                  <div className="flex min-h-[180px] flex-col items-center justify-center pt-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/10">
                      {c1?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c1.imageUrl}
                          alt={c1.name ?? `${c1.championId}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-sm font-bold text-white/70">{c1 ? c1.championId : "?"}</div>
                      )}
                    </div>

                    <div className="mt-4 text-center">
                      <div className="truncate text-base font-extrabold text-white">
                        {c1?.name ?? (data ? `#${c1?.championId ?? ""}` : "Waiting stats")}
                      </div>
                      {c1 ? (
                        <>
                          <div className="mt-1 text-xs font-semibold text-slate-300">
                            You lose <span className="text-red-300 font-extrabold">{formatLossPct(c1.winRate)}</span> of your games
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {c1.games} games • <span className="text-red-300 font-extrabold">{c1.losses}</span> losses
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-xs font-extrabold text-white/70">
                          {!data
                            ? "Waiting stats"
                            : data.history.mode.startsWith("recent_")
                              ? "Not enough recent matches yet"
                              : "Need ≥ 5 games to rank top 3"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* #2 and #3 (bottom row) */}
                <div className="flex w-full max-w-[320px] items-start justify-between gap-3">
                  {[c2, c3].map((c, idx) => {
                    const rank = idx + 2; // 2 or 3
                    return (
                      <div
                        key={c?.championId ?? `placeholder-${rank}`}
                        className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-3"
                      >
                        <div className="absolute right-3 top-3 rounded-xl bg-yellow-400/90 px-2 py-1 text-[11px] font-extrabold text-slate-950">
                          #{rank}
                        </div>

                        <div className="flex min-h-[150px] flex-col items-center justify-center pt-4">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/10">
                            {c?.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.imageUrl}
                                alt={c.name ?? `${c.championId}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="text-sm font-bold text-white/70">{c ? c.championId : "?"}</div>
                            )}
                          </div>

                          <div className="mt-3 text-center">
                            <div className="truncate text-sm font-extrabold text-white">
                              {c?.name ?? (data ? `#${c?.championId ?? ""}` : "Waiting stats")}
                            </div>
                            {c ? (
                              <>
                                <div className="mt-1 text-[11px] font-semibold text-slate-300">
                                  You lose <span className="text-red-300 font-extrabold">{formatLossPct(c.winRate)}</span> of your games
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400">
                                  {c.games} games • <span className="text-red-300 font-extrabold">{c.losses}</span> losses
                                </div>
                              </>
                            ) : (
                              <div className="mt-1 text-[11px] font-extrabold text-white/70">
                                {!data
                                  ? "Waiting stats"
                                  : data.history.mode.startsWith("recent_")
                                    ? "Not enough recent matches yet"
                                    : "Need ≥ 5 games to rank top 3"}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {data && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                  <div className="text-xs font-semibold text-slate-300">Your rank</div>
                  <div className="mt-1 text-2xl font-extrabold text-white">
                    {data.rank.tier} {data.rank.division}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{data.rank.queueType}</div>
                </div>
              )}
            </aside>
          </div>

          {data && (
            <section className="mt-10 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm text-slate-300">Profile</div>
                    <div className="mt-1 text-lg font-extrabold text-white">
                      {data.summoner.gameName}#{data.summoner.tagLine}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">Server: {data.summoner.region}</div>
                  </div>
                  <div className="text-sm text-slate-300">
                    {getQueueLabel(data.history.mode)} • Used {data.history.usedRankedMatches} ranked games
                    {data.history.capped ? " (capped)" : ""}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
                  <h2 className="text-lg font-extrabold text-white">Your best win-rate champs</h2>
                  <p className="mt-1 text-sm text-slate-400">Based on your ranked games (player-based).</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {data.playerTopChampions.map((c) => (
                      <div key={c.championId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center gap-3">
                          {c.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.imageUrl} alt={c.name ?? `${c.championId}`} className="h-12 w-12 rounded-lg bg-slate-900 object-cover" />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white/80">
                              {c.championId}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-white">{c.name ?? `#${c.championId}`}</div>
                            <div className="text-xs text-slate-300">{formatPct(c.winRate)} win</div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {c.wins}W / {c.losses}L
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
                  <h2 className="text-lg font-extrabold text-white">Your biggest personal counter</h2>
                  <p className="mt-1 text-sm text-slate-400">Enemy champion you lose to the most (from your losses).</p>
                  <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    {data.personalCounter.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.personalCounter.imageUrl}
                        alt={data.personalCounter.name ?? `${data.personalCounter.championId}`}
                        className="h-16 w-16 rounded-xl bg-slate-900 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white/70">
                        {data.personalCounter.championId}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-xl font-extrabold text-white">
                        {data.personalCounter.name ?? `#${data.personalCounter.championId}`}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">{data.personalCounter.lossesAgainst} losses</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-extrabold text-white">Win rate vs your nemesis</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Top enemy champions you lose to the most (based on your selected queue/range).
                    </p>
                  </div>
                  <div className="text-xs font-semibold text-yellow-300">Sorted by most frequent losses</div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {data.playerNemesisTop5Champions.map((c, idx) => (
                    <div
                      key={c.championId}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 relative"
                    >
                      <div className="absolute right-3 top-3 rounded-xl bg-yellow-400/90 px-2 py-1 text-[11px] font-extrabold text-slate-950">
                        #{idx + 1}
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imageUrl} alt={c.name ?? `${c.championId}`} className="h-12 w-12 rounded-lg bg-slate-900 object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white/80">
                            {c.championId}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">{c.name ?? `#${c.championId}`}</div>
                          <div className="text-xs text-slate-300">
                            You lose{" "}
                            <span className="text-red-300 font-extrabold">{formatLossPct(c.winRate)}</span> of your games
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {c.games} games • <span className="text-red-300 font-extrabold">{c.losses}</span> losses
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

