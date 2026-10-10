// Escenas fotográficas de Fogata: fotos reales recortadas (PNG/WebP con alfa)
// compuestas en un <canvas> según el avance del scroll. Cada escena expone
// render(p, px, py), resize() y dispose(), igual que las escenas 3D, para que
// app.js las maneje sin saber cómo se dibujan.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// Caída con un rebote corto: pasa un poco del punto y vuelve, como algo con peso.
const land = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.35;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

function makeCanvas(host, mobile) {
  const canvas = document.createElement('canvas');
  canvas.className = 'photo-canvas';
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const dprCap = mobile ? 1.5 : 2;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    return { w: canvas.width, h: canvas.height, dpr };
  };
  return { canvas, ctx, resize };
}

// ---------------------------------------------------------------------------
// Hamburguesa: siete fotos de ingredientes que caen y encajan. Al final se funde
// con la foto completa, que corrige las pequeñas diferencias entre capas.
// ---------------------------------------------------------------------------
const BURGER_LAYERS = ['b-01-pan-abajo', 'b-02-carne', 'b-03-queso', 'b-04-cebolla', 'b-05-tomate', 'b-06-lechuga', 'b-07-pan-arriba'];
// Separación en unidades de la foto (1536x1024 original, las capas comparten encuadre).
const SRC_W = 1536, SRC_H = 1024;
const EXPLODE_GAP = 78;

function burgerScene(host, { mobile, base }) {
  const { canvas, ctx, resize } = makeCanvas(host, mobile);
  let layers = [], full = null, size = resize();
  const ready = Promise.all([
    ...BURGER_LAYERS.map((n) => loadImage(`${base}/burger/${n}.webp`)),
    loadImage(`${base}/burger/b-00-completa.webp`),
  ]).then((imgs) => { full = imgs.pop(); layers = imgs; });

  // Cada capa aterriza en su turno; la de abajo ya está en su sitio.
  const windows = [[0, 0], [0.08, 0.22], [0.2, 0.34], [0.31, 0.43], [0.4, 0.52], [0.49, 0.62], [0.6, 0.78]];

  function render(p, px = 0, py = 0) {
    if (!full) return {};
    size = resize();
    const { w, h, dpr } = size;
    ctx.clearRect(0, 0, w, h);
    const assembled = easeInOut(range(p, 0.55, 0.9));
    // Encuadre: separada necesita más alto; armada se acerca y llena el espacio.
    // El pan de arriba empieza en y≈68 de la foto y sube hasta MAX_LIFT.
    const MAX_LIFT = EXPLODE_GAP * 6 + 40 * 6;
    const spanExploded = SRC_H - 68 + MAX_LIFT + 70;
    const sExploded = Math.min(w / SRC_W, h / spanExploded) * 0.98;
    const sAssembled = Math.min(w / SRC_W, h / SRC_H) * (mobile ? 1.08 : 1.02);
    const s = lerp(sExploded, sAssembled, assembled);
    const ox = (w - SRC_W * s) / 2;
    const oyExploded = h - SRC_H * s - 10 * dpr;
    const oyAssembled = (h - SRC_H * s) / 2;
    const oy = lerp(oyExploded, oyAssembled, assembled);

    const fullMix = range(p, 0.86, 0.97);
    const hover = Math.sin(p * Math.PI * 6) * (1 - assembled);

    for (let i = 0; i < layers.length; i++) {
      const [a, b] = windows[i];
      const t = i === 0 ? 1 : land(range(p, a, b));
      const lift = (1 - t) * (EXPLODE_GAP * i + 40 * i * (1 - assembled)) + hover * 3 * i;
      const tilt = (1 - t) * (i % 2 ? -1 : 1) * 0.035 * i / 6;
      const drift = (1 - t) * px * 14 * i + py * 4 * i * (1 - t);
      const x = ox + drift * s;
      const y = oy - lift * s;
      // Sombra de contacto: amplia y suave mientras cae, apretada al llegar.
      ctx.save();
      ctx.globalAlpha = 1 - fullMix;
      ctx.shadowColor = `rgba(20,8,2,${lerp(0.28, 0.55, t)})`;
      ctx.shadowBlur = lerp(46, 14, t) * dpr;
      ctx.shadowOffsetY = lerp(34, 8, t) * dpr;
      ctx.translate(x + (SRC_W * s) / 2, y + (SRC_H * s) / 2);
      ctx.rotate(tilt);
      ctx.drawImage(layers[i], -(SRC_W * s) / 2, -(SRC_H * s) / 2, SRC_W * s, SRC_H * s);
      ctx.restore();
    }
    if (fullMix > 0) {
      ctx.save();
      ctx.globalAlpha = fullMix;
      ctx.shadowColor = 'rgba(20,8,2,.5)';
      ctx.shadowBlur = 18 * dpr;
      ctx.shadowOffsetY = 10 * dpr;
      ctx.drawImage(full, ox, oy, SRC_W * s, SRC_H * s);
      ctx.restore();
    }
    return { assembled };
  }

  return { ready, render, resize: () => { size = resize(); }, dispose: () => canvas.remove(), canvas };
}

