/**
 * Client candidates (CRM + Operasyon share one clients table; similarity only suggests).
 * Run: npx tsx --test tests/client-match.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientCandidates, nameSimilar, normName } from '../lib/cockpit/match';

const C = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, ...extra });

test('names are compared without case, Turkish letters, punctuation or legal suffixes', () => {
  assert.equal(normName('Kuzey Mimarlık Ltd. Şti.'), 'kuzey mimarlik');
  assert.equal(normName('ÖRNEK A.Ş.'), 'ornek');
  assert.ok(nameSimilar('Kuzey Mimarlık Ltd. Şti.', 'kuzey mimarlik'));
  assert.ok(nameSimilar('Güney Tasarım Stüdyosu', 'Güney Tasarım'));
  assert.ok(!nameSimilar('Kuzey Mimarlık', 'Güney Mimarlık'));
  assert.ok(!nameSimilar('Ali', 'Alican Yapı'));
  assert.ok(!nameSimilar('', 'x'));
});

test('a similar name is only a candidate, with its reason', () => {
  const c = clientCandidates({ company: 'Kuzey Mimarlık' }, [C('1', 'Kuzey Mimarlık Ltd. Şti.'), C('2', 'Batı Yazılım')]);
  assert.equal(c.length, 1);
  assert.equal(c[0].client.id, '1');
  assert.deepEqual(c[0].reasons, ['benzer firma adı']);
  assert.equal(c[0].conflict, null);
});

test('two different clients with the same name are both offered (none is picked)', () => {
  const c = clientCandidates({ name: 'Ahmet Yılmaz' }, [C('1', 'Ahmet Yılmaz', { email: 'a@x.test' }), C('2', 'Ahmet Yılmaz', { email: 'b@y.test' })]);
  assert.deepEqual(c.map((x) => x.client.id).sort(), ['1', '2']);
});

test('e-mail on a contact of a client is found', () => {
  const c = clientCandidates({ name: 'Deneme Kişi', email: 'KISI@guney.test' }, [C('1', 'Güney Tasarım')], [{ client_id: '1', email: 'kisi@guney.test' }]);
  assert.equal(c[0].client.id, '1');
  assert.ok(c[0].reasons.includes('e-posta bu kaydın bir kişisinde'));
});

test('e-mail and firm pointing at different clients → conflict on both, never a clean match', () => {
  const clients = [C('1', 'Güney Tasarım', { email: 'kisi@guney.test' }), C('2', 'Kuzey Mimarlık')];
  const c = clientCandidates({ name: 'Deneme', company: 'Kuzey Mimarlık', email: 'kisi@guney.test' }, clients);
  const byId = Object.fromEntries(c.map((x) => [x.client.id, x]));
  assert.match(byId['1'].conflict ?? '', /başka bir kayda benziyor: Kuzey Mimarlık/);
  assert.match(byId['2'].conflict ?? '', /e-postası başka bir kayda ait: Güney Tasarım/);
});

test('e-mail matches but the lead names another firm (no other record) → conflict', () => {
  const c = clientCandidates({ company: 'Doğu Lojistik', email: 'kisi@guney.test' }, [C('1', 'Güney Tasarım', { email: 'kisi@guney.test' })]);
  assert.match(c[0].conflict ?? '', /uyuşmuyor/);
});

test('archived records are not offered', () => {
  assert.equal(clientCandidates({ company: 'Kuzey' }, [C('1', 'Kuzey', { archived_at: '2026-01-01' })]).length, 0);
});
