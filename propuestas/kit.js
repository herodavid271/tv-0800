// Utilidades de las maquetas: escala del lienzo, fichas, estrellas y cuadrícula de cupos.
const stage = document.getElementById('stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
fit();
addEventListener('resize', fit);

// Fichas tipo tablero: <span class="fl" data-fl="TEXTO" data-pad="20">
document.querySelectorAll('[data-fl]').forEach((el) => {
  const text = el.dataset.fl.padEnd(Number(el.dataset.pad) || 0, ' ');
  el.innerHTML = [...text]
    .map((c, n) => (c === ' ' ? `<i class="sp" style="--i:${n}">&nbsp;</i>` : `<i style="--i:${n}">${c}</i>`))
    .join('');
});

// Estrellas: <svg data-star="puntas,radioExterior,radioInterior" viewBox="0 0 400 400">
document.querySelectorAll('svg[data-star]').forEach((svg) => {
  const [n, R, r] = svg.dataset.star.split(',').map(Number);
  let points = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n;
    const q = i % 2 ? r : R;
    points += `${(200 + q * Math.sin(a)).toFixed(1)},${(200 - q * Math.cos(a)).toFixed(1)} `;
  }
  svg.innerHTML = `<polygon points="${points}" fill="#FFE200" stroke="#0E0E0E" stroke-width="7" stroke-linejoin="round"/>`;
});

// Cupos: <div class="asientos" data-total="60" data-libres="50">
document.querySelectorAll('.asientos').forEach((el) => {
  const total = Number(el.dataset.total);
  const taken = total - Number(el.dataset.libres);
  el.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < taken ? 'x' : ''}" style="--i:${i}"></i>`).join('');
});