// ---------------------------------------------------------------------------
// Pizza (el pico): vista cenital. La bola se vuelve disco, la salsa se pinta en
// espiral sobre la foto real, las piezas caen una a una y el horno la dora.
// ---------------------------------------------------------------------------
const GOLDEN = 2.399963;
// Reparte n piezas en el disco de salsa sin amontonarlas (espiral áurea).
function scatter(n, radius, offset) {
  return Array.from({ length: n }, (_, i) => {
    const r = Math.sqrt((i + 0.6) / n) * radius;
    const a = i * GOLDEN + offset;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (i * 1.7 + offset) % (Math.PI * 2) };
  });
}

function pizzaScene(host, { mobile, base }) {
  const { canvas, ctx, resize } = makeCanvas(host, mobile);
  const dir = `${base}/pizza`;
  const img = {};
  const sprites = { mozz: [], pepp: [], hoja: [] };
  const pieces = [];
  const ready = Promise.all([
    ...['p-01-masa-bola', 'p-02-masa-disco', 'p-03-salsa', 'p-08-harina', 'p-09-brasas'].map((n) => loadImage(`${dir}/${n}.webp`).then((i) => { img[n] = i; })),
    ...Object.keys(sprites).map((k) => fetch(`${dir}/${k}.json`).then((r) => r.json()).then((list) => Promise.all(list.map((m) => loadImage(`${dir}/${m.name}`)))).then((imgs) => { sprites[k] = imgs; })),
    loadImage(`${dir}/p-10-horneada.webp`).then((i) => { img.baked = i; }).catch(() => {}),
  ]).then(() => {
    // Hojas 1-8 son albahaca y 9-12 aceitunas (orden de la hoja original).
    const olives = sprites.hoja.slice(8), basil = sprites.hoja.slice(0, 8);
    const add = (list, n, size, radius, offset, from, to) => scatter(n, radius, offset).forEach((pos, i) => {
      const s = list[i % list.length];
      const start = from + (to - from - 0.05) * (i / n);
      pieces.push({ img: s, size, ...pos, start, end: start + 0.05 });
    });
    add(sprites.mozz, 11, 0.13, 0.3, 0.4, 0.44, 0.58);
    add(sprites.pepp, 10, 0.115, 0.31, 1.9, 0.56, 0.69);
    add(basil, 7, 0.1, 0.27, 3.1, 0.67, 0.77);
    add(olives, 6, 0.05, 0.3, 4.4, 0.69, 0.78);
  });

  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const sauceCanvas = document.createElement('canvas');
  const sctx = sauceCanvas.getContext('2d');

  // Máscara de espiral de Arquímedes: el trazo avanza desde el centro con punta
  // redonda, como la salsa que se esparce con el cucharón.
  function drawSauce(D, t) {
    const size = Math.round(D * 0.92);
    if (sauceCanvas.width !== size) { sauceCanvas.width = sauceCanvas.height = size; }
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, size, size);
    sctx.drawImage(img['p-03-salsa'], 0, 0, size, size);
    if (t >= 0.999) return sauceCanvas;
    const turns = 3.4, R = size * 0.44;
    const b = R / (turns * Math.PI * 2);
    const width = Math.PI * 2 * b * 1.32;
    const end = turns * Math.PI * 2 * t;
    sctx.globalCompositeOperation = 'destination-in';
    sctx.beginPath();
    for (let th = 0; th <= end; th += 0.05) {
      const r = b * th + width * 0.2;
      const x = size / 2 + Math.cos(th) * r, y = size / 2 + Math.sin(th) * r;
      th === 0 ? sctx.moveTo(x, y) : sctx.lineTo(x, y);
    }
    sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.lineWidth = t > 0 ? width : 0;
    sctx.strokeStyle = '#000';
    sctx.stroke();
    return sauceCanvas;
  }

  function drawPiece(c, piece, D, t, dpr) {
    const w = D * piece.size;
    const h = w * piece.img.naturalHeight / piece.img.naturalWidth;
    const k = easeOut(t);
    const s = lerp(1.6, 1, k);
    c.save();
    c.globalAlpha = Math.min(1, t * 8);
    c.translate(D / 2 + piece.x * D, D / 2 + piece.y * D);
    c.rotate(piece.rot + (1 - k) * 0.9);
    c.shadowColor = `rgba(24,8,2,${lerp(0.25, 0.5, k)})`;
    c.shadowBlur = lerp(26, 5, k) * dpr;
    c.shadowOffsetX = lerp(20, 3, k) * dpr;
    c.shadowOffsetY = lerp(26, 4, k) * dpr;
    c.drawImage(piece.img, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
    c.restore();
  }

  function render(p) {
    if (!img['p-02-masa-disco'] || !pieces.length) return { heat: 0, step: 0 };
    const { w, h, dpr } = resize();
    ctx.clearRect(0, 0, w, h);
    const D = Math.round(Math.min(w, h) * (mobile ? 1.02 : 0.96));
    if (layer.width !== D) { layer.width = layer.height = D; }
    lctx.clearRect(0, 0, D, D);

    // Masa: la bola cae y se estira en disco entre nubes de harina.
    const drop = easeOut(range(p, 0, 0.08));
    const stretch = easeInOut(range(p, 0.1, 0.24));
    if (stretch < 1) {
      const bs = lerp(1.25, 1, drop) * lerp(1, 1.7, stretch);
      const bw = D * bs;
      lctx.save();
      lctx.globalAlpha = 1 - stretch;
      lctx.shadowColor = 'rgba(20,8,2,.45)'; lctx.shadowBlur = 24 * dpr; lctx.shadowOffsetY = 14 * dpr;
      lctx.drawImage(img['p-01-masa-bola'], (D - bw) / 2, (D - bw) / 2, bw, bw);
      lctx.restore();
    }
    if (stretch > 0) {
      const ds = lerp(0.5, 1, stretch);
      lctx.save();
      lctx.globalAlpha = Math.min(1, stretch * 1.6);
      lctx.shadowColor = 'rgba(20,8,2,.5)'; lctx.shadowBlur = 22 * dpr; lctx.shadowOffsetY = 12 * dpr;
      lctx.drawImage(img['p-02-masa-disco'], (D - D * ds) / 2, (D - D * ds) / 2, D * ds, D * ds);
      lctx.restore();
    }
    // Salsa en espiral.
    const sauceT = easeInOut(range(p, 0.25, 0.45));
    if (sauceT > 0) {
      const sc = drawSauce(D, sauceT);
      lctx.drawImage(sc, (D - sc.width) / 2, (D - sc.height) / 2);
    }
    // Ingredientes: los que ya cayeron y los que van cayendo.
    for (const piece of pieces) {
      const t = range(p, piece.start, piece.end);
      if (t > 0) drawPiece(lctx, piece, D, t, dpr);
    }

    // Horno: la foto horneada (si existe) o un dorado aproximado sobre la cruda.
    const heat = easeInOut(range(p, 0.78, 0.97));
    const rot = p * 0.5 - 0.2;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rot);
    if (heat > 0 && !img.baked) ctx.filter = `sepia(${0.28 * heat}) saturate(${1 + 0.25 * heat}) contrast(${1 + 0.08 * heat}) brightness(${1 - 0.06 * heat})`;
    ctx.drawImage(layer, -D / 2, -D / 2);
    ctx.filter = 'none';
    if (img.baked && heat > 0) {
      // La horneada ocupa 93,1% de su cuadro y la cruda 92,5%: se iguala el tamaño.
      const bd = D * 0.994;
      ctx.globalAlpha = heat;
      ctx.drawImage(img.baked, -bd / 2, -bd / 2, bd, bd);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Harina en el aire: al caer la bola y al estirarla.
    const puff = (t, scale) => {
      if (t <= 0 || t >= 1) return;
      const s = D * lerp(scale * 0.55, scale, easeOut(t));
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.drawImage(img['p-08-harina'], (w - s) / 2, (h - s) / 2, s, s);
      ctx.restore();
    };
    puff(range(p, 0.05, 0.16), 0.75);
    puff(range(p, 0.13, 0.3), 1.25);

    // Brasas que suben con el calor.
    if (heat > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rise = (p - 0.78) * h * 0.9;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = heat * (i ? 0.3 : 0.5);
        const bw = w * (i ? 1.25 : 1), bh = bw * 2 / 3;
        ctx.drawImage(img['p-09-brasas'], (w - bw) / 2, h - bh * 0.7 - rise * (i ? 0.6 : 1), bw, bh);
      }
      ctx.restore();
    }
    const step = p < 0.25 ? 0 : p < 0.45 ? 1 : p < 0.78 ? 2 : 3;
    return { heat, step };
  }

  return { ready, render, resize, dispose: () => canvas.remove(), canvas, layer };
}

