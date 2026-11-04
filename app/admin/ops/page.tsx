'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardLink } from '@/components/admin/cockpit/Widgets';
import { Badge, Empty, EntityLink, Flash, PageHead, fmtDate, fmtDateTime } from '@/components/admin/ops/ui';
import { db, loadOps, type OpsData } from '@/lib/ops/data';
import { daysUntil, dueText, istanbulDay, missingInfo, payState, renewState, type PeriodRow, type Service } from '@/lib/ops/model';
import { formatTotals, type Minor } from '@/lib/ops/money';

/**
 * Yoca Operasyon — Genel bakış.
 * Every number is counted from real rows (loadOps) and links to the filtered
 * list behind it. No data → an empty state with the action that creates it.
 * Money is per currency only; an unknown amount is counted, never added as 0.
 */

const ZERO = BigInt(0);

interface AuditEntry { id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; label: string | null }

const ENTITY_LABEL: Record<string, string> = {
  clients: 'Müşteri/firma', client_contacts: 'Kişi', ops_projects: 'Proje', ops_provider_accounts: 'Sağlayıcı hesabı',
  ops_services: 'Hizmet', ops_service_links: 'Hizmet bağlantısı', ops_service_relations: 'Hizmet ilişkisi', ops_periods: 'Dönem',
  ops_payments: 'Ödeme', ops_documents: 'Belge', ops_work_logs: 'Çalışma kaydı', ops_tasks: 'Görev',
  ops_license_links: 'Lisans bağlantısı', ops_license_ops: 'Lisans işlemi',
};
const VERB: Record<string, string> = { insert: 'eklendi', update: 'güncellendi', delete: 'silindi' };

function auditHref(e: AuditEntry): string | null {
  if (!e.entity_id || e.action === 'delete') return null;
  if (e.entity === 'clients') return `/admin/ops/clients/${e.entity_id}`;
  if (e.entity === 'ops_projects') return `/admin/ops/projects/${e.entity_id}`;
  if (e.entity === 'ops_services') return `/admin/ops/services/${e.entity_id}`;
  return null;
}

const add = (map: Record<string, Minor>, currency: string, v: Minor) => { map[currency] = (map[currency] ?? ZERO) + v; };

