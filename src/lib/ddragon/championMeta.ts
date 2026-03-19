import fs from "node:fs/promises";
import path from "node:path";

export type ChampionMeta = {
  name: string;
  imageUrl: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDataDir() {
  return path.join(process.cwd(), "data");
}

function getCachePath(locale: string) {
  return path.join(getDataDir(), "ddragon", `champions.${locale}.json`);
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

let inMemoryCache: {
  locale: string;
  fetchedAt: number;
  championsById: Record<string, ChampionMeta>;
} | null = null;

export async function getChampionMeta(locale: string): Promise<Record<number, ChampionMeta>> {
  const effectiveLocale = locale || "en_US";

  if (
    inMemoryCache &&
    inMemoryCache.locale === effectiveLocale &&
    Date.now() - inMemoryCache.fetchedAt < 7 * ONE_DAY_MS
  ) {
    return Object.fromEntries(Object.entries(inMemoryCache.championsById).map(([k, v]) => [Number(k), v]));
  }

  const cachePath = getCachePath(effectiveLocale);
  if (await fileExists(cachePath)) {
    try {
      const raw = await fs.readFile(cachePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        fetchedAt: number;
        championsById: Record<string, ChampionMeta>;
      };
      if (Date.now() - parsed.fetchedAt < 7 * ONE_DAY_MS) {
        inMemoryCache = { locale: effectiveLocale, fetchedAt: parsed.fetchedAt, championsById: parsed.championsById };
        return Object.fromEntries(Object.entries(parsed.championsById).map(([k, v]) => [Number(k), v]));
      }
    } catch {
      // If cache is corrupted, fall through and rebuild.
    }
  }

  // Build meta from Data Dragon.
  const localePart = effectiveLocale;
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json() as Promise<
    string[]
  >);
  const version = versions[0];

  const championFull = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/${localePart}/championFull.json`
  ).then((r) => r.json()) as any;

  const championsById: Record<string, ChampionMeta> = {};
  for (const champKey of Object.keys(championFull.data ?? {})) {
    const champ = championFull.data[champKey];
    const id = Number(champ.key);
    championsById[String(id)] = {
      name: champ.name as string,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.image.full as string}`,
    };
  }

  // Persist cache for faster dev iterations.
  try {
    const cacheDir = path.dirname(cachePath);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), championsById }), "utf-8");
  } catch {
    // Non-fatal: caching is a performance optimization.
  }

  inMemoryCache = { locale: effectiveLocale, fetchedAt: Date.now(), championsById };

  return Object.fromEntries(Object.entries(championsById).map(([k, v]) => [Number(k), v]));
}

