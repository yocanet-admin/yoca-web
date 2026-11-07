'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Flash, field, fmtDate, small } from '@/components/admin/ops/ui';
import { importRequest, listImportRows, resolveImportRow, type ImportRowRecord } from '@/lib/fin/data';
import { ACTION_LABEL, type ImportAction, type PlanRow } from '@/lib/fin/importPlan';
import { CATEGORY_LABEL, METHOD_LABEL } from '@/lib/fin/model';
import { formatAmount, formatMinor } from '@/lib/ops/money';

/**
 * Giderler → Aktarım: Excel (.xlsx / .xlsm) preview and apply, and the list of
 * imported rows still waiting for information. The file is read on the server
 * and not stored; macros never run. Preview writes nothing; "Aktar" writes in
 * one transaction; re-importing the same file creates nothing; a changed row
 * is reported, never applied. No notification is sent.
 */

type Row = PlanRow & { state: 'new' | 'already' | 'changed'; sameName: string[]; opsMatches: Array<{ name: string; kind: string; provider: string | null }> };
interface Preview {
  file: { name: string; sha256: string; macros: boolean };
  sheet: string; headerRow: number; month: string | null; monthEvidence: string[]; warnings: string[]; questions: string[];
  rows: Row[];
  totals: { source: { total: string | null; paid: string | null; remaining: string | null }; computed: { total: string; paid: string; remaining: string; knownCount: number; missingCount: number }; system: { periods: string; paidImported: string; review: string; remaining: string }; match: { total: boolean | null; paid: boolean | null; remaining: boolean | null } };
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthName = (m: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : 'Ay belirsiz');
const tl = (minor: string | number | bigint) => formatMinor(BigInt(minor), 'TRY');
const tlSource = (v: string | null) => (v === null ? '—' : formatAmount(v, 'TRY'));
const STATE: Record<Row['state'], [string, 'ok' | 'muted' | 'warn']> = { new: ['Yeni', 'ok'], already: ['Zaten aktarıldı', 'muted'], changed: ['Kaynakta değişmiş — uygulanmaz', 'warn'] };

function Group({ title, note, rows, render }: { title: string; note?: string; rows: Row[]; render: (r: Row) => ReactNode }) {
  return (
    <section className="grid gap-2 border border-line p-3">
      <h3 className="text-[14px] font-extrabold">{title} <span className="text-subtle">({rows.length})</span></h3>
      {note && <p className="text-[12px] text-subtle">{note}</p>}
      {rows.length === 0 ? <p className="text-[12px] text-subtle">Yok.</p> : <ul className="grid gap-1 text-[13px]">{rows.map((r) => <li key={r.key} className="flex flex-wrap items-baseline gap-2 border-t border-line py-1.5"><span className="w-14 text-[11px] text-subtle">satır {r.row}</span>{render(r)}<Badge tone={STATE[r.state][1]}>{STATE[r.state][0]}</Badge></li>)}</ul>}
    </section>
  );
}

export function ImportPanel({ onApplied }: { onApplied: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [pending, setPending] = useState<ImportRowRecord[] | null>(null);
  const loadPending = () => listImportRows().then(setPending).catch(() => setPending([]));
  useEffect(() => { void loadPending(); }, []);

  const runPreview = async (f: File) => {
    setBusy(true); setMsg(null); setPreview(null); setChecked(false);
    const r = await importRequest<{ preview?: Preview }>('preview', f);
    setBusy(false);
    if (!r.ok || !r.preview) { setMsg({ tone: 'bad', text: r.error ?? 'Önizleme hazırlanamadı.' }); return; }
    setPreview(r.preview);
  };
  const apply = async () => {
    if (!file || !preview || busy) return;
    setBusy(true); setMsg(null);
    const r = await importRequest<{ result?: Record<string, number> }>('apply', file);
    setBusy(false);
    if (!r.ok || !r.result) { setMsg({ tone: 'bad', text: r.error ?? 'Aktarım yapılamadı; hiçbir kayıt yazılmadı.' }); return; }
    const x = r.result;
    setMsg({ tone: 'ok', text: `Aktarıldı: ${x.created} gider oluşturuldu, ${x.held} satır bekleyenlere alındı, ${x.already} satır zaten vardı, ${x.changed} değişmiş satır işaretlendi (uygulanmadı), ${x.skipped} boş satır atlandı. Bildirim gönderilmedi.` });
    setPreview(null); setFile(null); setChecked(false);
    void loadPending(); onApplied();
  };

  const rows = preview?.rows ?? [];
  const by = (a: ImportAction[]) => rows.filter((r) => a.includes(r.action));
  const newWork = rows.filter((r) => r.state !== 'already' && r.action !== 'skip_blank').length;
  const blockers = rows.filter((r) => r.state === 'new' && r.sameName.length && (r.action === 'create' || r.action === 'pending_payment'));

  return (
    <div className="grid gap-5">
      <section className="admin-card grid gap-3 p-4">
        <h2 className="text-[15px] font-extrabold">Excel’den aktar</h2>
        <p className="text-[12px] text-subtle">.xlsx veya .xlsm (en çok 5 MB). Dosya sunucuda yalnızca okunur, saklanmaz; formüller hesaplanmaz, makrolar çalıştırılmaz. Önizleme hiçbir şey yazmaz; aynı dosya tekrar yüklenirse ikinci kayıt oluşmaz.</p>
        <input type="file" accept=".xlsx,.xlsm" disabled={busy} className="text-[13px]" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) void runPreview(f); }} />
        {busy && <p className="text-[12px] text-subtle">Hazırlanıyor…</p>}
        {msg && <Flash tone={msg.tone} message={msg.text} onClose={() => setMsg(null)} />}
      </section>

