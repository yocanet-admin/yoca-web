'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, field, label, small } from '@/components/admin/ops/ui';
import { RecurringSummary } from '@/components/admin/documents/Recurring';
import { UnitField } from '@/components/admin/documents/fields';
import { applyDraft, defaultSelection, filledTarget, sectionLabel, sectionsOf, type DraftSuggestion, type SuggestedItem } from '@/lib/documents/aiDraft';
import { computeDocument, fmtMoney, fmtPct } from '@/lib/documents/calc';
import { BLOCK_LABEL, BILLING_LABEL, CURRENCY_LABEL, type BlockKey, type DocContent } from '@/lib/documents/model';

/**
 * Yoca — review of an AI draft suggestion before anything is written.
 * Every field can be edited here; the admin ticks the sections to apply
 * ("Seçilenleri uygula") or applies all of them. "Vazgeç" closes it and
 * writes nothing. Totals shown here are computed by the application from the
 * would-be document (lib/documents/calc.ts), never by the AI. Prices arrive
 * marked "AI fiyat önerisi — kontrol edilmeli"; commercial terms the request
 * did not give are marked "Kontrol edilecek öneri".
 */

export interface ReviewApply { select: string[]; itemMode: 'append' | 'replace'; acceptCurrency: boolean }

const blockLabel = (k: BlockKey) => BLOCK_LABEL[k]?.tr ?? k;
const TERM_OPTIONS = ['', '3', '6', '12', '24'];

