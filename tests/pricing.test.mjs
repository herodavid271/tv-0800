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
