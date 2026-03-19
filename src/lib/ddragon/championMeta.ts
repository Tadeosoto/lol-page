export type ChampionMeta = {
  name: string;
  imageUrl: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

  inMemoryCache = { locale: effectiveLocale, fetchedAt: Date.now(), championsById };

  return Object.fromEntries(Object.entries(championsById).map(([k, v]) => [Number(k), v]));
}

