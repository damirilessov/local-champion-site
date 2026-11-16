"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import ClientView from "./client-view";
import ProviderView from "./provider-view";
import PersonalAdminView from "./personal-admin-view";
import { Dialog, EmptyState, ErrorBanner, LoadingBlock } from "./freight-ui";
import type { ApiCall, DashboardState, Membership, Role, Session } from "./freight-types";
import { emptyDashboard, formatDate, money, roleLabel, statusClass } from "./freight-types";

type Notice = { message: string; tone: "success" | "error" };

export default function FreightApp({ identity }: { identity: { displayName: string; email: string } }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resourceVersion, setResourceVersion] = useState(0);
  const [organizationDialog, setOrganizationDialog] = useState(false);
  const [organizationDialogKind, setOrganizationDialogKind] = useState<"SHIPPER" | "PROVIDER">("SHIPPER");
  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"workspace" | "personal-admin">("workspace");
  const [providerSection, setProviderSection] = useState<"overview" | "shipments" | "rates" | "team">("overview");
  const [clientSection, setClientSection] = useState<"orders" | "team">("orders");

  const refreshSession = useCallback(async (organizationId?: string, silent = false) => {
    if (!silent) setSessionLoading(true);
    setSessionError(null);
    try {
      const response = await fetch("/api/session", {
        cache: "no-store",
        headers: organizationId ? { "x-organization-id": organizationId } : {},
      });
      const result = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить профиль");
      setSession(result);
      return result;
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Не удалось загрузить профиль");
      throw error;
    } finally {
      if (!silent) setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshSession().catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [refreshSession]);

  const refreshDashboard = useCallback(async () => {
    if (!session?.membership) return false;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await fetch("/api/state", {
        cache: "no-store",
        headers: { "x-organization-id": session.membership.organizationId },
      });
      const result = await response.json() as DashboardState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить данные компании");
      setDashboard(result);
      setDashboardReady(true);
      setResourceVersion((value) => value + 1);
      return true;
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Не удалось загрузить данные компании");
      return false;
    } finally {
      setDashboardLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.membership) return;
    const timer = window.setTimeout(() => void refreshDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [session?.membership, refreshDashboard]);

  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const api = useCallback<ApiCall>(async <T,>(path: string, method = "GET", payload?: unknown) => {
    const isFormData = payload instanceof FormData;
    const response = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        ...(payload !== undefined && !isFormData ? { "content-type": "application/json" } : {}),
        ...(session?.membership ? { "x-organization-id": session.membership.organizationId } : {}),
      },
      body: payload === undefined ? undefined : isFormData ? payload : JSON.stringify(payload),
    });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить действие");
    return result;
  }, [session]);

  const notify = useCallback((message: string, tone: "success" | "error" = "success") => setNotice({ message, tone }), []);
  const switchOrganization = useCallback(async (organizationId: string) => {
    setOrganizationSwitching(true);
    try {
      await refreshSession(organizationId);
      setDashboard(emptyDashboard);
      setDashboardReady(false);
      setWorkspaceView("workspace");
    } finally { setOrganizationSwitching(false); }
  }, [refreshSession]);

  if (sessionLoading && !session) return <main className="loading-page"><LoadingBlock label="Загружаем защищённое пространство…" /></main>;
  if (sessionError && !session) return <main className="auth-page"><section className="auth-card session-error"><h1>Не удалось открыть кабинет</h1><p>{sessionError}</p><button className="primary-button" type="button" onClick={() => void refreshSession().catch(() => undefined)}>Повторить</button></section></main>;
  if (!session?.membership) return <OnboardingView identity={identity} session={session} refreshSession={refreshSession} api={api} />;

  const membership = session.membership;
  const role: Role = membership.organizationKind === "PROVIDER" ? "provider" : membership.organizationKind === "PLATFORM" ? "admin" : "client";
  const canOperate = ["OWNER", "ADMIN", "OPERATIONS"].includes(membership.role);
  const canManageTeam = ["OWNER", "ADMIN"].includes(membership.role);
  const initials = session.user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">C</div><div><div className="brand-name">Champion Freights</div><div className="brand-subtitle">by Local Champion</div></div></div>
      <div className="nav-label">Рабочее пространство</div>
      <nav className="role-nav" aria-label="Разделы кабинета">
        {role === "provider" ? <>
          <NavButton label="Обзор" icon="ОБ" active={workspaceView === "workspace" && providerSection === "overview"} onClick={() => { setWorkspaceView("workspace"); setProviderSection("overview"); }} />
          <NavButton label="Перевозки" icon="ПР" active={workspaceView === "workspace" && providerSection === "shipments"} onClick={() => { setWorkspaceView("workspace"); setProviderSection("shipments"); }} />
          <NavButton label="Тарифы" icon="ТФ" active={workspaceView === "workspace" && providerSection === "rates"} onClick={() => { setWorkspaceView("workspace"); setProviderSection("rates"); }} />
          {canManageTeam && <NavButton label="Команда" icon="КМ" active={workspaceView === "workspace" && providerSection === "team"} onClick={() => { setWorkspaceView("workspace"); setProviderSection("team"); }} />}
        </> : role === "client" ? <><NavButton label="Поиск и заказы" icon="КЛ" active={workspaceView === "workspace" && clientSection === "orders"} onClick={() => { setWorkspaceView("workspace"); setClientSection("orders"); }} />{canManageTeam && <NavButton label="Команда" icon="КМ" active={workspaceView === "workspace" && clientSection === "team"} onClick={() => { setWorkspaceView("workspace"); setClientSection("team"); }} />}</> : <NavButton label="Платформа" icon="АД" active={workspaceView === "workspace"} onClick={() => setWorkspaceView("workspace")} />}
        <NavButton label="Моя админ-панель" icon="МА" active={workspaceView === "personal-admin"} onClick={() => setWorkspaceView("personal-admin")} />
      </nav>
      <label className="organization-switcher" htmlFor="organization-select"><span>Профиль или компания</span><select id="organization-select" disabled={organizationSwitching} value={membership.organizationId} onChange={(event) => void switchOrganization(event.target.value).catch((error) => notify(error instanceof Error ? error.message : "Не удалось переключить профиль", "error"))}>{session.memberships.map((item) => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}{item.organizationProfileType === "PERSONAL" ? " · личный" : ""}</option>)}</select></label>
      <button className="org-add" type="button" onClick={() => { setOrganizationDialogKind("SHIPPER"); setOrganizationDialog(true); }}>+ Добавить компанию</button>
      <div className="sidebar-card"><strong>● Система работает</strong><p>{membership.organizationName}<br />Роль: {roleLabel(membership.role)}</p></div>
    </aside>

    <main className="main-area" id="main-content">
      <div className="page">
        <header className="topbar"><div className="market-pill"><span className="live-dot" /> Центральная Азия · рабочая среда</div><div className="user-pill"><div className="user-avatar">{initials}</div><div className="user-meta"><strong>{session.user.displayName}</strong><span>{membership.organizationName}</span></div><a className="signout-link" href="/signout-with-chatgpt?return_to=%2F">Выйти</a></div></header>
        {session.pendingInvitations.length > 0 && <PendingInvitations invitations={session.pendingInvitations} activeOrganizationId={membership.organizationId} api={api} refreshSession={refreshSession} switchOrganization={switchOrganization} notify={notify} />}
        {(organizationSwitching || (!dashboardReady && dashboardLoading)) && <LoadingBlock label={organizationSwitching ? "Переключаем компанию…" : "Загружаем данные компании…"} />}
        {dashboardError && <ErrorBanner message={dashboardError} onRetry={() => void refreshDashboard()} />}
        {workspaceView === "personal-admin" && !organizationSwitching && <PersonalAdminView session={session} api={api} onOpenOrganization={switchOrganization} onCreateClient={() => { setOrganizationDialogKind("SHIPPER"); setOrganizationDialog(true); }} />}
        {workspaceView === "workspace" && dashboardReady && !organizationSwitching && <>{role === "client" && clientSection === "orders" && <ClientView state={dashboard} loading={dashboardLoading} canOperate={canOperate} api={api} refresh={refreshDashboard} notify={notify} />}
        {role === "provider" && providerSection !== "team" && <ProviderView section={providerSection} onNavigate={setProviderSection} state={dashboard} loading={dashboardLoading} canOperate={canOperate} api={api} refresh={refreshDashboard} notify={notify} />}
        {role === "admin" && <AdminView state={dashboard} loading={dashboardLoading} />}
        {role === "provider" && providerSection === "team" && <header className="page-header"><div><p className="eyebrow">Кабинет логистической компании · Команда</p><h1>Люди, роли и история действий</h1><p>Приглашения и журнал вынесены в отдельный раздел, чтобы не смешиваться с тарифами и перевозками.</p></div></header>}
        {role === "client" && clientSection === "team" && <header className="page-header"><div><p className="eyebrow">Кабинет клиента · Команда</p><h1>Люди, роли и история действий</h1><p>Доступы и аудит находятся отдельно от поиска и текущих заказов.</p></div></header>}
        {canManageTeam && ((role === "provider" && providerSection === "team") || (role === "client" && clientSection === "team")) && <><TeamPanel api={api} version={resourceVersion} managerRole={membership.role} notify={notify} /><AuditPanel api={api} version={resourceVersion} /></>}</>}
      </div>
    </main>

    {notice && <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}><span>{notice.message}</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice(null)}>×</button></div>}
    {organizationDialog && <OrganizationDialog initialKind={organizationDialogKind} api={api} onClose={() => setOrganizationDialog(false)} onCreated={async (organizationId) => { setOrganizationDialog(false); await switchOrganization(organizationId); notify("Компания добавлена"); }} />}
  </div>;
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) { return <button className={`role-button ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} type="button" onClick={onClick}><span className="nav-icon">{icon}</span>{label}</button>; }

function PendingInvitations({ invitations, activeOrganizationId, api, refreshSession, switchOrganization, notify }: { invitations: Session["pendingInvitations"]; activeOrganizationId: string; api: ApiCall; refreshSession: (organizationId?: string, silent?: boolean) => Promise<Session>; switchOrganization: (organizationId: string) => Promise<void>; notify: (message: string, tone?: "success" | "error") => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  async function respond(invitationId: string, action: "ACCEPT" | "DECLINE") { setBusyId(invitationId); try { const result = await api<{ organizationId?: string }>("/api/invitations/respond", "POST", { invitationId, action }); if (action === "ACCEPT" && result.organizationId) { await switchOrganization(result.organizationId); notify("Приглашение принято — компания открыта"); } else { await refreshSession(activeOrganizationId, true); notify("Приглашение отклонено"); } } catch (error) { notify(error instanceof Error ? error.message : "Не удалось ответить на приглашение", "error"); } finally { setBusyId(null); } }
  return <section className="pending-invites workspace-invites"><h2>Новые приглашения</h2>{invitations.map((invite) => <article key={invite.id}><div><strong>{invite.organizationName}</strong><small>{roleLabel(invite.role)} · до {formatDate(invite.expiresAt)}</small></div><div><button className="ghost-button" type="button" disabled={busyId === invite.id} onClick={() => void respond(invite.id, "DECLINE")}>Отклонить</button><button className="primary-button" type="button" disabled={busyId === invite.id} onClick={() => void respond(invite.id, "ACCEPT")}>Принять</button></div></article>)}</section>;
}

function OnboardingView({ identity, session, refreshSession, api }: { identity: { displayName: string; email: string }; session: Session; refreshSession: (organizationId?: string, silent?: boolean) => Promise<Session>; api: ApiCall }) {
  const [dialog, setDialog] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function respond(invitationId: string, action: "ACCEPT" | "DECLINE") { setChecking(true); setError(null); try { const result = await api<{ organizationId?: string }>("/api/invitations/respond", "POST", { invitationId, action }); if (action === "ACCEPT" && result.organizationId) await refreshSession(result.organizationId); else await refreshSession(undefined, true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось ответить на приглашение"); } finally { setChecking(false); } }
  return <main className="auth-page"><section className="auth-card onboarding-card"><div className="brand-mark">A</div><p className="eyebrow">Добро пожаловать, {identity.displayName}</p><h1>Настроим рабочее пространство</h1><p>Сначала создайте компанию или примите приглашение. Тип компании определяет кабинет, но позже вы сможете добавить другое рабочее пространство.</p>{session.pendingInvitations.length > 0 && <section className="pending-invites"><h2>Вас приглашают</h2>{session.pendingInvitations.map((invite) => <article key={invite.id}><div><strong>{invite.organizationName}</strong><small>{invite.organizationKind === "PROVIDER" ? "Логистическая компания" : "Клиент"} · роль {roleLabel(invite.role)} · до {formatDate(invite.expiresAt)}</small></div><div><button className="secondary-button" type="button" disabled={checking} onClick={() => void respond(invite.id, "DECLINE")}>Отклонить</button><button className="primary-button" type="button" disabled={checking} onClick={() => void respond(invite.id, "ACCEPT")}>Принять</button></div></article>)}</section>}<ol className="onboarding-steps"><li><strong>1. Компания</strong><span>Название и сторона перевозки</span></li><li><strong>2. Первый сценарий</strong><span>Тариф для логиста или запрос для клиента</span></li><li><strong>3. Команда</strong><span>Пригласите коллег с нужными ролями</span></li></ol>{error && <ErrorBanner message={error} />}<div className="dialog-actions onboarding-actions"><button className="primary-button" type="button" onClick={() => setDialog(true)}>Создать компанию</button><button className="secondary-button" disabled={checking} type="button" onClick={async () => { setChecking(true); setError(null); try { const result = await refreshSession(undefined, true); if (!result.pendingInvitations.length) setError("Активных приглашений для этого email пока нет"); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось проверить приглашение"); } finally { setChecking(false); } }}>{checking ? "Проверяем…" : "Проверить приглашение"}</button></div><a className="signout-link" href="/signout-with-chatgpt?return_to=%2F">Выйти из аккаунта {identity.email}</a></section>{dialog && <OrganizationDialog api={api} onClose={() => setDialog(false)} onCreated={async (organizationId) => { setDialog(false); await refreshSession(organizationId); }} />}</main>;
}

function OrganizationDialog({ initialKind = "SHIPPER", api, onClose, onCreated }: { initialKind?: "SHIPPER" | "PROVIDER"; api: ApiCall; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"PERSONAL" | "SHIPPER" | "PROVIDER">(initialKind === "PROVIDER" ? "PROVIDER" : "PERSONAL");
  const [providerProfile, setProviderProfile] = useState({ country: "Казахстан", businessId: "", contactName: "", contactPhone: "", serviceRegion: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { const result = await api<{ organizationId: string }>("/api/organizations", "POST", { name, kind: accountType === "PROVIDER" ? "PROVIDER" : "SHIPPER", profileType: accountType === "PERSONAL" ? "PERSONAL" : "BUSINESS", ...(accountType === "PROVIDER" ? providerProfile : {}) }); await onCreated(result.organizationId); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать профиль"); } finally { setSaving(false); } }
  return <Dialog title="Добавить профиль" onClose={onClose} actions={<><button className="ghost-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit" form="organization-form" disabled={saving}>{saving ? "Создаём…" : "Создать"}</button></>}><form id="organization-form" className="dialog-form" onSubmit={submit}>{error && <ErrorBanner message={error} />}<div className="field"><label htmlFor="organization-name">{accountType === "PERSONAL" ? "Имя профиля" : "Название компании"}</label><input id="organization-name" value={name} minLength={2} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={accountType === "PERSONAL" ? "Например, Дамир" : "Например, Champion Trade"} required /></div><fieldset className="choice-grid"><legend>Как вы хотите работать?</legend><label htmlFor="kind-personal" aria-label="Личный клиент"><input id="kind-personal" type="radio" name="kind" value="PERSONAL" checked={accountType === "PERSONAL"} onChange={() => setAccountType("PERSONAL")} /><span><strong>Личный клиент</strong><small>Ищу перевозку для себя, без создания компании</small></span></label><label htmlFor="kind-shipper" aria-label="Компания-клиент"><input id="kind-shipper" type="radio" name="kind" value="SHIPPER" checked={accountType === "SHIPPER"} onChange={() => setAccountType("SHIPPER")} /><span><strong>Компания-клиент</strong><small>Заказываю перевозки от имени юридического лица</small></span></label><label htmlFor="kind-provider" aria-label="Логистическая компания"><input id="kind-provider" type="radio" name="kind" value="PROVIDER" checked={accountType === "PROVIDER"} onChange={() => setAccountType("PROVIDER")} /><span><strong>Логистическая компания</strong><small>Публикую тарифы и веду перевозки</small></span></label></fieldset>{accountType === "PROVIDER" && <div className="form-section"><h3>Профиль логистической компании</h3><div className="form-body">{([['country','Страна','Казахстан'],['businessId','БИН / регистрационный номер','123456789012'],['contactName','Операционный контакт','Имя и фамилия'],['contactPhone','Телефон','+7 700 000 00 00'],['serviceRegion','География работы','Казахстан, Китай, Европа']] as const).map(([key, label, placeholder]) => <div className="field" key={key}><label htmlFor={`provider-${key}`}>{label}</label><input id={`provider-${key}`} value={providerProfile[key]} onChange={(event) => setProviderProfile({ ...providerProfile, [key]: event.target.value })} placeholder={placeholder} required /></div>)}</div></div>}</form></Dialog>;
}

function AdminView({ state, loading }: { state: DashboardState; loading: boolean }) {
  return <><header className="page-header"><div><p className="eyebrow">Операционный контур</p><h1>Платформа под контролем</h1><p>Только фактические запросы, поставщики и перевозки — без демонстрационных показателей.</p></div></header><section className="metric-grid"><Metric label="Оборот" value={money(state.metrics.monthlyGmv)} copy="По текущей выборке" /><Metric label="Открытые запросы" value={String(state.metrics.openRequests)} copy="Ожидают решения" /><Metric label="Поставщики" value={String(state.metrics.providers)} copy="Доступны платформе" /><Metric label="Активные перевозки" value={String(state.metrics.activeShipments)} copy="Не закрыты и не отменены" /></section><section className="section panel"><div className="panel-header"><h2>Перевозки платформы</h2><span>{state.shipments.length}</span></div>{loading ? <LoadingBlock /> : state.shipments.length ? <div className="shipment-card-list">{state.shipments.map((shipment) => <div className="shipment-row static" key={shipment.id}><span><strong>{shipment.reference}</strong><small>{shipment.provider}</small></span><span><strong>{shipment.origin} → {shipment.destination}</strong><small>{shipment.updatedAt}</small></span><span className={statusClass(shipment.status)}>{shipment.statusLabel}</span><span><strong>{money(shipment.price, shipment.currency)}</strong><small>ETA {shipment.eta}</small></span></div>)}</div> : <EmptyState title="Перевозок пока нет" copy="Здесь появятся реальные заказы платформы." />}</section></>;
}

function TeamPanel({ api, version, managerRole, notify }: { api: ApiCall; version: number; managerRole: Membership["role"]; notify: (message: string, tone?: "success" | "error") => void }) {
  type TeamData = { members: Array<{ id: string; displayName: string; email: string; role: Membership["role"]; status: string }>; invitations: Array<{ id: string; email: string; role: Membership["role"]; status: string; expiresAt: string }> };
  const [data, setData] = useState<TeamData>({ members: [], invitations: [] });
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("OPERATIONS");
  const [inviting, setInviting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setLoadError(null); try { setData(await api<TeamData>("/api/invitations")); } catch (error) { setLoadError(error instanceof Error ? error.message : "Не удалось загрузить команду"); } finally { setLoading(false); } }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, version]);
  async function invite(event: FormEvent) { event.preventDefault(); setInviting(true); try { await api("/api/invitations", "POST", { email, role }); setEmail(""); await load(); notify("Приглашение создано на 7 дней. Письмо не отправляется автоматически — сообщите коллеге, что нужно войти с этим email."); } catch (error) { notify(error instanceof Error ? error.message : "Не удалось создать приглашение", "error"); } finally { setInviting(false); } }
  async function updateTeam(payload: { target: "INVITATION" | "MEMBER"; id: string; role?: string }) { try { await api("/api/invitations", "PATCH", payload); await load(); notify(payload.target === "INVITATION" ? "Приглашение отозвано" : "Роль участника обновлена"); } catch (error) { notify(error instanceof Error ? error.message : "Не удалось обновить команду", "error"); } }
  const pending = data.invitations.filter((item) => item.status === "PENDING" && new Date(item.expiresAt) > new Date());
  return <section className="section panel team-panel"><div className="panel-header"><h2>Команда и доступ</h2><span>{data.members.length} участников · {pending.length} приглашений</span></div><form className="invite-form" onSubmit={invite}><div className="field"><label htmlFor="invite-email">Email сотрудника</label><input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field"><label htmlFor="invite-role">Роль</label><select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMIN">Администратор</option><option value="OPERATIONS">Операции</option><option value="FINANCE">Финансы</option><option value="VIEWER">Наблюдатель</option></select></div><button className="primary-button" disabled={inviting}>{inviting ? "Создаём…" : "Пригласить"}</button></form>{loadError ? <ErrorBanner message={loadError} onRetry={() => void load()} /> : loading ? <LoadingBlock /> : <div className="team-lists"><div><h3>Участники</h3>{data.members.map((member) => <div className="team-person" key={member.id}><span><strong>{member.displayName}</strong><small>{member.email}</small></span>{managerRole === "OWNER" && member.role !== "OWNER" ? <select aria-label={`Роль ${member.displayName}`} value={member.role} onChange={(event) => void updateTeam({ target: "MEMBER", id: member.id, role: event.target.value })}><option value="ADMIN">Администратор</option><option value="OPERATIONS">Операции</option><option value="FINANCE">Финансы</option><option value="VIEWER">Наблюдатель</option></select> : <span>{roleLabel(member.role)}</span>}</div>)}</div><div><h3>Ожидают входа</h3>{pending.length ? pending.map((invite) => <div className="team-person" key={invite.id}><span><strong>{invite.email}</strong><small>{roleLabel(invite.role)} · до {formatDate(invite.expiresAt)}</small></span><button className="ghost-button" type="button" onClick={() => void updateTeam({ target: "INVITATION", id: invite.id })}>Отозвать</button></div>) : <p className="muted-copy">Нет активных приглашений</p>}</div></div>}</section>;
}

function AuditPanel({ api, version }: { api: ApiCall; version: number }) {
  type AuditEvent = { id: string; action: string; entityType: string; actorName: string; actorEmail: string; createdAt: string };
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const result = await api<{ events: AuditEvent[] }>("/api/audit"); setEvents(result.events); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить журнал"); } finally { setLoading(false); } }, [api]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, version]);
  return <section className="section panel"><div className="panel-header"><h2>Журнал действий</h2><span>Неизменяемая история компании</span></div>{error ? <ErrorBanner message={error} onRetry={() => void load()} /> : loading ? <LoadingBlock /> : events.length ? <div className="audit-list">{events.slice(0, 20).map((event) => <div className="audit-row" key={event.id}><span><strong>{actionLabel(event.action)}</strong><small>{entityLabel(event.entityType)}</small></span><span><strong>{event.actorName}</strong><small>{event.actorEmail}</small></span><time dateTime={event.createdAt}>{formatDate(event.createdAt, true)}</time></div>)}</div> : <EmptyState title="Действий пока нет" copy="События компании появятся здесь автоматически." />}</section>;
}

function Metric({ label, value, copy }: { label: string; value: string; copy: string }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-delta">{copy}</div></article>; }
function actionLabel(value: string) { return ({ ORGANIZATION_CREATED: "Компания создана", INVITATION_CREATED: "Приглашение создано", INVITATION_ACCEPTED: "Приглашение принято", INVITATION_DECLINED: "Приглашение отклонено", INVITATION_REVOKED: "Приглашение отозвано", MEMBERSHIP_ROLE_CHANGED: "Роль участника изменена", RATE_PUBLISHED: "Тариф опубликован", QUOTE_REQUEST_CREATED: "Запрос тарифа создан", SHIPMENT_BOOKED: "Перевозка создана", SHIPMENT_STATUS_CHANGED: "Статус перевозки изменён", SHIPMENT_PAYMENT_CONFIRMED: "Оплата подтверждена", SHIPMENT_DOCUMENT_UPLOADED: "Документ перевозки загружен", PLATFORM_BOOTSTRAPPED: "Администратор платформы назначен" } as Record<string, string>)[value] ?? "Системное действие"; }
function entityLabel(value: string) { return ({ organization: "Компания", organization_invitation: "Приглашение", rate: "Тариф", quote_request: "Запрос", shipment: "Перевозка", platform: "Платформа" } as Record<string, string>)[value] ?? "Запись"; }
