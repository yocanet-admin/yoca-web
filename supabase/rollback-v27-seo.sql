-- ═══════════════════════════════════════════════════════════════
-- Yoca — rollback of upgrade v27 (Kokpit SEO, Faz 0)
--
-- Drops ONLY the v27 tables (and their triggers / policies with them).
-- Nothing else is touched; the audit_log rows written for seo_keywords /
-- seo_sites stay (history is never deleted). The application keeps working
-- without these tables: the SEO page shows "migration bekleniyor".
-- Stored SEO history (weekly records, audits, PageSpeed results, AI
-- suggestions, keyword mapping) is LOST — export first if it is needed.
-- ═══════════════════════════════════════════════════════════════

begin;

drop table if exists public.seo_ai_suggestions;
drop table if exists public.seo_pagespeed;
drop table if exists public.seo_audit_findings;
drop table if exists public.seo_audit_runs;
drop table if exists public.seo_weekly;
drop table if exists public.seo_keywords;
drop table if exists public.seo_sites;

commit;
