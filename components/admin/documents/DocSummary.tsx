'use client';

import type { ReactNode } from 'react';
import { computeDocument, fmtMoney, fmtPct, parseMoney, quantityText } from '@/lib/documents/calc';
import { BLOCK_LABEL, CURRENCY_LABEL, KIND_DEF, KIND_LABEL, billingText, bodyParts, type DocContent, type DocKind } from '@/lib/documents/model';
import { RecurringSummary } from '@/components/admin/documents/Recurring';
import { formatIban, type BankAccount } from '@/lib/documents/settings';
import { fmtDate } from '@/components/admin/ops/ui';

/**
 * Read-only view of a finalized (or archived) document: what the PDF says,
 * in the panel, without form fields. Editing starts with "Revize et".
 * Amounts are recomputed here with the same code as the PDF and the server.
 */

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="admin-card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-extrabold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">{k}</dt>
      <dd className="text-[13px] text-white">{v}</dd>
    </div>
  );
}

function Body({ text, list }: { text: string; list: boolean }) {
  const parts = bodyParts(text, list);
  const out: ReactNode[] = [];
  let ul: string[] = [];
  const flush = (key: number) => { if (ul.length) { out.push(<ul key={`u${key}`} className="list-disc ps-5">{ul.map((x, i) => <li key={i}>{x}</li>)}</ul>); ul = []; } };
  parts.forEach((p, i) => {
    if (p.type === 'li') { ul.push(p.text); return; }
    flush(i);
    out.push(p.type === 'h' ? <p key={i} className="font-bold text-white">{p.text}</p> : <p key={i}>{p.text}</p>);
  });
  flush(parts.length);
  return <div className="grid gap-2 text-[13px] leading-relaxed text-muted">{out}</div>;
}

