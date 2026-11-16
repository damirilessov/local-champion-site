"use client";

import { useEffect, useState } from "react";
import type { ApiCall, Membership, Session } from "./freight-types";
import { money, roleLabel } from "./freight-types";
import { EmptyState, ErrorBanner, LoadingBlock } from "./freight-ui";

type OrganizationOverview = {
  id: string; name: string; kind: Membership["organizationKind"]; profileType: "BUSINESS" | "PERSONAL"; role: Membership["role"];
  primaryCount: number; activeShipments: number; volume: number;
};

export default function PersonalAdminView({ session, api, onOpenOrganization, onCreateClient }: {
  session: Session;
  api: ApiCall;
  onOpenOrganization: (organizationId: string) => Promise<void>;
  onCreateClient: () => void;
}) {
  const [organizations, setOrganizations] = useState<OrganizationOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setOrganizations((await api<{ organizations: OrganizationOverview[] }>("/api/me/overview")).organizations); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить админ-панель"); }
    finally { setLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clientCompany = organizations.find((item) => item.kind === "SHIPPER");
  const totalShipments = organizations.reduce((sum, item) => sum + Number(item.activeShipments), 0);
  const totalVolume = organizations.reduce((sum, item) => sum + Number(item.volume), 0);

  return <>
    <header className="page-header admin-hero"><div><p className="eyebrow">Личная админ-панель</p><h1>Все ваши кабинеты в одном месте</h1><p>{session.user.displayName}, здесь можно контролировать компании и быстро перейти в интерфейс клиента или логиста.</p></div><button className="primary-button" type="button" onClick={() => clientCompany ? void onOpenOrganization(clientCompany.id) : onCreateClient()}>{clientCompany ? "Открыть кабинет клиента" : "+ Создать клиентскую компанию"}</button></header>
    {error && <ErrorBanner message={error} onRetry={() => void load()} />}
    {loading ? <LoadingBlock /> : <>
      <section className="metric-grid" aria-label="Сводка владельца"><AdminMetric label="Рабочие пространства" value={String(organizations.length)} copy="Клиенты и логистические компании" /><AdminMetric label="Активные перевозки" value={String(totalShipments)} copy="Во всех ваших компаниях" /><AdminMetric label="Сумма перевозок" value={money(totalVolume)} copy="Без отменённых заказов" /><AdminMetric label="Клиентский кабинет" value={clientCompany ? "Готов" : "Не создан"} copy={clientCompany ? clientCompany.name : "Создайте для проверки пути клиента"} /></section>
      <section className="section panel"><div className="panel-header"><h2>Ваши профили и компании</h2><span>{organizations.length}</span></div>{organizations.length ? <div className="admin-org-grid">{organizations.map((organization) => <article className="admin-org-card" key={organization.id}><div className={`org-kind ${organization.kind.toLowerCase()}`}>{organization.kind === "SHIPPER" ? organization.profileType === "PERSONAL" ? "Личный клиент" : "Компания-клиент" : organization.kind === "PROVIDER" ? "Логист" : "Платформа"}</div><h3>{organization.name}</h3><p>{roleLabel(organization.role)}</p><dl><div><dt>Активные перевозки</dt><dd>{organization.activeShipments}</dd></div><div><dt>{organization.kind === "PROVIDER" ? "Тарифы" : organization.kind === "SHIPPER" ? "Запросы" : "Компании"}</dt><dd>{organization.primaryCount}</dd></div><div><dt>Сумма</dt><dd>{money(Number(organization.volume))}</dd></div></dl><button className="secondary-button" type="button" onClick={() => void onOpenOrganization(organization.id)}>Открыть кабинет</button></article>)}</div> : <EmptyState title="Профилей пока нет" copy="Создайте личный клиентский профиль или логистическую компанию, чтобы начать работу." action={<button className="primary-button" type="button" onClick={onCreateClient}>Создать клиентский профиль</button>} />}</section>
    </>}
  </>;
}

function AdminMetric({ label, value, copy }: { label: string; value: string; copy: string }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-delta">{copy}</div></article>; }
