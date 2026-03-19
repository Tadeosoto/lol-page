type RiotFetchArgs = {
  baseUrl: string; // e.g. https://na1.api.riotgames.com
  path: string; // e.g. /lol/summoner/v4/summoners/by-puuid/{puuid}
};

const RIOT_FETCH_CACHE_TTL_MS = 30_000;
const riotFetchCache = new Map<string, { expiresAt: number; value: unknown }>();

function getApiKey() {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RIOT_API_KEY. Create it in .env.local (not committed).");
  }
  return apiKey;
}

export async function riotFetch<T>({ baseUrl, path }: RiotFetchArgs): Promise<T> {
  const apiKey = getApiKey();

  const cacheKey = `${baseUrl}${path}`;
  const cached = riotFetchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "X-Riot-Token": apiKey,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    // Try to extract Riot's structured error message without breaking JSON parsing.
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const retryAfter = res.headers.get("Retry-After");

    let message = `Riot API error (${res.status})`;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          message?: string;
          error?: string;
          status?: { message?: string };
        };
        message =
          parsed?.message ||
          parsed?.status?.message ||
          parsed?.error ||
          message;
      } catch {
        // Not JSON; keep default message and include a snippet.
        message = `${message} - ${raw.slice(0, 200)}`;
      }
    }

    if (retryAfter) {
      message = `${message}. Retry-After: ${retryAfter}s`;
    }

    // Include endpoint info for faster debugging; do not include the API key.
    if (contentType.includes("application/json")) {
      throw new Error(`Riot API error (${res.status}) at ${path}: ${message}`);
    }
    throw new Error(`Riot API error (${res.status}) at ${path}: ${message}`);
  }

  const value = (await res.json()) as T;
  riotFetchCache.set(cacheKey, { expiresAt: Date.now() + RIOT_FETCH_CACHE_TTL_MS, value });
  return value;
}

