import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, formatPrice, buildPriceRows } from '../js/pricing.js';

test('applyDiscount calcula el precio final en centavos al 30 %', () => {
  assert.equal(applyDiscount(59.99, 30), 41.99);
  assert.equal(applyDiscount(79.99, 30), 55.99);
  assert.equal(applyDiscount(99.99, 30), 69.99);
  assert.equal(applyDiscount(393.99, 30), 275.79);
});

test('formatPrice usa $ y separador de miles con dos decimales', () => {
  assert.equal(formatPrice(1120), '$1,120.00');
  assert.equal(formatPrice(41.99), '$41.99');
});

const c = (slug, basePrice, finished = false) => ({ slug, name: slug.toUpperCase(), basePrice, finished });

test('buildPriceRows incluye finalizados, conserva el orden y excluye sin precio', () => {
  const rows = buildPriceRows(
    [c('a', 59.99), c('b', null), c('c', 0), c('d', 99.99, true), c('e', NaN)],
    30,
  );
  assert.deepEqual(rows.map((r) => r.slug), ['a', 'd']);
  assert.deepEqual(rows[0], { slug: 'a', name: 'A', before: 59.99, after: 41.99, saving: 18 });
  assert.equal(rows[1].after, 69.99);
});

test('applyDiscount redondea medios centavos hacia arriba', () => {
  assert.equal(applyDiscount(10.45, 10), 9.41);
  assert.equal(applyDiscount(10.03, 50), 5.02);
  assert.equal(applyDiscount(10.70, 15), 9.10);
});

test('applyDiscount coincide con aritmetica entera half-up (barrido)', () => {
  for (let cents = 1000; cents <= 6000; cents++) {
    for (const p of [5, 10, 15, 25, 30, 50]) {
      const expected = Math.floor((cents * (100 - p) + 50) / 100) / 100;
      assert.equal(applyDiscount(cents / 100, p), expected, `${cents / 100} al ${p}%`);
    }
  }
});
