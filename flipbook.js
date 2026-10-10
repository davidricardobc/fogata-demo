// Reproductor cuadro por cuadro (la técnica de las páginas de Apple): una
// secuencia de WebP dibujada en un <canvas> según el avance del scroll.
// No usa <video>: buscar tiempos en un video al hacer scroll se traba, sobre
// todo en iPhone. Aquí cada posición del scroll es una imagen ya decodificada.
//
// Marcado:
//   <section data-sc-act="pin" data-sc-span="3">
//     <div class="sc-stage">
//       <canvas data-flipbook="frames/pizza" data-focus="0.5 0.5" data-range="0 1"></canvas>
//
// data-flipbook  carpeta con manifest.json; se usa <carpeta>-m en pantallas
//                angostas si existe esa versión (ver data-mobile).
// data-mobile    "1" si existe la carpeta móvil <carpeta>-m.
// data-focus     punto que se mantiene visible al recortar (x y, 0..1).
// data-range     tramo del avance del acto que recorre la secuencia.
// El avance lo publica el motor de scroll-craft como --sc-p en el acto.

const MOBILE = window.matchMedia('(max-width: 700px)');
const DPR_CAP = MOBILE.matches ? 1.5 : 2;

function frameUrl(dir, manifest, n) {
  return `${dir}/${manifest.pattern.replace('{n}', String(n).padStart(manifest.pad || 4, '0'))}`;
}

// Orden de carga progresivo: primero y último, luego cada 16, 8, 4, 2 y 1.
// Así cualquier posición tiene un cuadro cercano apenas empieza a cargar.
function loadOrder(count) {
  const order = [0, count - 1];
  const seen = new Set(order);
  for (let stride = 16; stride >= 1; stride /= 2) {
    for (let i = 0; i < count; i += stride) if (!seen.has(i)) { seen.add(i); order.push(i); }
  }
  return order;
}

class Flipbook {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.act = canvas.closest('[data-sc-act]');
    const [fx, fy] = (canvas.dataset.focus || '0.5 0.5').split(/\s+/).map(Number);
    this.focus = { x: fx, y: fy };
    const [r0, r1] = (canvas.dataset.range || '0 1').split(/\s+/).map(Number);
    this.range = { from: r0, to: r1 };
    const dir = canvas.dataset.flipbook;
    this.dir = MOBILE.matches && canvas.dataset.mobile === '1' ? `${dir}-m` : dir;
    this.images = [];
    this.drawn = -1;
    this.visible = true;
  }

  async load() {
    this.manifest = await fetch(`${this.dir}/manifest.json`).then((r) => r.json());
    const { count } = this.manifest;
    this.images = new Array(count).fill(null);
    const order = loadOrder(count);
    let next = 0;
    // Cuatro descargas en paralelo: rápido sin ahogar la conexión del celular.
    const worker = async () => {
      while (next < order.length) {
        const i = order[next++];
        const img = new Image();
        img.decoding = 'async';
        img.src = frameUrl(this.dir, this.manifest, i + 1);
        try { await img.decode(); this.images[i] = img; } catch { /* un cuadro que falla se reemplaza por el vecino */ }
        if (i === 0) this.canvas.closest('.sc-stage')?.classList.add('is-ready');
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.canvas.dispatchEvent(new CustomEvent('flipbook:loaded', { bubbles: true }));
  }

  resize() {
    const w = Math.round(this.canvas.clientWidth * Math.min(window.devicePixelRatio || 1, DPR_CAP));
    const h = Math.round(this.canvas.clientHeight * Math.min(window.devicePixelRatio || 1, DPR_CAP));
    if (w && h && (w !== this.canvas.width || h !== this.canvas.height)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.drawn = -1;
    }
  }

  // Cuadro cargado más cercano al pedido, buscando hacia ambos lados.
  nearest(i) {
    if (this.images[i]) return i;
    for (let d = 1; d < this.images.length; d++) {
      if (this.images[i - d]) return i - d;
      if (this.images[i + d]) return i + d;
    }
    return -1;
  }

  progress() {
    const p = parseFloat(this.act?.style.getPropertyValue('--sc-p')) || 0;
    const { from, to } = this.range;
    return Math.min(1, Math.max(0, (p - from) / (to - from)));
  }

  draw() {
    if (!this.manifest || !this.visible) return;
    const want = Math.round(this.progress() * (this.manifest.count - 1));
    const i = this.nearest(want);
    if (i < 0 || i === this.drawn) return;
    const img = this.images[i];
    const cw = this.canvas.width, ch = this.canvas.height;
    // "cover" con punto focal: llena el lienzo y recorta alrededor del foco.
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const dx = (cw - dw) * this.focus.x, dy = (ch - dh) * this.focus.y;
    this.ctx.drawImage(img, dx, dy, dw, dh);
    this.drawn = i;
  }
}

export function startFlipbooks(root = document) {
  const books = [...root.querySelectorAll('canvas[data-flipbook]')].map((c) => new Flipbook(c));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const book = books.find((b) => b.canvas === e.target);
      if (book) { book.visible = e.isIntersecting; if (book.visible) book.drawn = -1; }
    }
  }, { rootMargin: '50% 0px' });
  books.forEach((b) => { io.observe(b.canvas); b.resize(); b.load(); });
  window.addEventListener('resize', () => books.forEach((b) => b.resize()));
  const tick = () => { books.forEach((b) => b.draw()); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return books;
}
