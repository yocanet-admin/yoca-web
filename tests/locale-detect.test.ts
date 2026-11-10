import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localeFromCountry, localesFromAcceptLanguage, pickLocale } from '../lib/localeDetect';

test('browser languages: regional variants match, q order is respected, unsupported ones are skipped', () => {
  assert.deepEqual(localesFromAcceptLanguage('tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'), ['tr', 'en']);
  assert.deepEqual(localesFromAcceptLanguage('en-US,en;q=0.9'), ['en']);
  assert.deepEqual(localesFromAcceptLanguage('de-DE,de;q=0.9,az-Latn-AZ;q=0.8,ar;q=0.5'), ['az', 'ar'], 'first language unsupported → the next supported ones');
  assert.deepEqual(localesFromAcceptLanguage('fr;q=0.4, ar-AE;q=0.6, tr;q=0.5'), ['ar', 'tr'], 'q values decide, not position');
  assert.deepEqual(localesFromAcceptLanguage('en;q=0, tr'), ['tr'], 'q=0 means not acceptable');
  assert.deepEqual(localesFromAcceptLanguage('*'), []);
  assert.deepEqual(localesFromAcceptLanguage(''), []);
  assert.deepEqual(localesFromAcceptLanguage(null), []);
  assert.deepEqual(localesFromAcceptLanguage('TR-tr'), ['tr'], 'case-insensitive');
});

test('country is only a fallback, and only where the language is clear', () => {
  assert.equal(localeFromCountry('TR'), 'tr');
  assert.equal(localeFromCountry('az'), 'az');
  for (const c of ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'IQ', 'EG']) assert.equal(localeFromCountry(c), 'ar', c);
  for (const c of ['GB', 'DE', 'US', 'CY', 'MA', 'XX', '', 'TUR', '1A']) assert.equal(localeFromCountry(c), null, c || '(empty)');
  assert.equal(localeFromCountry(undefined), null);
});

test('order: saved choice → browser → country → English', () => {
  assert.deepEqual(pickLocale({ cookie: 'az', acceptLanguage: 'tr-TR', country: 'AE' }), { locale: 'az', source: 'cookie' });
  assert.deepEqual(pickLocale({ cookie: 'xx', acceptLanguage: 'tr-TR', country: 'AE' }), { locale: 'tr', source: 'browser' }, 'invalid cookie is ignored');
  assert.deepEqual(pickLocale({ acceptLanguage: 'de-DE,fr', country: 'AZ' }), { locale: 'az', source: 'country' }, 'no supported browser language → country');
  assert.deepEqual(pickLocale({ acceptLanguage: 'en-GB', country: 'TR' }), { locale: 'en', source: 'browser' }, 'the browser beats the country');
  assert.deepEqual(pickLocale({ acceptLanguage: 'de', country: null }), { locale: 'en', source: 'default' }, 'no country information still works');
  assert.deepEqual(pickLocale({}), { locale: 'en', source: 'default' });
});