export default function OpsOverview() {
  const [data, setData] = useState<OpsData | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    void loadOps().then(setData);
    (async () => {
      try {
        const { data: rows, error } = await db().from('audit_log').select('id, at, actor, action, entity, entity_id, label')
          .or('entity.like.ops_*,entity.in.(clients,client_contacts)').order('at', { ascending: false }).limit(10);
        if (error) { setAuditError(error.message); setAudit([]); return; }
        setAudit((rows ?? []) as AuditEntry[]);
      } catch (e) {
        setAuditError((e as Error).message); setAudit([]);
      }
    })();
  }, []);

  const today = istanbulDay();
  const month = today.slice(0, 7);

  const stats = useMemo(() => {
    if (!data?.ready) return null;
    const live = data.services.filter((s) => !s.archived_at && s.status !== 'cancelled');
    const openOf = new Map<string, PeriodRow>();
    data.periods.forEach((p) => { if (p.status === 'open') openOf.set(p.service_id, p); });
    const serviceById = new Map<string, Service>();
    data.services.forEach((s) => serviceById.set(s.id, s));
    const projectClient = new Map<string, string | null>();
    data.projects.forEach((p) => projectClient.set(p.id, p.client_id));
    const hasCustomer = new Set<string>();
    data.links.forEach((l) => { if (l.client_id || (l.project_id && projectClient.get(l.project_id))) hasCustomer.add(l.service_id); });

    const within: Record<7 | 30 | 90, number> = { 7: 0, 30: 0, 90: 0 };
    let overdue = 0, awaiting = 0, missing = 0, autoUnverified = 0;
    for (const s of live) {
      const open = openOf.get(s.id) ?? null;
      const state = renewState(s, open, data.payments, today);
      const end = open?.ends_on ?? s.end_on;
      if (end && state !== 'verified' && state !== 'perpetual' && state !== 'once') {
        const d = daysUntil(end, today);
        if (d >= 0 && d <= 7) within[7] += 1;
        if (d >= 0 && d <= 30) within[30] += 1;
        if (d >= 0 && d <= 90) within[90] += 1;
      }
      if (state === 'overdue') overdue += 1;
      if (state === 'awaiting_verification') awaiting += 1;
      if (state === 'awaiting_verification' && s.auto_renew === 'on') autoUnverified += 1;
      const miss = missingInfo(s);
      if (miss.includes('Bitiş tarihi') || miss.includes('Ekip sorumlusu')) missing += 1;
    }

    // Provider costs due this month (Yoca pays; services the customer pays directly are excluded).
    const costExpected: Record<string, Minor> = {}, costOpen: Record<string, Minor> = {};
    let costUnknown = 0, costCount = 0;
    // Customer collections still open (pending / partial / overdue).
    const collect: Record<string, Minor> = {}, collectOverdue: Record<string, Minor> = {};
    let collectCount = 0, collectOverdueCount = 0, collectUnknown = 0;
    for (const p of data.periods) {
      const s = serviceById.get(p.service_id);
      if (!s || s.archived_at || p.status === 'cancelled') continue;
      const costDate = p.due_on ?? p.ends_on;
      if (s.payer_party !== 'client' && costDate && costDate.slice(0, 7) === month) {
        const out = payState(p, data.payments, 'out', today);
        costCount += 1;
        if (out.expected === null || !out.currency) costUnknown += 1;
        else {
          add(costExpected, out.currency, out.expected);
          if (out.remaining !== null && out.remaining > ZERO) add(costOpen, out.currency, out.remaining);
        }
      }
      const inn = payState(p, data.payments, 'in', today);
      if ((inn.state === 'pending' || inn.state === 'partial' || inn.state === 'overdue') && inn.currency && inn.remaining !== null) {
        collectCount += 1;
        add(collect, inn.currency, inn.remaining);
        if (inn.state === 'overdue') { collectOverdueCount += 1; add(collectOverdue, inn.currency, inn.remaining); }
      } else if (inn.state === 'unknown' && p.status === 'open' && hasCustomer.has(s.id)) collectUnknown += 1;
    }

    const licenses = data.licenses
      .map((l) => ({ l, exp: typeof l.snapshot?.expires_at === 'string' ? (l.snapshot.expires_at as string).slice(0, 10) : null }))
      .filter((x) => x.exp && daysUntil(x.exp, today) <= 30)
      .sort((a, b) => String(a.exp).localeCompare(String(b.exp)));

    return { live, within, overdue, awaiting, missing, autoUnverified, costExpected, costOpen, costUnknown, costCount, collect, collectOverdue, collectCount, collectOverdueCount, collectUnknown, licenses };
  }, [data, today, month]);

  if (!data) return <div className="grid gap-6"><PageHead title="Genel bakış" /><p className="text-[13px] text-subtle">Yükleniyor…</p></div>;

  return (
    <div className="grid gap-6">
      <PageHead
        title="Genel bakış"
        sub="Yaklaşan yenilemeler, bekleyen tahsilatlar, sağlayıcı maliyetleri ve eksik bilgiler. Her kart ilgili filtreli listeyi açar."
        actions={<>
          <Link href="/admin/ops/services/new" className="admin-btn-primary">+ Yeni hizmet</Link>
          <Link href="/admin/ops/clients" className="admin-btn">Müşteriler</Link>
        </>}
      />

      {data.error && <Flash tone="bad" message={data.error} />}

      {stats && data.parties.length === 0 && (
        <Empty text="Henüz müşteri veya firma yok. Önce bir müşteri ekleyin; hizmetleri ve projeleri ona bağlarsınız." action={<Link href="/admin/ops/clients" className="admin-btn-primary">+ Müşteri ekle</Link>} />
      )}

      {stats && stats.live.length === 0 ? (
        <Empty
          text="Takip edilen aktif hizmet yok (domain, hosting, sunucu, SaaS, bakım…). Yenileme, maliyet ve tahsilat kartları ilk hizmetle birlikte dolar."
          action={<Link href="/admin/ops/services/new" className="admin-btn-primary">+ İlk hizmeti ekle</Link>}
        />
      ) : stats && (
        <>
          <section aria-label="Yenilemeler" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([7, 30, 90] as const).map((n) => (
              <Tile key={n} href={`/admin/ops/services?within=${n}`} label={`${n} gün içinde bitiyor`} value={stats.within[n]} hint="Doğrulanmış yenilemeler hariç" />
            ))}
          </section>

          <section aria-label="Dikkat isteyenler" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile href="/admin/ops/services?renew=overdue" label="Bitiş tarihi geçti" value={stats.overdue} hint="Yenileme kaydı yok" alert={stats.overdue > 0} />
            <Tile href="/admin/ops/services?renew=awaiting" label="Yenileme doğrulaması bekliyor" value={stats.awaiting} hint="Ödeme yapıldı veya otomatik yenileme açık; yeni bitiş tarihi onaylanmadı" alert={stats.awaiting > 0} />
            <Tile href="/admin/ops/services?autorenew=unverified" label="Otomatik yenileme doğrulanmadı" value={stats.autoUnverified} hint="Otomatik yenileme açık, bitiş yakın/geçti" alert={stats.autoUnverified > 0} />
            <Tile href="/admin/ops/services?missing=1" label="Eksik bilgi" value={stats.missing} hint="Bitiş tarihi veya ekip sorumlusu yok" alert={stats.missing > 0} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Bu ayki sağlayıcı maliyetleri" action={<CardLink href="/admin/ops/finance?view=costs&within=30">Maliyetler</CardLink>}>
              {stats.costCount === 0 ? <p className="text-[13px] text-subtle">Bu ay ödeme tarihi gelen sağlayıcı dönemi yok.</p> : (
                <dl className="grid gap-2 text-[13px]">
                  <Row term="Beklenen (para birimine göre)" value={formatTotals(stats.costExpected)} />
                  <Row term="Henüz ödenmemiş" value={formatTotals(stats.costOpen)} />
                  {stats.costUnknown > 0 && <p className="text-[12px] text-yellow-200">{stats.costUnknown} dönemin tutarı bilinmiyor (toplama eklenmedi).</p>}
                  <p className="text-[12px] text-subtle">{stats.costCount} dönem · ödemeyi müşterinin doğrudan yaptığı hizmetler hariç.</p>
                </dl>
              )}
            </Card>
            <Card title="Beklenen müşteri tahsilatları" action={<CardLink href="/admin/ops/finance?view=collections&state=awaiting">Tahsilatlar</CardLink>}>
              {stats.collectCount === 0 && stats.collectUnknown === 0 ? <p className="text-[13px] text-subtle">Bekleyen tahsilat yok.</p> : (
                <dl className="grid gap-2 text-[13px]">
                  <Row term="Kalan (bekliyor / kısmi / gecikmiş)" value={formatTotals(stats.collect)} />
                  <Row term={<Link href="/admin/ops/finance?view=collections&state=overdue" className="underline">Gecikmiş</Link>} value={stats.collectOverdueCount ? formatTotals(stats.collectOverdue) : 'Yok'} tone={stats.collectOverdueCount ? 'bad' : undefined} />
                  {stats.collectUnknown > 0 && <p className="text-[12px] text-yellow-200">Müşteriye bağlı {stats.collectUnknown} açık dönemin müşteri tutarı girilmemiş (toplama eklenmedi).</p>}
                  <p className="text-[12px] text-subtle">{stats.collectCount} dönem · para birimleri ayrı toplanır, çevrilmez.</p>
                </dl>
              )}
            </Card>
          </div>
        </>
      )}

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Yakında biten lisanslar" action={<CardLink href="/admin/ops/licenses">Lisanslar</CardLink>}>
            <p className="mb-3 text-[12px] text-subtle">Kaynak: lisans bağlantılarındaki son anlık görüntü (license.yoca.net’ten en son okunan veri). Güncel durum için Lisanslar sayfasına bakın.</p>
            {data.licenses.length === 0 ? (
              <Empty text="Bağlı lisans yok." action={<Link href="/admin/ops/licenses" className="admin-btn">Lisans bağla</Link>} />
            ) : stats.licenses.length === 0 ? <p className="text-[13px] text-subtle">Anlık görüntülere göre 30 gün içinde biten lisans yok.</p> : (
              <ul className="grid gap-1 text-[13px]">
                {stats.licenses.map(({ l, exp }) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
                    <span className="min-w-0 truncate">{l.label || l.license_id}</span>
                    <span className="text-[12px] text-muted">
                      {fmtDate(exp)} · {dueText(exp, today)} · <span className="text-subtle">anlık görüntü {l.last_synced_at ? fmtDateTime(l.last_synced_at) : 'zamanı bilinmiyor'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Son işlemler" action={<CardLink href="/admin/activity">İşlem geçmişi</CardLink>}>
            {audit === null ? <p className="text-[13px] text-subtle">Yükleniyor…</p> : auditError ? <Flash tone="warn" message={`İşlem geçmişi okunamadı: ${auditError}`} /> : audit.length === 0 ? <p className="text-[13px] text-subtle">Henüz Operasyon kaydı yok.</p> : (
              <ul className="grid gap-1 text-[13px]">
                {audit.map((e) => {
                  const href = auditHref(e);
                  const what = `${ENTITY_LABEL[e.entity] ?? e.entity} ${VERB[e.action] ?? e.action}`;
                  return (
                    <li key={e.id} className="grid gap-0.5 border-t border-line py-1.5">
                      <span className="min-w-0">
                        <span className="text-muted">{what}: </span>
                        {href ? <EntityLink href={href}>{e.label || '—'}</EntityLink> : <span>{e.label || '—'}</span>}
                      </span>
                      <span className="text-[12px] text-subtle">{e.actor ?? 'sistem'} · {fmtDateTime(e.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({ href, label, value, hint, alert }: { href: string; label: string; value: number; hint?: string; alert?: boolean }) {
  return (
    <Link href={href} className="block rounded-md border border-line bg-surface-deep/80 p-4 transition-colors hover:border-yoca-lime/50">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className={`mt-1.5 text-[28px] font-extrabold leading-none tabular-nums ${alert ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-subtle">{alert && <Badge tone="warn">Dikkat</Badge>}{hint}</p>
    </Link>
  );
}

function Row({ term, value, tone }: { term: React.ReactNode; value: string; tone?: 'bad' }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2">
      <dt className="text-muted">{term}</dt>
      <dd className={`font-bold tabular-nums ${tone === 'bad' ? 'text-red-300' : 'text-white'}`}>{value}</dd>
    </div>
  );
}