      {preview && (
        <section className="grid gap-4">
          <div className="admin-card grid gap-2 p-4 text-[13px]">
            <p><strong>{preview.file.name}</strong> · sayfa “{preview.sheet}” · başlık satırı {preview.headerRow} · makro: {preview.file.macros ? 'var (çalıştırılmadı)' : 'yok'} · özet {preview.file.sha256.slice(0, 12)}</p>
            <p>Dönem: <strong>{preview.month ?? 'belirlenemedi'}</strong></p>
            <ul className="list-disc ps-5 text-[12px] text-subtle">{preview.monthEvidence.map((e) => <li key={e}>{e}</li>)}</ul>
            {preview.warnings.map((w) => <p key={w} className="text-yellow-200">{w}</p>)}
          </div>

          <div className="admin-card grid gap-2 p-4 text-[13px]">
            <h3 className="text-[14px] font-extrabold">Kontrol toplamları (TRY)</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="text-[11px] uppercase tracking-[0.06em] text-subtle"><tr><th className="py-1">Kalem</th><th>Excel hücresi</th><th>Satırlardan hesaplanan</th><th>Uyum</th></tr></thead>
                <tbody className="tabular-nums">
                  {([['Bilinen tutarların toplamı', preview.totals.source.total, preview.totals.computed.total, preview.totals.match.total], ['Kaynakta ödendi işaretli', preview.totals.source.paid, preview.totals.computed.paid, preview.totals.match.paid], ['Kaynakta kalan', preview.totals.source.remaining, preview.totals.computed.remaining, preview.totals.match.remaining]] as const).map(([k, a, b, m]) => (
                    <tr key={k} className="border-t border-line"><td className="py-1.5">{k}</td><td>{tlSource(a)}</td><td>{tl(b)}</td><td>{m === null ? '—' : m ? <Badge tone="ok">Uyumlu</Badge> : <Badge tone="bad">Uyumsuz</Badge>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-subtle">{preview.totals.computed.knownCount} satırın tutarı biliniyor; tutarı eksik {preview.totals.computed.missingCount} satır toplamlara katılmadı (sıfır sayılmadı).</p>
            <div className="grid gap-1 border-t border-line pt-2">
              <p>Aktarımdan sonra sistemde (yeni satırlar): {monthName(preview.month)} dönemleri <strong>{tl(preview.totals.system.periods)}</strong> · onaylı ödeme <strong>{tl(preview.totals.system.paidImported)}</strong> · inceleme bekleyen <strong>{tl(preview.totals.system.review)}</strong> · kalan <strong>{tl(preview.totals.system.remaining)}</strong></p>
              {BigInt(preview.totals.system.review) > BigInt(0) && <p className="text-[12px] text-yellow-200">Fark: kaynakta ödendi {tl(preview.totals.computed.paid)}, sisteme aktarılan ödeme {tl(preview.totals.system.paidImported)}. {tl(preview.totals.system.review)} tutarındaki dönem ödeme tarihi gelene kadar “İnceleme bekliyor”dur; gecikmiş sayılmaz, özette listelenmez.</p>}
            </div>
          </div>

          <Group title="Oluşturulacak giderler ve dönemler" rows={by(['create', 'pending_payment'])} render={(r) => <span className="flex flex-wrap gap-2"><strong>{r.name}</strong><span>{CATEGORY_LABEL[r.category]}</span><span className="tabular-nums">{formatAmount(r.amount, 'TRY')}</span><span>vade {fmtDate(r.due)}</span>{r.method && <span className="text-subtle">{METHOD_LABEL[r.method]}</span>}{r.note && <span className="text-subtle">iç not var</span>}{r.sameName.length > 0 && <Badge tone="bad">Aynı adla gider var</Badge>}</span>} />
          <Group title="Ödeme olarak aktarılacak bilgiler" note="Ödeme tarihi olmayan “Ödendi” bilgisi ödeme kaydına çevrilmez; vade tarihi veya bugün ödeme tarihi yapılmaz." rows={by(['pending_payment'])} render={(r) => <span><strong>{r.name}</strong> — kaynakta “{r.statusText}”, {formatAmount(r.amount, 'TRY')}: <span className="text-yellow-200">ödeme kaydı oluşturulmayacak; dönem “İnceleme bekliyor”, gerçek tarih bekleniyor.</span></span>} />
          <Group title="Tutarı veya tarihi eksik olanlar" note="Oluşturulmaz; bekleyenler listesinde kalır, finans sorumlusu tamamlayınca gider olarak açılır." rows={by(['needs_info'])} render={(r) => <span><strong>{r.name}</strong> — eksik: {r.missing.join(', ')}{r.status === 'empty' ? ' · ödeme durumu boş' : ''}{r.note ? ' · iç not var' : ''}</span>} />
          <Group title="Tekrar ayarı önerileri" rows={rows.filter((r) => r.recurrence || r.variable)} render={(r) => <span><strong>{r.name}</strong> — aylık{r.variable ? ', tutar sabit değil: yeni dönemler “Tutar bekleniyor” açılır' : r.amount ? `, sonraki dönemlerin başlangıç tutarı ${formatAmount(r.amount, 'TRY')} (geçmiş dönemler değişmez)` : ''}{r.action === 'needs_info' ? ' · önce eksik bilgi tamamlanmalı' : ''}</span>} />
          <Group title="Gider tanımı önerileri (oluşturulmaz)" note="Yalnızca başlık var; Excel’de bulunduğu için aylık borç yapılmaz." rows={by(['suggestion'])} render={(r) => <span>{r.name} <span className="text-subtle">· öneri: {CATEGORY_LABEL[r.category]}</span></span>} />
          <Group title="Olası mükerrerler" note="Kendiliğinden birleştirilmez veya oluşturulmaz." rows={rows.filter((r) => r.action === 'possible_duplicate' || r.sameName.length > 0)} render={(r) => <span><strong>{r.name}</strong>{r.opsMatches.length ? ` — Operasyon’da ${r.opsMatches.length} hizmet: ${r.opsMatches.map((o) => `${o.name} (${o.kind})`).join(', ')}` : r.action === 'possible_duplicate' ? ' — Operasyon maliyetleriyle kesişebilir' : ''}{r.sameName.length ? ' — aynı adla kayıtlı gider var' : ''}</span>} />
          <Group title="Atlanan boş satırlar" rows={by(['skip_blank'])} render={(r) => <span className="text-subtle">{r.name}</span>} />

          {preview.questions.length > 0 && <div className="border border-yellow-400/40 p-3 text-[13px]"><p className="font-bold">Gerekli bilgi</p>{preview.questions.map((q) => <p key={q}>{q}</p>)}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Önizlemeyi kontrol ettim</label>
            <button type="button" className="admin-btn admin-btn-primary" disabled={!checked || busy || !preview.month || newWork === 0 || blockers.length > 0} onClick={() => void apply()}>{newWork === 0 ? 'Yeni satır yok' : 'Aktar'}</button>
            {blockers.length > 0 && <span className="text-[12px] text-red-300">Aynı adla kayıtlı gider olan satırlar var; önce kontrol edin.</span>}
          </div>
        </section>
      )}

      <PendingRows rows={pending} reload={loadPending} />
    </div>
  );
}

function PendingRows({ rows, reload }: { rows: ImportRowRecord[] | null; reload: () => void }) {
  const [closing, setClosing] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (rows === null) return <p className="text-[13px] text-subtle">Aktarım kayıtları yükleniyor…</p>;
  const todo = rows.filter((r) => !r.resolved_at && (r.action !== 'create' || r.changed_payload));
  if (!rows.length) return null;
  const p = (r: ImportRowRecord, k: string) => String((r.payload as Record<string, unknown>)[k] ?? '');
  return (
    <section className="grid gap-2">
      <h2 className="text-[15px] font-extrabold">Aktarımdan bekleyenler <span className="text-subtle">({todo.length})</span></h2>
      <p className="text-[12px] text-subtle">Eksik bilgisi olan, öneri ya da olası mükerrer satırlar ve kaynakta değişmiş satırlar. Hiçbiri kendiliğinden gider yapılmaz.</p>
      {err && <p className="text-[12px] text-red-300">{err}</p>}
      <ul className="grid gap-1 text-[13px]">
        {todo.map((r) => (
          <li key={r.id} className="grid gap-1 border-t border-line py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-subtle">{r.file_name} · {r.sheet} · satır {r.source_row}</span>
              <strong>{p(r, 'name')}</strong>
              <Badge tone={r.action === 'needs_info' || r.action === 'pending_payment' ? 'warn' : 'muted'}>{ACTION_LABEL[r.action as ImportAction] ?? r.action}</Badge>
              {r.changed_payload && <Badge tone="bad">Kaynakta değişmiş (uygulanmadı)</Badge>}
              <span className="ms-auto flex gap-2">
                {r.expense_id ? <Link href={`/admin/expenses/${r.expense_id}${r.period_id ? `?period=${r.period_id}` : ''}`} className={small}>Gideri aç</Link>
                  : <Link href={`/admin/expenses/new?import=${r.id}`} className={small}>Gider olarak aç</Link>}
                <button type="button" className={small} onClick={() => { setClosing(r.id); setWhy(''); }}>{r.changed_payload ? 'Gördüm' : 'Kapat'}</button>
              </span>
            </div>
            {r.changed_payload && <p className="text-[12px] text-yellow-200">Yeni dosyada değişen: {diffText(r.payload, r.changed_payload)} — mevcut finans kaydı değiştirilmedi; gerekiyorsa gider ekranından elle düzeltin.</p>}
            {Array.isArray((r.plan as { missing?: string[] }).missing) && (r.plan as { missing: string[] }).missing.length > 0 && r.action === 'needs_info' && <p className="text-[12px] text-subtle">Eksik: {(r.plan as { missing: string[] }).missing.join(', ')}</p>}
            {closing === r.id && (
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${field} max-w-md`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Not (zorunlu), ör. Operasyon’da kayıtlı / bu ay yok" maxLength={300} />
                <button type="button" className="admin-btn" disabled={why.trim().length < 3} onClick={async () => { const e = await resolveImportRow(r.id, why.trim()); if (e) setErr(e); else { setClosing(null); reload(); } }}>Kaydet</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const FIELD: Record<string, string> = { name: 'gider adı', amountText: 'tutar', dueText: 'vade', status: 'ödeme durumu', method: 'ödeme yöntemi', note: 'not' };
function diffText(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const parts = Object.keys(FIELD).filter((k) => String(before[k] ?? '') !== String(after[k] ?? '')).map((k) => `${FIELD[k]}: “${String(before[k] ?? '') || '—'}” → “${String(after[k] ?? '') || '—'}”`);
  return parts.join(' · ') || 'biçim değişikliği';
}
