'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminClient } from '@/lib/adminClient';
import { GROUP_LOCALES, LANG_STATE_LABEL, LOCALE_NAME, groupInsights, langState, type GroupLocale, type LangState } from '@/lib/insightGroup';
import type { InsightRow } from '@/types';
import InsightEditor, { type EditorState } from '@/components/admin/insights/InsightEditor';
import BulkPublishDialog, { type BulkResultItem } from '@/components/admin/insights/BulkPublishDialog';
import MissingLanguage from '@/components/admin/insights/MissingLanguage';

/**
 * Yoca Admin — one article, every language, one workspace.
 *
 * Tabs TR · EN · AR · AZ over the rows that share the article's group_id.
 * Each existing language has its own editor (the regular InsightEditor in
 * embedded mode); an editor stays mounted once opened, so switching tabs
 * never loses unsaved edits (they are also kept in this browser until saved).
 * A missing language shows "Çeviri oluştur" (AI translation from the
 * source, saved as a draft — never published — or an empty draft for a
 * manual translation); an existing one is edited in place ("Düzenle").
 * Every tab shows that language's state as text. "Yayınla" (top) opens one
 * dialog for all languages (BulkPublishDialog).
 * The address follows the tab (/admin/insights/<id of that language>, or
 * ?lang=xx for a missing one) without reloading the page.
 */

const STATE_STYLE: Record<LangState, string> = {
  missing: 'border-dashed border-line text-subtle',
  draft: 'border-line text-muted',
  review: 'border-yellow-400/60 text-yellow-200',
  ready: 'border-yoca-green/70 text-yoca-green',
  published: 'border-yoca-lime text-yoca-lime',
  scheduled: 'border-yoca-green/50 text-yoca-green',
};

