import { env } from "cloudflare:workers";

export async function getRuntimeDb() {
  const db = env.DB;
  if (!db) throw new Error("Хранилище данных временно недоступно");
  return db;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    BOOKING_VERIFICATION: "На проверке",
    SENT_TO_PROVIDER: "Новый заказ",
    PROVIDER_ACCEPTED: "Подтверждено",
    PICKUP_SCHEDULED: "Забор назначен",
    IN_TRANSIT: "В пути",
    CUSTOMS: "На таможне",
    DELIVERED: "Доставлено",
    CLOSED: "Закрыто",
    CANCELLED: "Отменено",
  };
  return labels[status] ?? status;
}

export function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}
