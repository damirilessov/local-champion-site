import type { RateForPricing } from "./pricing";

export type DemoRate = RateForPricing & {
  providerId: string;
  mode: string;
  effectiveFrom: string;
  validUntil: string;
};

const providers = [
  { id: "org-demo-express", multiplier: 1.08, days: -1 },
  { id: "org-demo-silk", multiplier: 0.96, days: 1 },
  { id: "org-demo-global", multiplier: 1, days: 0 },
];

const modeRates: Record<string, Omit<RateForPricing, "id" | "version">> = {
  "Авто": { basePrice: 520, perKg: 0.22, perCbm: 28, fuelPercent: 6, handlingFee: 40, minimumCharge: 720, currency: "USD", transitDays: 9 },
  "Ж/д": { basePrice: 680, perKg: 0.14, perCbm: 23, fuelPercent: 4, handlingFee: 55, minimumCharge: 900, currency: "USD", transitDays: 14 },
  "Авиа": { basePrice: 190, perKg: 1.18, perCbm: 145, fuelPercent: 8, handlingFee: 35, minimumCharge: 480, currency: "USD", transitDays: 3 },
  "Море": { basePrice: 760, perKg: 0.09, perCbm: 19, fuelPercent: 5, handlingFee: 85, minimumCharge: 1_050, currency: "USD", transitDays: 27 },
};

export function demoRatesForLane(origin: string, destination: string, requestedMode: string): DemoRate[] {
  const combinations = requestedMode === "Любой"
    ? [
        [0, "Авиа"], [1, "Ж/д"], [2, "Море"],
        [0, "Авто"], [1, "Авто"], [2, "Авиа"],
      ] as const
    : providers.map((_, index) => [index, requestedMode] as const);
  const laneFactor = 0.9 + (hash(`${origin}|${destination}`) % 31) / 100;
  return combinations.map(([providerIndex, mode]) => {
    const provider = providers[providerIndex];
    const base = modeRates[mode] ?? modeRates["Авто"];
    const factor = laneFactor * provider.multiplier;
    const key = `${provider.id}|${origin}|${destination}|${mode}`;
    return {
      id: `demo-rate-${hash(key).toString(36)}`,
      providerId: provider.id,
      mode,
      version: 1,
      basePrice: round(base.basePrice * factor),
      perKg: round(base.perKg * factor),
      perCbm: round(base.perCbm * factor),
      fuelPercent: base.fuelPercent,
      handlingFee: round(base.handlingFee * factor),
      minimumCharge: round(base.minimumCharge * factor),
      currency: base.currency,
      transitDays: Math.max(1, base.transitDays + provider.days + (hash(key) % 3)),
      effectiveFrom: "2020-01-01T00:00:00.000Z",
      validUntil: "2099-12-31T00:00:00.000Z",
    };
  });
}

function hash(value: string) {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function round(value: number) { return Math.round(value * 100) / 100; }
