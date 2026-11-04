import InsightEditor from '@/components/admin/insights/InsightEditor';
import InsightWorkspace from '@/components/admin/insights/InsightWorkspace';

/**
 * Yoca Admin — İçerik düzenleyici.
 * 'new' → a new article (single editor; after the first save it opens as a workspace).
 * <id>  → the article of that row, all languages in tabs (InsightWorkspace).
 */
export default function AdminInsightEditorPage({ params }: { params: { id: string } }) {
  if (params.id === 'new') return <InsightEditor id="new" />;
  return <InsightWorkspace id={params.id} />;
}