export function AiDraftReview({ suggestion: s, onChange, doc, defaultTaxRate, hasClient, onApply, onCancel }: {
  suggestion: DraftSuggestion;
  onChange: (next: DraftSuggestion) => void;
  doc: { title: string; content: DocContent };
  defaultTaxRate: string;
  hasClient: boolean;
  onApply: (a: ReviewApply) => void;
  onCancel: () => void;
}) {
  const c = doc.content;
  const sections = sectionsOf(s);
  // a whole draft opens with only the sections whose target is still empty ticked: a filled title / text / list is never replaced unasked
  const [sel, setSel] = useState<Record<string, boolean>>(() => { const on = new Set(defaultSelection(doc, s)); return Object.fromEntries(sections.map((x) => [x, on.has(x)])); });
  const realItems = c.items.filter((i) => i.title.trim() || i.description.trim() || i.unitPrice.trim()).length;
  const [itemMode, setItemMode] = useState<'append' | 'replace'>(realItems ? 'append' : 'replace');
  const [acceptCurrency, setAcceptCurrency] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, []);

  // a new plan and its payment-terms text are applied together
  const linked = (id: string) => id === 'block:terms' && sections.includes('payment') && (sel.payment ?? true);
  const isSel = (id: string) => sections.includes(id) && ((sel[id] ?? true) || linked(id));
  const chosen = sections.filter(isSel);
  const pricedItems = s.prices && s.items.some((i) => i.unitPrice.trim());
  const needCurrency = Boolean(s.currencyConflict) && isSel('items') && pricedItems && !acceptCurrency;
  const opts = { select: chosen, itemMode, defaultTaxRate, acceptCurrency, hasClient };
  const preview = useMemo(() => applyDraft(doc, s, opts), [doc, s, chosen.join('|'), itemMode, acceptCurrency, hasClient]); // eslint-disable-line react-hooks/exhaustive-deps
  const calc = useMemo(() => computeDocument(preview.content), [preview]);
  const money = (m: bigint) => fmtMoney(m, c.currency, 'tr');

  const setItem = (i: number, patch: Partial<SuggestedItem>) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setBlock = (key: string, body: string) => onChange({ ...s, blocks: s.blocks.map((b) => (b.key === key ? { ...b, body } : b)) });
  const proposed = (id: string) => s.proposed.includes(id);

  // a render helper, not a component: re-rendering must not remount the checkbox (keyboard focus stays)
  const pick = (id: string, children: React.ReactNode = null) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-[13px] font-bold text-white">
        <input type="checkbox" checked={isSel(id)} disabled={linked(id)} onChange={(e) => setSel((o) => ({ ...o, [id]: e.target.checked }))} aria-describedby={proposed(id) ? `prop-${id}` : undefined} />
        {sectionLabel(id, blockLabel)}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {proposed(id) && <span id={`prop-${id}`}><Badge tone="warn">Kontrol edilecek öneri</Badge></span>}
        {filledTarget(doc, id) && <Badge tone="info">Belgede dolu — işaretlerseniz yerine geçer</Badge>}
        {linked(id) && <Badge tone="info">Ödeme planıyla birlikte uygulanır</Badge>}
        {children}
      </div>
    </div>
  );

  return (
    <section aria-labelledby="ai-review-h" className="admin-card grid min-w-0 grid-cols-1 gap-4 border-yoca-lime/40 p-4" data-testid="ai-review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="ai-review-h" ref={head} tabIndex={-1} className="text-[17px] font-extrabold outline-none">AI taslak önerisi — inceleyin</h2>
          <p className="text-[12px] text-muted">Siz “Uygula” demeden belgeye hiçbir şey yazılmaz. Alanları burada düzenleyebilir, yalnızca seçtiğiniz bölümleri uygulayabilirsiniz; uygulamadan sonra da her alan elle düzenlenebilir. Belge kaydedilmez, kesinleştirilmez, gönderilmez.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">Para birimi: {CURRENCY_LABEL[c.currency]}</Badge>
          {s.scope !== 'all' && <Badge tone="info">Yalnızca: {sectionLabel(s.scope, blockLabel)}</Badge>}
          {s.sample && <Badge tone="warn">ÖRNEK — kurgusal bilgiler</Badge>}
        </div>
      </div>

      {s.sample && <p className="border border-yellow-400/40 bg-yellow-400/10 p-2 text-[13px] text-yellow-100" role="note">ÖRNEK (sentetik) taslak: adlar kurgusaldır ve “ÖRNEK” ile işaretlenir. Uygulanırsa belge ÖRNEK olarak işaretlenir; kesinleştirilemez, gönderilemez ve müşteri kaydına (CRM) yazılmaz. Banka, IBAN, vergi, adres ve iletişim bilgisi uydurulmaz.</p>}
      {s.currencyConflict && (
        <div className="grid gap-2 border border-yellow-400/40 bg-yellow-400/10 p-3 text-[13px] text-yellow-100" role="alert">
          <p className="font-bold">Para birimi çakışması</p>
          <p>Talebinizde {s.currencyConflict.requested.map((x) => CURRENCY_LABEL[x]).join(', ')} geçiyor; teklifin para birimi {CURRENCY_LABEL[s.currencyConflict.selected]}. Yapay zekâ para birimini değiştirmez: önerilen fiyatlar {s.currencyConflict.selected} olarak hazırlandı. Başka para birimi istiyorsanız önce Belge bilgileri → Para birimi’ni değiştirip öneriyi yeniden isteyin.</p>
          {pricedItems && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={acceptCurrency} onChange={(e) => setAcceptCurrency(e.target.checked)} /> Fiyatların {s.currencyConflict.selected} olduğunu onaylıyorum</label>}
        </div>
      )}
      {s.warnings.map((w) => <p key={w} className="text-[13px] text-yellow-200">{w}</p>)}
      {s.missing.length > 0 && <div className="text-[13px]"><p className="font-semibold text-yellow-100">Sizin tamamlamanız gerekenler</p><ul className="list-disc ps-5 text-yellow-100">{s.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
      {(s.checks ?? []).length > 0 && <div className="text-[13px]"><p className="font-semibold text-muted">Kontrol edilecek varsayımlar (öneridir; metinde varsayım olarak yazın veya düzeltin)</p><ul className="list-disc ps-5 text-muted">{(s.checks ?? []).map((m) => <li key={m}>{m}</li>)}</ul></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 content-start gap-3">
          {sections.includes('title') && (
            <div className="grid gap-2 border border-line p-3">{pick('title')}
              <input aria-label="Önerilen başlık" className={field} value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
            </div>
          )}
          {sections.includes('subject') && (
            <div className="grid gap-2 border border-line p-3">{pick('subject')}
              <input aria-label="Önerilen konu" className={field} value={s.subject} onChange={(e) => onChange({ ...s, subject: e.target.value })} />
            </div>
          )}
          {sections.includes('recipient') && s.sampleRecipient && (
            <div className="grid gap-2 border border-line p-3">{pick('recipient', <Badge tone="warn">ÖRNEK</Badge>)}
              {hasClient ? <p className="text-[12px] text-yellow-200">Belge müşteri kaydına bağlı: örnek alıcı uygulanmaz.</p> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={label}>Firma (kurgusal)<input className={field} value={s.sampleRecipient.company} onChange={(e) => onChange({ ...s, sampleRecipient: { ...s.sampleRecipient!, company: e.target.value } })} /></label>
                  <label className={label}>Kişi (kurgusal)<input className={field} value={s.sampleRecipient.name} onChange={(e) => onChange({ ...s, sampleRecipient: { ...s.sampleRecipient!, name: e.target.value } })} /></label>
                </div>
              )}
            </div>
          )}

          {sections.includes('items') && (
            <div className="grid gap-3 border border-line p-3" data-testid="review-items">
              {pick('items', s.prices && pricedItems ? <Badge tone="warn">AI fiyat önerisi — kontrol edilmeli</Badge> : null)}
              {s.prices && (s.pricing.basis || s.pricing.assumptions.length > 0) && (
                <div className="grid gap-1 text-[12px] text-muted">
                  <p><span className="font-semibold text-white">Fiyat tahmininin dayanağı:</span> {s.pricing.basis || '—'}</p>
                  {s.pricing.assumptions.length > 0 && <ul className="list-disc ps-5">{s.pricing.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
                  <p className="text-subtle">Canlı piyasa araştırması yapılmadı; bu bir ortalama değil, kapsam ve efor varsayımına dayanan tahmindir. Birim fiyatlar KDV hariçtir; KDV belge ayarlarındaki oranla (%{defaultTaxRate}) eklenir.</p>
                </div>
              )}
              {realItems > 0 && (
                <fieldset className="grid gap-1 text-[13px]">
                  <legend className="mb-1 font-semibold text-muted">Belgede {realItems} kalem var:</legend>
                  <label className="flex items-center gap-2"><input type="radio" name="item-mode" checked={itemMode === 'append'} onChange={() => setItemMode('append')} /> Önerilen kalemleri mevcutların sonuna ekle</label>
                  <label className="flex items-center gap-2"><input type="radio" name="item-mode" checked={itemMode === 'replace'} onChange={() => setItemMode('replace')} /> Mevcut kalemlerin yerine koy</label>
                </fieldset>
              )}
              {s.items.map((it, i) => {
                const others = s.items.filter((x) => x.ref !== it.ref && !x.includedIn);
                const recurring = !it.includedIn && it.billing !== 'once';
                return (
                  <div key={it.ref} className="grid gap-2 border border-line p-2.5" data-testid={`review-item-${it.ref}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-[12px] font-bold text-yoca-green">{String(i + 1).padStart(2, '0')}</span>
                      <input aria-label={`${i + 1}. önerilen kalem başlığı`} className={`${field} min-w-0 flex-1`} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                    </div>
                    <textarea aria-label={`${i + 1}. önerilen kalem açıklaması`} className={field} rows={2} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className={label}>Faturalama
                        <select className={field} value={it.includedIn ? 'included' : it.billing} onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'included') setItem(i, { includedIn: others[0]?.ref ?? '', unitPrice: '', billing: 'once', term: '', startYear: 1 });
                          else if (v === 'once') setItem(i, { includedIn: '', billing: 'once', startYear: 1, quantity: recurring ? it.term || '1' : it.quantity, term: '' });
                          else {
                            // duration ("6 ay") moves to term; the period becomes the unit; quantity stays 1 (no double counting)
                            const q = it.quantity.trim();
                            const term = recurring ? it.term : /^\d{1,3}$/.test(q) && Number(q) > 1 ? String(Number(q)) : it.term;
                            setItem(i, { includedIn: '', billing: v as SuggestedItem['billing'], startYear: recurring ? it.startYear || 1 : 1, term, quantity: '1', unit: v === 'monthly' ? 'ay' : 'yıl' });
                          }
                        }}>
                          <option value="once">{BILLING_LABEL.once.tr}</option><option value="monthly">{BILLING_LABEL.monthly.tr}</option><option value="yearly">{BILLING_LABEL.yearly.tr}</option>
                          {others.length > 0 && <option value="included">Dahil</option>}
                        </select>
                      </label>
                      {it.includedIn ? (
                        <label className={`${label} col-span-2 sm:col-span-3`}>Dahil olduğu kalem
                          <select className={field} value={it.includedIn} onChange={(e) => setItem(i, { includedIn: e.target.value })}>{others.map((o) => <option key={o.ref} value={o.ref}>{o.title}</option>)}</select>
                        </label>
                      ) : <>
                        {recurring ? (
                          <label className={label}>Adet / Süre ({BILLING_LABEL[it.billing].per.tr})
                            <select className={field} value={it.term} onChange={(e) => setItem(i, { term: e.target.value })}>
                              {Array.from(new Set([...TERM_OPTIONS, it.term])).map((o) => <option key={o} value={o}>{o ? `${o} ${BILLING_LABEL[it.billing].per.tr}` : it.startYear > 1 ? 'Süresiz' : 'Belirtilmedi'}</option>)}
                            </select>
                          </label>
                        ) : <label className={label}>Adet / Süre<input className={field} inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></label>}
                        <label className={label}>Birim<UnitField className={field} value={it.unit} fixed={recurring ? BILLING_LABEL[it.billing].per.tr : undefined} onChange={(v) => setItem(i, { unit: v })} /></label>
                        {s.prices ? (
                          <label className={label}>Birim fiyat ({c.currency}{recurring ? ` / ${BILLING_LABEL[it.billing].per.tr}` : ''}, KDV hariç)
                            <input className={`${field} ${it.unitPrice ? '!border-yellow-400/70' : ''}`} inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder="boş = siz girersiniz" />
                          </label>
                        ) : <p className="self-end text-[12px] text-subtle">Fiyat istenmedi; siz girersiniz.</p>}
                      </>}
                      {recurring && (
                        <label className={label}>Başlangıç yılı
                          <select className={field} value={String(it.startYear || 1)} onChange={(e) => setItem(i, { startYear: Number(e.target.value), priceBasis: Number(e.target.value) > 1 ? it.priceBasis || 'estimate' : '' })}>
                            <option value="1">1. yıldan</option><option value="2">2. yıldan</option><option value="3">3. yıldan</option>
                          </select>
                        </label>
                      )}
                      {recurring && it.startYear > 1 && (
                        <label className={`${label} col-span-2`}>Gelecek dönem fiyatının niteliği
                          <select className={field} value={it.priceBasis} onChange={(e) => setItem(i, { priceBasis: e.target.value as SuggestedItem['priceBasis'] })}>
                            <option value="">Seçin</option><option value="estimate">Tahmini (güncel tarife)</option><option value="fixed">Sabit (taahhüt)</option>
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[12px]">
                      {it.includedIn ? <Badge tone="info">{`“${s.items.find((x) => x.ref === it.includedIn)?.title ?? ''}” kalemine dahil — ayrı fiyatı yok`}</Badge> : null}
                      {!it.includedIn ? <span data-testid={`review-qty-${it.ref}`}><Badge tone="muted">{`Adet / Süre: ${recurring && it.startYear > 1 && !it.term ? `${BILLING_LABEL[it.billing].tr} yenileme · ${it.startYear}. yıldan itibaren` : recurring ? `${it.term ? `${it.term} ${BILLING_LABEL[it.billing].per.tr}` : 'süre belirtilmedi'} · ${BILLING_LABEL[it.billing].tr.toLocaleLowerCase('tr')} faturalanır` : `${it.quantity || '1'}${it.unit ? ` ${it.unit}` : ''}`}`}</Badge></span> : null}
                      {recurring && !it.term && it.startYear <= 1 ? <Badge tone="warn">Süre belirtilmedi — varsayım; isterseniz süre seçin</Badge> : null}
                      {recurring && it.startYear > 1 ? <Badge tone="muted">İlk dönem toplamlarına dahil değil</Badge> : null}
                      {s.prices && it.unitPrice && !it.includedIn ? <Badge tone="warn">AI fiyat önerisi — kontrol edilmeli</Badge> : null}
                    </div>
                    {!it.includedIn && it.billing === 'monthly' ? <p className="text-[12px] text-subtle">Aylık birim fiyat, toplam aylık hizmet bedelidir (süreyle çarpılmaz).</p> : null}
                    {s.prices && it.priceNote && !it.includedIn ? <p className="text-[12px] text-subtle">Tahmin: {it.priceNote}</p> : null}
                  </div>
                );
              })}
            </div>
          )}

          {s.blocks.map((b) => sections.includes(`block:${b.key}`) && (
            <div key={b.key} className="grid gap-2 border border-line p-3">
              {pick(`block:${b.key}`)}
              <textarea aria-label={`${blockLabel(b.key as BlockKey)} önerisi`} className={field} rows={Math.min(8, Math.max(2, b.body.split('\n').length + 1))} value={b.body} onChange={(e) => setBlock(b.key, e.target.value)} />
            </div>
          ))}

          {sections.includes('payment') && (
            <div className="grid gap-2 border border-line p-3">
              {pick('payment')}
              <p className="text-[12px] text-subtle">Ödeme planı tek seferlik toplam üzerinden; aylık / yıllık ücretler bu plana girmez, kendi dönemlerinde faturalanır.</p>
              {s.payment.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px] gap-2 sm:grid-cols-[1.4fr_90px_1.2fr]">
                  <input aria-label={`${i + 1}. ödeme adımı`} className={field} value={p.label} onChange={(e) => onChange({ ...s, payment: s.payment.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input aria-label={`${i + 1}. ödeme yüzdesi`} className={field} inputMode="decimal" value={p.percent ?? ''} placeholder="%" onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); onChange({ ...s, payment: s.payment.map((x, j) => (j === i ? { ...x, percent: e.target.value.trim() && Number.isFinite(n) ? n : null } : x)) }); }} />
                  <input aria-label={`${i + 1}. ödeme vadesi`} className={`${field} col-span-2 sm:col-span-1`} value={p.due} onChange={(e) => onChange({ ...s, payment: s.payment.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)) })} />
                </div>
              ))}
            </div>
          )}
          {sections.includes('deliveryTime') && (
            <div className="grid gap-2 border border-line p-3">{pick('deliveryTime')}
              <textarea aria-label="Önerilen takvim" className={field} rows={2} value={s.deliveryTime} onChange={(e) => onChange({ ...s, deliveryTime: e.target.value })} />
            </div>
          )}
          {sections.includes('validity') && (
            <div className="grid gap-2 border border-line p-3">{pick('validity')}
              <label className={label}>Geçerlilik (düzenleme tarihinden itibaren gün)<input className={field} inputMode="numeric" value={s.validityDays ?? ''} onChange={(e) => { const n = Number(e.target.value); onChange({ ...s, validityDays: Number.isInteger(n) && n >= 1 && n <= 365 ? n : null }); }} /></label>
            </div>
          )}
          {sections.includes('closing') && (
            <div className="grid gap-2 border border-line p-3">{pick('closing')}
              <input aria-label="Önerilen kapanış cümlesi" className={field} value={s.closing} onChange={(e) => onChange({ ...s, closing: e.target.value })} />
            </div>
          )}
          {sections.length === 0 && <p className="text-[13px] text-subtle">Öneri boş geldi; belgenizde hiçbir şey değişmez.</p>}
        </div>

        <aside className="grid content-start gap-3 self-start text-[13px] xl:sticky xl:top-4" aria-label="Uygulanırsa hesaplanan özet">
          <div className="grid gap-1.5 border border-line p-3" data-testid="review-totals">
            <p className="font-bold text-white">Uygulanırsa (uygulama hesaplar)</p>
            <p className="text-[12px] text-subtle">Toplamları yapay zekâ değil, belgenin hesaplama kuralları üretir. KDV: belge ayarlarındaki oran.</p>
            <div className="flex justify-between gap-6"><span className="text-muted">Tek seferlik ara toplam</span><span className="tabular-nums">{money(calc.totals.subtotal)}</span></div>
            {calc.totals.taxes.map((t) => <div key={String(t.rateBp)} className="flex justify-between gap-6"><span className="text-muted">KDV %{fmtPct(t.rateBp)}</span><span className="tabular-nums">{money(t.tax)}</span></div>)}
            <div className="flex justify-between gap-6 border-t border-line pt-1 font-extrabold"><span>Tek seferlik toplam</span><span className="tabular-nums" data-testid="review-once-total">{calc.totals.grand !== null ? money(calc.totals.grand) : <span className="text-yellow-200">hesaplanamadı</span>}</span></div>
            {calc.payment.rows.length > 0 && <p className="text-[12px] text-subtle">Ödeme planı tek seferlik toplam üzerinden:</p>}
            {calc.payment.rows.length > 0 && <ul className="grid gap-0.5 border-t border-line pt-1 text-[12px] text-muted">{calc.payment.rows.map((r) => <li key={r.id} className="flex justify-between gap-4"><span>{r.pctBp !== null ? `%${fmtPct(r.pctBp)} · ` : ''}{r.label}</span><span className="tabular-nums">{r.amount !== null ? money(r.amount) : '—'}</span></li>)}</ul>}
            {calc.payment.problem && <p className="text-[12px] text-yellow-200">{calc.payment.problem}</p>}
          </div>
          <RecurringSummary groups={calc.recurring} currency={c.currency} compact />
          {preview.skipped.map((x) => <p key={x.id} className="text-[12px] text-yellow-200">{x.why}</p>)}
          {preview.notes.map((x) => <p key={x} className={`text-[12px] ${/uyuşmuyor/.test(x) ? 'text-yellow-200' : 'text-subtle'}`} data-testid="review-note">Uygulanırsa: {x}</p>)}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="button" className="admin-btn admin-btn-primary" disabled={!chosen.length || needCurrency} onClick={() => onApply({ select: chosen, itemMode, acceptCurrency })}>Seçilenleri uygula ({chosen.length})</button>
        <button type="button" className="admin-btn" disabled={!sections.length || (Boolean(s.currencyConflict) && pricedItems && !acceptCurrency)} onClick={() => onApply({ select: sections, itemMode, acceptCurrency })}>Hepsini uygula</button>
        <button type="button" className="admin-btn" onClick={onCancel}>Vazgeç</button>
        {needCurrency && <span className="text-[12px] text-yellow-200">Önce para birimini onaylayın.</span>}
        <button type="button" className={`${small} ms-auto`} onClick={() => setSel(Object.fromEntries(sections.map((x) => [x, !chosen.length])))}>{chosen.length ? 'Seçimi temizle' : 'Tümünü seç'}</button>
      </div>
    </section>
  );
}
