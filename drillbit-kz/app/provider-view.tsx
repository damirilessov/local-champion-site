"use client";

import { FormEvent, useMemo, useState } from "react";
import { isSupportedLocation, locationOptions } from "@/lib/locations";
import { createRateTemplate, excelDate, normalize, parseRateWorkbook } from "@/lib/rate-xlsx";
import type { ApiCall, DashboardState, Rate, Shipment } from "./freight-types";
import { formatDate, money, plural, statusClass } from "./freight-types";
import { Dialog, EmptyState, LoadingBlock, ShipmentDetail, statusName } from "./freight-ui";

type RateForm = {
  origin: string; destination: string; mode: string; currency: string; basePrice: string;
  perKg: string; perCbm: string; fuelPercent: string; handlingFee: string;
  minimumCharge: string; transitDays: string; effectiveFrom: string; validUntil: string;
};
type ImportRow = { rowNumber: number; payload: Record<string, string | number>; error: string | null };

export default function ProviderView({ section, onNavigate, state, loading, canOperate, api, refresh, notify }: {
  section: "overview" | "shipments" | "rates";
  onNavigate: (section: "overview" | "shipments" | "rates" | "team") => void;
  state: DashboardState;
  loading: boolean;
  canOperate: boolean;
  api: ApiCall;
  refresh: () => Promise<boolean>;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const [form, setForm] = useState<RateForm>({
    origin: "", destination: "", mode: "Авто", currency: "USD", basePrice: "",
    perKg: "0", perCbm: "0", fuelPercent: "0", handlingFee: "0", minimumCharge: "0",
    transitDays: "", effectiveFrom: today(), validUntil: futureDate(90),
  });
  const [rateReview, setRateReview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [statusAction, setStatusAction] = useState<{ shipment: Shipment; target: string; label: string } | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [statusDetails, setStatusDetails] = useState({ pickupDate: "", pickupTime: "", vehicle: "", driver: "", actualPickupDate: "", actualPickupTime: "", deliveredDate: "", deliveredTime: "", podReference: "", invoiceNumber: "" });
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [podFile, setPodFile] = useState<File | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importReading, setImportReading] = useState(false);
  const [importPublishing, setImportPublishing] = useState(false);
  const [pricingHelpOpen, setPricingHelpOpen] = useState(false);

  const currentRates = useMemo(() => state.rates.filter((rate) => {
    const now = new Date();
    if (new Date(rate.effectiveFrom) > now || new Date(rate.validUntil) <= now) return false;
    return !state.rates.some((candidate) => candidate.provider === rate.provider && candidate.origin === rate.origin && candidate.destination === rate.destination && candidate.mode === rate.mode && candidate.version > rate.version && new Date(candidate.effectiveFrom) <= now && new Date(candidate.validUntil) > now);
  }), [state.rates]);
  const scheduledRates = useMemo(() => state.rates.filter((rate) => new Date(rate.effectiveFrom) > new Date()), [state.rates]);
  const expiredRates = useMemo(() => state.rates.filter((rate) => !currentRates.includes(rate) && !scheduledRates.includes(rate)), [currentRates, scheduledRates, state.rates]);

  function reviewRate(event: FormEvent) {
    event.preventDefault();
    setRateReview(true);
  }

  async function publishRate() {
    setPublishing(true);
    try {
      const result = await api<{ id: string; version: number }>("/api/rates", "POST", {
        ...form,
        basePrice: Number(form.basePrice), perKg: Number(form.perKg), perCbm: Number(form.perCbm),
        fuelPercent: Number(form.fuelPercent), handlingFee: Number(form.handlingFee),
        minimumCharge: Number(form.minimumCharge), transitDays: Number(form.transitDays),
      });
      const synced = await refresh();
      setRateReview(false);
      notify(synced ? `Тариф опубликован · версия ${result.version}` : `Тариф версии ${result.version} опубликован, но список не обновился. Повторите загрузку.`, synced ? "success" : "error");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось опубликовать тариф", "error");
    } finally {
      setPublishing(false);
    }
  }

  async function updateStatus() {
    if (!statusAction) return;
    setStatusPendingId(statusAction.shipment.id);
    try {
      let podDocumentId: string | undefined;
      if (statusAction.target === "DELIVERED") {
        if (!podFile) throw new Error("Добавьте файл POD");
        const upload = new FormData(); upload.set("shipmentId", statusAction.shipment.id); upload.set("file", podFile);
        podDocumentId = (await api<{ documentId: string }>("/api/shipment-documents", "POST", upload)).documentId;
      }
      await api(`/api/shipments?id=${encodeURIComponent(statusAction.shipment.id)}`, "PATCH", {
        status: statusAction.target, expectedVersion: statusAction.shipment.version, note: statusNote, details: {
          ...statusDetails,
          pickupAt: combineDateTime(statusDetails.pickupDate, statusDetails.pickupTime),
          actualPickupAt: combineDateTime(statusDetails.actualPickupDate, statusDetails.actualPickupTime),
          deliveredAt: combineDateTime(statusDetails.deliveredDate, statusDetails.deliveredTime),
          podDocumentId,
        },
      });
      const reference = statusAction.shipment.reference;
      const label = statusAction.label;
      setStatusAction(null);
      setStatusNote("");
      setStatusDetails(emptyStatusDetails());
      setPodFile(null);
      notify(`${reference}: ${label}. Обновляем очередь…`);
      const synced = await refresh();
      if (!synced) notify(`${reference}: этап сохранён, но список не обновился. Повторите загрузку.`, "error");
    } catch (error) {
      await refresh();
      notify(error instanceof Error ? error.message : "Не удалось обновить этап", "error");
      setStatusAction(null);
    } finally {
      setStatusPendingId(null);
    }
  }

  async function readWorkbook(file: File) {
    setImportReading(true);
    try {
      const rows = await parseRateWorkbook(file);
      if (rows.length > 100) throw new Error("За один раз можно импортировать не более 100 тарифов");
      setImportRows(rows.map(({ rowNumber, values }) => validateImportRow(rowNumber, values)));
    } catch (error) { notify(error instanceof Error ? error.message : "Не удалось прочитать Excel", "error"); setImportRows([]); }
    finally { setImportReading(false); }
  }

  async function downloadTemplate() {
    try {
      const blob = await createRateTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "atlas-freight-rates-template.xlsx"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { notify("Не удалось создать Excel-шаблон", "error"); }
  }

  async function publishImport() {
    const validRows = importRows.filter((row) => !row.error);
    if (!validRows.length) return;
    setImportPublishing(true);
    let published = 0;
    const nextRows = [...importRows];
    for (const row of validRows) {
      try { await api("/api/rates", "POST", row.payload); published += 1; }
      catch (error) { const target = nextRows.find((item) => item.rowNumber === row.rowNumber); if (target) target.error = error instanceof Error ? error.message : "Ошибка публикации"; }
    }
    setImportRows(nextRows);
    const synced = await refresh();
    setImportPublishing(false);
    if (published === validRows.length) { setImportOpen(false); setImportRows([]); notify(`${published} тарифов импортировано`); }
    else notify(`Импортировано ${published} из ${validRows.length}. Исправьте отмеченные строки.`, "error");
    if (!synced) notify("Тарифы сохранены, но список не обновился. Повторите загрузку.", "error");
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Кабинет логистической компании · {section === "overview" ? "Обзор" : section === "shipments" ? "Перевозки" : "Тарифы"}</p><h1>{section === "overview" ? "Всё важное на одном экране" : section === "shipments" ? "Заказы и этапы перевозок" : "Тарифы по понятным блокам"}</h1><p>{section === "overview" ? "Выберите рабочий раздел — данные и действия больше не смешаны в одной длинной странице." : section === "shipments" ? "Принимайте заказы, назначайте забор и фиксируйте доставку." : "Маршрут, период и стоимость разделены на самостоятельные поля."}</p></div>
      {canOperate && section === "rates" && <div className="page-actions"><button className="secondary-button" type="button" onClick={() => { setImportRows([]); setImportOpen(true); }}>Импорт из Excel</button><button className="primary-button" type="button" onClick={() => { document.getElementById("new-rate")?.scrollIntoView({ behavior: "smooth" }); window.setTimeout(() => document.getElementById("provider-origin")?.focus(), 350); }}>+ Новый тариф</button></div>}
    </header>
    {section === "rates" && <section className={`pricing-help ${pricingHelpOpen ? "open" : ""}`} aria-labelledby="pricing-help-title">
      <div className="pricing-help-bar">
        <div><span className="pricing-help-icon" aria-hidden="true">i</span><div><strong id="pricing-help-title">Как устроен тариф и считается цена</strong><small>Формула итоговой стоимости и объяснение каждого поля</small></div></div>
        <button className="ghost-button" type="button" aria-expanded={pricingHelpOpen} aria-controls="pricing-help-content" onClick={() => setPricingHelpOpen((open) => !open)}>{pricingHelpOpen ? "Закрыть" : "Открыть объяснение"}</button>
      </div>
      {pricingHelpOpen && <div className="pricing-help-content" id="pricing-help-content">
        <div className="formula-card"><span>Формула расчёта</span><strong>Промежуточная сумма = База + (Вес × За кг) + (Объём × За м³)</strong><strong>Топливо = Промежуточная сумма × Топливная надбавка %</strong><strong>Итог = максимум из: Минимальная сумма или Промежуточная сумма + Топливо + Обработка</strong><p>Каждая денежная часть округляется до двух знаков. Клиент всегда видит итог в выбранной валюте.</p></div>
        <div className="formula-example"><span>Пример</span><p>Груз 1 000 кг и 5 м³: база 2 200 USD, 0,34 USD/кг, 31 USD/м³, топливо 5%, обработка 40 USD.</p><strong>2 200 + 340 + 155 + 134,75 + 40 = 2 869,75 USD</strong><small>Минимум 2 200 USD меньше расчётной суммы, поэтому итог — 2 869,75 USD.</small></div>
        <div className="pricing-field-guide">
          <FieldExplanation name="Откуда / Куда" copy="Точное направление тарифа. Клиент увидит ставку только для совпадающего маршрута." />
          <FieldExplanation name="Вид перевозки" copy="Авто, железная дорога, авиа или море. Тариф участвует только в поиске этого вида перевозки." />
          <FieldExplanation name="Валюта" copy="Единая валюта всех денежных полей тарифа и итоговой цены." />
          <FieldExplanation name="Базовая ставка" copy="Фиксированная часть, которая добавляется в каждый расчёт независимо от веса и объёма." />
          <FieldExplanation name="За кг" copy="Ставка умножается на общий вес груза в килограммах." />
          <FieldExplanation name="За м³" copy="Ставка умножается на общий объём груза в кубических метрах." />
          <FieldExplanation name="Топливная надбавка, %" copy="Процент от суммы базы, весовой и объёмной частей. Обработка в базу для этого процента не входит." />
          <FieldExplanation name="Обработка" copy="Фиксированный сбор за оформление, терминальную или складскую обработку." />
          <FieldExplanation name="Минимальная сумма" copy="Нижний предел заказа. Если расчёт получился меньше, клиенту будет показана эта сумма." />
          <FieldExplanation name="Транзит, дней" copy="Ожидаемое число календарных дней в пути; используется для расчёта ориентировочной даты доставки." />
          <FieldExplanation name="Действует с / до" copy="Период применения тарифа. Для даты готовности груза выбирается самая новая действующая версия." />
        </div>
        <button className="pricing-help-close" type="button" onClick={() => setPricingHelpOpen(false)}>Закрыть объяснение</button>
      </div>}
    </section>}
    {!canOperate && <div className="readonly-note">У вашей роли доступ только для просмотра. Обратитесь к владельцу компании, чтобы публиковать тарифы или менять статусы.</div>}

    {section === "overview" && <><section className="metric-grid" aria-label="Показатели компании">
      <Metric label="Открытые запросы" value={String(state.metrics.openRequests)} copy="Доступные по вашим тарифам" />
      <Metric label="Активные перевозки" value={String(state.metrics.activeShipments)} copy="Не закрыты и не отменены" />
      <Metric label="Действующие тарифы" value={String(currentRates.length)} copy={scheduledRates.length ? `${plural(scheduledRates.length, "запланирован", "запланировано", "запланировано")}` : "Нет запланированных"} />
      <Metric label="Стоимость перевозок" value={money(state.metrics.monthlyGmv)} copy="По текущей выборке" />
    </section><section className="section provider-home-grid"><article className="provider-home-card"><span className="home-step">01 · Операции</span><h2>Перевозки</h2><p>Новые бронирования, параметры груза и следующие действия находятся в одной очереди.</p><strong>{plural(state.shipments.length, "заказ", "заказа", "заказов")}</strong><button className="secondary-button" type="button" onClick={() => onNavigate("shipments")}>Открыть перевозки</button></article><article className="provider-home-card"><span className="home-step">02 · Продажи</span><h2>Тарифы</h2><p>Создание ставки разбито на маршрут, период и отдельные компоненты стоимости.</p><strong>{plural(currentRates.length, "действующий тариф", "действующих тарифа", "действующих тарифов")}</strong><button className="secondary-button" type="button" onClick={() => onNavigate("rates")}>Открыть тарифы</button></article><article className="provider-home-card checklist-card"><span className="home-step">03 · Настройка</span><h2>Следующие шаги</h2><ul><li className="done">Компания создана</li><li className={currentRates.length ? "done" : ""}>{currentRates.length ? "Первый тариф опубликован" : "Опубликуйте первый тариф"}</li><li>Добавьте коллег в разделе «Команда»</li></ul><button className="ghost-button" type="button" onClick={() => onNavigate("team")}>Перейти к команде</button></article></section></>}

    {section === "shipments" && <section className="section panel">
      <div className="panel-header"><h2>Очередь перевозок</h2><span>{plural(state.shipments.length, "заказ", "заказа", "заказов")}</span></div>
      {loading ? <LoadingBlock /> : state.shipments.length ? <div className="provider-queue">{state.shipments.map((shipment) => <article className="provider-shipment" key={shipment.id}>
        <button className="shipment-open" type="button" onClick={() => setSelectedShipment(shipment)}>
          <span><strong>{shipment.reference}</strong><small>{shipment.shipper}</small></span>
          <span><strong>{shipment.origin} → {shipment.destination}</strong><small>{shipment.loadType} · {shipment.weightKg} кг · готов {formatDate(shipment.readyDate)}</small></span>
          <span><strong>{money(shipment.price, shipment.currency)}</strong><small>ETA {shipment.eta}</small></span>
          <span className={statusClass(shipment.status)}>{shipment.statusLabel}</span>
        </button>
        {canOperate && <div className="row-actions">{actionsFor(shipment).map((action) => <button key={action.target} className={action.target === "CANCELLED" ? "danger-button" : "small-button"} type="button" disabled={statusPendingId === shipment.id} onClick={() => { setStatusNote(""); setStatusDetails(emptyStatusDetails()); setPodFile(null); setStatusAction({ shipment, ...action }); }}>{statusPendingId === shipment.id ? "Обновляем…" : action.label}</button>)}</div>}
      </article>)}</div> : <EmptyState title="Новых бронирований пока нет" copy="Опубликуйте действующий тариф. Когда клиент выберет его, заказ появится здесь со всеми параметрами груза." action={canOperate ? <button className="secondary-button" onClick={() => document.getElementById("provider-origin")?.focus()}>Создать тариф</button> : undefined} />}
    </section>}

    {section === "rates" && canOperate && <form className="section panel" id="new-rate" onSubmit={reviewRate}>
      <div className="panel-header"><h2>Новый тариф</h2><span>Сначала проверьте сводку, затем опубликуйте</span></div>
      <div className="form-section"><h3>Маршрут и срок</h3><div className="form-body">
        <Input id="provider-origin" label="Откуда" list="provider-locations" placeholder="Например, Шэньчжэнь, CN" value={form.origin} onChange={(value) => setForm({ ...form, origin: value })} required />
        <Input id="provider-destination" label="Куда" list="provider-locations" placeholder="Например, Алматы, KZ" value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} required />
        <Select id="provider-mode" label="Вид перевозки" value={form.mode} onChange={(value) => setForm({ ...form, mode: value })} options={["Авто", "Ж/д", "Авиа", "Море"]} />
        <Input id="provider-transit" label="Транзит, дней" type="number" min="1" max="365" placeholder="12" value={form.transitDays} onChange={(value) => setForm({ ...form, transitDays: value })} required />
        <Input id="provider-from" label="Действует с" type="date" min={today()} value={form.effectiveFrom} onChange={(value) => setForm({ ...form, effectiveFrom: value })} required />
        <Input id="provider-until" label="Действует до" type="date" min={form.effectiveFrom} value={form.validUntil} onChange={(value) => setForm({ ...form, validUntil: value })} required />
      </div></div>
      <div className="form-section"><h3>Стоимость</h3><div className="form-body">
        <Select id="provider-currency" label="Валюта" value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={["USD", "KZT", "EUR", "CNY"]} />
        <Input id="provider-base" label="Базовая ставка" type="number" min="0.01" step="0.01" placeholder="2200" value={form.basePrice} onChange={(value) => setForm({ ...form, basePrice: value })} required />
        <Input id="provider-kg" label="За кг" type="number" min="0" step="0.01" value={form.perKg} onChange={(value) => setForm({ ...form, perKg: value })} />
        <Input id="provider-cbm" label="За м³" type="number" min="0" step="0.01" value={form.perCbm} onChange={(value) => setForm({ ...form, perCbm: value })} />
        <Input id="provider-fuel" label="Топливная надбавка, %" type="number" min="0" max="100" step="0.1" value={form.fuelPercent} onChange={(value) => setForm({ ...form, fuelPercent: value })} />
        <Input id="provider-handling" label="Обработка" type="number" min="0" step="0.01" value={form.handlingFee} onChange={(value) => setForm({ ...form, handlingFee: value })} />
        <Input id="provider-minimum" label="Минимальная сумма" type="number" min="0" step="0.01" value={form.minimumCharge} onChange={(value) => setForm({ ...form, minimumCharge: value })} />
      </div></div>
      <div className="form-actions"><button className="primary-button" type="submit">Проверить тариф</button></div>
      <datalist id="provider-locations">{locationOptions.map((location) => <option key={location} value={location} />)}</datalist>
    </form>}

    {section === "rates" && <><RateTable title="Действующие тарифы" rates={currentRates} empty="Опубликуйте первый тариф — он появится здесь после проверки." />
    {scheduledRates.length > 0 && <RateTable title="Запланированные тарифы" rates={scheduledRates} empty="" />}
    {expiredRates.length > 0 && <RateTable title="История тарифов" rates={expiredRates} empty="" />}</>}

    {rateReview && <Dialog title="Проверьте тариф" onClose={() => setRateReview(false)} actions={<><button className="ghost-button" type="button" onClick={() => setRateReview(false)}>Вернуться</button><button className="primary-button" type="button" onClick={() => void publishRate()} disabled={publishing}>{publishing ? "Публикуем…" : "Опубликовать тариф"}</button></>}>
      <div className="review-route"><span>{form.origin}</span><b>→</b><span>{form.destination}</span></div>
      <div className="detail-summary"><div><span>Перевозка</span><strong>{form.mode}</strong></div><div><span>Период</span><strong>{formatDate(form.effectiveFrom)} — {formatDate(form.validUntil)}</strong></div><div><span>Базовая ставка</span><strong>{money(Number(form.basePrice), form.currency)}</strong></div><div><span>Транзит</span><strong>{form.transitDays} дней</strong></div><div><span>Переменные сборы</span><strong>{form.perKg}/кг · {form.perCbm}/м³ · топливо {form.fuelPercent}%</strong></div><div><span>Обработка</span><strong>{money(Number(form.handlingFee), form.currency)}</strong></div><div><span>Минимум</span><strong>{money(Number(form.minimumCharge), form.currency)}</strong></div></div>
      <p className="review-note">Публикация создаст новую версию тарифа. Будущая версия начнёт участвовать в расчётах только с даты начала.</p>
    </Dialog>}

    {selectedShipment && <Dialog title={`Перевозка ${selectedShipment.reference}`} onClose={() => setSelectedShipment(null)}><ShipmentDetail shipment={selectedShipment} milestones={state.milestones.filter((item) => item.shipmentId === selectedShipment.id)} /></Dialog>}

    {statusAction && <Dialog title={`${statusAction.shipment.reference}: ${statusAction.label}`} onClose={() => setStatusAction(null)} actions={<><button className="ghost-button" type="button" onClick={() => setStatusAction(null)}>Отмена</button><button className={statusAction.target === "CANCELLED" ? "danger-button" : "primary-button"} type="button" onClick={() => void updateStatus()} disabled={statusPendingId === statusAction.shipment.id || !statusDetailsValid(statusAction.shipment.status, statusAction.target, statusNote, statusDetails) || (statusAction.target === "DELIVERED" && !podFile)}>{statusPendingId ? "Сохраняем…" : "Подтвердить"}</button></>}>
      <p>Текущий этап: <strong>{statusAction.shipment.statusLabel}</strong><br />Новый этап: <strong>{statusName(statusAction.target)}</strong></p>
      {statusAction.target === "CANCELLED" && <div className="field"><label htmlFor="status-note">Причина отказа</label><textarea id="status-note" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} minLength={3} required placeholder="Добавьте понятную причину для клиента" /></div>}
      {statusAction.target === "PROVIDER_ACCEPTED" && <Input id="invoice-number" label="Номер счёта" value={statusDetails.invoiceNumber} onChange={(value) => setStatusDetails({ ...statusDetails, invoiceNumber: value })} placeholder="INV-2026-001" required />}
      {statusAction.target === "PICKUP_SCHEDULED" && <div className="status-fields"><Input id="pickup-date" label="Дата забора" type="date" value={statusDetails.pickupDate} onChange={(value) => setStatusDetails({ ...statusDetails, pickupDate: value })} required /><Input id="pickup-time" label="Время забора" type="time" value={statusDetails.pickupTime} onChange={(value) => setStatusDetails({ ...statusDetails, pickupTime: value })} required /><Input id="pickup-vehicle" label="Транспорт / госномер" value={statusDetails.vehicle} onChange={(value) => setStatusDetails({ ...statusDetails, vehicle: value })} placeholder="KZ 123 ABC" required /><Input id="pickup-driver" label="Водитель и контакт" value={statusDetails.driver} onChange={(value) => setStatusDetails({ ...statusDetails, driver: value })} placeholder="Имя, +7…" /></div>}
      {statusAction.target === "IN_TRANSIT" && statusAction.shipment.status === "PICKUP_SCHEDULED" && <div className="status-fields"><Input id="actual-pickup-date" label="Фактическая дата забора" type="date" value={statusDetails.actualPickupDate} onChange={(value) => setStatusDetails({ ...statusDetails, actualPickupDate: value })} required /><Input id="actual-pickup-time" label="Фактическое время" type="time" value={statusDetails.actualPickupTime} onChange={(value) => setStatusDetails({ ...statusDetails, actualPickupTime: value })} required /></div>}
      {statusAction.target === "DELIVERED" && <div className="status-fields"><Input id="delivered-date" label="Дата доставки" type="date" value={statusDetails.deliveredDate} onChange={(value) => setStatusDetails({ ...statusDetails, deliveredDate: value })} required /><Input id="delivered-time" label="Время доставки" type="time" value={statusDetails.deliveredTime} onChange={(value) => setStatusDetails({ ...statusDetails, deliveredTime: value })} required /><Input id="pod-reference" label="Номер POD / подтверждения" value={statusDetails.podReference} onChange={(value) => setStatusDetails({ ...statusDetails, podReference: value })} placeholder="POD-12345" required /><div className="field"><label htmlFor="pod-file">Файл POD (PDF, PNG или JPEG)</label><input id="pod-file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setPodFile(event.target.files?.[0] ?? null)} required /></div></div>}
      <p className="review-note">Изменение попадёт в историю перевозки с вашим именем и временем.</p>
    </Dialog>}

    {importOpen && <Dialog title="Импорт тарифов из Excel" onClose={() => setImportOpen(false)} actions={<><button className="ghost-button" type="button" onClick={() => setImportOpen(false)}>Закрыть</button><button className="primary-button" type="button" disabled={importPublishing || !importRows.some((row) => !row.error)} onClick={() => void publishImport()}>{importPublishing ? "Публикуем…" : `Опубликовать ${importRows.filter((row) => !row.error).length}`}</button></>}>
      <div className="import-steps"><div><span>1</span><div><strong>Скачайте шаблон</strong><p>Не меняйте названия столбцов. В файле есть пример строки.</p><button className="secondary-button" type="button" onClick={() => void downloadTemplate()}>Скачать .xlsx шаблон</button></div></div><div><span>2</span><div><strong>Загрузите заполненный файл</strong><p>До 100 строк. Перед публикацией мы покажем ошибки.</p><label className="file-drop" htmlFor="rate-workbook"><input id="rate-workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readWorkbook(file); }} /><span>{importReading ? "Читаем файл…" : "Выбрать Excel-файл"}</span></label></div></div></div>
      {importRows.length > 0 && <div className="import-summary"><div className="success-banner"><strong>{importRows.filter((row) => !row.error).length} строк готовы</strong><span>{importRows.filter((row) => row.error).length} требуют исправления</span></div><div className="import-preview">{importRows.map((row) => <article className={row.error ? "invalid" : "valid"} key={row.rowNumber}><span>Строка {row.rowNumber}</span><strong>{String(row.payload.origin || "—")} → {String(row.payload.destination || "—")}</strong><small>{row.error ?? `${row.payload.mode} · ${row.payload.currency} · ${money(Number(row.payload.basePrice), String(row.payload.currency))}`}</small></article>)}</div></div>}
    </Dialog>}
  </>;
}

function validateImportRow(rowNumber: number, values: Record<string, string>): ImportRow {
  const value = (...keys: string[]) => keys.map(normalize).map((key) => values[key]).find((item) => item !== undefined) ?? "";
  const number = (...keys: string[]) => Number(value(...keys).replace(",", "."));
  const payload = {
    origin: value("Откуда", "Origin"), destination: value("Куда", "Destination"), mode: value("Вид перевозки", "Mode"),
    currency: value("Валюта", "Currency").toUpperCase(), basePrice: number("Базовая ставка", "Base price"),
    perKg: number("За кг", "Per kg"), perCbm: number("За м3", "За м³", "Per cbm"),
    fuelPercent: number("Топливная надбавка %", "Fuel percent"), handlingFee: number("Обработка", "Handling"),
    minimumCharge: number("Минимальная сумма", "Minimum charge"), transitDays: number("Транзит дней", "Transit days"),
    effectiveFrom: excelDate(value("Действует с", "Effective from")), validUntil: excelDate(value("Действует до", "Valid until")),
  };
  let error: string | null = null;
  if (!isSupportedLocation(String(payload.origin)) || !isSupportedLocation(String(payload.destination))) error = "Выберите маршрут из справочника Champion Freights";
  else if (!["Авто", "Ж/д", "Авиа", "Море"].includes(String(payload.mode))) error = "Некорректный вид перевозки";
  else if (!["USD", "KZT", "EUR", "CNY"].includes(String(payload.currency))) error = "Допустимые валюты: USD, KZT, EUR, CNY";
  else if (![payload.basePrice, payload.perKg, payload.perCbm, payload.fuelPercent, payload.handlingFee, payload.minimumCharge].every((item) => Number.isFinite(item) && item >= 0) || payload.basePrice <= 0) error = "Проверьте компоненты стоимости";
  else if (!Number.isInteger(payload.transitDays) || payload.transitDays < 1 || payload.transitDays > 365) error = "Транзит должен быть от 1 до 365 дней";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil) || payload.validUntil <= payload.effectiveFrom) error = "Проверьте даты действия тарифа";
  return { rowNumber, payload, error };
}

