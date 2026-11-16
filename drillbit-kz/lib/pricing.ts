export type RateForPricing = {
  id: string;
  version: number;
  basePrice: number;
  perKg: number;
  perCbm: number;
  fuelPercent: number;
  handlingFee: number;
  minimumCharge: number;
  currency: string;
  transitDays: number;
};

export function calculateQuote(rate: RateForPricing, weightKg: number, volumeCbm: number, serviceDate?: string) {
  const baseAmount = cents(rate.basePrice);
  const weightAmount = cents(weightKg * rate.perKg);
  const volumeAmount = cents(volumeCbm * rate.perCbm);
  const fuelAmount = cents((baseAmount + weightAmount + volumeAmount) * rate.fuelPercent / 100);
  const handlingAmount = cents(rate.handlingFee);
  const calculated = cents(baseAmount + weightAmount + volumeAmount + fuelAmount + handlingAmount);
  const price = Math.max(calculated, cents(rate.minimumCharge));
  return {
    baseAmount,
    weightAmount,
    volumeAmount,
    fuelAmount,
    handlingAmount,
    price,
    snapshot: JSON.stringify({
      rateId: rate.id,
      rateVersion: rate.version,
      inputs: { weightKg, volumeCbm, serviceDate },
      formula: {
        basePrice: rate.basePrice,
        perKg: rate.perKg,
        perCbm: rate.perCbm,
        fuelPercent: rate.fuelPercent,
        handlingFee: rate.handlingFee,
        minimumCharge: rate.minimumCharge,
      },
      breakdown: { baseAmount, weightAmount, volumeAmount, fuelAmount, handlingAmount, price },
      currency: rate.currency,
    }),
  };
}

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
