export type Role = "client" | "provider" | "admin";

export type Membership = {
  organizationId: string;
  organizationName: string;
  organizationKind: "SHIPPER" | "PROVIDER" | "PLATFORM";
  organizationProfileType: "BUSINESS" | "PERSONAL";
  role: "OWNER" | "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER";
};

export type Session = {
  user: { id: string; email: string; displayName: string };
  memberships: Membership[];
  membership: Membership | null;
  pendingInvitations: Array<{ id: string; organizationId: string; organizationName: string; organizationKind: Membership["organizationKind"]; role: Membership["role"]; expiresAt: string }>;
};

export type QuoteBreakdown = {
  baseAmount: number;
  weightAmount: number;
  volumeAmount: number;
  fuelAmount: number;
  handlingAmount: number;
  price: number;
};

export type Quote = {
  id: string;
  requestId: string;
  provider: string;
  providerCode: string;
  price: number;
  currency: string;
  transitDays: number;
  mode: string;
  rating: number;
  origin: string;
  destination: string;
  loadType: string;
  units: number;
  weightKg: number;
  volumeCbm: number;
  readyDate: string;
  expiresAt: string;
  pricingSnapshot: string;
  isDemo: number;
  cargoItems: CargoItem[];
  pickupAddress: string; deliveryAddress: string; contactName: string; contactPhone: string;
  cargoDescription: string; incoterm: string; specialRequirements: string;
};

export type CargoItem = { quantity: number; lengthCm: number; widthCm: number; heightCm: number; weightKg: number };

export type QuoteRequest = {
  id: string;
  origin: string;
  destination: string;
  loadType: string;
  mode: string;
  units: number;
  weightKg: number;
  volumeCbm: number;
  readyDate: string;
  status: string;
  quoteCount: number;
  cargoItems: CargoItem[];
  pickupAddress: string; deliveryAddress: string; contactName: string; contactPhone: string;
  cargoDescription: string; incoterm: string; specialRequirements: string;
};

export type Shipment = {
  id: string;
  reference: string;
  provider: string;
  shipper: string;
  origin: string;
  destination: string;
  status: string;
  statusLabel: string;
  price: number;
  currency: string;
  eta: string;
  etaAt: string;
  pickupAt?: string;
  vehicle?: string;
  driver?: string;
  actualPickupAt?: string;
  deliveredAt?: string;
  podReference?: string;
  podDocumentId?: string;
  podFileName?: string;
  invoiceNumber?: string;
  paymentStatus: "PENDING" | "INVOICED" | "PAID";
  updatedAt: string;
  version: number;
  loadType: string;
  mode: string;
  units: number;
  weightKg: number;
  volumeCbm: number;
  readyDate: string;
  pricingSnapshot: string;
  rateVersion: number;
  cargoItems: CargoItem[];
  pickupAddress: string; deliveryAddress: string; contactName: string; contactPhone: string;
  cargoDescription: string; incoterm: string; specialRequirements: string;
};

export type Milestone = {
  id: string;
  shipmentId: string;
  status: string;
  note: string;
  actorName: string;
  actorOrganization: string;
  createdAt: string;
};

export type Rate = {
  id: string;
  provider: string;
  origin: string;
  destination: string;
  mode: string;
  version: number;
  basePrice: number;
  perKg: number;
  perCbm: number;
  fuelPercent: number;
  handlingFee: number;
  minimumCharge: number;
  currency: string;
  transitDays: number;
  effectiveFrom: string;
  validUntil: string;
};

export type DashboardState = {
  quoteRequests: QuoteRequest[];
  quotes: Quote[];
  shipments: Shipment[];
  rates: Rate[];
  milestones: Milestone[];
  metrics: { openRequests: number; activeShipments: number; monthlyGmv: number; providers: number };
};

export type ApiCall = <T>(path: string, method?: "GET" | "POST" | "PATCH", payload?: unknown) => Promise<T>;

export const emptyDashboard: DashboardState = {
  quoteRequests: [], quotes: [], shipments: [], rates: [], milestones: [],
  metrics: { openRequests: 0, activeShipments: 0, monthlyGmv: 0, providers: 0 },
};

export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  return `${count} ${mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many}`;
}

export function roleLabel(role: Membership["role"]) {
  return ({ OWNER: "Владелец", ADMIN: "Администратор", OPERATIONS: "Операции", FINANCE: "Финансы", VIEWER: "Наблюдатель" })[role];
}

export function statusClass(status: string) {
  if (["IN_TRANSIT", "CUSTOMS", "DELIVERED", "CLOSED"].includes(status)) return "status-chip transit";
  if (["BOOKING_VERIFICATION", "SENT_TO_PROVIDER"].includes(status)) return "status-chip pending";
  if (status === "CANCELLED") return "status-chip danger";
  return "status-chip";
}