function RateTable({ title, rates, empty }: { title: string; rates: Rate[]; empty: string }) {
  return <section className="section panel"><div className="panel-header"><h2>{title}</h2><span>{plural(rates.length, "версия", "версии", "версий")}</span></div>{rates.length ? <div className="rate-card-list">{rates.map((rate) => <article className="rate-row" key={rate.id}><div><strong>{rate.origin} → {rate.destination}</strong><small>{rate.mode} · версия {rate.version}</small></div><div><span>База</span><strong>{money(rate.basePrice, rate.currency)}</strong></div><div><span>Переменные</span><strong>{rate.perKg}/кг · {rate.perCbm}/м³ · {rate.fuelPercent}% · обработка {money(rate.handlingFee, rate.currency)} · минимум {money(rate.minimumCharge, rate.currency)}</strong></div><div><span>Период</span><strong>{formatDate(rate.effectiveFrom)} — {formatDate(rate.validUntil)}</strong></div><div><span>Транзит</span><strong>{rate.transitDays} дней</strong></div></article>)}</div> : <EmptyState title="Тарифов пока нет" copy={empty} />}</section>;
}

function Metric({ label, value, copy }: { label: string; value: string; copy: string }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-delta">{copy}</div></article>; }
function FieldExplanation({ name, copy }: { name: string; copy: string }) { return <article><strong>{name}</strong><p>{copy}</p></article>; }
function Input({ id, label, value, onChange, ...props }: { id: string; label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) { return <div className="field"><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div>; }
function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></div>; }
function actionsFor(shipment: Shipment) {
  const map: Record<string, Array<{ target: string; label: string }>> = {
    SENT_TO_PROVIDER: [{ target: "PROVIDER_ACCEPTED", label: "Принять заказ" }, { target: "CANCELLED", label: "Отклонить" }],
    PROVIDER_ACCEPTED: [{ target: "PICKUP_SCHEDULED", label: "Назначить забор" }],
    PICKUP_SCHEDULED: [{ target: "IN_TRANSIT", label: "Груз забран" }],
    IN_TRANSIT: [{ target: "CUSTOMS", label: "На таможне" }, { target: "DELIVERED", label: "Доставлено" }],
    CUSTOMS: [{ target: "IN_TRANSIT", label: "Таможня пройдена" }, { target: "DELIVERED", label: "Доставлено" }],
  };
  return map[shipment.status] ?? [];
}
function statusDetailsValid(currentStatus: string, targetStatus: string, note: string, details: ReturnType<typeof emptyStatusDetails>) {
  if (targetStatus === "CANCELLED") return note.trim().length >= 3;
  if (targetStatus === "PROVIDER_ACCEPTED") return details.invoiceNumber.trim().length >= 3;
  if (targetStatus === "PICKUP_SCHEDULED") return Boolean(details.pickupDate && details.pickupTime) && details.vehicle.trim().length >= 2;
  if (targetStatus === "IN_TRANSIT" && currentStatus === "PICKUP_SCHEDULED") return Boolean(details.actualPickupDate && details.actualPickupTime);
  if (targetStatus === "DELIVERED") return Boolean(details.deliveredDate && details.deliveredTime) && details.podReference.trim().length >= 3;
  return true;
}
function today() { return new Date().toISOString().slice(0, 10); }
function futureDate(days: number) { return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10); }
function emptyStatusDetails() { return { pickupDate: "", pickupTime: "", vehicle: "", driver: "", actualPickupDate: "", actualPickupTime: "", deliveredDate: "", deliveredTime: "", podReference: "", invoiceNumber: "" }; }
function combineDateTime(date: string, time: string) { return date && time ? new Date(`${date}T${time}`).toISOString() : undefined; }
