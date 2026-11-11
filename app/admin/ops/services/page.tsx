'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadges } from '@/components/admin/ops/ServiceForm';
import { LabeledDate } from '@/components/admin/DateField';
import { Badge, Details, Empty, EntityLink, Flash, PageHead, Unknown, field, fmtDate, label as labelCls, small } from '@/components/admin/ops/ui';
import { IMPORT_FIELDS, guessMapping, parseCsv, toCsv, validateImport, type ImportField, type ImportRow } from '@/lib/ops/csv';
import { createService, loadOps, type OpsData, type Party, type Project } from '@/lib/ops/data';
import {
  AUTO_RENEW_LABEL,
  KIND_LABEL,
  PAY_STATE_LABEL,
  PERIOD_LABEL,
  RENEW_STATE_LABEL,
  SERVICE_KINDS,
  SERVICE_STATUS_LABEL,
  SERVICE_STATUSES,
  daysUntil,
  dueText,
  istanbulDay,
  missingInfo,
  payState,
  renewState,
  type PaySummary,
  type Period,
  type PeriodRow,
  type RenewState,
  type Service,
  type ServiceKind,
} from '@/lib/ops/model';

/**
 * Yoca Operasyon — Hizmetler ve varlıklar (list).
 * Filters live in the URL so other pages can link here, e.g.
 * /admin/ops/services?renew=awaiting · ?within=30 · ?missing=1 · ?client=<id>.
 * CSV export = the filtered rows; CSV import only ever ADDS services.
 */

const BASE = '/admin/ops/services';
const RENEW_FILTER: Record<string, RenewState> = { awaiting: 'awaiting_verification', overdue: 'overdue', upcoming: 'upcoming', unknown_date: 'unknown_date' };
const RENEW_FILTER_LABEL: Record<string, string> = { awaiting: 'Doğrulama bekliyor', overdue: 'Bitiş geçti', upcoming: 'Yaklaşıyor', unknown_date: 'Bitiş tarihi bilinmiyor' };
const lc = (v: string) => v.toLocaleLowerCase('tr-TR');

interface Row {
  s: Service;
  open: PeriodRow | null;
  clients: Party[];
  projects: Project[];
  provider: Party | null;
  end: string | null;
  renew: RenewState;
  pin: PaySummary | null;
  pout: PaySummary | null;
  missing: string[];
  domain: string;
}

function buildRows(data: OpsData, today: string): Row[] {
  const openBy = new Map<string, PeriodRow>();
  for (const p of data.periods) if (p.status === 'open') openBy.set(p.service_id, p);
  const partyBy = new Map(data.parties.map((p) => [p.id, p] as const));
  const projectBy = new Map(data.projects.map((p) => [p.id, p] as const));
  return data.services.map((s) => {
    const open = openBy.get(s.id) ?? null;
    const pays = data.payments.filter((p) => p.service_id === s.id);
    const links = data.links.filter((l) => l.service_id === s.id);
    const clients = links.map((l) => (l.client_id ? partyBy.get(l.client_id) : undefined)).filter((x): x is Party => Boolean(x));
    const projects = links.map((l) => (l.project_id ? projectBy.get(l.project_id) : undefined)).filter((x): x is Project => Boolean(x));
    const d = s.details ?? {};
    const domain = [d.domain, ...(Array.isArray(d.domains) ? d.domains : [])].filter((x) => typeof x === 'string' && x).join(', ');
    return {
      s, open, clients, projects,
      provider: s.provider_id ? partyBy.get(s.provider_id) ?? null : null,
      end: s.is_perpetual ? null : open?.ends_on ?? s.end_on,
      renew: renewState(s, open, pays, today),
      pin: open ? payState(open, pays, 'in', today) : null,
      pout: open ? payState(open, pays, 'out', today) : null,
      missing: missingInfo(s),
      domain,
    };
  });
}

function EndCell({ r, today }: { r: Row; today: string }) {
  if (r.s.is_perpetual) return <span>Süresiz</span>;
  if (!r.end) return r.s.period === 'once' ? <span className="text-subtle">Tek seferlik</span> : <Unknown>Bitiş tarihi bilinmiyor</Unknown>;
  const left = daysUntil(r.end, today);
  return (
    <span className="grid">
      <span className="tabular-nums">{fmtDate(r.end)}</span>
      <span className={`text-[11px] ${left < 0 ? 'text-red-300' : left <= 30 ? 'text-yellow-200' : 'text-subtle'}`}>{dueText(r.end, today)}</span>
    </span>
  );
}

function ServicesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const [showImport, setShowImport] = useState(false);
  const today = istanbulDay();
  const reload = () => loadOps().then(setData);
  useEffect(() => { void reload(); }, []);

  const get = (k: string) => params.get(k) ?? '';
  const f = {
    kind: get('kind'), status: get('status'), owner: get('owner'), renew: get('renew'), within: get('within'), missing: get('missing') === '1',
    autorenew: get('autorenew'), client: get('client'), provider: get('provider'), from: get('from'), to: get('to'), archived: get('archived') === '1', q: get('q'), sort: get('sort') || 'end',
  };
  const [q, setQ] = useState(f.q);
  // Only an outside change of ?q (link, back button, "temizle") resets the box; other filters don't.
  useEffect(() => { setQ(f.q); }, [f.q]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    const qs = next.toString();
    router.replace(qs ? `${BASE}?${qs}` : BASE, { scroll: false });
  };
  // Search box → URL (debounced), so the result can be shared as a link.
  useEffect(() => {
    if (q === (params.get('q') ?? '')) return;
    const t = setTimeout(() => setParams({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (data?.ready ? buildRows(data, today) : []), [data, today]);
  const projectClient = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p.client_id] as const)), [data]);

  const visible = useMemo(() => {
    const needle = lc(f.q.trim());
    const within = Number(f.within);
    const out = rows.filter((r) => {
      const s = r.s;
      if (f.archived ? !s.archived_at : s.archived_at) return false;
      if (f.kind && s.kind !== f.kind) return false;
      if (f.status && s.status !== f.status) return false;
      if (f.owner && lc(s.team_owner ?? '') !== lc(f.owner)) return false;
      if (f.renew && RENEW_FILTER[f.renew] && r.renew !== RENEW_FILTER[f.renew]) return false;
      if ([7, 30, 90].includes(within)) { if (!r.end) return false; const d = daysUntil(r.end, today); if (d < 0 || d > within) return false; }
      if (f.missing && r.missing.length === 0) return false;
      if (f.autorenew === 'unverified' && !(s.auto_renew === 'on' && r.renew === 'awaiting_verification')) return false;
      if (f.client && !(r.clients.some((c) => c.id === f.client) || r.projects.some((p) => projectClient.get(p.id) === f.client) || s.owner_client_id === f.client || s.payer_client_id === f.client)) return false;
      if (f.provider && s.provider_id !== f.provider) return false;
      if (f.from && (!r.end || r.end < f.from)) return false;
      if (f.to && (!r.end || r.end > f.to)) return false;
      if (needle) {
        const hay = [s.name, r.domain, r.provider?.name ?? '', ...r.clients.map((c) => c.name)].map(lc);
        if (!hay.some((h) => h.includes(needle))) return false;
      }
      return true;
    });
    return out.sort((a, b) => (f.sort === 'name' ? a.s.name.localeCompare(b.s.name, 'tr') : (a.end ?? '9999-99-99').localeCompare(b.end ?? '9999-99-99') || a.s.name.localeCompare(b.s.name, 'tr')));
  }, [rows, f.q, f.within, f.archived, f.kind, f.status, f.owner, f.renew, f.missing, f.autorenew, f.client, f.provider, f.from, f.to, f.sort, today, projectClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = ['kind', 'status', 'owner', 'renew', 'within', 'missing', 'autorenew', 'client', 'provider', 'from', 'to', 'archived', 'q'].filter((k) => params.get(k));
  const owners = useMemo(() => Array.from(new Set((data?.services ?? []).map((s) => (s.team_owner ?? '').trim()).filter(Boolean))).sort(), [data]);
  const customers = (data?.parties ?? []).filter((p) => !p.roles.includes('provider') || p.roles.includes('customer'));
  const providers = (data?.parties ?? []).filter((p) => p.roles.includes('provider'));

  const exportCsv = () => {
    const header = ['Kayıt adı', 'Tür', 'Durum', 'Müşteri (ad)', 'Projeler', 'Sağlayıcı (ad)', 'Alan adı (domain)', 'Başlangıç', 'Bitiş', 'Süresiz', 'Ödeme vadesi', 'İptal son günü',
      'Yenileme dönemi', 'Otomatik yenileme', 'Alış bedeli', 'Alış para birimi', 'Satış bedeli', 'Satış para birimi', 'Tahsilat durumu', 'Sağlayıcı ödemesi', 'Yenileme durumu', 'Ekip sorumlusu', 'Eksik bilgi', 'Etiketler', 'Not', 'Arşivde', 'Kayıt no'];
    const body = visible.map((r) => {
      const s = r.s;
      return [s.name, s.kind, SERVICE_STATUS_LABEL[s.status], r.clients.map((c) => c.name).join(', '), r.projects.map((p) => p.name).join(', '), r.provider?.name ?? '', r.domain,
        s.start_on ?? '', s.is_perpetual ? '' : s.end_on ?? '', s.is_perpetual ? 'Evet' : '', s.due_on ?? '', s.cancel_by ?? '',
        s.period ? PERIOD_LABEL[s.period] : '', AUTO_RENEW_LABEL[s.auto_renew], s.cost_amount ?? '', s.cost_currency ?? '', s.price_amount ?? '', s.price_currency ?? '',
        r.pin ? PAY_STATE_LABEL[r.pin.state] : 'Dönem yok', r.pout ? PAY_STATE_LABEL[r.pout.state] : 'Dönem yok', RENEW_STATE_LABEL[r.renew], s.team_owner ?? '', r.missing.join(', '), s.tags, s.note ?? '', s.archived_at ? 'Evet' : '', s.id];
    });
    const blob = new Blob([toCsv(header, body)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hizmetler-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sel = (k: string, title: string, options: Array<[string, string]>) => (
    <label className="admin-label">{title}
      <select className={field} value={get(k)} onChange={(e) => setParams({ [k]: e.target.value || null })}>
        <option value="">Tümü</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="grid gap-5">
      <PageHead
        title="Hizmetler ve varlıklar"
        sub="Domain, hosting, sunucu, e-posta, SSL, abonelik ve bakım kayıtları. Hizmet durumu, tahsilat, sağlayıcı ödemesi ve yenileme ayrı ayrı izlenir."
        actions={<>
          <button type="button" className="admin-btn" onClick={() => setShowImport((v) => !v)} aria-expanded={showImport} disabled={!data?.ready}>CSV içe aktar</button>
          <button type="button" className="admin-btn" onClick={exportCsv} disabled={!visible.length}>CSV dışa aktar ({visible.length})</button>
          <Link href={`${BASE}/new${f.client ? `?client=${encodeURIComponent(f.client)}` : ''}`} className="admin-btn-primary">+ Yeni hizmet</Link>
        </>}
      />

      {data && !data.ready && <Flash tone="bad" message={data.error ?? 'Veriler yüklenemedi.'} />}
      {showImport && data?.ready && <ImportPanel data={data} onImported={reload} onClose={() => setShowImport(false)} />}

      <section className="admin-card grid gap-3" aria-label="Filtreler">
        <div className="flex flex-wrap items-end gap-2">
          <label className="admin-label min-w-[220px] flex-1">Ara
            <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, alan adı, müşteri veya sağlayıcı" aria-label="Hizmet ara" />
          </label>
          <label className="admin-label">Sırala
            <select className={field} value={f.sort} onChange={(e) => setParams({ sort: e.target.value === 'end' ? null : e.target.value })}>
              <option value="end">Bitiş tarihi</option><option value="name">Ad</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {sel('kind', 'Tür', SERVICE_KINDS.map((k) => [k, KIND_LABEL[k]]))}
          {sel('status', 'Hizmet durumu', SERVICE_STATUSES.map((k) => [k, SERVICE_STATUS_LABEL[k]]))}
          {sel('renew', 'Yenileme', Object.entries(RENEW_FILTER_LABEL))}
          {sel('within', 'Bitiş', [['7', '7 gün içinde'], ['30', '30 gün içinde'], ['90', '90 gün içinde']])}
          {sel('owner', 'Ekip sorumlusu', owners.map((o) => [o, o]))}
          {sel('client', 'Müşteri', customers.map((p) => [p.id, p.name]))}
          {sel('provider', 'Sağlayıcı', providers.map((p) => [p.id, p.name]))}
          <LabeledDate className="lg:col-span-2" label="Bitiş (başlangıç)" value={f.from} max={f.to || null} today={today} onChange={(v) => setParams({ from: v || null })} />
          <LabeledDate className="lg:col-span-2" label="Bitiş (son)" value={f.to} min={f.from || null} today={today} onChange={(v) => setParams({ to: v || null })} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-soft">
          <label className="flex items-center gap-2"><input type="checkbox" className="admin-check" checked={f.missing} onChange={(e) => setParams({ missing: e.target.checked ? '1' : null })} />Eksik bilgisi olanlar</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="admin-check" checked={f.autorenew === 'unverified'} onChange={(e) => setParams({ autorenew: e.target.checked ? 'unverified' : null })} />Otomatik yenileme doğrulanmamış</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="admin-check" checked={f.archived} onChange={(e) => setParams({ archived: e.target.checked ? '1' : null })} />Yalnızca arşivdekiler</label>
          {active.length > 0 && <button type="button" className={small} onClick={() => { setQ(''); router.replace(BASE, { scroll: false }); }}>Filtreleri temizle</button>}
        </div>
      </section>

      {!data ? <p className="text-[14px] text-muted">Yükleniyor…</p> : data.ready && (
        visible.length === 0 ? (
          <Empty
            text={rows.length === 0 ? 'Henüz hizmet kaydı yok. Yalnızca ad ve tür girerek ilk kaydı oluşturabilir veya CSV ile içe aktarabilirsiniz.' : 'Bu filtrelere uyan hizmet yok.'}
            action={rows.length === 0 ? <Link href={`${BASE}/new`} className="admin-btn-primary">+ Yeni hizmet</Link> : <button type="button" className="admin-btn" onClick={() => { setQ(''); router.replace(BASE, { scroll: false }); }}>Filtreleri temizle</button>}
          />
        ) : (
          <div className="grid gap-2">
            <p className="text-[12px] text-subtle">{visible.length} kayıt{active.length ? ' (filtreli)' : ''}</p>
            <div className="admin-table-wrap admin-table-cards-lg">
              <table className="admin-table min-w-[960px]">
                <thead>
                  <tr>
                    <th>Hizmet</th>
                    <th>Müşteri / proje</th>
                    <th>Sağlayıcı</th>
                    <th>Bitiş</th>
                    <th>Durumlar</th>
                    <th>Sorumlu</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.s.id}>
                      <td data-primary>
                        <EntityLink href={`${BASE}/${r.s.id}`}>{r.s.name}</EntityLink>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px] text-subtle">
                          {KIND_LABEL[r.s.kind]}{r.domain && r.domain !== r.s.name ? ` · ${r.domain}` : ''}
                          {r.s.archived_at && <Badge>Arşivde</Badge>}
                          {r.missing.length > 0 && <Badge tone="warn" title="Eksik bilgi">Eksik: {r.missing.join(', ')}</Badge>}
                        </span>
                      </td>
                      <td data-label="Müşteri / proje">
                        {r.clients.length || r.projects.length ? (
                          <span className="grid gap-0.5">
                            {r.clients.map((c) => <span key={c.id}>{c.name}</span>)}
                            {r.projects.map((p) => <span key={p.id} className="text-[12px] text-subtle">Proje: {p.name}</span>)}
                          </span>
                        ) : <Unknown>Bağlı değil</Unknown>}
                      </td>
                      <td data-label="Sağlayıcı">{r.provider ? r.provider.name : <Unknown />}</td>
                      <td data-label="Bitiş"><EndCell r={r} today={today} /></td>
                      <td data-label="Durumlar"><StatusBadges compact status={r.s.status} collection={r.pin?.state ?? null} provider={r.pout?.state ?? null} renew={r.renew} /></td>
                      <td data-label="Sorumlu">{r.s.team_owner || <Unknown>Atanmadı</Unknown>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ── CSV import (adds only; never updates existing records) ───────── */

interface ImportResult {
  created: Array<{ line: number; name: string; id: string; notes: string[] }>;
  skipped: Array<{ line: number; name: string; reason: string }>;
  failed: Array<{ line: number; name: string; error: string }>;
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;

function ImportPanel({ data, onImported, onClose }: { data: OpsData; onImported: () => Promise<unknown> | void; onClose: () => void }) {
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const running = useRef(false);

  const header = table?.[0] ?? [];
  const body = useMemo(() => (table ? table.slice(1) : []), [table]);
  const existing = useMemo(() => data.services.map((s) => ({ id: s.id, name: s.name, kind: s.kind, domain: typeof s.details?.domain === 'string' ? (s.details.domain as string) : null })), [data.services]);
  // Lines created in this session are compared against the records as they were before the import.
  const baseExisting = useRef(existing);
  const preview = useMemo<ImportRow[]>(() => (table ? validateImport(body, mapping, baseExisting.current) : []), [table, body, mapping]);

  const byName = useMemo(() => {
    const m = new Map<string, Party[]>();
    for (const p of data.parties) {
      const k = lc(p.name.trim());
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [data.parties]);
  const matchParty = (name: string): { party?: Party; problem?: string } => {
    const hits = byName.get(lc(name.trim())) ?? [];
    if (hits.length === 1) return { party: hits[0] };
    if (hits.length > 1) return { problem: `“${name}” adıyla ${hits.length} kayıt var (belirsiz), bağlanmadı` };
    return { problem: `“${name}” bulunamadı, bağlanmadı` };
  };
  const matchClients = (raw: string): { ids: string[]; problems: string[] } => {
    const whole = matchParty(raw);
    if (whole.party) return { ids: [whole.party.id], problems: [] };
    const parts = raw.split(/\s*[,;]\s*/).filter(Boolean);
    if (parts.length < 2) return { ids: [], problems: [`Müşteri ${whole.problem}`] };
    const ids: string[] = [];
    const problems: string[] = [];
    for (const p of parts) { const m = matchParty(p); if (m.party) ids.push(m.party.id); else problems.push(`Müşteri ${m.problem}`); }
    return { ids: Array.from(new Set(ids)), problems };
  };

  // Default ticks: rows without errors and not a possible duplicate.
  useEffect(() => {
    const next: Record<number, boolean> = {};
    for (const r of preview) next[r.line] = r.errors.length === 0 && !r.duplicateOf;
    setPicked(next);
  }, [preview]);

  const load = async (file: File | undefined) => {
    setError(null); setResult(null); setDone({}); setTable(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('Dosya 2 MB’tan büyük.'); return; }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { setError('Dosyada başlık satırı ve en az bir veri satırı olmalı.'); return; }
    if (parsed.length - 1 > MAX_ROWS) { setError(`En çok ${MAX_ROWS} satır içe aktarılabilir (dosyada ${parsed.length - 1}).`); return; }
    baseExisting.current = existing;
    setFileName(file.name);
    setMapping(guessMapping(parsed[0]));
    setTable(parsed);
  };

  const mappedOk = mapping.name !== undefined && mapping.kind !== undefined;
  const tickable = (r: ImportRow) => r.errors.length === 0 && !done[r.line];
  const chosen = preview.filter((r) => picked[r.line] && tickable(r));

  const run = async () => {
    if (running.current || !chosen.length) return;
    running.current = true;
    setBusy(true); setError(null);
    const res: ImportResult = { created: [], skipped: [], failed: [] };
    const createdNow: Record<number, string> = {};
    for (const r of preview) {
      const name = r.values.name ?? '(adsız)';
      if (done[r.line]) { res.skipped.push({ line: r.line, name, reason: 'Bu oturumda zaten oluşturuldu.' }); continue; }
      if (r.errors.length) { res.skipped.push({ line: r.line, name, reason: r.errors.join(' ') }); continue; }
      if (!picked[r.line]) { res.skipped.push({ line: r.line, name, reason: r.duplicateOf ? `Olası mükerrer: ${r.duplicateOf} (seçilmedi)` : 'Seçilmedi.' }); continue; }
    }
    let i = 0;
    for (const r of chosen) {
      i += 1;
      setProgress(`${i} / ${chosen.length} kaydediliyor…`);
      const v = r.values;
      const notes: string[] = [];
      let provider_id: string | null = null;
      if (v.provider) {
        const m = matchParty(v.provider);
        if (m.party) { provider_id = m.party.id; if (!m.party.roles.includes('provider')) notes.push(`“${m.party.name}” sağlayıcı rolünde değil (yine de bağlandı)`); }
        else notes.push(`Sağlayıcı ${m.problem}`);
      }
      const links: Array<{ client_id: string }> = [];
      if (v.client) { const m = matchClients(v.client); links.push(...m.ids.map((id) => ({ client_id: id }))); notes.push(...m.problems); }
      const kind = v.kind as ServiceKind;
      const details: Record<string, unknown> = {};
      if (v.domain) { details.domain = v.domain; if (kind === 'ssl') details.domains = [v.domain]; }
      const payload: Partial<Service> = {
        name: v.name ?? '', kind, start_on: v.start_on, end_on: v.end_on, due_on: v.due_on, period: (v.period as Period | null) ?? null,
        auto_renew: (v.auto_renew as Service['auto_renew']) ?? 'unknown', cost_amount: v.cost_amount, cost_currency: v.cost_currency,
        price_amount: v.price_amount, price_currency: v.price_currency, team_owner: v.team_owner, note: v.note, details, provider_id,
      };
      try {
        const out = await createService(payload, links);
        if (out.id) {
          createdNow[r.line] = out.id;
          if (out.warning) notes.push(out.warning);
          res.created.push({ line: r.line, name: payload.name ?? '', id: out.id, notes });
        } else res.failed.push({ line: r.line, name: payload.name ?? '', error: out.error ?? 'Bilinmeyen hata' });
      } catch (e) {
        res.failed.push({ line: r.line, name: payload.name ?? '', error: (e as Error).message });
      }
    }
    setDone((prev) => ({ ...prev, ...createdNow }));
    setResult(res);
    setProgress('');
    setBusy(false);
    running.current = false;
    await onImported();
  };

  const partyHint = (raw: string | null, isClient: boolean) => {
    if (!raw) return <Unknown>—</Unknown>;
    const ok = isClient ? matchClients(raw).problems.length === 0 : Boolean(matchParty(raw).party);
    return <span>{raw}{!ok && <span className="block text-[11px] text-yellow-200">eşleşmedi → bağlanmaz</span>}</span>;
  };

  return (
    <section className="admin-card grid gap-4 !p-4" aria-label="CSV içe aktar">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-extrabold">CSV içe aktar</h2>
          <p className="text-[12px] text-subtle">Yalnızca yeni kayıt ekler; mevcut kayıtlar hiçbir zaman güncellenmez. Müşteri ve sağlayıcı adları mevcut firmalarla birebir (büyük/küçük harf duyarsız) eşleştirilir; eşleşmeyenler bağlanmadan bırakılır ve raporlanır.</p>
        </div>
        <button type="button" className={small} onClick={onClose} disabled={busy}>Kapat</button>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>Dosya (CSV, virgül veya noktalı virgül, en çok 2 MB):</span>
        <input type="file" accept=".csv,text/csv,text/plain" disabled={busy} onChange={(e) => { void load(e.target.files?.[0]); }} className="text-[12px]" />
      </label>
      <Flash tone="bad" message={error} onClose={() => setError(null)} />

      {table && (
        <>
          <Details title="Sütun eşleştirme" hint={`${fileName} · ${body.length} satır`} open>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_FIELDS.map((fd) => (
                <label key={fd.key} className={labelCls}>{fd.label}{'required' in fd && fd.required ? ' *' : ''}
                  <select className={field} value={mapping[fd.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [fd.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                    <option value="">— yok —</option>
                    {header.map((h, idx) => <option key={idx} value={idx}>{idx + 1}. {h || '(başlıksız)'}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!mappedOk && <p className="text-[12px] text-yellow-200">“Kayıt adı” ve “Tür” sütunlarını eşleştirin.</p>}
          </Details>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-subtle">
            <span>{preview.filter((r) => !r.errors.length).length} geçerli · {preview.filter((r) => r.errors.length).length} hatalı · {preview.filter((r) => r.duplicateOf).length} olası mükerrer · {chosen.length} seçili</span>
            <button type="button" className={small} disabled={busy} onClick={() => setPicked(Object.fromEntries(preview.map((r) => [r.line, tickable(r) && !r.duplicateOf])))}>Mükerrer olmayanları seç</button>
            <button type="button" className={small} disabled={busy} onClick={() => setPicked({})}>Seçimi temizle</button>
          </div>

          <div className="max-h-[60vh] overflow-auto border border-line">
            <table className="w-full min-w-[880px] text-left text-[12px]">
              <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-[0.06em] text-subtle">
                <tr>
                  <th className="px-2 py-2">Al</th><th className="px-2 py-2">Satır</th><th className="px-2 py-2">Kayıt adı</th><th className="px-2 py-2">Tür</th>
                  <th className="px-2 py-2">Müşteri</th><th className="px-2 py-2">Sağlayıcı</th><th className="px-2 py-2">Bitiş</th><th className="px-2 py-2">Alış / satış</th><th className="px-2 py-2">Kontrol</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.line} className={`border-t border-line align-top ${r.errors.length ? 'bg-red-500/5' : r.duplicateOf ? 'bg-yellow-400/5' : ''}`}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" className="admin-check" aria-label={`Satır ${r.line} içe aktar`} disabled={!tickable(r) || busy} checked={Boolean(picked[r.line]) && tickable(r)} onChange={(e) => setPicked((p) => ({ ...p, [r.line]: e.target.checked }))} />
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.line}</td>
                    <td className="px-2 py-1.5">{r.values.name ?? <Unknown>—</Unknown>}{r.values.domain && <span className="block text-subtle">{r.values.domain}</span>}</td>
                    <td className="px-2 py-1.5">{r.values.kind ? KIND_LABEL[r.values.kind as ServiceKind] : <Unknown>—</Unknown>}</td>
                    <td className="px-2 py-1.5">{partyHint(r.values.client, true)}</td>
                    <td className="px-2 py-1.5">{partyHint(r.values.provider, false)}</td>
                    <td className="px-2 py-1.5">{r.values.end_on ? fmtDate(r.values.end_on) : <Unknown>Bilinmiyor</Unknown>}</td>
                    <td className="px-2 py-1.5">{r.values.cost_amount ? `${r.values.cost_amount} ${r.values.cost_currency ?? ''}` : <Unknown>Bilinmiyor</Unknown>} / {r.values.price_amount ? `${r.values.price_amount} ${r.values.price_currency ?? ''}` : <Unknown>Bilinmiyor</Unknown>}</td>
                    <td className="px-2 py-1.5">
                      {done[r.line] ? <Link href={`${BASE}/${done[r.line]}`} className="text-yoca-green underline">Oluşturuldu</Link> : (
                        <span className="grid gap-0.5">
                          {r.errors.map((e, idx) => <span key={idx} className="text-red-300">{e}</span>)}
                          {r.duplicateOf && <span className="font-bold text-yellow-200">olası mükerrer: {r.duplicateOf}</span>}
                          {!r.errors.length && !r.duplicateOf && <span className="text-yoca-green">Uygun</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="admin-btn-primary" disabled={busy || !mappedOk || !chosen.length} onClick={run}>{busy ? progress || 'Kaydediliyor…' : `Seçili ${chosen.length} kaydı ekle`}</button>
            <span className="text-[12px] text-subtle">Hatalı satırlar seçilemez. Olası mükerrerler varsayılan olarak seçili değildir; yine de eklemek isterseniz işaretleyin.</span>
          </div>
        </>
      )}

      {result && (
        <div className="grid gap-2 admin-box p-3 text-[13px]" role="status">
          <p className="font-bold">Sonuç: {result.created.length} oluşturuldu · {result.skipped.length} atlandı · {result.failed.length} başarısız</p>
          {result.created.length > 0 && (
            <Details title={`Oluşturulanlar (${result.created.length})`} open={result.created.some((c) => c.notes.length > 0)}>
              <ul className="grid gap-1">
                {result.created.map((c) => (
                  <li key={c.line}>Satır {c.line}: <EntityLink href={`${BASE}/${c.id}`}>{c.name}</EntityLink>{c.notes.length > 0 && <span className="block text-[12px] text-yellow-200">{c.notes.join(' · ')}</span>}</li>
                ))}
              </ul>
            </Details>
          )}
          {result.skipped.length > 0 && (
            <Details title={`Atlananlar (${result.skipped.length})`}>
              <ul className="grid gap-1">{result.skipped.map((c) => <li key={c.line}>Satır {c.line} · {c.name}: <span className="text-subtle">{c.reason}</span></li>)}</ul>
            </Details>
          )}
          {result.failed.length > 0 && (
            <Details title={`Başarısız (${result.failed.length})`} open>
              <ul className="grid gap-1">{result.failed.map((c) => <li key={c.line}>Satır {c.line} · {c.name}: <span className="text-red-300">{c.error}</span></li>)}</ul>
            </Details>
          )}
        </div>
      )}
    </section>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <ServicesInner />
    </Suspense>
  );
}
