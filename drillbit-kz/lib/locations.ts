const canonicalLocations = [
  "Алматы, KZ", "Астана, KZ", "Шымкент, KZ", "Актау, KZ", "Атырау, KZ",
  "Шэньчжэнь, CN", "Гуанчжоу, CN", "Шанхай, CN", "Пекин, CN",
  "Стамбул, TR", "Ташкент, UZ", "Бишкек, KG", "Москва, RU",
];

const locationAliases = new Map<string, string>();
for (const location of canonicalLocations) {
  const [city] = location.split(",");
  locationAliases.set(normalizeKey(location), location);
  locationAliases.set(normalizeKey(city), location);
}

export const locationOptions = canonicalLocations;

export function canonicalizeLocation(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return locationAliases.get(normalizeKey(cleaned)) ?? cleaned;
}

export function isSupportedLocation(value: string) {
  return canonicalLocations.includes(canonicalizeLocation(value));
}

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}
