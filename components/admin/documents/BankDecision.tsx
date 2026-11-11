'use client';

import { formatIban, type BankChange } from '@/lib/documents/settings';

/**
 * Shown when a finalized version is downloaded but the bank details printed on
 * it differ from today's Belge ayarları. Nothing is swapped silently: the admin
 * either downloads the version as it is (old bank details, said plainly) or
 * opens a revision, which uses the current details of the SAME selected
 * accounts. An account that was not selected is never added.
 */
export function BankDecision({ number, version, changes, busy, canRevise, onKeep, onRevise, onClose }: {
  number: string; version: number; changes: BankChange[]; busy: boolean; canRevise: boolean;
  onKeep: () => void; onRevise: () => void; onClose: () => void;
}) {
  const removed = changes.some((c) => c.change === 'removed');
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="bank-decision-title" className="admin-backdrop">
      <div className="admin-dialog max-w-xl">
        <div>
          <h2 id="bank-decision-title" className="text-[17px] font-extrabold">Banka bilgisi değişmiş</h2>
          <p className="mt-1 text-[13px] text-muted">
            {number} sürüm {version}, kesinleştirildiği andaki banka bilgisini taşır. Belge ayarlarındaki bilgi o tarihten sonra değişti:
          </p>
        </div>
        <ul className="grid gap-3 text-[13px]">
          {changes.map((c) => (
            <li key={c.id} className="grid gap-1 admin-box p-3">
              <p className="font-bold">{c.old.bank || 'Banka hesabı'}{c.old.currency ? ` · ${c.old.currency}` : ''}</p>
              <p className="text-muted">Belgede: <span className="font-mono text-white">{formatIban(c.old.iban)}</span>{c.old.holder ? ` · ${c.old.holder}` : ''}</p>
              {c.change === 'removed'
                ? <p className="text-yellow-200">Bu hesap Belge ayarlarından kaldırılmış.</p>
                : <p className="text-yellow-200">Şimdi: <span className="font-mono">{formatIban(c.now?.iban ?? '')}</span>{c.now?.holder ? ` · ${c.now.holder}` : ''} <span className="text-subtle">(değişen: {c.fields.join(', ')})</span></p>}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 text-[12px] text-subtle">
          <p><b className="text-muted">Sürümdeki bilgilerle indir:</b> PDF, bu sürümde basılı olan (eski) banka bilgisini içerir. Şirket bilgileri güncel profilden gelir.</p>
          <p><b className="text-muted">Güncel banka bilgileriyle revize et:</b> belge yeniden taslak olur; aynı hesapların güncel bilgileri kullanılır ve kesinleştirdiğinizde yeni sürüm oluşur. Önceki sürüm ve PDF’leri saklanır.{removed ? ' Kaldırılan hesabın yerine hangi hesabın basılacağını siz seçersiniz; başka bir hesap kendiliğinden eklenmez.' : ''}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="button" className="admin-btn" onClick={onKeep} disabled={busy}>Sürümdeki bilgilerle indir</button>
          {canRevise && <button type="button" className="admin-btn admin-btn-primary" onClick={onRevise} disabled={busy}>Güncel banka bilgileriyle revize et</button>}
        </div>
      </div>
    </div>
  );
}
