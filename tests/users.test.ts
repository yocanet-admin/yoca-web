import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountState, canOpen, dbErrorCode, isPublicAdminPath, passwordProblem, ROLE_HOME, visibleHref } from '../lib/admin/roles';
import { hashInviteToken, inviteEmail, inviteLink, newInviteToken, validTokenShape } from '../lib/admin/users';

test('roles: admin opens everything; finance only Finans; editor only the content screens', () => {
  for (const p of ['/admin', '/admin/ops/services', '/admin/users', '/admin/finance', '/admin/insights/x']) assert.equal(canOpen('admin', p), true, p);
  for (const p of ['/admin/finance', '/admin/finance/income/123', '/admin/expenses', '/admin/expenses/new']) assert.equal(canOpen('finance', p), true, p);
  for (const p of ['/admin', '/admin/ops', '/admin/insights', '/admin/users', '/admin/settings', '/admin/seo', '/admin/traffic', '/admin/financeX']) assert.equal(canOpen('finance', p), false, p);
  for (const p of ['/admin/sections', '/admin/menus', '/admin/content', '/admin/work', '/admin/work/results', '/admin/insights', '/admin/insights/new', '/admin/team']) assert.equal(canOpen('editor', p), true, p);
  for (const p of ['/admin', '/admin/submissions', '/admin/clients', '/admin/traffic', '/admin/seo', '/admin/sites', '/admin/ops', '/admin/ops/clients', '/admin/documents', '/admin/finance', '/admin/expenses', '/admin/newsletter', '/admin/signature', '/admin/company', '/admin/activity', '/admin/settings', '/admin/users', '/admin/teamX', '/admin/insightsX'])
    assert.equal(canOpen('editor', p), false, p);
  assert.equal(visibleHref('editor', '/admin/newsletter'), false);
  // every home is openable by its role
  for (const r of ['admin', 'finance', 'editor'] as const) assert.equal(canOpen(r, ROLE_HOME[r]), true, r);
  assert.equal(isPublicAdminPath('/admin/davet'), true);
  assert.equal(isPublicAdminPath('/admin/davetX'), false);
});

test('account state: active / invite sent / expired / failed / disabled', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  assert.equal(accountState({ status: 'active', invite_open: false, invite_send_status: null, invite_expires_at: null }, now).label, 'Etkin');
  assert.equal(accountState({ status: 'disabled', invite_open: false, invite_send_status: null, invite_expires_at: null }, now).label, 'Erişim kapalı');
  assert.equal(accountState({ status: 'invited', invite_open: true, invite_send_status: 'sent', invite_expires_at: '2026-11-13T10:00:00Z' }, now).label, 'Davet bekliyor');
  assert.equal(accountState({ status: 'invited', invite_open: true, invite_send_status: 'sent', invite_expires_at: '2026-11-12T09:59:59Z' }, now).label, 'Davetin süresi doldu');
  // a failed send is never shown as a pending (sent) invite
  assert.equal(accountState({ status: 'invited', invite_open: false, invite_send_status: 'failed', invite_expires_at: '2026-11-13T10:00:00Z' }, now).label, 'Davet gönderilemedi');
});

test('invite token: 256-bit, only the hash is stored, link uses the fragment', () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.notEqual(a.token, b.token);
  assert.equal(validTokenShape(a.token), true);
  assert.equal(validTokenShape('short'), false);
  assert.equal(validTokenShape(`${a.token}/../x`), false);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(hashInviteToken(a.token), a.hash);
  assert.ok(!a.hash.includes(a.token));
  const hours = (Date.parse(a.expiresAt) - Date.now()) / 3600_000;
  assert.ok(hours > 71.9 && hours <= 72, String(hours));
  assert.equal(inviteLink('T0K'), 'https://yoca.net/admin/davet#t=T0K');
});

test('invite e-mail: escapes the name, states the role and the expiry, never a password', () => {
  const m = inviteEmail({ name: '<script>alert(1)</script> Ayşe', role: 'editor', link: 'https://yoca.net/admin/davet#t=abc', expiresAt: '2026-11-15T09:00:00Z' });
  assert.ok(!m.html.includes('<script>alert(1)</script>'));
  assert.ok(m.html.includes('İçerik editörü'));
  assert.ok(m.html.includes('https://yoca.net/admin/davet#t=abc'));
  assert.ok(m.html.includes('15 Kasım 2026'));
  assert.ok(!/şifren(iz)?\s*:/i.test(m.html));
});

test('password rule for the invite page', () => {
  assert.match(passwordProblem('kisa', 'ayse@x.com') ?? '', /en az 10/);
  assert.match(passwordProblem('ayse-guclu-2026', 'ayse@x.com') ?? '', /e-posta/);
  assert.match(passwordProblem('aaaaaaaaaaaa', 'b@x.com') ?? '', /tek bir karakter/);
  assert.equal(passwordProblem('Mavi-Deniz-48-Kalem', 'ayse@x.com'), null);
});

test('database errors map to stable codes', () => {
  assert.equal(dbErrorCode('last_admin', 'P0001'), 'last_admin');
  assert.equal(dbErrorCode('pending_invite', 'P0001'), 'pending_invite');
  assert.equal(dbErrorCode(null, '42501'), 'forbidden');
  assert.equal(dbErrorCode('Bad Hint!', 'P0002'), 'not_found');
});

test('direct creation helpers: generated temporary password passes the rule; honest e-mail wording', async () => {
  const { generatePassword, emailProof } = await import('../lib/admin/roles');
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const p = generatePassword();
    assert.equal(p.length, 16);
    assert.equal(passwordProblem(p, 'kisi@yoca.net'), null, p);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
  assert.equal(emailProof({ created_via: 'direct', email_verified: false, status: 'active' }), 'E-posta doğrulanmadı (yönetici oluşturdu)');
  assert.equal(emailProof({ created_via: 'invite', email_verified: true, status: 'active' }), 'E-posta doğrulandı (davet bağlantısı)');
  assert.equal(emailProof({ created_via: 'legacy', email_verified: false, status: 'active' }), 'Mevcut hesap (panel öncesi)');
  assert.equal(accountState({ status: 'active', must_change_password: true, invite_open: false, invite_send_status: null, invite_expires_at: null }).label, 'İlk girişte şifre değiştirmeli');
});

test('ADMIN_EMAILS is no longer an access input (database role is the only source)', async () => {
  const fs = await import('node:fs');
  const auth = fs.readFileSync('lib/cockpit/auth.ts', 'utf8');
  const me = fs.readFileSync('app/api/admin/me/route.ts', 'utf8');
  assert.doesNotMatch(auth, /isAllowedAdminEmail|adminAllowlist\(/);
  assert.doesNotMatch(me, /ADMIN_EMAILS\b(?![^\n]*no longer)/);
  assert.match(auth, /export async function requireAdmin[\s\S]*?adminCheck\(bearerToken\(request\)\)/);
});
