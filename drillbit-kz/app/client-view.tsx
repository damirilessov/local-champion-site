"use client";

import { FormEvent, useMemo, useState } from "react";
import { locationOptions } from "@/lib/locations";
import type { ApiCall, DashboardState, Quote, QuoteRequest, Shipment } from "./freight-types";
import { formatDate, money, plural, statusClass } from "./freight-types";
import { Dialog, EmptyState, LoadingBlock, QuoteCost, ShipmentDetail } from "./freight-ui";

type CargoDraft = { id: string; quantity: string; lengthCm: string; widthCm: string; heightCm: string; weightKg: string };
const emptyCargoItem = (id: string): CargoDraft => ({ id, quantity: "1", lengthCm: "", widthCm: "", heightCm: "", weightKg: "" });

export default function ClientView({ state, loading, canOperate, api, refresh, notify }: {
  state: DashboardState;
  loading: boolean;
  canOperate: boolean;
  api: ApiCall;
  refresh: () => Promise<boolean>;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const [form, setForm] = useState({
    origin: "", destination: "", loadType: "Коробки", mode: "Любой", readyDate: tomorrow(),
  });
  const [bookingDetails, setBookingDetails] = useState(emptyBookingDetails());
  const [cargoItems, setCargoItems] = useState<CargoDraft[]>([emptyCargoItem("cargo-initial")]);
  const [searching, setSearching] = useState(false);
  const [activeRequest, setActiveRequest] = useState<QuoteRequest | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [bookingQuoteId, setBookingQuoteId] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<{ reference: string; shipmentId: string } | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [cancelShipment, setCancelShipment] = useState<Shipment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const displayedRequest = activeRequest;
  const quotes = useMemo(() => displayedRequest
    ? state.quotes.filter((quote) => quote.requestId === displayedRequest.id).sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || a.price - b.price)
    : [], [displayedRequest, state.quotes]);
  const cargoTotals = useMemo(() => cargoItems.reduce((totals, item) => {
    const quantity = Number(item.quantity);
    const length = Number(item.lengthCm);
    const width = Number(item.widthCm);
    const height = Number(item.heightCm);
    const weight = Number(item.weightKg);
    if ([quantity, length, width, height, weight].every((value) => Number.isFinite(value) && value > 0)) {
      totals.units += quantity;
      totals.weight += quantity * weight;
      totals.volume += quantity * length * width * height / 1_000_000;
    }
    return totals;
  }, { units: 0, weight: 0, volume: 0 }), [cargoItems]);
  const nearestShipment = [...state.shipments]
    .filter((shipment) => !["CLOSED", "CANCELLED"].includes(shipment.status))
    .sort((a, b) => new Date(a.etaAt).getTime() - new Date(b.etaAt).getTime())[0];

  async function search(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setActiveRequest(null);
    setBookingSuccess(null);
    try {
      const result = await api<{ requestId: string; quoteCount: number }>("/api/quote-requests", "POST", {
        ...form, weight: cargoTotals.weight, volume: cargoTotals.volume, units: cargoTotals.units,
        cargoItems: cargoItems.map((item) => ({ quantity: Number(item.quantity), lengthCm: Number(item.lengthCm), widthCm: Number(item.widthCm), heightCm: Number(item.heightCm), weightKg: Number(item.weightKg) })),
      });
      setActiveRequest({ id: result.requestId, quoteCount: result.quoteCount, origin: form.origin, destination: form.destination, loadType: form.loadType, mode: form.mode, units: cargoTotals.units, weightKg: cargoTotals.weight, volumeCbm: cargoTotals.volume, cargoItems: cargoItems.map((item) => ({ quantity: Number(item.quantity), lengthCm: Number(item.lengthCm), widthCm: Number(item.widthCm), heightCm: Number(item.heightCm), weightKg: Number(item.weightKg) })), readyDate: form.readyDate, status: result.quoteCount ? "QUOTED" : "OPEN", ...emptyBookingDetails() });
      const synced = await refresh();
      if (!synced) notify("Запрос создан, но список не обновился. Повторите загрузку данных.", "error");
      else if (result.quoteCount > 0) notify(`Найдено ${plural(result.quoteCount, "предложение", "предложения", "предложений")}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось выполнить поиск", "error");
    } finally {
      setSearching(false);
    }
  }

  async function confirmBooking() {
    if (!selectedQuote) return;
    setBookingQuoteId(selectedQuote.id);
    try {
      const result = await api<{ shipmentId: string; reference: string }>("/api/shipments", "POST", { quoteId: selectedQuote.id, details: bookingDetails });
      setBookingSuccess(result);
      setSelectedQuote(null);
      notify(`Перевозка ${result.reference} создана. Обновляем кабинет…`);
      const synced = await refresh();
      if (!synced) notify(`Перевозка ${result.reference} создана, но список не обновился. Нажмите «Повторить» в сообщении выше.`, "error");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось забронировать", "error");
    } finally {
      setBookingQuoteId(null);
    }
  }

  async function confirmCancellation() {
    if (!cancelShipment || cancelReason.trim().length < 3) return;
    setCancelling(true);
    try {
      await api(`/api/shipments?id=${encodeURIComponent(cancelShipment.id)}`, "PATCH", { status: "CANCELLED", expectedVersion: cancelShipment.version, note: cancelReason });
      const reference = cancelShipment.reference;
      setCancelShipment(null);
      setSelectedShipment(null);
      setCancelReason("");
      notify(`Перевозка ${reference} отменена. Обновляем кабинет…`);
      const synced = await refresh();
      if (!synced) notify(`Перевозка ${reference} отменена, но список не обновился. Повторите загрузку.`, "error");
    } catch (error) {
      await refresh();
      notify(error instanceof Error ? error.message : "Не удалось отменить перевозку", "error");
    } finally { setCancelling(false); }
  }

  async function updateClientShipment(shipment: Shipment, action: "PAY" | "CLOSE") {
    try {
      await api(`/api/shipments?id=${encodeURIComponent(shipment.id)}`, "PATCH", action === "PAY"
        ? { paymentStatus: "PAID", expectedVersion: shipment.version }
        : { status: "CLOSED", expectedVersion: shipment.version, note: "Клиент подтвердил получение груза" });
      setSelectedShipment(null);
      const synced = await refresh();
      notify(synced ? (action === "PAY" ? "Оплата подтверждена" : "Получение подтверждено, заказ закрыт") : "Изменение сохранено, но список ещё не обновился", synced ? "success" : "error");
    } catch (error) { await refresh(); notify(error instanceof Error ? error.message : "Не удалось обновить заказ", "error"); }
  }

  function updateCargoItem(id: string, field: keyof Omit<CargoDraft, "id">, value: string) {
    setCargoItems((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function swapRoute() {
    setForm((current) => ({ ...current, origin: current.destination, destination: current.origin }));
  }

  return <>
    <section className="client-search-hero">
      <div className="client-hero-copy"><p className="eyebrow">Поиск международной доставки</p><h1>Сравните тарифы на перевозку груза</h1><p>Один поиск — несколько вариантов авто, ж/д, авиа и морской доставки.</p></div>
      {!canOperate && <div className="readonly-note">У вашей роли доступ только для просмотра.</div>}
      <form className="market-search" onSubmit={search} aria-label="Поиск тарифа">
        <fieldset className="mode-picker"><legend>Тип перевозки</legend>{["Любой", "Авто", "Ж/д", "Авиа", "Море"].map((mode) => <label key={mode}><input type="radio" name="client-mode" value={mode} checked={form.mode === mode} onChange={() => setForm({ ...form, mode })} /><span>{mode}</span></label>)}</fieldset>
        <div className="route-search-row">
          <FormInput id="client-origin" label="Откуда" list="location-options" placeholder="Город отправления" value={form.origin} onChange={(value) => setForm({ ...form, origin: value })} required />
          <button className="route-swap" type="button" onClick={swapRoute} aria-label="Поменять города местами">⇄</button>
          <FormInput id="client-destination" label="Куда" list="location-options" placeholder="Город назначения" value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} required />
          <FormInput id="client-ready-date" label="Груз готов" type="date" min={today()} value={form.readyDate} onChange={(value) => setForm({ ...form, readyDate: value })} required />
        </div>
        <div className="cargo-builder">
          <div className="cargo-builder-heading"><div><strong>Габариты груза</strong><p>Укажите размеры и вес одного места — объём рассчитается автоматически.</p></div><button className="ghost-button" type="button" onClick={() => setCargoItems((items) => [...items, emptyCargoItem(crypto.randomUUID())])}>+ Добавить тип места</button></div>
          <div className="cargo-items">{cargoItems.map((item, index) => <div className="cargo-item" key={item.id}>
            <span className="cargo-item-number">{index + 1}</span>
            <FormInput id={`cargo-quantity-${item.id}`} label="Количество" type="number" min="1" step="1" placeholder="1" value={item.quantity} onChange={(value) => updateCargoItem(item.id, "quantity", value)} required />
            <FormInput id={`cargo-length-${item.id}`} label="Длина, см" type="number" min="1" step="0.1" placeholder="120" value={item.lengthCm} onChange={(value) => updateCargoItem(item.id, "lengthCm", value)} required />
            <FormInput id={`cargo-width-${item.id}`} label="Ширина, см" type="number" min="1" step="0.1" placeholder="80" value={item.widthCm} onChange={(value) => updateCargoItem(item.id, "widthCm", value)} required />
            <FormInput id={`cargo-height-${item.id}`} label="Высота, см" type="number" min="1" step="0.1" placeholder="90" value={item.heightCm} onChange={(value) => updateCargoItem(item.id, "heightCm", value)} required />
            <FormInput id={`cargo-weight-${item.id}`} label="Вес места, кг" type="number" min="0.01" step="0.01" placeholder="250" value={item.weightKg} onChange={(value) => updateCargoItem(item.id, "weightKg", value)} required />
            {cargoItems.length > 1 && <button className="cargo-remove" type="button" aria-label={`Удалить тип места ${index + 1}`} onClick={() => setCargoItems((items) => items.filter((candidate) => candidate.id !== item.id))}>×</button>}
          </div>)}</div>
        </div>
        <div className="search-footer"><FormSelect id="client-load-type" label="Упаковка" value={form.loadType} onChange={(value) => setForm({ ...form, loadType: value })} options={["Коробки", "Паллеты", "Контейнер 20′", "Контейнер 40′", "Без упаковки"]} /><div className="cargo-total" aria-live="polite"><span>{plural(cargoTotals.units || 0, "место", "места", "мест")}</span><strong>{formatNumber(cargoTotals.weight)} кг · {formatNumber(cargoTotals.volume)} м³</strong></div><button className="search-cta" type="submit" disabled={!canOperate || searching || cargoTotals.units === 0 || form.origin === form.destination}>{searching ? "Ищем варианты…" : "Найти тарифы"}</button></div>
        <datalist id="location-options">{locationOptions.map((location) => <option key={location} value={location} />)}</datalist>
      </form>
    </section>

    {bookingSuccess && <section className="success-banner" role="status">
      <div><strong>Бронирование подтверждено</strong><p>Перевозка {bookingSuccess.reference} направлена логистической компании.</p></div>
      <button type="button" onClick={() => {
        const shipment = state.shipments.find((item) => item.id === bookingSuccess.shipmentId);
        if (shipment) setSelectedShipment(shipment);
      }}>Открыть перевозку</button>
    </section>}

    {displayedRequest && Number(displayedRequest.quoteCount) === 0 && !searching && <section className="section panel">
      <EmptyState title="По этому маршруту пока нет тарифов" copy={`${displayedRequest.origin} → ${displayedRequest.destination}. Запрос сохранён — измените параметры или попробуйте другой вид перевозки.`} action={<button className="secondary-button" type="button" onClick={() => document.getElementById("client-origin")?.focus()}>Изменить поиск</button>} />
    </section>}

    {(quotes.length > 0 || searching) && <section className="section" aria-labelledby="quotes-title">
      <div className="section-heading"><div><h2 id="quotes-title">Варианты доставки</h2><p>{plural(quotes.length, "вариант", "варианта", "вариантов")} · разные способы перевозки · по возрастанию цены</p></div></div>
      {searching ? <LoadingBlock label="Сверяем действующие тарифы…" /> : <div className="result-grid">
        {quotes.map((quote, index) => <article className={`result-card ${index === 0 && !quote.isDemo && quotes.filter((item) => !item.isDemo).length > 1 ? "featured" : ""}`} key={quote.id}>
          <div className="result-top"><div><div className="provider-logo">{quote.providerCode}</div><div className="provider-name">{quote.provider}</div><div className="provider-rating">{quote.rating > 0 ? `★ ${quote.rating.toFixed(1)}` : "Пока нет оценок"}</div></div><div className="quote-badges">{Boolean(quote.isDemo) && <span className="demo-tag">Ориентировочная цена</span>}{index === 0 && !quote.isDemo && quotes.filter((item) => !item.isDemo).length > 1 && <span className="best-tag">Самая низкая реальная цена</span>}</div></div>
          <div className="quote-price">{money(quote.price, quote.currency)}</div>
          <div className="quote-route">{quote.origin} → {quote.destination}</div>
          <div className="quote-meta"><span className="meta-chip">{quote.mode}</span><span className="meta-chip">{plural(quote.transitDays, "день", "дня", "дней")}</span><span className="meta-chip">до {formatDate(quote.expiresAt)}</span></div>
          <details className="quote-details"><summary>Состав стоимости</summary><QuoteCost quote={quote} /></details>
          <button className="result-action" type="button" onClick={() => { setBookingDetails(emptyBookingDetails()); setSelectedQuote(quote); }} disabled={!canOperate || bookingQuoteId === quote.id}>{quote.isDemo ? "Как получить эту цену" : bookingQuoteId === quote.id ? "Бронируем…" : "Выбрать вариант"}</button>
        </article>)}
      </div>}
    </section>}

    <section className="section dashboard-grid">
      <div className="panel">
        <div className="panel-header"><h2>Мои перевозки</h2><span>{plural(state.shipments.length, "перевозка", "перевозки", "перевозок")}</span></div>
        {loading ? <LoadingBlock /> : state.shipments.length ? <div className="shipment-card-list">{state.shipments.map((shipment) => <button className="shipment-row" type="button" key={shipment.id} onClick={() => setSelectedShipment(shipment)}>
          <span><strong>{shipment.reference}</strong><small>{shipment.provider}</small></span><span><strong>{shipment.origin} → {shipment.destination}</strong><small>{shipment.updatedAt}</small></span><span className={statusClass(shipment.status)}>{shipment.statusLabel}</span><span><strong>{money(shipment.price, shipment.currency)}</strong><small>ETA {shipment.eta}</small></span>
        </button>)}</div> : <EmptyState title="Перевозок пока нет" copy="Найдите тариф и подтвердите предложение — заказ появится здесь." action={<button className="secondary-button" onClick={() => document.getElementById("client-origin")?.focus()}>Найти тариф</button>} />}
      </div>
      <div className="panel">
        <div className="panel-header"><h2>Ближайшая доставка</h2>{nearestShipment && <span>{nearestShipment.reference}</span>}</div>
        {nearestShipment ? <div className="nearest-card"><span className={statusClass(nearestShipment.status)}>{nearestShipment.statusLabel}</span><h3>{nearestShipment.origin} → {nearestShipment.destination}</h3><p>Расчётная доставка: <strong>{nearestShipment.eta}</strong></p><button className="secondary-button" type="button" onClick={() => setSelectedShipment(nearestShipment)}>Открыть детали</button></div> : <EmptyState title="Нет активных доставок" copy="После бронирования здесь появится ближайшая перевозка и её текущий этап." />}
      </div>
    </section>

    {selectedQuote && <Dialog title={selectedQuote.isDemo ? "Ориентировочная цена" : "Оформление перевозки"} onClose={() => setSelectedQuote(null)} actions={<><button className="ghost-button" type="button" onClick={() => setSelectedQuote(null)}>Вернуться</button>{!selectedQuote.isDemo && <button className="primary-button" type="button" onClick={() => void confirmBooking()} disabled={bookingQuoteId === selectedQuote.id || !bookingDetailsValid(bookingDetails)}>{bookingQuoteId ? "Подтверждаем…" : "Подтвердить бронирование"}</button>}</>}>
      {Boolean(selectedQuote.isDemo) && <div className="demo-disclaimer"><strong>Это предварительный расчёт Champion Freights</strong><p>На этом направлении пока нет подключённого логиста с подтверждённым тарифом. Запрос уже сохранён: когда появится реальное предложение, его можно будет забронировать. Искусственный заказ мы не создаём.</p></div>}
      <div className="review-route"><span>{selectedQuote.origin}</span><b>→</b><span>{selectedQuote.destination}</span></div>
      <div className="detail-summary"><div><span>Логист</span><strong>{selectedQuote.provider}</strong></div><div><span>Транзит</span><strong>{plural(selectedQuote.transitDays, "день", "дня", "дней")}</strong></div><div><span>Груз готов</span><strong>{formatDate(selectedQuote.readyDate)}</strong></div><div><span>Предложение действует</span><strong>до {formatDate(selectedQuote.expiresAt, true)}</strong></div></div>
      <QuoteCost quote={selectedQuote} />
      {!selectedQuote.isDemo && <><div className="booking-step-title"><span>Последний шаг</span><h3>Куда подать транспорт и кому позвонить</h3><p>Эти данные нужны только выбранному логисту после бронирования.</p></div><div className="booking-details-grid"><FormInput id="booking-pickup" label="Точный адрес забора" value={bookingDetails.pickupAddress} onChange={(value) => setBookingDetails({ ...bookingDetails, pickupAddress: value })} placeholder="Улица, дом, склад, ворота" required /><FormInput id="booking-delivery" label="Точный адрес доставки" value={bookingDetails.deliveryAddress} onChange={(value) => setBookingDetails({ ...bookingDetails, deliveryAddress: value })} placeholder="Улица, дом, склад" required /><FormInput id="booking-contact" label="Контактное лицо" value={bookingDetails.contactName} onChange={(value) => setBookingDetails({ ...bookingDetails, contactName: value })} placeholder="Имя и фамилия" required /><FormInput id="booking-phone" label="Телефон" type="tel" value={bookingDetails.contactPhone} onChange={(value) => setBookingDetails({ ...bookingDetails, contactPhone: value })} placeholder="+7 700 000 00 00" required /><FormInput id="booking-cargo" label="Что перевозим" value={bookingDetails.cargoDescription} onChange={(value) => setBookingDetails({ ...bookingDetails, cargoDescription: value })} placeholder="Например, запчасти" required /><FormSelect id="booking-incoterm" label="Incoterms" value={bookingDetails.incoterm} onChange={(value) => setBookingDetails({ ...bookingDetails, incoterm: value })} options={["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"]} /><FormInput id="booking-special" label="Особые условия (необязательно)" value={bookingDetails.specialRequirements} onChange={(value) => setBookingDetails({ ...bookingDetails, specialRequirements: value })} placeholder="Температура, режим склада, комментарий" /></div><p className="review-note">После подтверждения заявка будет направлена логистической компании. Отменить её можно до назначения забора.</p></>}
    </Dialog>}

    {selectedShipment && <Dialog title={`Перевозка ${selectedShipment.reference}`} onClose={() => setSelectedShipment(null)} actions={<><button className="ghost-button" type="button" onClick={() => setSelectedShipment(null)}>Закрыть</button>{canOperate && selectedShipment.paymentStatus === "INVOICED" && <button className="primary-button" type="button" onClick={() => void updateClientShipment(selectedShipment, "PAY")}>Подтвердить оплату</button>}{canOperate && selectedShipment.status === "DELIVERED" && selectedShipment.paymentStatus === "PAID" && <button className="primary-button" type="button" onClick={() => void updateClientShipment(selectedShipment, "CLOSE")}>Подтвердить получение</button>}{canOperate && ["SENT_TO_PROVIDER", "PROVIDER_ACCEPTED", "PICKUP_SCHEDULED"].includes(selectedShipment.status) && <button className="danger-button" type="button" onClick={() => { setCancelReason(""); setCancelShipment(selectedShipment); setSelectedShipment(null); }}>Отменить перевозку</button>}</>}><ShipmentDetail shipment={selectedShipment} milestones={state.milestones.filter((item) => item.shipmentId === selectedShipment.id)} /></Dialog>}
    {cancelShipment && <Dialog title={`Отменить ${cancelShipment.reference}?`} onClose={() => setCancelShipment(null)} actions={<><button className="ghost-button" type="button" onClick={() => setCancelShipment(null)}>Вернуться</button><button className="danger-button" type="button" disabled={cancelling || cancelReason.trim().length < 3} onClick={() => void confirmCancellation()}>{cancelling ? "Отменяем…" : "Подтвердить отмену"}</button></>}><p>Логистическая компания увидит отмену и её причину в истории заказа.</p><div className="field"><label htmlFor="cancel-reason">Причина отмены</label><textarea id="cancel-reason" value={cancelReason} minLength={3} required onChange={(event) => setCancelReason(event.target.value)} placeholder="Например, изменились сроки готовности груза" /></div></Dialog>}
  </>;
}

function FormInput({ id, label, value, onChange, ...props }: { id: string; label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>;
}

function FormSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></div>;
}

function today() { return new Date().toISOString().slice(0, 10); }
function tomorrow() { return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); }
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value); }
function emptyBookingDetails() { return { pickupAddress: "", deliveryAddress: "", contactName: "", contactPhone: "", cargoDescription: "", incoterm: "EXW", specialRequirements: "" }; }
function bookingDetailsValid(details: ReturnType<typeof emptyBookingDetails>) { return [details.pickupAddress, details.deliveryAddress, details.contactName, details.contactPhone, details.cargoDescription].every((value) => value.trim().length >= 3); }
