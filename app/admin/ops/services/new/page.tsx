'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ServiceForm from '@/components/admin/ops/ServiceForm';
import { Flash, PageHead } from '@/components/admin/ops/ui';
import { createService, loadOps, type OpsData } from '@/lib/ops/data';
import { duplicateService, type Service } from '@/lib/ops/model';

/**
 * Yoca Operasyon — new service. Only name + kind are required.
 * ?copy=<serviceId> prefills from duplicateService() (no payments, periods,
 * documents or licenses are copied; the original's client/project links are
 * preselected and can be removed). ?client=<id> / ?project=<id> preselect links.
 */

function NewServiceInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<OpsData | null>(null);
  const copyId = params.get('copy');
  const clientId = params.get('client');
  const projectId = params.get('project');

  useEffect(() => { loadOps().then(setData); }, []);

  const prefill = useMemo(() => {
    if (!data?.ready) return null;
    let initial: Partial<Service> | undefined;
    const clients: string[] = [];
    const projects: string[] = [];
    let copyMissing = false;
    if (copyId) {
      const src = data.services.find((x) => x.id === copyId);
      if (src) {
        initial = duplicateService(src);
        for (const l of data.links.filter((x) => x.service_id === src.id)) {
          if (l.client_id) clients.push(l.client_id);
          if (l.project_id) projects.push(l.project_id);
        }
      } else copyMissing = true;
    }
    if (clientId && data.parties.some((p) => p.id === clientId) && !clients.includes(clientId)) clients.push(clientId);
    if (projectId) {
      const pr = data.projects.find((p) => p.id === projectId);
      if (pr && !projects.includes(pr.id)) {
        projects.push(pr.id);
        if (pr.client_id && !clients.includes(pr.client_id)) clients.push(pr.client_id);
      }
    }
    return { initial, links: { clients, projects }, copyMissing, source: copyId ? data.services.find((x) => x.id === copyId) ?? null : null };
  }, [data, copyId, clientId, projectId]);

  const onSubmit = async (payload: Partial<Service>, links: Array<{ client_id?: string; project_id?: string }>) => {
    const r = await createService(payload, links);
    if (!r.id) return r.error ?? 'Kaydedilemedi.';
    const q = new URLSearchParams({ created: '1' });
    if (r.warning) q.set('warn', r.warning);
    router.push(`/admin/ops/services/${r.id}?${q.toString()}`);
    return null;
  };

  return (
    <div className="grid gap-5">
      <PageHead
        title={prefill?.source ? 'Hizmeti çoğalt' : 'Yeni hizmet'}
        sub="Yalnızca kayıt adı ve tür zorunlu. Diğer bilgileri bildiğiniz kadar girin; kalanını sonra ekleyebilirsiniz."
        actions={<Link href="/admin/ops/services" className="admin-btn">← Hizmetler</Link>}
      />
      {!data ? <p className="text-[14px] text-muted">Yükleniyor…</p> : !data.ready ? (
        <Flash tone="bad" message={data.error ?? 'Veriler yüklenemedi.'} />
      ) : prefill && (
        <div className="admin-card grid gap-4 !p-4 sm:!p-6">
          {prefill.copyMissing && <Flash tone="warn" message="Çoğaltılacak hizmet bulunamadı; boş formla devam edebilirsiniz." />}
          {prefill.source && (
            <Flash tone="warn" message={`“${prefill.source.name}” kaydından kopyalanıyor. Tarihler, dönemler, ödemeler, belgeler, lisanslar ve müşteri bildirimi kopyalanmaz.`} />
          )}
          <ServiceForm
            key={`${copyId ?? ''}:${clientId ?? ''}:${projectId ?? ''}`}
            data={data}
            mode="create"
            initial={prefill.initial}
            initialLinks={prefill.links}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/ops/services')}
          />
        </div>
      )}
    </div>
  );
}

export default function NewServicePage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Yükleniyor…</p>}>
      <NewServiceInner />
    </Suspense>
  );
}
