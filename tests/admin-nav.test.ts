import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOfPath, navStorageKey, openCurrent, parseOpenGroups, resolveOpenGroups, toggleGroup } from '../lib/admin/navState';

const groups = [
  { title: 'Genel', items: [{ href: '/admin/submissions' }, { href: '/admin/sites' }] },
  { title: 'Operasyon', items: [{ href: '/admin/ops' }, { href: '/admin/ops/clients' }] },
  { title: 'Finans', items: [{ href: '/admin/finance' }, { href: '/admin/finance/income' }, { href: '/admin/expenses' }] },
];
const exact = new Set(['/admin', '/admin/ops', '/admin/finance']);
const isActive = (href: string, p: string) => (exact.has(href) ? p === href : p === href || p.startsWith(`${href}/`));
const titles = groups.map((g) => g.title);

test('groupOfPath: the group of the current page; home and unknown pages have none', () => {
  assert.equal(groupOfPath(groups, '/admin/ops/clients/42', isActive), 'Operasyon');
  assert.equal(groupOfPath(groups, '/admin/expenses/abc', isActive), 'Finans');
  assert.equal(groupOfPath(groups, '/admin/finance/income', isActive), 'Finans');
  assert.equal(groupOfPath(groups, '/admin', isActive), null);
  assert.equal(groupOfPath(groups, '/admin/unknown', isActive), null);
});

test('first visit: only the current group is open; on the home page all are closed', () => {
  assert.deepEqual(resolveOpenGroups(titles, null, 'Finans'), { Genel: false, Operasyon: false, Finans: true });
  assert.deepEqual(resolveOpenGroups(titles, null, null), { Genel: false, Operasyon: false, Finans: false });
});

test('stored choices come back; several open at once; the current group is always opened', () => {
  const stored = { Genel: true, Operasyon: true, Finans: false };
  assert.deepEqual(resolveOpenGroups(titles, stored, null), stored);
  assert.deepEqual(resolveOpenGroups(titles, stored, 'Finans'), { Genel: true, Operasyon: true, Finans: true });
});

test('stored titles the user cannot see are dropped (finance user sees Finans only)', () => {
  assert.deepEqual(resolveOpenGroups(['Finans'], { Kokpit: true, Sistem: true, Finans: false }, 'Finans'), { Finans: true });
});

test('toggle flips one group; openCurrent opens the page group without touching others', () => {
  const s = { Genel: false, Operasyon: true, Finans: false };
  assert.deepEqual(toggleGroup(s, 'Genel'), { Genel: true, Operasyon: true, Finans: false });
  assert.deepEqual(toggleGroup(s, 'Operasyon'), { Genel: false, Operasyon: false, Finans: false });
  assert.deepEqual(openCurrent(s, 'Finans'), { Genel: false, Operasyon: true, Finans: true });
  assert.equal(openCurrent(s, 'Operasyon'), s, 'already open: same object (no re-render loop)');
  assert.equal(openCurrent(s, null), s);
});

test('parseOpenGroups: only booleans survive; broken values count as nothing stored', () => {
  assert.deepEqual(parseOpenGroups('{"Kokpit":true,"Finans":false,"x":"yes","y":1}'), { Kokpit: true, Finans: false });
  assert.equal(parseOpenGroups(null), null);
  assert.equal(parseOpenGroups(''), null);
  assert.equal(parseOpenGroups('not json'), null);
  assert.equal(parseOpenGroups('[true]'), null);
  assert.equal(parseOpenGroups('null'), null);
});

test('storage key is per user', () => {
  assert.notEqual(navStorageKey('a'), navStorageKey('b'));
  assert.match(navStorageKey('u1'), /^yoca-admin-nav:v1:u1$/);
});
