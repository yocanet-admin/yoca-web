import { Notice } from '@/components/admin/cockpit/Widgets';

/** Step-by-step: connect Vercel (Web Analytics + deployments) to the cockpit. */
export function TokenHelp() {
  return (
    <Notice tone="warning">
      <p className="font-bold text-white">Trafik ve yayın verisi için Vercel bağlantısı gerekiyor</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          vercel.com → sağ üstte profil → <strong>Account Settings → Tokens</strong> → <strong>Create Token</strong>.
        </li>
        <li>
          Ad: <code className="text-yoca-lime">yoca-cockpit</code>, Scope: <strong>mg&apos;s projects</strong>, süre: 1 yıl. Oluşan değeri kopyalayın (bir daha gösterilmez).
        </li>
        <li>
          yoca-web projesi → <strong>Settings → Environment Variables</strong> → anahtar <code className="text-yoca-lime">VERCEL_API_TOKEN</code>, değer: kopyaladığınız token, ortam: <strong>Production</strong> (ve istersen Preview).
        </li>
        <li>Projeyi yeniden yayınlayın (Deployments → son yayın → Redeploy). Sonra bu sayfayı yenileyin.</li>
      </ol>
      <p className="mt-2 text-[12px] text-subtle">Token yalnızca sunucuda kullanılır, tarayıcıya hiç gönderilmez.</p>
    </Notice>
  );
}
