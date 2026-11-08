import type { Report, KeywordRow } from '@/lib/seoPanel/report';
import type { Metrics, Preset, SeoFilters } from '@/lib/seoPanel/model';

/** Response of GET /api/admin/seo (client-side view). */
export interface SeoKeyword extends KeywordRow { metrics: Metrics | null; prevMetrics: Metrics | null }
export interface WeeklyTotal { week_start: string; clicks: number; impressions: number; ctr: number; position: number | null; days_with_data: number; data_through: string | null; fetched_at: string; filters: string; counts: Record<string, number> }
export interface AuditRun { id: string; started_at: string; finished_at: string | null; status: 'running' | 'done' | 'partial' | 'failed'; pages_planned: number; pages_checked: number; limit_reason: string | null; source: 'live' | 'fixture'; summary: Record<string, number> }
export interface AuditFinding { url: string; check_key: string; severity: 'error' | 'warning' | 'info' | 'ok'; message: string; detail: Record<string, unknown> }
export interface PsiRow { url: string; strategy: 'mobile' | 'desktop'; fetched_at: string; lab_perf_score: number | null; lab_lcp_ms: number | null; lab_cls: number | null; lab_tbt_ms: number | null; field_scope: 'url' | 'origin' | 'none'; field_lcp_p75_ms: number | null; field_inp_p75_ms: number | null; field_cls_p75: number | null; field_category: string | null; source: 'psi' | 'fixture'; error: string | null }
export interface StoredSuggestion { id: string; kind: string; subject: string; suggestion: { title: string; metaDescription: string; outline: Array<{ heading: string; points: string[] }>; notes: string[] }; mock: boolean; created_by: string | null; created_at: string }

export interface SeoResponse {
  ok: boolean;
  error?: string;
  pending?: boolean;
  today: string;
  site: { domain: string; property: string; clientLinked: boolean };
  connection: { mode: 'live' | 'fixture' | 'none'; fixture: boolean; message: string | null; step: string | null; hosts: string[] };
  filters: SeoFilters;
  preset: Preset | null;
  report: Report | null;
  reportError: string | null;
  keywords: SeoKeyword[];
  weekly: WeeklyTotal[];
  audit: { run: AuditRun; findings: AuditFinding[] } | null;
  pagespeed: PsiRow[];
  suggestions: StoredSuggestion[];
}
