'use client';

import { Badge, small } from '@/components/admin/ops/ui';
import { conflictText, type PaymentCheck } from '@/lib/documents/model';

/** Fixed scope of the automatic check, said wherever its result is shown. */
export const PAYMENT_CHECK_SCOPE = 'Denetim yalnız Ödeme koşulları ve Notlar bölümlerini kapsar; diğer bölümlerdeki ödeme ifadeleri kontrol edilmez.';

/**
 * Result of the payment text vs plan check, four states never shown as one another:
 * çelişki var / otomatik doğrulanamadı (with "İnceledim, onaylıyorum") / uyum doğrulandı /
 * metinde ödeme aşaması yok. Nothing is shown when the document has no complete plan.
 */
export function PaymentCheckStatus({ check, onApprove, onRevoke, readOnly = false }: { check: PaymentCheck; onApprove?: () => void; onRevoke?: () => void; readOnly?: boolean }) {
  if (check.state === 'noplan') return null;
  return (
    <div className="grid gap-1.5 admin-box p-3 text-[13px]" data-testid="payment-check" data-state={check.state} data-approved={check.approved ? '1' : '0'} role="status">
      {check.state === 'verified' && <p><Badge tone="ok">Uyum doğrulandı</Badge> <span className="text-muted">Metindeki her ödeme aşaması plandaki aşamayla yüzde ve ödeme zamanı olarak eşleşti.</span></p>}
      {check.state === 'neutral' && <p><Badge tone="muted">Metinde ödeme aşaması yok</Badge> <span className="text-muted">Plan yalnız tabloda; doğrulanacak ödeme metni yok.</span></p>}
      {check.state === 'conflict' && check.conflict && <p><Badge tone="bad">Çelişki var</Badge> <span className="text-red-200">Ödeme metni ile plan uyuşmuyor: {conflictText(check.conflict)}. Kesinleştirilemez.</span></p>}
      {check.state === 'unverified' && (
        <div className="grid gap-1.5">
          <p>
            <Badge tone="warn">{check.approved ? 'Otomatik doğrulanamadı — incelendi, onaylandı' : 'Otomatik doğrulanamadı'}</Badge>{' '}
            <span className={check.approved ? 'text-muted' : 'text-yellow-100'}>{check.approved ? 'Bu metin ve plan için onayınız kayıtlı; ikisinden biri değişirse onay düşer.' : 'Bu ödeme koşulu otomatik doğrulanamadı. İnceleyip onaylamadan kesinleştirilemez.'}</span>
          </p>
          <ul className="list-disc ps-5 text-[12px] text-muted">{check.issues.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ul>
          {!readOnly && (check.approved
            ? <button type="button" className={`${small} justify-self-start`} onClick={onRevoke}>Onayı geri al</button>
            : <button type="button" className="admin-btn justify-self-start" onClick={onApprove}>İnceledim, onaylıyorum</button>)}
        </div>
      )}
      <p className="text-[12px] text-subtle">{PAYMENT_CHECK_SCOPE}</p>
    </div>
  );
}