// ---------------------------------------------------------------------------
// Limonada: la licuadora vista desde arriba. El limón cae y salpica, un remolino
// real (WebGL sobre la foto) la vuelve frapé y luego se sirve en el vaso.
// ---------------------------------------------------------------------------
const TWIRL_FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D A, B;
uniform float mixAB, angle;
uniform vec3 bg;
void main() {
  vec2 p = v - 0.5;
  float r = length(p);
  float k = smoothstep(0.43, 0.0, r);
  float a = angle * k * k;
  vec2 q = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a)) + 0.5;
  vec4 c = mix(texture2D(A, q), texture2D(B, q), mixAB);
  // Borde difuminado hacia el color de la sección: la foto no deja esquinas.
  float edge = smoothstep(0.5, 0.44, r);
  gl_FragColor = vec4(mix(bg, c.rgb, edge), 1.0);
}`;

function twirlLayer(host, mobile) {
  const canvas = document.createElement('canvas');
  canvas.className = 'twirl-canvas';
  host.prepend(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x, -p.y) * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, TWIRL_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  const texture = (unit, image) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };
  const dprCap = mobile ? 1.5 : 2;
  return {
    canvas,
    setImages(a, b) {
      texture(0, a); texture(1, b);
      gl.uniform1i(u('A'), 0); gl.uniform1i(u('B'), 1);
      gl.uniform3f(u('bg'), 18 / 255, 47 / 255, 31 / 255);
    },
    draw(size, angle, mixAB) {
      const px = Math.round(size * Math.min(window.devicePixelRatio || 1, dprCap));
      if (canvas.width !== px) { canvas.width = canvas.height = px; }
      gl.viewport(0, 0, px, px);
      gl.uniform1f(u('angle'), angle);
      gl.uniform1f(u('mixAB'), mixAB);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

function drinkScene(host, { mobile, base }) {
  let loaded = false;
  const twirl = twirlLayer(host, mobile);
  const { canvas, ctx, resize } = makeCanvas(host, mobile);
  const dir = `${base}/limonada`;
  const img = {};
  const sprites = { mitad: [], menta: [], hielo: [] };
  const ready = Promise.all([
    ...['l-01-licuadora-agua', 'l-02-licuadora-frape', 'l-03-limon', 'l-05-salpicadura', 'l-06-vaso'].map((n) => loadImage(`${dir}/${n}.webp`).then((i) => { img[n] = i; })),
    ...Object.keys(sprites).map((k) => fetch(`${dir}/${k}.json`).then((r) => r.json()).then((list) => Promise.all(list.map((m) => loadImage(`${dir}/${m.name}`)))).then((imgs) => { sprites[k] = imgs; })),
  ]).then(() => { twirl?.setImages(img['l-01-licuadora-agua'], img['l-02-licuadora-frape']); loaded = true; });

  function drawAt(image, cx, cy, width, { alpha = 1, rot = 0, shadow = 0, dpr = 1, blur = 0 } = {}) {
    const h = width * image.naturalHeight / image.naturalWidth;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    if (blur > 0.3) ctx.filter = `blur(${blur}px)`;
    if (shadow) { ctx.shadowColor = `rgba(4,20,10,${0.45 * shadow})`; ctx.shadowBlur = 24 * dpr * shadow; ctx.shadowOffsetY = 16 * dpr * shadow; }
    ctx.drawImage(image, -width / 2, -h / 2, width, h);
    ctx.restore();
  }

  function render(p) {
    if (!loaded) return {};
    const { w, h, dpr } = resize();
    ctx.clearRect(0, 0, w, h);
    const S = Math.min(w, h) * (mobile ? 1.04 : 0.98);
    const cx = w / 2, cy = h / 2;

    // Licuadora vista desde arriba, con remolino.
    const spinUp = easeInOut(range(p, 0.42, 0.56));
    const spinDown = easeInOut(range(p, 0.6, 0.7));
    const angle = 13 * spinUp * (1 - spinDown);
    const toFrappe = easeInOut(range(p, 0.5, 0.63));
    const leave = easeInOut(range(p, 0.64, 0.73));
    if (twirl) {
      const cssSize = S / dpr;
      Object.assign(twirl.canvas.style, {
        width: `${cssSize}px`, height: `${cssSize}px`,
        left: `${(canvas.clientWidth - cssSize) / 2}px`, top: `${(canvas.clientHeight - cssSize) / 2}px`,
        opacity: String(1 - leave), transform: `scale(${lerp(1, 1.35, leave)})`,
      });
      if (leave < 1) twirl.draw(cssSize, angle, toFrappe);
    } else if (leave < 1) {
      // Sin WebGL: fundido simple entre las dos fotos.
      ctx.globalAlpha = 1 - leave;
      ctx.drawImage(img['l-01-licuadora-agua'], cx - S / 2, cy - S / 2, S, S);
      ctx.globalAlpha = (1 - leave) * toFrappe;
      ctx.drawImage(img['l-02-licuadora-frape'], cx - S / 2, cy - S / 2, S, S);
      ctx.globalAlpha = 1;
    }

    // El remolino arrastra y deshace lo que cayó.
    const swirl = (x, y, fade) => {
      const a = angle * 0.35;
      const dx = x - cx, dy = y - cy;
      return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a), alpha: 1 - fade };
    };
    const melt = easeInOut(range(p, 0.44, 0.58));

    // Limón entero: cae desde la cámara hacia el agua.
    const fall = range(p, 0.03, 0.2);
    if (fall > 0 && melt < 1) {
      const k = easeInOut(fall);
      const sunk = range(p, 0.2, 0.3);
      // Entra con fundido dentro del lienzo: grande (cerca de la cámara) y baja al agua.
      const pos = swirl(lerp(cx + S * 0.1, cx + S * 0.03, k), lerp(cy - S * 0.3, cy + S * 0.02, k), melt);
      drawAt(img['l-03-limon'], pos.x, pos.y, S * lerp(0.95, 0.3, k) * lerp(1, 0.9, sunk), {
        rot: k * 2.6 + angle * 0.4, alpha: pos.alpha * lerp(1, 0.85, sunk) * Math.min(1, fall * 5), shadow: k * (1 - sunk), dpr,
      });
    }
    // Mitades.
    sprites.mitad.forEach((half, i) => {
      const t = range(p, 0.24 + i * 0.04, 0.36 + i * 0.04);
      if (t <= 0 || melt >= 1) return;
      const k = easeInOut(t);
      const side = i ? 1 : -1;
      const pos = swirl(lerp(cx + side * S * 0.22, cx + side * S * 0.14, k), lerp(cy - S * 0.2, cy - S * 0.05 + i * S * 0.12, k), melt);
      drawAt(half, pos.x, pos.y, S * lerp(0.42, 0.22, k), { rot: side * (1 - k) * 1.4 + angle * 0.4, alpha: pos.alpha * Math.min(1, t * 5), shadow: k, dpr });
    });
    // Salpicaduras al entrar al agua.
    const splash = (t, size, x, y) => {
      if (t <= 0 || t >= 1) return;
      drawAt(img['l-05-salpicadura'], x, y, S * lerp(size * 0.35, size, easeOut(t)), { alpha: (1 - t) ** 1.4 });
      ctx.save();
      ctx.strokeStyle = `rgba(230,255,240,${0.35 * (1 - t)})`;
      ctx.lineWidth = 2 * dpr;
      for (let r = 0; r < 2; r++) { ctx.beginPath(); ctx.arc(x, y, S * (0.08 + easeOut(t) * (0.22 + r * 0.12)), 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    };
    splash(range(p, 0.19, 0.32), 0.75, cx + S * 0.03, cy + S * 0.02);
    splash(range(p, 0.35, 0.46), 0.55, cx, cy + S * 0.02);

    // Servida: el vaso sube, cae la hierbabuena y el hielo se acomoda al lado.
    const serve = easeOut(range(p, 0.73, 0.9));
    if (serve > 0) {
      const gh = h * (mobile ? 0.78 : 0.86);
      const gw = gh * img['l-06-vaso'].naturalWidth / img['l-06-vaso'].naturalHeight;
      const gy = lerp(cy + gh * 0.3, cy, serve);
      ctx.save();
      ctx.globalAlpha = serve * 0.55;
      ctx.fillStyle = 'rgba(2,12,6,1)';
      ctx.beginPath();
      ctx.ellipse(cx + gw * 0.02, gy + gh * 0.45, gw * 0.3, gh * 0.03, 0, 0, Math.PI * 2);
      ctx.filter = `blur(${10 * dpr}px)`;
      ctx.fill();
      ctx.restore();
      drawAt(img['l-06-vaso'], cx, gy, gw, { alpha: Math.min(1, serve * 1.8) });
      sprites.hielo.slice(0, 2).forEach((ice, i) => {
        const t = easeOut(range(p, 0.8 + i * 0.03, 0.9 + i * 0.03));
        if (t <= 0) return;
        const side = i ? 1 : -1;
        drawAt(ice, cx + side * gw * lerp(0.6, 0.52, t), lerp(cy - h * 0.4, cy + gh * 0.4 - gw * 0.06, t), gw * 0.24, { rot: side * (1 - t) * 1.2 + i, shadow: t, dpr });
      });
      sprites.menta.slice(0, 3).forEach((leaf, i) => {
        const t = easeOut(range(p, 0.78 + i * 0.03, 0.95));
        if (t <= 0) return;
        const side = [-1, 1, -1][i];
        const spread = [0.78, 0.74, 1.12][i];
        drawAt(leaf, cx + side * gw * lerp(spread * 1.1, spread, t), lerp(cy - h * 0.7, cy + gh * (0.44 - i * 0.015), t), gw * [0.26, 0.24, 0.2][i], { rot: side * (0.9 + i * 0.4) + (1 - t) * 2 * side, alpha: Math.min(1, t * 2), shadow: t * 0.6, dpr });
      });
    }
    return {};
  }

  return {
    ready,
    render,
    resize,
    dispose: () => { canvas.remove(); twirl?.canvas.remove(); },
    canvas,
  };
}

// ---------------------------------------------------------------------------
// Cierre: al aparecer el naranja caen papas en una canasta de freír (izquierda)
// y se sirve una cerveza helada (derecha). El avance es cuánto del naranja
// cubre la pantalla: 0 cuando asoma, 1 cuando la llena.
// ---------------------------------------------------------------------------
function closeScene(host, { mobile, base }) {
  let loaded = false;
  const { canvas, ctx, resize } = makeCanvas(host, mobile);
  const dir = `${base}/cierre`;
  const img = {};
  const sprites = { papa: [], salsa: [] };
  const section = host.closest('.closing') || host;
  const ready = Promise.all([
    ...['c-01-canasta-llena', 'c-02-canasta-vacia', 'c-04-cerveza-llena', 'c-05-cerveza-vacia', 'c-06-chorro'].map((n) => loadImage(`${dir}/${n}.webp`).then((i) => { img[n] = i; })),
    ...Object.keys(sprites).map((k) => fetch(`${dir}/${k}.json`).then((r) => r.json()).then((list) => Promise.all(list.map((m) => loadImage(`${dir}/${m.name}`)))).then((imgs) => { sprites[k] = imgs; })),
  ]).then(() => { loaded = true; });
  // Papas: caen en chorro, cada una con su giro y su carril.
  const FRIES = 30;
  const fries = Array.from({ length: FRIES }, (_, i) => ({
    start: 0.1 + (0.72 * i) / FRIES,
    lane: ((i * 37) % 11) / 10 - 0.5,
    spin: ((i * 53) % 7) / 7 - 0.5,
    rot: (i * 1.3) % Math.PI,
  }));

  function progress() {
    const r = section.getBoundingClientRect();
    return clamp((window.innerHeight - r.top) / (window.innerHeight * 0.92));
  }

  // Dibuja la imagen "llena" solo por debajo de una línea que sube: la
  // canasta y el vaso son idénticos vacíos y llenos, así solo se ve subir lo de adentro.
  function fillFrom(empty, full, x, y, w, h, level, top, bottom) {
    ctx.drawImage(empty, x, y, w, h);
    if (level <= 0) return;
    const line = y + h * lerp(bottom, top, level);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, line, w + 4, y + h - line + 2);
    ctx.clip();
    ctx.drawImage(full, x, y, w, h);
    ctx.restore();
  }

  function render() {
    if (!loaded) return {};
    const p = progress();
    const { w, h, dpr } = resize();
    ctx.clearRect(0, 0, w, h);

    // Canasta a la izquierda (abajo en celular), cerveza a la derecha.
    const bs = mobile ? Math.min(w * 0.6, h * 0.95) : Math.min(w * 0.32, h * 0.66);
    const bx = mobile ? w * 0.31 - bs / 2 : w * 0.2 - bs / 2;
    const enterB = land(range(p, 0.02, 0.16));
    const by = lerp(h + bs * 0.2, h - bs * (mobile ? 0.98 : 1.02), enterB);
    const gh = mobile ? h * 0.96 : h * 0.66;
    const gw = gh * img['c-04-cerveza-llena'].naturalWidth / img['c-04-cerveza-llena'].naturalHeight;
    const gx = mobile ? w * 0.77 - gw / 2 : w * 0.84 - gw / 2;
    const enterG = land(range(p, 0.05, 0.2));
    const gy = lerp(h + gh * 0.2, h - gh * 1.0, enterG);

    // Sombra de contacto sobre el naranja.
    const floor = (cx, cy, rw, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(90,30,8,.5)';
      ctx.filter = `blur(${12 * dpr}px)`;
      ctx.beginPath(); ctx.ellipse(cx, cy, rw, rw * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    floor(bx + bs * 0.52, by + bs * 0.93, bs * 0.36, enterB);
    floor(gx + gw * 0.5, gy + gh * 0.965, gw * 0.3, enterG);

    // Canasta: el montón de papas sube según cuántas han caído.
    const landed = fries.filter((f) => p >= f.start + 0.1).length / FRIES;
    fillFrom(img['c-02-canasta-vacia'], img['c-01-canasta-llena'], bx, by, bs, bs, easeOut(landed), 0.12, 0.78);

    // Papas en el aire: entran por arriba y desaparecen al llegar al montón.
    const papas = sprites.papa;
    fries.forEach((f, i) => {
      const t = range(p, f.start, f.start + 0.1);
      if (t <= 0 || t >= 1 || !papas.length) return;
      const k = t * t;
      const s = papas[i % papas.length];
      const fw = bs * 0.2;
      const fh = fw * s.naturalHeight / s.naturalWidth;
      const x = bx + bs * (0.52 + f.lane * 0.34);
      const y = lerp(-fh, by + bs * lerp(0.62, 0.3, landed), k);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot + f.spin * 5 * t);
      ctx.drawImage(s, -fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    });

    // Salsas que caen delante de la canasta.
    sprites.salsa.forEach((s, i) => {
      const t = land(range(p, 0.55 + i * 0.07, 0.68 + i * 0.07));
      if (t <= 0) return;
      const sw = bs * (mobile ? 0.3 : 0.28);
      const sh = sw * s.naturalHeight / s.naturalWidth;
      if (mobile && i === 2) return;
      const x = bx + bs * (mobile ? [0.24, 0.84][i] : [0.16, 0.86, 1.14][i]);
      const floorY = by + bs * 0.97;
      floor(x, floorY - sh * 0.06, sw * 0.4, t);
      ctx.drawImage(s, x - sw / 2, lerp(-sh, floorY - sh, t), sw, sh);
    });

    // Cerveza: el chorro cae y el nivel sube; al final aparece la espuma.
    const pour = range(p, 0.24, 0.86);
    fillFrom(img['c-05-cerveza-vacia'], img['c-04-cerveza-llena'], gx, gy, gw, gh, easeInOut(pour), 0.06, 0.94);
    const stream = Math.min(range(p, 0.2, 0.26), 1 - range(p, 0.86, 0.93));
    if (stream > 0) {
      const level = gy + gh * lerp(0.94, 0.06, easeInOut(pour));
      // El chorro ocupa 14% de su foto: a 0,55 del vaso queda de un dedo de grueso.
      const sw = gw * 0.55;
      ctx.save();
      ctx.globalAlpha = stream;
      ctx.beginPath(); ctx.rect(gx, 0, gw, level); ctx.clip();
      ctx.drawImage(img['c-06-chorro'], gx + gw * 0.5 - sw / 2, level - h * 1.1, sw, h * 1.1);
      ctx.restore();
    }
    return { p };
  }

  return { ready, render, resize, dispose: () => canvas.remove(), canvas };
}

const SCENES = { burger: burgerScene, pizza: pizzaScene, drink: drinkScene, close: closeScene };

export function createScene(host, type, options) {
  const make = SCENES[type];
  if (!make) throw new Error(`Escena sin fotos todavía: ${type}`);
  return make(host, options);
}
