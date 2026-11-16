export const shipmentTransitions = {
  BOOKING_VERIFICATION: ["SENT_TO_PROVIDER", "CANCELLED"],
  SENT_TO_PROVIDER: ["PROVIDER_ACCEPTED", "CANCELLED"],
  PROVIDER_ACCEPTED: ["PICKUP_SCHEDULED", "CANCELLED"],
  PICKUP_SCHEDULED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["CUSTOMS", "DELIVERED"],
  CUSTOMS: ["IN_TRANSIT", "DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
} as const;

export type ShipmentStatus = keyof typeof shipmentTransitions;

export function isShipmentStatus(value: string): value is ShipmentStatus {
  return Object.hasOwn(shipmentTransitions, value);
}

export function canTransitionShipment(from: string, to: string) {
  return isShipmentStatus(from) && isShipmentStatus(to)
    && (shipmentTransitions[from] as readonly string[]).includes(to);
}

export function canActorSetStatus(kind: string, target: ShipmentStatus) {
  if (kind === "PLATFORM") return true;
  if (kind === "SHIPPER") return target === "CANCELLED" || target === "CLOSED";
  return kind === "PROVIDER" && target !== "CLOSED";
}