export default function InsightWorkspace({ id }: { id: string }) {
  const supabase = getAdminClient();
  const [rows, setRows] = useState<InsightRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [active, setActive] = useState<GroupLocale | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, EditorState>>({});
  const [reload, setReload] = useState<Record<string, number>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [preferredId] = useState(id);
  const [notice, setNotice] = useState<string | null>(null);

  const loadGroup = useCallback(async (groupId?: string) => {
    if (!supabase) return;
    let gid = groupId;
    if (!gid) {
      const { data } = await supabase.from('insights').select('group_id').eq('id', id).maybeSingle();
      gid = (data as { group_id: string } | null)?.group_id;
      if (!gid) { setNotFound(true); return; }
    }
    const { data: members } = await supabase.from('insights').select('*').eq('group_id', gid).order('updated_at', { ascending: false });
    setRows((members as InsightRow[]) ?? []);
  }, [supabase, id]);

  useEffect(() => { void loadGroup(); }, [loadGroup]);

  const group = useMemo(() => (rows && rows.length ? groupInsights(rows)[0] : null), [rows]);

  /**
   * The row a tab edits: the one in the address when it is that language,
   * else the newest — and once chosen it stays chosen (a later save that
   * reorders duplicate rows never swaps the editor under the user).
   */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const memberOf = useCallback((l: GroupLocale): InsightRow | undefined => {
    if (!group) return undefined;
    const list = group.byLocale[l] as InsightRow[] | undefined;
    return list?.find((m) => m.id === chosen[l]) ?? list?.find((m) => m.id === preferredId) ?? list?.[0];
  }, [group, preferredId, chosen]);
  useEffect(() => {
    if (!group) return;
    const next: Record<string, string> = { ...chosen };
    let changed = false;
    for (const l of GROUP_LOCALES) {
      const list = group.byLocale[l] as InsightRow[] | undefined;
      if (!list?.length || list.some((m) => m.id === next[l])) continue;
      next[l] = (list.find((m) => m.id === preferredId) ?? list[0]).id;
      changed = true;
    }
    if (changed) setChosen(next);
  }, [group, preferredId, chosen]);

  // First tab: ?lang=xx, else the language of the opened row.
  useEffect(() => {
    if (!group || active) return;
    const q = new URLSearchParams(window.location.search).get('lang');
    const fromUrl = (GROUP_LOCALES as readonly string[]).includes(String(q)) ? (q as GroupLocale) : null;
    const own = rows?.find((r) => r.id === id)?.locale as GroupLocale | undefined;
    const first = fromUrl ?? own ?? 'tr';
    setActive(first);
    const m = memberOf(first);
    if (m) setVisited(new Set([m.id]));
  }, [group, active, rows, id, memberOf]);

  const open = (l: GroupLocale) => {
    setActive(l);
    const m = memberOf(l);
    if (m) setVisited((v) => new Set(v).add(m.id));
    const url = m ? `/admin/insights/${m.id}` : `/admin/insights/${group?.primary.id ?? id}?lang=${l}`;
    try { window.history.replaceState(null, '', url); } catch { /* ignore */ }
  };

  const onState = useCallback((s: EditorState) => setStates((cur) => ({ ...cur, [s.id]: s })), []);

  if (notFound) return <div className="admin-card"><p className="text-[14px]">Bu içerik bulunamadı.</p><Link href="/admin/insights" className="admin-btn mt-3 inline-flex">Listeye dön</Link></div>;
  if (!group || !active) return <p className="text-[14px] text-muted">Yükleniyor…</p>;

  const source = (GROUP_LOCALES.map((l) => memberOf(l)).find((m) => m && !m.source_insight_id && m.locale === 'tr') ?? group.members.find((m) => !m.source_insight_id)) as InsightRow | undefined;
  const tabState = (l: GroupLocale) => {
    const m = memberOf(l);
    const live = m ? states[m.id] : undefined;
    return { member: m, state: langState(live?.row ?? m), dirty: Boolean(live?.dirty) };
  };
  const dirtyLocales = GROUP_LOCALES.filter((l) => tabState(l).dirty);

  const finished = (results: BulkResultItem[]) => {
    const done = results.filter((r) => r.outcome === 'published' || r.outcome === 'updated');
    if (done.length) setReload((cur) => Object.fromEntries([...Object.entries(cur), ...done.map((r) => [r.insightId, (cur[r.insightId] ?? 0) + 1])]));
    void loadGroup(group.groupId);
  };

  return (
    <div className="grid gap-4">
      {/* Article header */}
      <div className="admin-head">
        <div className="admin-head-text">
          <Link href="/admin/insights" className="admin-kicker hover:text-white">← İçerik / Insights</Link>
          <h1 className="admin-h1 !text-[28px]" dir={group.titleLocale === 'ar' ? 'rtl' : 'ltr'}>{group.title || '(başlıksız)'}</h1>
          <p className="admin-lede !text-[13px]">Tek yazı · {group.members.length} dil sürümü{dirtyLocales.length ? ` · kaydedilmemiş: ${dirtyLocales.map((l) => l.toUpperCase()).join(', ')}` : ''}</p>
        </div>
        <button type="button" className="admin-btn-primary" onClick={() => setBulkOpen(true)}>Yayınla</button>
      </div>

      {group.warnings.length > 0 && (
        <div className="admin-notice admin-notice-warn grid gap-1">
          {group.warnings.map((w) => <p key={w}>{w}</p>)}
          {GROUP_LOCALES.filter((l) => (group.byLocale[l]?.length ?? 0) > 1).map((l) => (
            <p key={l} className="text-[12px]">{l.toUpperCase()} kayıtları: {(group.byLocale[l] as InsightRow[]).map((m) => <a key={m.id} href={`/admin/insights/${m.id}`} className="me-2 underline">{m.slug} ({LANG_STATE_LABEL[langState(m)]})</a>)}</p>
          ))}
        </div>
      )}
      {notice && <p role="status" className="admin-notice admin-notice-good">{notice}</p>}

      {/* Language tabs */}
      <div role="tablist" aria-label="Diller" className="flex flex-wrap gap-1.5 border-b border-[var(--line,#262a31)] pb-3">
        {GROUP_LOCALES.map((l) => {
          const t = tabState(l);
          const isActive = active === l;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              id={`tab-${l}`}
              aria-selected={isActive}
              aria-controls={`panel-${l}`}
              onClick={() => open(l)}
              className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-bold ${isActive ? 'border-yoca-lime bg-yoca-lime text-black' : 'border-[var(--line-2,#343943)] bg-[var(--tile,#15171c)] text-muted hover:text-white'}`}
            >
              <span>{l.toUpperCase()}</span>
              <span className={`rounded-[6px] border px-1.5 py-0.5 text-[11px] ${isActive ? 'border-black/30 text-black' : STATE_STYLE[t.state]}`}>{LANG_STATE_LABEL[t.state]}</span>
              {t.dirty && <span className={isActive ? 'text-black' : 'text-yellow-200'} title="Kaydedilmemiş düzenleme var">• kaydedilmedi</span>}
              <span className={`text-[11px] font-semibold ${isActive ? 'text-black/70' : 'text-subtle'}`}>{t.member ? 'Düzenle' : 'Çeviri oluştur'}</span>
            </button>
          );
        })}
      </div>

      {GROUP_LOCALES.map((l) => {
        const m = memberOf(l);
        if (m && visited.has(m.id)) {
          return (
            <div key={m.id} role="tabpanel" id={`panel-${l}`} aria-labelledby={`tab-${l}`} hidden={active !== l}>
              <InsightEditor id={m.id} embedded onState={onState} reloadToken={reload[m.id] ?? 0} onGroupChanged={() => void loadGroup(group.groupId)} />
            </div>
          );
        }
        if (!m && active === l) {
          return (
            <div key={`missing-${l}`} role="tabpanel" id={`panel-${l}`} aria-labelledby={`tab-${l}`}>
              <MissingLanguage
                locale={l}
                source={source ? ((states[source.id]?.row ?? source) as InsightRow) : null}
                sourceSaved={source ? !states[source.id]?.dirty : false}
                onCreated={async (newId) => {
                  await loadGroup(group.groupId);
                  setVisited((v) => new Set(v).add(newId));
                  try { window.history.replaceState(null, '', `/admin/insights/${newId}`); } catch { /* ignore */ }
                  setNotice(`${LOCALE_NAME[l]} sürümü taslak olarak oluşturuldu. Yayımlanmadı; dil kontrolünden sonra “Yayınla” ile yayımlayabilirsiniz.`);
                  setTimeout(() => setNotice(null), 6000);
                }}
                onOpenSource={() => source && open(source.locale as GroupLocale)}
              />
            </div>
          );
        }
        return null;
      })}

      {bulkOpen && (
        <BulkPublishDialog
          groupId={group.groupId}
          languages={GROUP_LOCALES.map((l) => {
            const m = memberOf(l);
            return { locale: l, member: m ?? null, editor: m ? states[m.id] ?? null : null };
          })}
          onClose={() => setBulkOpen(false)}
          onFinished={finished}
        />
      )}
    </div>
  );
}
