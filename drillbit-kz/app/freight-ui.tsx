"use client";

import { useEffect, useRef } from "react";
import type { Milestone, Quote, QuoteBreakdown, Shipment } from "./freight-types";
import { formatDate, money, statusClass } from "./freight-types";

export function Dialog({ title, children, onClose, actions }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, [href]")?.focus(), 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.clearTimeout(timer); window.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="dialog-body">{children}</div>
        {actions && <footer className="dialog-actions">{actions}</footer>}
      </section>
    </div>
  );
}

export function EmptyState({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><p>{copy}</p>{action}</div>;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner" role="alert"><span>{message}</span>{onRetry && <button type="button" onClick={onRetry}>Повторить</button>}</div>;
}

export function LoadingBlock({ label = "Загружаем данные…" }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite">{label}</div>;
}

export function QuoteCost({ quote }: { quote: Quote }) {
  let breakdown: QuoteBreakdown | null = null;
  try {
    breakdown = (JSON.parse(quote.pricingSnapshot) as { breakdown?: QuoteBreakdown }).breakdown ?? null;
  } catch { /* A legacy quote may have only a total. */ }
  return (
    <div className="cost-breakdown">
      {breakdown ? <>
        <CostLine label="Базовая ставка" value={breakdown.baseAmount} currency={quote.currency} />
        <CostLine label={`Вес · ${quote.weightKg} кг`} value={breakdown.weightAmount} currency={quote.currency} />
        <CostLine label={`Объём · ${quote.volumeCbm} м³`} value={breakdown.volumeAmount} currency={quote.currency} />
        <CostLine label="Топливная надбавка" value={breakdown.fuelAmount} currency={quote.currency} />
        <CostLine label="Обработка" value={breakdown.handlingAmount} currency={quote.currency} />
      </> : <p>Для архивного предложения доступна только итоговая сумма.</p>}
      <CostLine label="Итого" value={quote.price} currency={quote.currency} total />
    </div>
  );
}

function CostLine({ label, value, currency, total = false }: { label: string; value: number; currency: string; total?: boolean }) {
  return <div className={total ? "cost-line total" : "cost-line"}><span>{label}</span><strong>{money(value, currency)}</strong></div>;
}

export function ShipmentDetail({ shipment, milestones }: { shipment: Shipment; milestones: Milestone[] }) {
  return (
    <div className="shipment-detail">
      <div className="detail-summary">
        <div><span>Маршрут</span><strong>{shipment.origin} → {shipment.destination}</strong></div>
        <div><span>Статус</span><strong className={statusClass(shipment.status)}>{shipment.statusLabel}</strong></div>
        <div><span>Клиент</span><strong>{shipment.shipper}</strong></div>
        <div><span>Логист</span><strong>{shipment.provider}</strong></div>
        <div><span>Груз</span><strong>{shipment.cargoDescription} · {shipment.loadType} · {shipment.units} мест · {shipment.weightKg} кг · {shipment.volumeCbm} м³</strong></div>
        {shipment.cargoItems?.length > 0 && <div><span>Габариты мест</span><strong>{shipment.cargoItems.map((item) => `${item.quantity} × ${item.lengthCm}×${item.widthCm}×${item.heightCm} см, ${item.weightKg} кг`).join("; ")}</strong></div>}
        <div><span>Готовность</span><strong>{formatDate(shipment.readyDate)}</strong></div>
        <div><span>Забор</span><strong>{shipment.pickupAddress}</strong></div>
        <div><span>Доставка</span><strong>{shipment.deliveryAddress}</strong></div>
        <div><span>Контакт</span><strong>{shipment.contactName} · {shipment.contactPhone}</strong></div>
        <div><span>Условия</span><strong>{shipment.incoterm}{shipment.specialRequirements ? ` · ${shipment.specialRequirements}` : ""}</strong></div>
        <div><span>Стоимость</span><strong>{money(shipment.price, shipment.currency)}</strong></div>
        <div><span>Оплата</span><strong>{shipment.paymentStatus === "PAID" ? "Оплачено" : shipment.paymentStatus === "INVOICED" ? `Счёт ${shipment.invoiceNumber ?? "выставлен"}` : "Счёт ещё не выставлен"}</strong></div>
        <div><span>Расчётная доставка</span><strong>{shipment.eta}</strong></div>
        {shipment.pickupAt && <div><span>Назначенный забор</span><strong>{formatDate(shipment.pickupAt, true)} · {shipment.vehicle}{shipment.driver ? ` · ${shipment.driver}` : ""}</strong></div>}
        {shipment.actualPickupAt && <div><span>Фактический забор</span><strong>{formatDate(shipment.actualPickupAt, true)}</strong></div>}
        {shipment.deliveredAt && <div><span>Доставка</span><strong>{formatDate(shipment.deliveredAt, true)} · POD {shipment.podReference}{shipment.podDocumentId ? <> · <a href={`/api/shipment-documents?id=${encodeURIComponent(shipment.podDocumentId)}`}>скачать {shipment.podFileName ?? "файл"}</a></> : ""}</strong></div>}
      </div>
      <h3>Зафиксированная стоимость · тариф v{shipment.rateVersion}</h3>
      <SnapshotCost snapshot={shipment.pricingSnapshot} total={shipment.price} currency={shipment.currency} />
      <h3>История перевозки</h3>
      {milestones.length ? <ol className="timeline">
        {milestones.map((milestone) => <li key={milestone.id}>
          <span className="timeline-dot" />
          <div><strong>{statusName(milestone.status)}</strong><p>{milestone.note}</p><small>{formatDate(milestone.createdAt, true)} · {milestone.actorName}, {milestone.actorOrganization}</small></div>
        </li>)}
      </ol> : <EmptyState title="История пока пуста" copy="Первое событие появится после обновления статуса." />}
    </div>
  );
}

function SnapshotCost({ snapshot, total, currency }: { snapshot: string; total: number; currency: string }) {
  let breakdown: QuoteBreakdown | null = null;
  try { breakdown = (JSON.parse(snapshot) as { breakdown?: QuoteBreakdown }).breakdown ?? null; } catch { /* Legacy shipment. */ }
  if (!breakdown) return <div className="cost-breakdown"><p>Для архивного заказа доступна только итоговая сумма.</p><CostLine label="Итого" value={total} currency={currency} total /></div>;
  return <div className="cost-breakdown"><CostLine label="Базовая ставка" value={breakdown.baseAmount} currency={currency} /><CostLine label="Вес" value={breakdown.weightAmount} currency={currency} /><CostLine label="Объём" value={breakdown.volumeAmount} currency={currency} /><CostLine label="Топливная надбавка" value={breakdown.fuelAmount} currency={currency} /><CostLine label="Обработка" value={breakdown.handlingAmount} currency={currency} /><CostLine label="Итого" value={total} currency={currency} total /></div>;
}

export function statusName(status: string) {
  return ({
    BOOKING_VERIFICATION: "Проверка бронирования", SENT_TO_PROVIDER: "Новый заказ",
    PROVIDER_ACCEPTED: "Принято логистом", PICKUP_SCHEDULED: "Забор назначен",
    IN_TRANSIT: "В пути", CUSTOMS: "На таможне", DELIVERED: "Доставлено",
    CLOSED: "Закрыто", CANCELLED: "Отменено",
  } as Record<string, string>)[status] ?? status;
}