export function DocSummary({ kind, content: c, banks, sourceNumber }: { kind: DocKind; content: DocContent; banks: BankAccount[]; sourceNumber?: string | null }) {
  const def = KIND_DEF[kind];
  const { totals, payment, recurring } = computeDocument(c);
  const lines = [...totals.lines, ...recurring.flatMap((g) => g.totals.lines)].sort((a, b) => a.index - b.index);
  const money = (m: bigint) => fmtMoney(m, c.currency, 'tr');
  const r = c.recipient;
  const blocks = c.blocks.filter((b) => b.body.trim());
  const showDisc = c.items.some((i) => i.discountPct.trim() && i.discountPct.trim() !== '0');
  return (
    <div className="grid gap-5">
      <Card title="Belge">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact k="Tür" v={KIND_LABEL[kind].tr} />
          <Fact k="Düzenleme" v={fmtDate(c.issueDate)} />
          {def.validity && c.validUntil ? <Fact k="Geçerlilik" v={fmtDate(c.validUntil)} /> : null}
          {def.items ? <Fact k="Para birimi" v={CURRENCY_LABEL[c.currency]} /> : null}
          {c.sample ? <Fact k="Örnek" v="ÖRNEK (sentetik) belge — gerçek teklif değildir" /> : null}
          <Fact k="Dil" v={c.locale === 'tr' ? 'Türkçe' : 'English'} />
          {c.projectName ? <Fact k="Proje" v={c.projectName} /> : null}
          {def.period && c.period ? <Fact k="Dönem" v={c.period} /> : null}
          {c.reference ? <Fact k="İlgi" v={c.reference} /> : null}
          {def.subject && c.subject ? <Fact k="Konu" v={c.subject} /> : null}
          {sourceNumber ? <Fact k="Kaynak teklif" v={sourceNumber} /> : null}
        </dl>
      </Card>

      <Card title="Alıcı">
        <div className="grid gap-0.5 text-[13px]">
          <p className="font-bold text-white">{r.company || r.name || <span className="italic text-subtle">Alıcı yok</span>}</p>
          {r.company && r.name ? <p className="text-muted">{r.name}</p> : null}
          {r.attention ? <p className="text-muted">İlgili: {r.attention}</p> : null}
          {r.address ? <p className="whitespace-pre-wrap text-muted">{r.address}</p> : null}
          {r.taxOffice || r.taxNumber ? <p className="text-muted">{[r.taxOffice ? `Vergi dairesi: ${r.taxOffice}` : '', r.taxNumber ? `Vergi no: ${r.taxNumber}` : ''].filter(Boolean).join(' · ')}</p> : null}
          {r.email || r.phone ? <p className="text-muted">{[r.email, r.phone].filter(Boolean).join(' · ')}</p> : null}
        </div>
      </Card>

      {def.items && (
        <Card title="Kalemler" aside={<span className="text-[12px] text-subtle">{lines.length} kalem</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-subtle">
                <tr><th className="py-1.5 pe-2">#</th><th className="py-1.5 pe-2">Açıklama</th><th className="py-1.5 pe-2 text-right">Adet / Süre</th><th className="py-1.5 pe-2 text-right">Birim fiyat</th>{showDisc && <th className="py-1.5 pe-2 text-right">İnd.</th>}<th className="py-1.5 pe-2 text-right">KDV</th><th className="py-1.5 text-right">Tutar</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const it = c.items[l.index];
                  return (
                    <tr key={l.id} className="border-t border-line align-top">
                      <td className="py-2 pe-2 font-bold text-yoca-green">{String(l.index + 1).padStart(2, '0')}</td>
                      <td className="py-2 pe-2"><p className="font-semibold text-white">{it.title}</p>{it.description ? <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-muted">{it.description}</p> : null}<p className="mt-0.5 text-[11px] text-subtle">{billingText(it, c.items)}</p></td>
                      <td className="whitespace-nowrap py-2 pe-2 text-right tabular-nums text-muted">{quantityText(it)}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-right tabular-nums text-muted">{l.included ? 'Dahil' : l.missingPrice ? <span className="text-yellow-200">eksik</span> : money(parseMoney(it.unitPrice) ?? BigInt(0))}</td>
                      {showDisc && <td className="py-2 pe-2 text-right tabular-nums text-muted">{it.discountPct && it.discountPct !== '0' ? `%${it.discountPct}` : '—'}</td>}
                      <td className="py-2 pe-2 text-right tabular-nums text-muted">{l.taxRateBp !== null ? `%${fmtPct(l.taxRateBp)}` : ''}</td>
                      <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-white">{l.net !== null ? money(l.net) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid justify-end gap-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between gap-10"><span className="text-muted">Ara toplam</span><span className="tabular-nums">{money(totals.subtotal)}</span></div>
            {totals.discount > BigInt(0) && <div className="flex justify-between gap-10"><span className="text-muted">İndirim</span><span className="tabular-nums">−{money(totals.discount)}</span></div>}
            {totals.taxes.map((t) => <div key={String(t.rateBp)} className="flex justify-between gap-10"><span className="text-muted">KDV %{fmtPct(t.rateBp)} <span className="text-subtle">(matrah {money(t.base)})</span></span><span className="tabular-nums">{money(t.tax)}</span></div>)}
            <div className="flex justify-between gap-10 border-t border-line pt-1 text-[15px] font-extrabold"><span>{recurring.length ? 'Tek seferlik toplam' : 'Genel toplam'}</span><span className="tabular-nums">{totals.grand !== null ? money(totals.grand) : <span className="text-yellow-200">hesaplanamadı</span>}</span></div>
          </div>
          <RecurringSummary groups={recurring} currency={c.currency} />
        </Card>
      )}

      {def.payment && (payment.rows.length > 0 || (def.deliveryTime && c.deliveryTime)) && (
        <Card title="Ödeme planı">
          {payment.rows.length > 0 ? (
            <ul className="grid gap-1 text-[13px]">
              {payment.rows.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1.5 first:border-t-0 first:pt-0">
                  <span><b className="text-white">{p.pctBp !== null ? `%${fmtPct(p.pctBp)} · ` : ''}{p.label}</b>{p.due ? <span className="text-muted"> · {p.due}</span> : null}</span>
                  <span className="tabular-nums text-white">{p.amount !== null ? money(p.amount) : '—'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-subtle">Ödeme planı yok.</p>}
          {def.deliveryTime && c.deliveryTime ? <p className="text-[13px] text-muted"><span className="text-subtle">Teslim süresi / takvim:</span> {c.deliveryTime}</p> : null}
        </Card>
      )}

      {def.bank && (
        <Card title="Banka bilgileri (belgede basılı)">
          {banks.length === 0 ? <p className="text-[13px] text-subtle">Belgede banka bilgisi yok.</p> : (
            <ul className="grid gap-2 text-[13px]">
              {banks.map((a) => <li key={a.id}><b className="text-white">{[a.bank, a.currency].filter(Boolean).join(' · ')}</b>{a.holder ? <span className="text-muted"> · {a.holder}</span> : null}<br /><span className="font-mono text-[12px] text-muted">{formatIban(a.iban)}</span></li>)}
            </ul>
          )}
        </Card>
      )}

      <Card title={kind === 'letter' ? 'Yazı metni' : 'Bölümler'} aside={<span className="text-[12px] text-subtle">{blocks.length} bölüm</span>}>
        {c.salutation ? <p className="text-[13px] text-white">{c.salutation}</p> : null}
        {blocks.length === 0 ? <p className="text-[13px] text-subtle">Metin yok.</p> : blocks.map((b) => (
          <div key={b.id} className="grid gap-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <h3 className="text-[13px] font-bold text-white">{b.heading || BLOCK_LABEL[b.key].tr}</h3>
            <Body text={b.body} list={BLOCK_LABEL[b.key].list} />
          </div>
        ))}
        {c.closing || c.signatory.name || c.signatory.title ? (
          <p className="border-t border-line pt-3 text-[12px] text-subtle">{[c.closing, [c.signatory.name, c.signatory.title].filter(Boolean).join(', ')].filter(Boolean).join(' — ')}</p>
        ) : null}
      </Card>
    </div>
  );
}
