export const PLATFORM_TO_ROUTING_GROUP: Record<string, string> = {
  // Americas
  NA1: "americas",
  BR1: "americas",
  LA1: "americas",
  LA2: "americas",

  // Europe
  EUW1: "europe",
  EUN1: "europe",
  TR1: "europe",
  RU1: "europe",
  ME1: "europe",

  // Asia / APAC
  KR: "asia",
  JP1: "asia",
  OC1: "sea",
  SG2: "sea",
};

export function getRoutingGroupForPlatform(platform: string): string | null {
  return PLATFORM_TO_ROUTING_GROUP[platform] ?? null;
}

export function isSupportedPlatform(platform: string): boolean {
  return platform in PLATFORM_TO_ROUTING_GROUP;
}

