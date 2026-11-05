'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Badge, Empty, Flash, PageHead, field, label, small, fmtDate } from '@/components/admin/ops/ui';
import { clientDisplay, docAction, draftPdf, loadDoc, loadList, moneyOf, newKey, storedPdf, type ClientLite, type DocList, type DocListRow } from '@/lib/documents/client';
import { DOC_KINDS, KIND_LABEL, QUOTE_STATE_LABEL, STATUS_LABEL, type DocKind } from '@/lib/documents/model';

/**
 * Yoca — Teklifler ve Belgeler: list.
 * Search and filters run on the loaded rows (number, title, recipient, type,
 * client, status). "Yeni belge" asks for the type and (optionally) the client,
 * then opens the editor; the AI draft is an option there, never automatic.
 */

const STATUS_TONE = { draft: 'warn', final: 'ok', archived: 'muted' } as const;
const QUOTE_TONE = { sent: 'info', accepted: 'ok', rejected: 'bad', expired: 'muted' } as const;

function NewDocument({ clients, onClose, preset }: { clients: ClientLite[]; onClose: () => void; preset: { clientId?: string; kind?: DocKind } }) {
  const router = useRouter();
  const [kind, setKind] = useState<DocKind>(preset.kind ?? 'quote');
  const [clientId, setClientId] = useState(preset.clientId ?? '');
  const [locale, setLocale] = useState<'tr' | 'en'>('tr');
  const [start, setStart] = useState<'manual' | 'ai'>('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newKey);
  const active = clients.filter((c) => !c.archived_at);
  const create = async () => {
    setBusy(true); setError(null);
    const r = await docAction<{ id: string }>({ action: 'create', kind, clientId: clientId || null, locale, requestKey: key });
    setBusy(false);
    if (!r.ok || !r.id) { setError(r.error ?? 'Belge oluşturulamadı.'); return; }
    router.push(`/admin/documents/${r.id}${start === 'ai' ? '?ai=1' : ''}`);
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-doc-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="admin-card grid w-full max-w-lg gap-4 p-5">
        <h2 id="new-doc-title" className="text-lg font-extrabold">Yeni belge</h2>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-semibold text-muted">Tür</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DOC_KINDS.map((k) => (
              <label key={k} className={`cursor-pointer border px-3 py-2 text-[13px] ${kind === k ? 'border-yoca-lime text-white' : 'border-line text-muted'}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                {KIND_LABEL[k].tr}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>Müşteri
          <select className={field} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Müşteriye bağlamadan (alıcıyı elle yazacağım)</option>
            {active.map((c) => <option key={c.id} value={c.id}>{clientDisplay(c)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Dil
            <select className={field} value={locale} onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'tr')}><option value="tr">Türkçe</option><option value="en">English</option></select>
          </label>
          <label className={label}>Başlangıç
            <select className={field} value={start} onChange={(e) => setStart(e.target.value === 'ai' ? 'ai' : 'manual')}><option value="manual">Elle dolduracağım</option><option value="ai">Yapay zekâ ile ilk taslak</option></select>
          </label>
        </div>
        <p className="text-[12px] text-subtle">Şirket bilgileri “Şirket bilgileri” ayarından gelir. Belge numarası türe göre otomatik verilir. Yapay zekâ taslağı yalnızca öneri olarak gelir; fiyat, vergi ve şirket bilgisi yazmaz.</p>
        {error && <Flash tone="bad" message={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={create} disabled={busy}>{busy ? 'Oluşturuluyor…' : 'Oluştur ve aç'}</button>
        </div>
      </div>
    </div>
  );
}

function ListInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<DocList | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');
  const [client, setClient] = useState<string>(params.get('client') ?? '');
  const [status, setStatus] = useState<string>('active');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => loadList().then(setData);
  useEffect(() => { void load(); }, []);

  const clientName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.clients ?? []) m.set(c.id, clientDisplay(c));
    return m;
  }, [data]);

  const rows = useMemo(() => {
    const list = data?.documents ?? [];
    const needle = q.trim().toLocaleLowerCase('tr');
    return list.filter((d) => {
      if (kind && d.kind !== kind) return false;
      if (client === 'none' ? d.client_id : client && d.client_id !== client) return false;
      if (status === 'active' && d.status === 'archived') return false;
      if (['draft', 'final', 'archived'].includes(status) && d.status !== status) return false;
      if (['sent', 'accepted', 'rejected', 'expired'].includes(status) && d.quote_state !== status) return false;
      if (!needle) return true;
      return [d.number, d.title, d.recipient_company, d.recipient_name, d.client_id ? clientName.get(d.client_id) : ''].join(' ').toLocaleLowerCase('tr').includes(needle);
    });
  }, [data, q, kind, client, status, clientName]);

  const duplicate = async (d: DocListRow) => {
    setBusy(d.id);
    const r = await docAction<{ id: string }>({ action: 'duplicate', id: d.id, requestKey: newKey() });
    setBusy(null);
    if (!r.ok || !r.id) return setFlash({ tone: 'bad', text: r.error ?? 'Çoğaltılamadı.' });
    router.push(`/admin/documents/${r.id}`);
  };
  const archive = async (d: DocListRow) => {
    setBusy(d.id);
    const r = await docAction({ action: 'archive', id: d.id, archive: d.status !== 'archived' });
    setBusy(null);
    setFlash(r.ok ? { tone: 'ok', text: d.status === 'archived' ? `${d.number} arşivden çıkarıldı.` : `${d.number} arşivlendi.` } : { tone: 'bad', text: r.error ?? 'İşlem yapılamadı.' });
    void load();
  };
  const download = async (d: DocListRow) => {
    setBusy(d.id);
    let err: string | null;
    if (d.status === 'draft' || d.final_version < 1) {
      const full = await loadDoc(d.id);
      err = full.ok ? await draftPdf(d.id, full.document.title, full.document.content, true, d.number) : full.error ?? 'Belge okunamadı.';
    } else err = await storedPdf({ id: d.id });
    setBusy(null);
    if (err) setFlash({ tone: 'bad', text: err });
  };

  if (!data) return <p className="text-[13px] text-subtle">Yükleniyor…</p>;
  if (!data.ok) return <Flash tone="bad" message={data.error ?? 'Belgeler okunamadı.'} />;

  return (
    <div className="grid gap-5">
      <PageHead
        title="Teklifler ve Belgeler"
        sub="Teklif, proforma, antetli yazı, durum raporu ve teslim belgesi. PDF’ler güncel şirket bilgileriyle üretilir; kesinleşmiş sürümlerin önceki PDF’leri saklanır. Bu modül e-fatura veya muhasebe kaydı değildir."
        actions={<>
          <Link href="/admin/documents/settings" className="admin-btn">Belge ayarları</Link>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => setCreating(true)}>+ Yeni belge</button>
        </>}
      />
      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="doc-q">Ara</label>
        <input id="doc-q" className={field} placeholder="Ara: numara, başlık, alıcı…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Tür" className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tüm türler</option>
          {DOC_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k].tr}</option>)}
        </select>
        <select aria-label="Müşteri" className={field} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">Tüm müşteriler</option>
          <option value="none">Müşteriye bağlı olmayanlar</option>
          {data.clients.map((c) => <option key={c.id} value={c.id}>{clientDisplay(c)}</option>)}
        </select>
        <select aria-label="Durum" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Arşiv dışındakiler</option>
          <option value="">Tümü</option>
          <option value="draft">Taslak</option>
          <option value="final">Kesinleştirildi</option>
          <option value="archived">Arşivlendi</option>
          <option value="sent">Teklif: gönderildi</option>
          <option value="accepted">Teklif: kabul edildi</option>
          <option value="rejected">Teklif: reddedildi</option>
          <option value="expired">Teklif: süresi doldu</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty text={data.documents.length ? 'Bu filtrelerle eşleşen belge yok.' : 'Henüz belge yok.'} action={<button type="button" className="admin-btn admin-btn-primary" onClick={() => setCreating(true)}>+ Yeni belge</button>} />
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-surface-secondary text-left text-[11px] uppercase tracking-[0.08em] text-subtle">
              <tr><th className="px-3 py-2">Belge no</th><th className="px-3 py-2">Başlık</th><th className="px-3 py-2">Tür</th><th className="px-3 py-2">Müşteri / alıcı</th><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2 text-right">Toplam</th><th className="px-3 py-2"><span className="sr-only">İşlemler</span></th></tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const total = moneyOf(d.status === 'draft' ? d.total : d.final_total ?? d.total, d.currency);
                const who = d.client_id ? clientName.get(d.client_id) : d.recipient_company || d.recipient_name;
                return (
                  <tr key={d.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]"><Link href={`/admin/documents/${d.id}`} className="font-semibold text-white underline decoration-line underline-offset-2 hover:text-yoca-lime">{d.number}</Link></td>
                    <td className="px-3 py-2">{d.title || <span className="italic text-subtle">Başlıksız</span>}</td>
                    <td className="px-3 py-2 text-muted">{KIND_LABEL[d.kind].short}</td>
                    <td className="px-3 py-2">{who || <span className="italic text-subtle">Alıcı yok</span>}{!d.client_id && who ? <span className="block text-[11px] text-subtle">müşteri kaydına bağlı değil</span> : null}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{fmtDate(d.issue_date)}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1"><Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}{d.status !== 'draft' && d.final_version ? ` · v${d.final_version}` : d.final_version ? ` · v${d.final_version} revize` : ''}</Badge>{d.quote_state ? <Badge tone={QUOTE_TONE[d.quote_state]}>{QUOTE_STATE_LABEL[d.quote_state]}</Badge> : null}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{total ?? (d.kind === 'quote' || d.kind === 'proforma' ? <span className="text-[12px] italic text-subtle">eksik fiyat</span> : <span className="text-subtle">—</span>)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link href={`/admin/documents/${d.id}`} className={small}>{d.status === 'draft' ? 'Düzenle' : 'Aç'}</Link>
                        <button type="button" className={small} disabled={busy === d.id} onClick={() => duplicate(d)}>Çoğalt</button>
                        <button type="button" className={small} disabled={busy === d.id} onClick={() => download(d)}>PDF indir</button>
                        <button type="button" className={small} disabled={busy === d.id} onClick={() => archive(d)}>{d.status === 'archived' ? 'Arşivden çıkar' : 'Arşivle'}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-subtle">Daha önce indirdiğiniz veya e-postayla gönderdiğiniz PDF dosyaları değişmez. Yeni indirme, o anki şirket bilgileriyle üretilir; belgenin kalemleri, tutarları, alıcısı ve tarihi değişmez.</p>
      {creating && <NewDocument clients={data.clients} preset={{ clientId: params.get('client') ?? undefined }} onClose={() => setCreating(false)} />}
    </div>
  );
}

export default function DocumentsPage() {
  return <Suspense fallback={<p className="text-[13px] text-subtle">Yükleniyor…</p>}><ListInner /></Suspense>;
}
