// Precio final en centavos: round(precio_base * (100 - porcentaje)) / 100.
export function applyDiscount(price, percent) {
  const cents = Math.round(price * 100);
  return Math.round(cents * (100 - percent) / 100) / 100;
}

export function formatPrice(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPriceRows(courses, percent) {
  return courses
    .filter((c) => c.basePrice > 0)
    .map((c) => {
      const before = c.basePrice;
      const after = applyDiscount(before, percent);
      return { slug: c.slug, name: c.name, before, after, saving: (Math.round(before * 100) - Math.round(after * 100)) / 100 };
    });
}

// Cashea: precio con el descuento y la inicial (porcentaje del precio ya descontado) que se paga para reservar.
export function buildCasheaRows(courses, percent, initialPercent) {
  return buildPriceRows(courses, percent).map((r) => ({ ...r, initial: applyDiscount(r.after, 100 - initialPercent) }));
}
