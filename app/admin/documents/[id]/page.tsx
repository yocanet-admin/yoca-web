'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Details, Flash, field, label, small, fmtDate, fmtDateTime } from '@/components/admin/ops/ui';
import { aiAction, clientDisplay, docAction, draftPdf, loadDoc, moneyOf, newKey, storedPdf, type ClientLite, type DocDetail, type StoredPdfResult } from '@/lib/documents/client';
import { BankDecision } from '@/components/admin/documents/BankDecision';
import { DocSummary } from '@/components/admin/documents/DocSummary';
import { Group } from '@/components/admin/documents/Group';
import type { BankChange } from '@/lib/documents/settings';
import { readDocBackup, writeDocBackup, type DocBackup } from '@/lib/documents/backup';
import { getAdminClient } from '@/lib/adminClient';
import {
  BLOCK_LABEL, DOC_CURRENCIES, KIND_DEF, KIND_LABEL, QUOTE_STATE_LABEL, QUOTE_STATES, STATUS_LABEL,
  blockHeading, localId, missingFor, newItem, type Block, type BlockKey, type DocContent, type LineItem, type PaymentStep, type QuoteState,
} from '@/lib/documents/model';
import { computeDocument, fmtMoney, fmtPct } from '@/lib/documents/calc';

/**
 * Yoca — Teklifler ve Belgeler: editor.
 * Fields follow the document type (KIND_DEF): a letter never asks for line
 * items or payments. Amounts are computed here and on the server with the
 * same code; the AI only proposes text, shown as a suggestion that the
 * admin applies (or not).
 *  - Draft: the fields are grouped in collapsible sections; closing a group
 *    never loses what was typed, and unsaved changes are also kept in this
 *    browser per user and per document (lib/documents/backup.ts), offered back
 *    after a reload or an accidental navigation, removed on save, "Sil" and
 *    sign-out.
 *  - Finalized / archived: a readable summary (recipient, items, totals,
 *    payment plan, sections) instead of disabled fields; "Revize et" opens the
 *    editor again. PDF, preview and the version history stay one click away.
 * Each finalization is a new version and earlier PDFs stay.
 */

type Draft = { title: string; clientId: string | null; content: DocContent };
type DraftSuggestion = {
  title: string; subject: string; deliveryTime: string; missing: string[]; warnings: string[];
  blocks: Array<{ key: string; heading: string; body: string }>;
  items: Array<{ title: string; description: string; quantity: string; unit: string }>;
  payment: Array<{ label: string; percent: number | null; due: string }>;
};
type Rewrite = { blockId: string; start: number; end: number; original: string; text: string; changes: string[]; warnings: string[] };
type Translation = { to: 'tr' | 'en'; title: string; subject: string; deliveryTime: string; blocks: Array<{ id: string; heading: string; body: string }>; items: Array<{ id: string; title: string; description: string; unit: string }>; payment: Array<{ id: string; label: string; due: string }> };

const EVENT_LABEL: Record<string, string> = {
  created: 'Oluşturuldu', duplicated: 'Çoğaltılarak oluşturuldu', from_quote: 'Tekliften proforma oluşturuldu', finalized: 'Kesinleştirildi',
  revised: 'Revizyona açıldı', archived: 'Arşivlendi', restored: 'Arşivden çıkarıldı', quote_state: 'Teklif durumu işaretlendi',
};

function recipientFrom(c: ClientLite) {
  const b = c.billing ?? {};
  return {
    company: c.legal_name || (c.party_type === 'individual' ? '' : c.name), name: c.contact_name || (c.party_type === 'individual' ? c.name : ''), attention: '',
    address: b.billing_address || c.address || '', taxOffice: b.tax_office || '', taxNumber: b.tax_no || '', email: b.billing_email || c.email || '', phone: c.phone || '',
  };
}

function EditorInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<DocDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [finalizeKey, setFinalizeKey] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [suggestion, setSuggestion] = useState<DraftSuggestion | null>(null);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [stateNote, setStateNote] = useState('');
  const [showAi, setShowAi] = useState(params.get('ai') === '1');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const [restore, setRestore] = useState<DocBackup | null>(null);
  // Signed-in user: the browser backup is kept per user and per document.
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => { void getAdminClient()?.auth.getSession().then(({ data }) => setUid(data.session?.user.id ?? null)); }, []);
  const [bankAsk, setBankAsk] = useState<{ version: number; changes: BankChange[]; preview: boolean } | null>(null);
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const load = useCallback(async () => {
    if (!uid) return;
    const r = await loadDoc(id);
    setData(r);
    if (r.ok) {
      setDraft({ title: r.document.title, clientId: r.document.client_id, content: r.document.content });
      setDirty(false); setConflict(false);
      // Long documents open with filled text sections collapsed (preview line); decided once per load,
      // so a section never folds away while someone is typing or applying a suggestion.
      const bl = r.document.content.blocks;
      setOpenBlocks(Object.fromEntries(bl.map((b) => [b.id, bl.length <= 3 || !b.body.trim()])));
      // Unsaved changes from an earlier visit in this browser: offer to restore, never apply silently.
      const b = r.document.status === 'draft' ? readDocBackup(uid, id) : null;
      const same = b && JSON.stringify({ t: b.title, c: b.clientId, x: b.content }) === JSON.stringify({ t: r.document.title, c: r.document.client_id, x: r.document.content });
      if (b && !same) setRestore(b); else { setRestore(null); if (b) writeDocBackup(uid, id, null); }
    }
  }, [id, uid]);
  useEffect(() => { void load(); }, [load]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Keep unsaved changes in this browser too (in-app navigation does not trigger beforeunload).
  const docUpdatedAt = data?.ok ? data.document.updated_at : '';
  useEffect(() => {
    if (!dirty || !draft || !docUpdatedAt || !uid) return;
    const t = setTimeout(() => writeDocBackup(uid, id, { base: docUpdatedAt, at: new Date().toISOString(), title: draft.title, clientId: draft.clientId, content: draft.content }), 400);
    return () => clearTimeout(t);
  }, [dirty, draft, docUpdatedAt, id, uid]);

  const doc = data?.ok ? data.document : null;
  const kind = doc?.kind ?? 'quote';
  const def = KIND_DEF[kind];
  const editable = doc?.status === 'draft';
  const c = draft?.content;
  const calc = useMemo(() => (c ? computeDocument(c) : null), [c]);
  const goneBanks = useMemo(() => (c && data?.ok && def.bank ? c.bankAccountIds.filter((x) => !data.settings.bankAccounts.some((a) => a.id === x)) : []), [c, data, def.bank]);
  const missing = useMemo(() => {
    if (!c || !data?.ok || !calc) return { blocking: [] as string[], warnings: [] as string[] };
    const m = missingFor(kind, c, data.issuer, { title: draft?.title ?? '', missingPrices: def.items ? [...calc.totals.missingPrices, ...calc.totals.errors] : [], paymentProblem: def.payment ? calc.payment.problem : null });
    if (goneBanks.length) m.blocking.push(`Seçili ${goneBanks.length} banka hesabı Belge ayarlarında artık yok; banka bilgilerini yeniden seçin.`);
    return m;
  }, [c, data, calc, kind, def, draft?.title, goneBanks]);

  if (!data) return <p className="text-[13px] text-subtle">Yükleniyor…</p>;
  if (!data.ok || !doc || !draft || !c || !calc) return <Flash tone="bad" message={data.error ?? 'Belge okunamadı.'} />;

  const set = (patch: Partial<DocContent>) => { setDraft({ ...draft, content: { ...c, ...patch } }); setDirty(true); };
  const setTop = (patch: Partial<Draft>) => { setDraft({ ...draft, ...patch }); setDirty(true); };
  const setItem = (i: number, patch: Partial<LineItem>) => set({ items: c.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setStep = (i: number, patch: Partial<PaymentStep>) => set({ payment: c.payment.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setBlock = (bid: string, patch: Partial<Block>) => set({ blocks: c.blocks.map((b) => (b.id === bid ? { ...b, ...patch } : b)) });
  const move = <T,>(list: T[], i: number, d: -1 | 1) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; };
  const money = (m: bigint) => fmtMoney(m, c.currency, 'tr');

  const save = async (): Promise<string | null> => {
    setBusy('save');
    const r = await docAction<{ updated_at: string }>({ action: 'save', id: doc.id, expectedUpdatedAt: doc.updated_at, title: draft.title, clientId: draft.clientId, content: c });
    setBusy(null);
    if (!r.ok) {
      if (r.conflict) setConflict(true);
      setFlash({ tone: 'bad', text: `${r.error ?? 'Kaydedilemedi.'} Değişiklikleriniz bu tarayıcıda saklı; sayfa yenilense de kaybolmaz.` });
      return null;
    }
    setData({ ...data, document: { ...doc, title: draft.title, client_id: draft.clientId, content: c, updated_at: r.updated_at as string } });
    setDirty(false);
    if (uid) writeDocBackup(uid, id, null);
    setRestore(null);
    setFlash({ tone: 'ok', text: 'Kaydedildi.' });
    return r.updated_at as string;
  };

  const act = async (action: string, extra: Record<string, unknown> = {}, ok?: string) => {
    setBusy(action);
    const r = await docAction<{ id?: string; version?: number }>({ action, id: doc.id, ...extra });
    setBusy(null);
    if (!r.ok) { setFlash({ tone: 'bad', text: r.missing ? `${r.error} ${r.missing.blocking.join(' ')}` : r.error ?? 'İşlem yapılamadı.' }); if (r.conflict) setConflict(true); return r; }
    if (ok) setFlash({ tone: 'ok', text: ok });
    return r;
  };

  const finalize = async () => {
    if (dirty) return setFlash({ tone: 'warn', text: 'Önce değişiklikleri kaydedin; kesinleştirme kayıtlı metin üzerinden yapılır.' });
    const key = finalizeKey ?? newKey();
    setFinalizeKey(key);
    const r = await act('finalize', { expectedUpdatedAt: doc.updated_at, requestKey: key });
    if (r.ok) { setFinalizeKey(null); setFlash({ tone: 'ok', text: `Kesinleştirildi: sürüm ${r.version}. PDF depoya kaydedildi.` }); await load(); }
  };

  const revise = async (why?: 'bank') => {
    if (busy) return;
    const r = await act('revise', { expectedUpdatedAt: doc.updated_at }, why === 'bank'
      ? 'Revizyon açıldı. Banka bilgileri artık Belge ayarlarındaki güncel hâliyle gösterilir; kontrol edip kaydedin ve kesinleştirin. Yeni sürüm oluşur, önceki sürüm ve PDF’leri saklanır.'
      : 'Revizyon açıldı. Kaydedip kesinleştirdiğinizde yeni sürüm oluşur; önceki sürümün PDF’i saklanır.');
    if (r.ok) { setBankAsk(null); if (why === 'bank') setOpen((o) => ({ ...o, bank: true })); await load(); }
  };

  const fillFromClient = () => {
    const cl = data.clients.find((x) => x.id === draft.clientId);
    if (!cl) return;
    set({ recipient: { ...c.recipient, ...recipientFrom(cl) } });
  };

  const aiDraft = async () => {
    setBusy('ai'); setSuggestion(null);
    const r = await aiAction<{ suggestion: DraftSuggestion }>({ mode: 'draft', kind, locale: c.locale, brief, recipient: c.recipient.company || c.recipient.name, projectName: c.projectName, requestKey: newKey() });
    setBusy(null);
    if (!r.ok || !r.suggestion) return setFlash({ tone: 'bad', text: r.error ?? 'Yapay zekâ önerisi alınamadı. Belgeniz değişmedi.' });
    setSuggestion(r.suggestion);
  };

  const applySuggestion = (what: 'title' | 'blocks' | 'items' | 'payment' | 'delivery' | 'subject' | 'all', blockKey?: string) => {
    if (!suggestion) return;
    const next: Partial<DocContent> = {};
    const nd: Partial<Draft> = {};
    if ((what === 'title' || what === 'all') && suggestion.title) nd.title = suggestion.title;
    if ((what === 'subject' || what === 'all') && suggestion.subject) next.subject = suggestion.subject;
    if ((what === 'delivery' || what === 'all') && suggestion.deliveryTime) next.deliveryTime = suggestion.deliveryTime;
    if (what === 'blocks' || what === 'all') {
      const blocks = [...c.blocks];
      for (const sb of suggestion.blocks.filter((b) => !blockKey || b.key === blockKey)) {
        const i = blocks.findIndex((b) => b.key === sb.key);
        if (i >= 0) blocks[i] = { ...blocks[i], heading: blocks[i].heading || sb.heading, body: sb.body };
        else blocks.push({ id: localId('b'), key: sb.key as BlockKey, heading: sb.heading || blockHeading(sb.key as BlockKey, c.locale), body: sb.body });
      }
      next.blocks = blocks;
    }
    if ((what === 'items' || what === 'all') && suggestion.items.length) {
      const keep = c.items.filter((i) => i.title.trim() || i.description.trim() || i.unitPrice.trim());
      // Prices are never taken from the AI: every suggested line arrives without a price.
      next.items = [...keep, ...suggestion.items.map((i) => ({ ...newItem(data.settings.defaultTaxRate), title: i.title, description: i.description, quantity: i.quantity || '1', unit: i.unit }))];
    }
    if ((what === 'payment' || what === 'all') && suggestion.payment.length) {
      next.payment = suggestion.payment.map((p) => ({ id: localId('p'), label: p.label, mode: 'percent' as const, value: p.percent === null ? '' : String(p.percent).replace('.', ','), due: p.due }));
    }
    setDraft({ ...draft, ...nd, content: { ...c, ...next } });
    setDirty(true);
    setFlash({ tone: 'ok', text: 'Öneri uygulandı (henüz kaydedilmedi). Eksik bilgileri ve fiyatları siz tamamlayın.' });
  };

  const aiRewrite = async (b: Block, op: 'shorten' | 'formal' | 'simplify') => {
    const el = textRefs.current[b.id];
    const start = el && el.selectionEnd > el.selectionStart ? el.selectionStart : 0;
    const end = el && el.selectionEnd > el.selectionStart ? el.selectionEnd : b.body.length;
    const original = b.body.slice(start, end);
    if (!original.trim()) return setFlash({ tone: 'warn', text: 'Önce düzenlenecek metni yazın veya seçin.' });
    setBusy(`rw-${b.id}`); setRewrite(null);
    const r = await aiAction<{ suggestion: { text: string; changes: string[]; warnings: string[] } }>({ mode: 'rewrite', op, kind, locale: c.locale, text: original, requestKey: newKey() });
    setBusy(null);
    if (!r.ok || !r.suggestion) return setFlash({ tone: 'bad', text: r.error ?? 'Öneri alınamadı. Metniniz değişmedi.' });
    setRewrite({ blockId: b.id, start, end, original, ...r.suggestion });
  };

  const applyRewrite = () => {
    if (!rewrite) return;
    const b = c.blocks.find((x) => x.id === rewrite.blockId);
    if (!b || b.body.slice(rewrite.start, rewrite.end) !== rewrite.original) { setRewrite(null); return setFlash({ tone: 'warn', text: 'Metin öneri alındıktan sonra değişti; öneri uygulanmadı. Yeniden deneyin.' }); }
    setBlock(b.id, { body: b.body.slice(0, rewrite.start) + rewrite.text + b.body.slice(rewrite.end) });
    setRewrite(null);
  };

  const aiTranslate = async () => {
    const to = c.locale === 'tr' ? 'en' : 'tr';
    setBusy('tr'); setTranslation(null);
    const r = await aiAction<{ suggestion: Translation }>({ mode: 'translate', id: doc.id, kind, locale: c.locale, to, title: draft.title, content: c, requestKey: newKey() });
    setBusy(null);
    if (!r.ok || !r.suggestion) return setFlash({ tone: 'bad', text: r.error ?? 'Çeviri önerisi alınamadı. Belgeniz değişmedi.' });
    setTranslation(r.suggestion);
  };

  const applyTranslation = () => {
    if (!translation) return;
    const t = translation;
    setDraft({
      ...draft,
      title: t.title || draft.title,
      content: {
        ...c, locale: t.to, subject: t.subject || c.subject, deliveryTime: t.deliveryTime || c.deliveryTime,
        blocks: c.blocks.map((b) => { const x = t.blocks.find((y) => y.id === b.id); return x ? { ...b, heading: x.heading, body: x.body } : b; }),
        items: c.items.map((i) => { const x = t.items.find((y) => y.id === i.id); return x ? { ...i, title: x.title, description: x.description, unit: x.unit } : i; }),
        payment: c.payment.map((p) => { const x = t.payment.find((y) => y.id === p.id); return x ? { ...p, label: x.label, due: x.due } : p; }),
        closing: c.closing && kind === 'letter' ? (t.to === 'en' ? 'Kind regards,' : 'Saygılarımızla,') : c.closing,
      },
    });
    setDirty(true);
    setTranslation(null);
    setFlash({ tone: 'ok', text: `Belge dili ${t.to === 'en' ? 'İngilizce' : 'Türkçe'} oldu (henüz kaydedilmedi). Tutarlar ve tarihler değişmedi.` });
  };

  /** Stored PDF of a finalized version; stops and asks when its bank details are out of date. */
  const handleStored = (r: StoredPdfResult, preview: boolean) => {
    if (r && 'error' in r) setFlash({ tone: 'bad', text: r.error });
    else if (r && 'bankDecision' in r) setBankAsk({ ...r.bankDecision, preview });
    else setBankAsk(null);
  };
  const openTab = () => { const w = window.open('', '_blank'); if (w) w.opener = null; return w; };
  const downloadStored = async (version?: number, keepBank = false) => {
    setBusy('pdf');
    const r = await storedPdf({ id: doc.id, version }, { keepBank });
    setBusy(null);
    handleStored(r, false);
  };
  const previewStored = async (version?: number, keepBank = false) => {
    const w = openTab();
    setBusy('prev');
    const r = await storedPdf({ id: doc.id, version }, { keepBank, preview: w });
    setBusy(null);
    handleStored(r, true);
  };
  const previewDraft = async () => {
    setBusy('prev');
    const e = await draftPdf(doc.id, draft.title, c, false, doc.number);
    setBusy(null);
    if (e) setFlash({ tone: 'bad', text: e });
  };
  const downloadDraft = async () => {
    setBusy('pdf');
    const e = await draftPdf(doc.id, draft.title, c, true, doc.number);
    setBusy(null);
    if (e) setFlash({ tone: 'bad', text: e });
  };

  const finalV = data.versions.find((v) => v.version === doc.final_version) ?? null;
  const ro = !editable;
  const blockKeysAvailable = def.blocks.filter((k) => !c.blocks.some((b) => b.key === k));
  const recipientName = c.recipient.company || c.recipient.name;

  // Groups: open by default where work usually happens; the state is per page visit.
  const groupDefault: Record<string, boolean> = {
    facts: true, recipient: !recipientName, items: true, payment: true,
    bank: params.get('bank') === '1' || goneBanks.length > 0, blocks: true, closing: false,
  };
  const isOpen = (g: string) => open[g] ?? groupDefault[g];
  const toggle = (g: string) => setOpen((o) => ({ ...o, [g]: !isOpen(g) }));
  const groupIds = ['facts', 'recipient', ...(def.items ? ['items'] : []), ...(def.payment ? ['payment'] : []), ...(def.bank ? ['bank'] : []), 'blocks', 'closing'];
  const allOpen = groupIds.every(isOpen);
  const setAll = (v: boolean) => { setOpen(Object.fromEntries(groupIds.map((g) => [g, v]))); setOpenBlocks(Object.fromEntries(c.blocks.map((b) => [b.id, v]))); };
  const blockOpen = (b: Block) => openBlocks[b.id] ?? true;

  const lastBankChanges = finalV?.bankChanges ?? [];

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle"><Link href="/admin/documents" className="hover:text-white">Teklifler ve Belgeler</Link> · {KIND_LABEL[kind].tr}</p>
          <h1 className="text-2xl font-extrabold tracking-tight"><span className="font-mono text-[18px] text-muted">{doc.number}</span> {draft.title || <span className="italic text-subtle">Başlıksız</span>}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={doc.status === 'draft' ? 'warn' : doc.status === 'final' ? 'ok' : 'muted'}>{STATUS_LABEL[doc.status]}</Badge>
            {doc.final_version ? <Badge tone="info">Son sürüm v{doc.final_version}{doc.status === 'draft' ? ' · revizyon açık' : ''}</Badge> : null}
            {doc.quote_state ? <Badge tone={doc.quote_state === 'accepted' ? 'ok' : doc.quote_state === 'rejected' ? 'bad' : 'info'}>{QUOTE_STATE_LABEL[doc.quote_state]}</Badge> : null}
            {dirty ? <Badge tone="warn">Kaydedilmemiş değişiklik</Badge> : null}
          </div>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy || !dirty} onClick={() => void save()}>{busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}</button>
            <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void previewDraft()}>{busy === 'prev' ? 'Hazırlanıyor…' : 'Önizle (taslak PDF)'}</button>
            <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void downloadDraft()}>{busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir'}</button>
            <button type="button" className="admin-btn" disabled={!!busy || missing.blocking.length > 0 || dirty} title={dirty ? 'Önce kaydedin' : missing.blocking.length ? 'Eksik bilgiler tamamlanmalı' : ''} onClick={finalize}>{busy === 'finalize' ? 'Kesinleştiriliyor…' : 'Kesinleştir'}</button>
            {doc.final_version > 0 && <a href="#surumler" className="admin-btn">Sürüm geçmişi ({data.versions.length})</a>}
            {kind === 'quote' && doc.final_version > 0 && <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('from_quote', { requestKey: newKey() }); if (r.ok && r.id) router.push(`/admin/documents/${r.id}`); }}>Proforma oluştur</button>}
            <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('duplicate', { requestKey: newKey() }); if (r.ok && r.id) router.push(`/admin/documents/${r.id}`); }}>Çoğalt</button>
            <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('archive', { archive: true }, 'Arşivlendi.'); if (r.ok) await load(); }}>Arşivle</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {doc.final_version > 0 && <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy} onClick={() => void downloadStored()}>{busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir'}</button>}
            {doc.final_version > 0 && <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void previewStored()}>{busy === 'prev' ? 'Hazırlanıyor…' : 'Önizle'}</button>}
            {doc.final_version > 0 && <a href="#surumler" className="admin-btn">Sürüm geçmişi ({data.versions.length})</a>}
            {doc.status === 'final' && <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void revise()}>Revize et</button>}
            {kind === 'quote' && doc.final_version > 0 && <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('from_quote', { requestKey: newKey() }); if (r.ok && r.id) router.push(`/admin/documents/${r.id}`); }}>Proforma oluştur</button>}
            <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('duplicate', { requestKey: newKey() }); if (r.ok && r.id) router.push(`/admin/documents/${r.id}`); }}>Çoğalt</button>
            <button type="button" className="admin-btn" disabled={!!busy} onClick={async () => { const r = await act('archive', { archive: doc.status !== 'archived' }, doc.status === 'archived' ? 'Arşivden çıkarıldı.' : 'Arşivlendi.'); if (r.ok) await load(); }}>{doc.status === 'archived' ? 'Arşivden çıkar' : 'Arşivle'}</button>
          </div>
        )}
      </div>

      {flash && <Flash tone={flash.tone} message={flash.text} onClose={() => setFlash(null)} />}
      {conflict && <div className="flex flex-wrap items-center gap-3"><Flash tone="warn" message="Belge başka bir oturumda değişti; değişiklikleriniz kaydedilmedi (bu tarayıcıda saklı)." /><button type="button" className="admin-btn" onClick={() => void load()}>Son hâli yükle</button></div>}
      {restore && editable && (
        <div className="admin-card grid gap-2 border-yellow-400/40 p-4 text-[13px]" role="status">
          <p className="font-bold text-yellow-100">Bu tarayıcıda kaydedilmemiş değişiklikler var ({fmtDateTime(restore.at)}).</p>
          {restore.base !== doc.updated_at && <p className="text-yellow-200">Belge bu değişikliklerden sonra kaydedilmiş. Geri yükleyip kaydederseniz sonraki kayıttaki metnin üzerine yazılır.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => { setDraft({ title: restore.title, clientId: restore.clientId, content: restore.content }); setDirty(true); setRestore(null); setFlash({ tone: 'ok', text: 'Kaydedilmemiş değişiklikler geri yüklendi. Kaydetmeyi unutmayın.' }); }}>Geri yükle</button>
            <button type="button" className="admin-btn" onClick={() => { if (uid) writeDocBackup(uid, id, null); setRestore(null); setFlash({ tone: 'ok', text: 'Bu tarayıcıdaki kaydedilmemiş değişiklikler silindi.' }); }}>Sil</button>
          </div>
        </div>
      )}
      {doc.status === 'final' && (
        <p className="text-[13px] text-muted">Kesinleşmiş belge (sürüm {doc.final_version}{finalV ? ` · ${fmtDateTime(finalV.finalized_at)}` : ''}). Değiştirmek için “Revize et”: yeni sürüm oluşur, önceki PDF’ler saklanır.</p>
      )}
      {doc.status === 'archived' && <Flash tone="warn" message="Bu belge arşivde; düzenlemek için arşivden çıkarın." />}
      {ro && lastBankChanges.length > 0 && (
        <div className="admin-card grid gap-2 border-yellow-400/40 p-4 text-[13px]" role="status">
          <p className="font-bold text-yellow-100">Banka bilgisi değişmiş</p>
          <p className="text-muted">Bu sürümde basılı banka bilgisi, Belge ayarlarındaki güncel bilgiden farklı ({lastBankChanges.map((x) => `${x.old.bank || 'hesap'}: ${x.change === 'removed' ? 'ayarlardan kaldırılmış' : `${x.fields.join(', ')} değişti`}`).join(' · ')}). “PDF indir” önce ne yapılacağını sorar; IBAN kendiliğinden değiştirilmez.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn" disabled={!!busy} onClick={() => void downloadStored(undefined, true)}>Sürümdeki bilgilerle indir</button>
            {doc.status === 'final' && <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy} onClick={() => void revise('bank')}>Güncel banka bilgileriyle revize et</button>}
          </div>
        </div>
      )}

      {editable && (missing.blocking.length > 0 || missing.warnings.length > 0) && (
        <div className="admin-card grid gap-2 p-4 text-[13px]" aria-live="polite">
          {missing.blocking.length > 0 && <><p className="font-bold text-yellow-200">Kesinleştirmeden önce tamamlanmalı</p><ul className="list-disc ps-5 text-yellow-100">{missing.blocking.map((m) => <li key={m}>{m}</li>)}</ul></>}
          {missing.warnings.length > 0 && <><p className="mt-1 font-bold text-muted">Kontrol edin</p><ul className="list-disc ps-5 text-muted">{missing.warnings.map((m) => <li key={m}>{m}</li>)}</ul></>}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {ro ? (
          <div className="min-w-0">
            <DocSummary kind={kind} content={finalV?.content ?? c} banks={finalV ? finalV.bankAccounts : data.settings.bankAccounts.filter((a) => c.bankAccountIds.includes(a.id))} sourceNumber={finalV?.sourceNumber ?? data.source?.number ?? null} />
          </div>
        ) : (
          <div className="grid min-w-0 content-start gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-subtle">
              <span>Grupları kapatmak yazdıklarınızı silmez. Kaydedilmemiş değişiklikler bu tarayıcıda da saklanır.</span>
              <button type="button" className={small} onClick={() => setAll(!allOpen)}>{allOpen ? 'Tümünü kapat' : 'Tümünü aç'}</button>
            </div>

            {/* Document facts */}
            <Group id="facts" title="Belge bilgileri" open={isOpen('facts')} onToggle={toggle} summary={[fmtDate(c.issueDate), def.validity && c.validUntil ? `geçerlilik ${fmtDate(c.validUntil)}` : '', def.items ? c.currency : '', c.locale === 'tr' ? 'Türkçe' : 'English'].filter(Boolean).join(' · ')}>
              <label className={label}>Başlık (PDF’te ana başlık)<input className={field} value={draft.title} onChange={(e) => setTop({ title: e.target.value })} placeholder={kind === 'quote' ? 'Ör. Marka kimliği ve iki dilli web sitesi teklifi' : 'Belge başlığı'} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Dil<select className={field} value={c.locale} onChange={(e) => set({ locale: e.target.value === 'en' ? 'en' : 'tr' })}><option value="tr">Türkçe</option><option value="en">English</option></select></label>
                <label className={label}>Düzenleme tarihi<input type="date" className={field} value={c.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></label>
                {def.validity && <label className={label}>Geçerlilik tarihi<input type="date" className={field} value={c.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></label>}
                {def.items && <label className={label}>Para birimi<select className={field} value={c.currency} onChange={(e) => set({ currency: e.target.value as DocContent['currency'] })}>{DOC_CURRENCIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
                {def.period && <label className={label}>Rapor dönemi<input className={field} value={c.period} onChange={(e) => set({ period: e.target.value })} placeholder="Ör. 20 Ekim – 3 Kasım 2026" /></label>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {kind !== 'letter' && <label className={label}>Proje<input className={field} value={c.projectName} onChange={(e) => set({ projectName: e.target.value })} /></label>}
                <label className={label}>İlgi / referans (isteğe bağlı)<input className={field} value={c.reference} onChange={(e) => set({ reference: e.target.value })} /></label>
                {def.subject && <label className={label}>Konu<input className={field} value={c.subject} onChange={(e) => set({ subject: e.target.value })} /></label>}
                {def.deliveryTime && <label className={label}>Teslim süresi / takvim<input className={field} value={c.deliveryTime} onChange={(e) => set({ deliveryTime: e.target.value })} placeholder="Ör. Sözleşmeden sonra 6 hafta" /></label>}
              </div>
            </Group>

            {/* Recipient */}
            <Group id="recipient" title="Alıcı" open={isOpen('recipient')} onToggle={toggle} summary={recipientName ? [recipientName, c.recipient.company && c.recipient.name ? c.recipient.name : ''].filter(Boolean).join(' · ') : 'Alıcı yazılmadı'} tone={recipientName ? undefined : 'warn'}>
              <p className="text-[12px] text-subtle">Belge alıcı bilgilerinin kendi kopyasını tutar; müşteri kaydı sonradan değişirse bu belge değişmez.</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className={label}>Müşteri kaydı
                  <select className={field} value={draft.clientId ?? ''} onChange={(e) => setTop({ clientId: e.target.value || null })}>
                    <option value="">Müşteriye bağlı değil</option>
                    {data.clients.filter((x) => !x.archived_at || x.id === draft.clientId).map((x) => <option key={x.id} value={x.id}>{clientDisplay(x)}</option>)}
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <button type="button" className="admin-btn" disabled={!draft.clientId} onClick={fillFromClient}>Müşteri kaydından doldur</button>
                  {draft.clientId && <Link className={small} href={`/admin/ops/clients/${draft.clientId}`}>Kaydı aç</Link>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>Firma / kurum<input className={field} value={c.recipient.company} onChange={(e) => set({ recipient: { ...c.recipient, company: e.target.value } })} /></label>
                <label className={label}>Kişi<input className={field} value={c.recipient.name} onChange={(e) => set({ recipient: { ...c.recipient, name: e.target.value } })} /></label>
                <label className={label}>İlgili (unvan / birim)<input className={field} value={c.recipient.attention} onChange={(e) => set({ recipient: { ...c.recipient, attention: e.target.value } })} /></label>
                <label className={label}>E-posta<input className={field} value={c.recipient.email} onChange={(e) => set({ recipient: { ...c.recipient, email: e.target.value } })} /></label>
                <label className={`${label} sm:col-span-2`}>Adres<textarea className={field} rows={2} value={c.recipient.address} onChange={(e) => set({ recipient: { ...c.recipient, address: e.target.value } })} /></label>
                {(def.items || c.recipient.taxNumber || c.recipient.taxOffice) && <>
                  <label className={label}>Vergi dairesi<input className={field} value={c.recipient.taxOffice} onChange={(e) => set({ recipient: { ...c.recipient, taxOffice: e.target.value } })} /></label>
                  <label className={label}>Vergi no / TCKN<input className={field} value={c.recipient.taxNumber} onChange={(e) => set({ recipient: { ...c.recipient, taxNumber: e.target.value } })} /></label>
                </>}
                <label className={label}>Telefon<input className={field} value={c.recipient.phone} onChange={(e) => set({ recipient: { ...c.recipient, phone: e.target.value } })} /></label>
              </div>
            </Group>

            {/* Line items */}
            {def.items && (
              <Group id="items" title="İş kalemleri" open={isOpen('items')} onToggle={toggle} tone={calc.totals.grand === null && calc.totals.lines.length ? 'warn' : undefined}
                summary={`${calc.totals.lines.length} kalem · ${calc.totals.grand !== null ? `genel toplam ${money(calc.totals.grand)}` : calc.totals.lines.length ? 'fiyat eksik, toplam hesaplanmadı' : 'kalem yok'}`}>
                <p className="text-[12px] text-subtle">Tutarları uygulama hesaplar (yarım yukarı yuvarlama, KDV her oran için bir kez). Fiyatı bilinmeyen kalemi boş bırakın; 0 yazmayın.</p>
                {c.items.map((it, i) => {
                  const line = calc.totals.lines.find((l) => l.id === it.id);
                  return (
                    <div key={it.id} className="grid gap-2 border border-line p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-2 w-6 text-[12px] font-bold text-yoca-green">{String(i + 1).padStart(2, '0')}</span>
                        <div className="grid min-w-0 flex-1 gap-2">
                          <input aria-label={`${i + 1}. kalem başlığı`} className={field} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Kalem başlığı" />
                          <textarea aria-label={`${i + 1}. kalem açıklaması`} className={field} rows={2} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Açıklama (isteğe bağlı)" />
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <label className={label}>Miktar<input className={field} inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></label>
                            <label className={label}>Birim<input className={field} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="adet, saat…" /></label>
                            <label className={label}>Birim fiyat ({c.currency})<input className={`${field} ${!it.unitPrice.trim() && it.title.trim() ? '!border-yellow-400/70' : ''}`} inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder="eksik" /></label>
                            <label className={label}>İndirim %<input className={field} inputMode="decimal" value={it.discountPct} onChange={(e) => setItem(i, { discountPct: e.target.value })} placeholder="0" /></label>
                            <label className={label}>KDV %<input className={field} inputMode="decimal" value={it.taxRate} onChange={(e) => setItem(i, { taxRate: e.target.value })} /></label>
                          </div>
                          <p className="text-[12px] text-muted">
                            {line?.error ? <span className="text-red-300">{line.error}</span> : line?.missingPrice ? <span className="text-yellow-200">Fiyat eksik — toplam hesaplanmaz.</span> : line?.net !== null && line?.net !== undefined ? <>Tutar: <b className="text-white">{money(line.net)}</b>{line.discount ? ` (indirim ${money(line.discount)})` : ''}</> : null}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button type="button" className={small} aria-label="Yukarı taşı" onClick={() => set({ items: move(c.items, i, -1) })}>↑</button>
                          <button type="button" className={small} aria-label="Aşağı taşı" onClick={() => set({ items: move(c.items, i, 1) })}>↓</button>
                          <button type="button" className={small} aria-label="Kalemi sil" onClick={() => set({ items: c.items.filter((_, j) => j !== i) })}>Sil</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="admin-btn justify-self-start" onClick={() => set({ items: [...c.items, newItem(data.settings.defaultTaxRate)] })}>+ Kalem ekle</button>
                <div className="grid justify-end gap-1 border-t border-line pt-3 text-[13px]">
                  <div className="flex justify-between gap-10"><span className="text-muted">Ara toplam</span><span className="tabular-nums">{money(calc.totals.subtotal)}</span></div>
                  {calc.totals.discount > BigInt(0) && <div className="flex justify-between gap-10"><span className="text-muted">İndirim</span><span className="tabular-nums">−{money(calc.totals.discount)}</span></div>}
                  {calc.totals.taxes.map((t) => <div key={String(t.rateBp)} className="flex justify-between gap-10"><span className="text-muted">KDV %{fmtPct(t.rateBp)} <span className="text-subtle">(matrah {money(t.base)})</span></span><span className="tabular-nums">{money(t.tax)}</span></div>)}
                  <div className="flex justify-between gap-10 border-t border-line pt-1 font-extrabold"><span>Genel toplam</span><span className="tabular-nums">{calc.totals.grand !== null ? money(calc.totals.grand) : <span className="text-yellow-200">hesaplanamadı</span>}</span></div>
                </div>
              </Group>
            )}

            {/* Payment plan */}
            {def.payment && (
              <Group id="payment" title="Ödeme planı" open={isOpen('payment')} onToggle={toggle} tone={calc.payment.problem ? 'warn' : undefined}
                summary={c.payment.length ? `${c.payment.length} adım · ${calc.payment.problem ? 'toplamla uyuşmuyor' : 'toplamla uyumlu'}` : 'adım yok'}>
                <p className="text-[12px] text-subtle">Yüzdeler toplamı %100 olduğunda son adım kuruş farkını alır. Proforma tahsilat kaydı değildir; Operasyon ödemelerine dokunmaz.</p>
                {c.payment.map((p, i) => {
                  const row = calc.payment.rows.find((r) => r.id === p.id);
                  return (
                    <div key={p.id} className="grid gap-2 border border-line p-3 sm:grid-cols-[1.4fr_auto_0.7fr_1.2fr_auto] sm:items-end">
                      <label className={label}>Adım<input className={field} value={p.label} onChange={(e) => setStep(i, { label: e.target.value })} placeholder="Başlangıç ödemesi" /></label>
                      <label className={label}>Tür<select className={field} value={p.mode} onChange={(e) => setStep(i, { mode: e.target.value === 'amount' ? 'amount' : 'percent' })}><option value="percent">Yüzde</option><option value="amount">Tutar</option></select></label>
                      <label className={label}>{p.mode === 'percent' ? '%' : c.currency}<input className={field} inputMode="decimal" value={p.value} onChange={(e) => setStep(i, { value: e.target.value })} /></label>
                      <label className={label}>Vade<input className={field} value={p.due} onChange={(e) => setStep(i, { due: e.target.value })} placeholder="Sözleşme imzasında" /></label>
                      <div className="flex items-center gap-2 pb-1 text-[12px]">
                        <span className="tabular-nums text-white">{row?.amount !== null && row?.amount !== undefined ? money(row.amount) : '—'}</span>
                        <button type="button" className={small} onClick={() => set({ payment: c.payment.filter((_, j) => j !== i) })}>Sil</button>
                      </div>
                    </div>
                  );
                })}
                {calc.payment.problem && <Flash tone="warn" message={calc.payment.problem} />}
                <button type="button" className="admin-btn justify-self-start" onClick={() => set({ payment: [...c.payment, { id: localId('p'), label: '', mode: 'percent', value: '', due: '' }] })}>+ Ödeme adımı</button>
              </Group>
            )}

            {/* Bank accounts */}
            {def.bank && (
              <Group id="bank" title="Banka bilgileri" open={isOpen('bank')} onToggle={toggle} tone={goneBanks.length ? 'warn' : undefined}
                summary={goneBanks.length ? 'seçili hesap ayarlardan kaldırılmış' : c.bankAccountIds.length ? `${c.bankAccountIds.length} hesap seçili` : 'belgede banka bilgisi yok (isteğe bağlı)'}>
                <p className="text-[12px] text-subtle">Yalnızca işaretlediğiniz hesaplar basılır; yeni eklenen bir hesap belgeye kendiliğinden girmez. Bilgiler Belge ayarlarındaki güncel hâlinden alınır ve kesinleştirmede sürüme dondurulur.</p>
                {goneBanks.map((gid) => (
                  <div key={gid} className="flex flex-wrap items-center justify-between gap-2 border border-yellow-400/40 p-2 text-[13px] text-yellow-100">
                    <span>Seçili bir hesap Belge ayarlarından kaldırılmış. Yerine basılacak hesabı aşağıdan siz seçin.</span>
                    <button type="button" className={small} onClick={() => set({ bankAccountIds: c.bankAccountIds.filter((x) => x !== gid) })}>Seçimi kaldır</button>
                  </div>
                ))}
                {data.settings.bankAccounts.length === 0 ? <p className="text-[13px] text-subtle">Kayıtlı banka hesabı yok. <Link href="/admin/documents/settings" className="underline">Belge ayarları</Link> ekranından ekleyebilirsiniz.</p> : data.settings.bankAccounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={c.bankAccountIds.includes(a.id)} onChange={(e) => set({ bankAccountIds: e.target.checked ? [...c.bankAccountIds, a.id] : c.bankAccountIds.filter((x) => x !== a.id) })} />
                    {a.label || a.bank} · {a.currency || 'para birimi yok'} · <span className="font-mono text-[12px]">{a.iban}</span>
                  </label>
                ))}
              </Group>
            )}

            {/* Text sections */}
            <Group id="blocks" title={kind === 'letter' ? 'Yazı metni' : 'Bölümler'} open={isOpen('blocks')} onToggle={toggle}
              summary={`${c.blocks.filter((b) => b.body.trim()).length} / ${c.blocks.length} bölüm dolu`}>
              <p className="text-[12px] text-subtle">Boş bölümler PDF’e basılmaz. Paragrafları boş satırla ayırın; “- ” ile madde, “## ” ile ara başlık.</p>
              {c.blocks.map((b, i) => {
                const bo = blockOpen(b);
                return (
                  <div key={b.id} className="grid gap-2 border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="w-4 text-subtle" aria-expanded={bo} aria-label={bo ? `${b.heading || 'Bölüm'} kapat` : `${b.heading || 'Bölüm'} aç`} onClick={() => setOpenBlocks((o) => ({ ...o, [b.id]: !bo }))}><span aria-hidden className={`inline-block transition-transform ${bo ? 'rotate-90' : ''}`}>›</span></button>
                      <input aria-label="Bölüm başlığı" className={`${field} flex-1`} value={b.heading} onChange={(e) => setBlock(b.id, { heading: e.target.value })} />
                      <button type="button" className={small} aria-label="Yukarı taşı" onClick={() => set({ blocks: move(c.blocks, i, -1) })}>↑</button>
                      <button type="button" className={small} aria-label="Aşağı taşı" onClick={() => set({ blocks: move(c.blocks, i, 1) })}>↓</button>
                      <button type="button" className={small} onClick={() => set({ blocks: c.blocks.filter((x) => x.id !== b.id) })}>Kaldır</button>
                    </div>
                    {!bo ? (
                      <button type="button" className="truncate text-left text-[12px] text-muted hover:text-white" onClick={() => setOpenBlocks((o) => ({ ...o, [b.id]: true }))}>{b.body.trim() ? b.body.trim().replace(/\s+/g, ' ').slice(0, 160) : <span className="italic text-subtle">boş</span>}</button>
                    ) : <>
                      <textarea ref={(el) => { textRefs.current[b.id] = el; }} aria-label={`${b.heading || 'Bölüm'} metni`} className={field} rows={BLOCK_LABEL[b.key].list ? 5 : kind === 'letter' ? 12 : 4} value={b.body} onChange={(e) => setBlock(b.id, { body: e.target.value })} placeholder={BLOCK_LABEL[b.key].list ? 'Her satıra bir madde' : ''} />
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span className="text-subtle">Seçili metin (seçim yoksa tümü):</span>
                        {(['shorten', 'formal', 'simplify'] as const).map((op) => <button key={op} type="button" className={small} disabled={!!busy} onClick={() => aiRewrite(b, op)}>{busy === `rw-${b.id}` ? '…' : op === 'shorten' ? 'Kısalt' : op === 'formal' ? 'Resmîleştir' : 'Sadeleştir'}</button>)}
                      </div>
                    </>}
                    {rewrite && rewrite.blockId === b.id && (
                      <div className="grid gap-2 border border-yoca-lime/40 bg-yoca-lime/5 p-3 text-[13px]">
                        <p className="font-bold">Yapay zekâ önerisi — uygulamadıkça metniniz değişmez</p>
                        <p className="whitespace-pre-wrap text-white">{rewrite.text}</p>
                        {rewrite.changes.length > 0 && <p className="text-subtle">Değişiklikler: {rewrite.changes.join(' · ')}</p>}
                        {rewrite.warnings.map((w) => <p key={w} className="text-yellow-200">{w}</p>)}
                        <div className="flex gap-2"><button type="button" className="admin-btn admin-btn-primary" onClick={applyRewrite}>Uygula</button><button type="button" className="admin-btn" onClick={() => setRewrite(null)}>Vazgeç</button></div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                {blockKeysAvailable.map((k) => <button key={k} type="button" className={small} onClick={() => set({ blocks: [...c.blocks, { id: localId('b'), key: k, heading: blockHeading(k, c.locale), body: '' }] })}>+ {BLOCK_LABEL[k].tr}</button>)}
                <button type="button" className={small} onClick={() => set({ blocks: [...c.blocks, { id: localId('b'), key: 'custom', heading: c.locale === 'tr' ? 'Yeni bölüm' : 'New section', body: '' }] })}>+ Serbest bölüm</button>
              </div>
            </Group>

            {/* Closing */}
            <Group id="closing" title="Kapanış ve imza" open={isOpen('closing')} onToggle={toggle} summary={[c.closing, c.signatory.name, c.signatory.title].filter(Boolean).join(' · ') || 'imza alanında şirket adı basılır'}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Kapanış cümlesi<input className={field} value={c.closing} onChange={(e) => set({ closing: e.target.value })} placeholder={kind === 'letter' ? 'Saygılarımızla,' : '(boş)'} /></label>
                <label className={label}>İmza yetkilisi<input className={field} value={c.signatory.name} onChange={(e) => set({ signatory: { ...c.signatory, name: e.target.value } })} /></label>
                <label className={label}>Unvanı<input className={field} value={c.signatory.title} onChange={(e) => set({ signatory: { ...c.signatory, title: e.target.value } })} /></label>
              </div>
              <p className="text-[12px] text-subtle">PDF’teki imza alanı ıslak imza içindir; bu panel elektronik imza almaz.</p>
            </Group>
          </div>
        )}

        {/* Side column */}
        <aside className="grid content-start gap-5">
          {editable && (
            <section className="admin-card grid gap-3 p-4">
              <button type="button" className="flex items-center justify-between text-left" onClick={() => setShowAi(!showAi)} aria-expanded={showAi}>
                <h2 className="text-[15px] font-extrabold">Yapay zekâ ile taslak</h2><span className="text-subtle">{showAi ? '−' : '+'}</span>
              </button>
              {showAi && <>
                <p className="text-[12px] text-subtle">Kısa bir açıklama yazın. Öneri yalnızca metin içerir: fiyat, vergi oranı, şirket veya banka bilgisi yazmaz; bilmediği şeyleri “[EKSİK: …]” olarak işaretler. Hiçbir şey siz uygulamadan belgeye girmez.</p>
                <textarea className={field} rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ör. Bu müşteri için marka kimliği ve iki dilli web sitesi teklifi hazırla. Süre altı hafta, iki revizyon, ödeme yüzde 50 başlangıçta." />
                <button type="button" className="admin-btn admin-btn-primary" disabled={!!busy || brief.trim().length < 10} onClick={aiDraft}>{busy === 'ai' ? 'Hazırlanıyor…' : 'Taslak öner'}</button>
                {suggestion && (
                  <div className="grid gap-2 border border-yoca-lime/40 bg-yoca-lime/5 p-3 text-[13px]">
                    <p className="font-bold">Öneri</p>
                    {suggestion.warnings.map((w) => <p key={w} className="text-yellow-200">{w}</p>)}
                    {suggestion.missing.length > 0 && <div><p className="font-semibold text-yellow-100">Sizin tamamlamanız gerekenler</p><ul className="list-disc ps-5 text-yellow-100">{suggestion.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                    {suggestion.title && <div className="flex items-start justify-between gap-2"><p><span className="text-subtle">Başlık:</span> {suggestion.title}</p><button type="button" className={small} onClick={() => applySuggestion('title')}>Uygula</button></div>}
                    {suggestion.subject && <div className="flex items-start justify-between gap-2"><p><span className="text-subtle">Konu:</span> {suggestion.subject}</p><button type="button" className={small} onClick={() => applySuggestion('subject')}>Uygula</button></div>}
                    {suggestion.blocks.map((b) => <div key={b.key} className="grid gap-1 border-t border-line pt-2"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{b.heading || BLOCK_LABEL[b.key as BlockKey]?.tr}</p><button type="button" className={small} onClick={() => applySuggestion('blocks', b.key)}>Uygula</button></div><p className="whitespace-pre-wrap text-muted">{b.body}</p></div>)}
                    {suggestion.items.length > 0 && <div className="grid gap-1 border-t border-line pt-2"><div className="flex items-center justify-between gap-2"><p className="font-semibold">Kalemler ({suggestion.items.length}, fiyatsız)</p><button type="button" className={small} onClick={() => applySuggestion('items')}>Ekle</button></div><ul className="list-disc ps-5 text-muted">{suggestion.items.map((i) => <li key={i.title}>{i.title} — {i.quantity} {i.unit}</li>)}</ul></div>}
                    {suggestion.payment.length > 0 && <div className="grid gap-1 border-t border-line pt-2"><div className="flex items-center justify-between gap-2"><p className="font-semibold">Ödeme planı</p><button type="button" className={small} onClick={() => applySuggestion('payment')}>Uygula</button></div><ul className="list-disc ps-5 text-muted">{suggestion.payment.map((p) => <li key={p.label}>{p.percent === null ? 'oran yok' : `%${p.percent}`} · {p.label} · {p.due}</li>)}</ul></div>}
                    {suggestion.deliveryTime && <div className="flex items-start justify-between gap-2 border-t border-line pt-2"><p><span className="text-subtle">Süre:</span> {suggestion.deliveryTime}</p><button type="button" className={small} onClick={() => applySuggestion('delivery')}>Uygula</button></div>}
                    <div className="flex gap-2 border-t border-line pt-2"><button type="button" className="admin-btn" onClick={() => applySuggestion('all')}>Hepsini uygula</button><button type="button" className="admin-btn" onClick={() => setSuggestion(null)}>Kapat</button></div>
                  </div>
                )}
                <div className="grid gap-2 border-t border-line pt-3">
                  <button type="button" className="admin-btn" disabled={!!busy} onClick={aiTranslate}>{busy === 'tr' ? 'Çevriliyor…' : c.locale === 'tr' ? 'İngilizce çeviri öner' : 'Türkçe çeviri öner'}</button>
                  {translation && <div className="grid gap-2 border border-yoca-lime/40 bg-yoca-lime/5 p-3 text-[13px]">
                    <p className="font-bold">Çeviri önerisi ({translation.to === 'en' ? 'English' : 'Türkçe'})</p>
                    <p><span className="text-subtle">Başlık:</span> {translation.title}</p>
                    {translation.blocks.slice(0, 3).map((b) => <p key={b.id} className="line-clamp-3 text-muted">{b.heading}: {b.body}</p>)}
                    <p className="text-[12px] text-subtle">Uygulanırsa metinler değişir; tutarlar, tarihler ve alıcı değişmez.</p>
                    <div className="flex gap-2"><button type="button" className="admin-btn admin-btn-primary" onClick={applyTranslation}>Uygula</button><button type="button" className="admin-btn" onClick={() => setTranslation(null)}>Vazgeç</button></div>
                  </div>}
                </div>
              </>}
            </section>
          )}

          <section id="surumler" className="admin-card grid scroll-mt-20 gap-3 p-4">
            <h2 className="text-[15px] font-extrabold">Sürümler ve PDF geçmişi</h2>
            <p className="text-[12px] text-subtle">“PDF indir” güncel şirket bilgileriyle (şirket profili r{data.companyRevision}) üretir. Daha önce indirdiğiniz veya gönderdiğiniz dosyalar değişmez. Kalemler, tutarlar, alıcı, tarih ve banka bilgisi kesinleştirildiği gibi kalır.</p>
            {data.versions.length === 0 ? <p className="text-[13px] text-subtle">Henüz kesinleşmiş sürüm yok.</p> : data.versions.map((v) => (
              <div key={v.id} className="grid gap-1.5 border-t border-line pt-2 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p><b>Sürüm {v.version}</b> · {fmtDateTime(v.finalized_at)} · {v.finalized_by}{v.total ? ` · ${moneyOf(v.total, v.currency)}` : ''}</p>
                  <button type="button" className={small} disabled={!!busy} onClick={() => void downloadStored(v.version)}>Güncel bilgilerle indir</button>
                </div>
                {v.bankChanges.length > 0 && <p className="text-[12px] text-yellow-200">Bu sürümdeki banka bilgisi güncel ayarlardan farklı; indirmeden önce sorulur.</p>}
                <ul className="grid gap-1 ps-3">
                  {data.renders.filter((r) => r.version === v.version).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                      <span>{r.reason === 'finalized' ? 'Kesinleştirme PDF’i' : 'Yeniden üretim'} · şirket profili r{r.company_revision} · {fmtDateTime(r.generated_at)} · {r.pdf_pages} sayfa{r.company_revision === data.companyRevision && r.template_version === data.templateVersion ? ' · güncel' : ''}</span>
                      <button type="button" className={small} onClick={async () => { const e = await storedPdf({ render: r.id }); handleStored(e, false); }}>Geçmiş PDF</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {kind === 'quote' && (
            <section className="admin-card grid gap-3 p-4">
              <h2 className="text-[15px] font-extrabold">Teklif takibi</h2>
              <p className="text-[12px] text-subtle">Elle işaretlenir; kim, ne zaman işaretlediği kaydedilir. Elektronik imza veya doğrulanmış müşteri onayı değildir.</p>
              {doc.final_version < 1 ? <p className="text-[13px] text-subtle">Teklifi kesinleştirdikten sonra işaretleyebilirsiniz.</p> : <>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_STATES.map((s) => <button key={s} type="button" className={`${small} ${doc.quote_state === s ? '!border-yoca-lime !text-white' : ''}`} disabled={!!busy || doc.status === 'archived'} onClick={async () => { const r = await act('quote_state', { state: s, note: stateNote }, `“${QUOTE_STATE_LABEL[s as QuoteState]}” olarak işaretlendi.`); if (r.ok) { setStateNote(''); await load(); } }}>{QUOTE_STATE_LABEL[s as QuoteState]}</button>)}
                  {doc.quote_state && <button type="button" className={small} disabled={!!busy} onClick={async () => { const r = await act('quote_state', { state: null, note: stateNote }, 'İşaret kaldırıldı.'); if (r.ok) await load(); }}>Temizle</button>}
                </div>
                <input className={field} value={stateNote} onChange={(e) => setStateNote(e.target.value)} placeholder="Not (isteğe bağlı): ör. e-postayla gönderildi" />
                {doc.quote_state && <p className="text-[12px] text-muted">{QUOTE_STATE_LABEL[doc.quote_state]} · {fmtDateTime(doc.quote_state_at)} · {doc.quote_state_by}</p>}
              </>}
            </section>
          )}

          {(data.source || data.derived.length > 0) && (
            <section className="admin-card grid gap-2 p-4 text-[13px]">
              <h2 className="text-[15px] font-extrabold">İlişkili belgeler</h2>
              {data.source && <p>Kaynak teklif: <Link className="underline" href={`/admin/documents/${data.source.id}`}>{data.source.number}</Link> {data.source.title}</p>}
              {data.derived.map((d) => <p key={d.id}>{KIND_LABEL[d.kind].short}: <Link className="underline" href={`/admin/documents/${d.id}`}>{d.number}</Link> {d.title} <span className="text-subtle">({STATUS_LABEL[d.status]})</span></p>)}
            </section>
          )}

          <Details title="İşlem geçmişi" hint={`${data.events.length} kayıt`}>
            <ul className="grid gap-1 text-[12px] text-muted">
              {data.events.map((e) => <li key={e.id}>{fmtDateTime(e.at)} · {EVENT_LABEL[e.kind] ?? e.kind}{e.kind === 'quote_state' ? `: ${e.detail.to ? QUOTE_STATE_LABEL[e.detail.to as QuoteState] : 'kaldırıldı'}${e.detail.note ? ` (“${String(e.detail.note)}”)` : ''}` : e.detail.version ? ` (v${String(e.detail.version)})` : ''} · {e.actor}</li>)}
            </ul>
          </Details>
          <p className="text-[12px] text-subtle">Oluşturan: {doc.created_by} · {fmtDate(doc.created_at)}</p>
        </aside>
      </div>

      {bankAsk && (
        <BankDecision number={doc.number} version={bankAsk.version} changes={bankAsk.changes} busy={!!busy} canRevise={doc.status === 'final' && bankAsk.version === doc.final_version}
          onClose={() => setBankAsk(null)}
          onKeep={() => { const v = bankAsk.version; const p = bankAsk.preview; setBankAsk(null); void (p ? previewStored(v, true) : downloadStored(v, true)); }}
          onRevise={() => void revise('bank')} />
      )}
    </div>
  );
}

export default function DocumentEditorPage() {
  return <Suspense fallback={<p className="text-[13px] text-subtle">Yükleniyor…</p>}><EditorInner /></Suspense>;
}
