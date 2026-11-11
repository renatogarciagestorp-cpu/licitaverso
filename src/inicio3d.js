/* Licitacon — cenas 3D (Three.js): o "Índice vivo" da Biblioteca Jurídica e a balança da Calculadora.
 *
 * Uma coluna de cinco placas cristalinas, uma para cada tipo de fonte (Tribunais de Contas, Cortes superiores e
 * controle, Procuradorias, Tribunais de Justiça e Normas). Em volta de cada placa, um trilho em órbita com as fontes
 * daquele tipo, como fichas. Decisões saem das fichas, fazem a curva pelo trilho e assentam na placa do seu tipo, que
 * acende de leve: a classificação acontecendo. As camadas se deslocam em profundidades diferentes com o mouse.
 *
 * Fonte deste arquivo: src/inicio3d.js. O site carrega o pacote gerado na raiz (inicio3d.js), montado por
 * scripts/3d/montar.mjs com o Three.js e só com as partes usadas. O inicio.js baixa o pacote quando a cena chega perto
 * da tela e chama montar(elemento, tipo) para o lugar marcado com data-lv3d="biblioteca".
 * Calculadora (topo da página, só em telas largas): uma balança de placas cristalinas. De um lado, o preço do
 * contrato; do outro, os custos. Uma ficha de índice cai sobre os custos, a balança pende para eles e o reajuste
 * acrescenta ao preço o que devolve o equilíbrio econômico-financeiro (art. 124, II, "d", da Lei 14.133/2021).
 * Na página inicial, as ferramentas usam telas vivas em GSAP (inicio-ui.js), que mostram a ferramenta trabalhando.
 *
 * Um só WebGLRenderer; a cena é desenhada num pedaço da tela dele e copiada para o canvas 2D do palco. Só desenha com
 * o palco à vista e a aba aberta. Com "reduzir movimento", aparece parada no quadro completo. O botão "Pausar
 * animação" (o mesmo das telas vivas) para a cena. Sem WebGL, nada muda na página.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Sprite, SpriteMaterial, MeshStandardMaterial,
  MeshBasicMaterial, CylinderGeometry, BoxGeometry, EdgesGeometry, InstancedMesh, LineSegments, LineLoop, Line,
  LineBasicMaterial, BufferGeometry, Float32BufferAttribute, Object3D, Color, CanvasTexture,
  SRGBColorSpace, AdditiveBlending, HemisphereLight, DirectionalLight, PointLight, ACESFilmicToneMapping
} from "three";

// ------------------------------------------------------------------ cores da marca (sistema.css)
const COR = { floresta: 0x0f3431, verde: 0x0fa36b, verdeEscuro: 0x0a7a50, menta: 0x6fe0ae, mentaForte: 0x3fd49a, petroleo: 0x0f6b7e };

let REDUZ = false;
try { REDUZ = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue */ }
let TOQUE = false;
try { TOQUE = matchMedia("(pointer: coarse)").matches; } catch (e) { /* segue */ }
const DPR = Math.min(window.devicePixelRatio || 1, TOQUE ? 1.25 : 1.75);

// ------------------------------------------------------------------ utilidades
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const suave = (a, b, v) => { const t = lim((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const aprox = (atual, alvo, dt, k) => atual + (alvo - atual) * (1 - Math.exp(-k * dt));

function textura(w, h, desenhar) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  desenhar(c.getContext("2d"), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let TEX_BRILHO = null;
function texBrilho() {
  if (TEX_BRILHO) return TEX_BRILHO;
  TEX_BRILHO = textura(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  return TEX_BRILHO;
}
function brilho(cor, tam, opac) {
  const s = new Sprite(new SpriteMaterial({ map: texBrilho(), color: cor, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: opac == null ? 0.8 : opac }));
  s.scale.set(tam, tam, 1);
  return s;
}

function luzes(cena) {
  cena.add(new HemisphereLight(0xe6fff4, 0x061a18, 1.1));
  const d = new DirectionalLight(0xffffff, 2.2);
  d.position.set(2.5, 6, 5);
  cena.add(d);
  const p = new PointLight(COR.mentaForte, 18, 12, 2);
  p.position.set(-3.5, 1.2, 2.5);
  cena.add(p);
}

// ------------------------------------------------------------------ Biblioteca Jurídica: o Índice vivo
// de baixo para cima: Tribunais de Contas, Cortes superiores e controle, Procuradorias, Tribunais de Justiça, Normas
const CAMADAS = [
  { fichas: 22, raioPlaca: 1.02, raioTrilho: 1.92, vel: 0.06 },
  { fichas: 20, raioPlaca: 0.95, raioTrilho: 1.78, vel: -0.075 },
  { fichas: 18, raioPlaca: 0.88, raioTrilho: 1.64, vel: 0.09 },
  { fichas: 16, raioPlaca: 0.81, raioTrilho: 1.5, vel: -0.105 },
  { fichas: 14, raioPlaca: 0.74, raioTrilho: 1.36, vel: 0.12 }
];
const PASSO = 0.36;            // distância entre as placas
const ENTRADA = 1.6;           // segundos da montagem inicial

function circulo(raio, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(Math.cos(a) * raio, 0, Math.sin(a) * raio); }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}

function cenaBiblioteca() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 2, 0.1, 60);
  luzes(scene);
  const mundo = new Group();
  scene.add(mundo);

  // eixo de luz que atravessa a coluna e o brilho de fundo
  const halo = brilho(COR.menta, 4.2, 0.22);
  halo.position.set(0, 0.1, -0.6);
  const eixo = new Mesh(new CylinderGeometry(0.03, 0.03, PASSO * 5.6, 8, 1, true), new MeshBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.55, depthWrite: false }));
  mundo.add(halo, eixo);
  // anel de base, que assenta a coluna
  const base = new LineLoop(circulo(2.15, 96), new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.1 }));
  base.position.y = -PASSO * 2.9;
  mundo.add(base);

  const cartao = new BoxGeometry(0.105, 0.07, 0.01);
  const camadas = CAMADAS.map((c, i) => {
    const y = (i - 2) * PASSO;
    const g = new Group(); g.position.y = y;
    // placa cristalina sextavada, translúcida, com as arestas em menta
    const geo = new CylinderGeometry(c.raioPlaca, c.raioPlaca, 0.075, 6, 1);
    const mat = new MeshStandardMaterial({ color: i === 4 ? COR.petroleo : COR.verdeEscuro, emissive: COR.mentaForte, emissiveIntensity: 0.06, roughness: 0.22, metalness: 0.15, transparent: true, opacity: 0.5, depthWrite: false });
    const placa = new Mesh(geo, mat);
    placa.renderOrder = 2 + i;
    const arestas = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.6 }));
    arestas.renderOrder = 8 + i;
    const luzPlaca = brilho(COR.menta, 0.9, 0);
    g.add(placa, arestas, luzPlaca);
    // trilho em órbita com as fontes do tipo
    const orbita = new Group();
    const trilho = new LineLoop(circulo(c.raioTrilho, 128), new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.22 }));
    const fichas = new InstancedMesh(cartao, new MeshStandardMaterial({ color: 0xdff5ec, emissive: COR.menta, emissiveIntensity: 0.16, roughness: 0.5 }), c.fichas);
    const o = new Object3D(), ang = [];
    for (let k = 0; k < c.fichas; k++) {
      const a = (k / c.fichas) * Math.PI * 2 + i * 0.37;
      ang.push(a);
      o.position.set(Math.cos(a) * c.raioTrilho, 0, Math.sin(a) * c.raioTrilho);
      o.lookAt(0, 0, 0);
      o.updateMatrix();
      fichas.setMatrixAt(k, o.matrix);
      fichas.setColorAt(k, new Color(k % 6 === 0 ? COR.menta : (k % 2 ? 0xb9d8ce : 0xffffff)));
    }
    fichas.instanceMatrix.needsUpdate = true;
    orbita.add(trilho, fichas);
    g.add(orbita);
    mundo.add(g);
    return { c, g, y, placa, arestas, luzPlaca, orbita, ang, aceso: 0 };
  });

  // decisões: saem de uma ficha, fazem a curva pelo trilho e assentam na placa do seu tipo
  const P = TOQUE ? 10 : 16;
  const pulsos = [];
  for (let i = 0; i < P; i++) {
    const L = camadas[(i * 3) % 5];
    const s = brilho(i % 5 === 0 ? 0xffffff : COR.menta, 0.38, 0);
    L.orbita.add(s);
    pulsos.push({ s, L, a0: L.ang[(i * 7) % L.ang.length], fase: i / P, vel: 0.17 + (i % 4) * 0.025, ultimo: 0 });
  }

  return {
    scene, camera, tParado: 7.5,
    update(t, dt, p) {
      const ent = REDUZ ? 1 : suave(0, ENTRADA, t);
      // a coluna gira devagar; o mouse inclina o conjunto e desloca cada camada numa profundidade diferente
      mundo.rotation.y = 0.35 + t * 0.045 + p.tx * 0.28;
      mundo.rotation.x = p.ty * 0.08;
      mundo.position.y = (0.5 - p.prog) * 0.18;
      camadas.forEach((L, i) => {
        const nivel = i - 2;
        L.g.position.y = L.y * (1 + (1 - ent) * 1.6);
        L.g.position.x = p.tx * nivel * 0.05;
        L.g.position.z = p.ty * nivel * 0.04;
        L.orbita.rotation.y = t * L.c.vel;
        L.orbita.scale.setScalar(0.86 + 0.14 * ent);
        L.placa.rotation.y = -t * L.c.vel * 0.5;
        L.arestas.rotation.y = L.placa.rotation.y;
        L.placa.material.opacity = 0.5 * ent;
        L.arestas.material.opacity = 0.6 * ent;
        L.aceso = dt ? L.aceso * Math.exp(-dt * 2.2) : L.aceso;
        L.placa.material.emissiveIntensity = 0.06 + L.aceso * 0.55;
        L.luzPlaca.material.opacity = L.aceso * 0.7;
      });
      pulsos.forEach((k) => {
        const f = (k.fase + t * k.vel) % 1;
        const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        const r = k.L.c.raioTrilho * (1 - e * 0.94), a = k.a0 + e * 1.35;
        k.s.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
        k.s.material.opacity = ent * suave(0, 0.1, f) * (1 - suave(0.9, 1, f)) * 0.95;
        // chegou à placa: ela acende (só com a animação andando)
        if (dt && k.ultimo < 0.93 && f >= 0.93) k.L.aceso = 1;
        k.ultimo = f;
      });
      camera.position.set(0, 1.9, 6.2);
      camera.lookAt(0, -0.22, 0);
    }
  };
}


// ------------------------------------------------------------------ Calculadora: o equilíbrio do contrato
// Ciclo de 9 s: equilíbrio → o índice cai sobre os custos e a balança pende → o reajuste entra no preço e ela
// volta ao nível → as duas placas novas se apagam juntas (a balança segue nivelada) e o ciclo recomeça.
const CICLO = 9;
function cenaCalculadora() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 2, 0.1, 60);
  luzes(scene);
  const mundo = new Group();
  scene.add(mundo);
  const halo = brilho(COR.menta, 4.4, 0.2);
  halo.position.set(0, 0.25, -0.8);
  mundo.add(halo);

  const vidro = (cor, op) => new MeshStandardMaterial({ color: cor, emissive: COR.mentaForte, emissiveIntensity: 0.06, roughness: 0.22, metalness: 0.15, transparent: true, opacity: op, depthWrite: false });
  const aresta = (geo, op) => new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: op }));
  const peca = (geo, cor, op) => { const g = new Group(); g.add(new Mesh(geo, vidro(cor, op)), aresta(geo, 0.6)); return g; };

  // pé sextavado, coluna de luz e o fiel
  const pe = peca(new CylinderGeometry(0.62, 0.78, 0.12, 6), COR.verdeEscuro, 0.5);
  pe.position.y = -1.2;
  const coluna = new Mesh(new CylinderGeometry(0.035, 0.035, 2.0, 8), new MeshBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.5, depthWrite: false }));
  coluna.position.y = -0.2;
  const fiel = brilho(COR.menta, 0.5, 0.75);
  fiel.position.y = 0.82;
  mundo.add(pe, coluna, fiel);

  const braco = new Group();
  braco.position.y = 0.8;
  mundo.add(braco);
  braco.add(peca(new BoxGeometry(3.3, 0.05, 0.12), COR.verdeEscuro, 0.7));

  const placaG = (i) => new BoxGeometry(0.66 - i * 0.06, 0.07, 0.44 - i * 0.04);
  const pratos = [-1, 1].map((ld) => {
    const prato = new Group();
    prato.position.set(ld * 1.5, -0.8, 0);
    braco.add(prato);
    const fio = new BufferGeometry();
    fio.setAttribute("position", new Float32BufferAttribute([-0.42, 0.06, 0, 0, 0.8, 0, 0.42, 0.06, 0], 3));
    prato.add(new Line(fio, new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.35 })));
    const cor = ld < 0 ? COR.verdeEscuro : COR.petroleo;
    prato.add(peca(new CylinderGeometry(0.6, 0.6, 0.04, 6), cor, 0.5));
    for (let k = 0; k < 3; k++) { const pl = peca(placaG(k), cor, 0.62); pl.position.y = 0.07 + k * 0.1; prato.add(pl); }
    // a placa que chega: o reajuste (preço) ou o índice (custos)
    const nova = peca(placaG(3), ld < 0 ? COR.verde : COR.petroleo, 0.75);
    nova.position.y = 0.07 + 3 * 0.1;
    prato.add(nova);
    const luz = brilho(COR.menta, 0.95, 0);
    luz.position.y = 0.4;
    prato.add(luz);
    return { prato, nova, luz };
  });
  const [preco, custos] = pratos;
  const ficha = brilho(0xffffff, 0.34, 0);
  custos.prato.add(ficha);

  const vis = (g, v) => { g.visible = v > 0.01; g.children.forEach((m) => { m.material.opacity = (m.isLineSegments ? 0.6 : 0.75) * v; }); };
  return {
    scene, camera, tParado: 6.9,
    update(t, dt, p) {
      const c = t % CICLO;
      // índice: cai de cima até o prato dos custos (1,2 s a 2,4 s) e vira placa
      const queda = suave(1.2, 2.4, c);
      ficha.position.y = 1.5 - queda * 1.1;
      ficha.material.opacity = suave(0.9, 1.3, c) * (1 - suave(2.3, 2.6, c));
      const pesoCustos = suave(2.3, 2.7, c), pesoPreco = suave(4.6, 5.2, c), some = 1 - suave(7.8, 8.6, c);
      vis(custos.nova, pesoCustos * some);
      vis(preco.nova, pesoPreco * some);
      custos.nova.position.y = 0.37 + (1 - pesoCustos) * 0.25;
      preco.nova.position.y = 0.37 + (1 - pesoPreco) * 0.25;
      custos.luz.material.opacity = (suave(2.3, 2.6, c) - suave(2.9, 3.6, c)) * 0.8;
      preco.luz.material.opacity = (suave(4.6, 5.0, c) - suave(5.3, 6.0, c)) * 0.8;
      // o lado mais pesado desce: custos a mais pendem para a direita; o reajuste no preço nivela de novo
      const desnivel = pesoCustos * some - pesoPreco * some;
      const alvo = -0.11 * desnivel;
      braco.rotation.z = REDUZ ? 0 : alvo;
      pratos.forEach((x) => { x.prato.rotation.z = -braco.rotation.z; });
      mundo.rotation.y = -0.28 + p.tx * 0.22 + Math.sin(t * 0.25) * 0.05;
      mundo.rotation.x = p.ty * 0.06;
      mundo.position.y = (0.5 - p.prog) * 0.12;
      camera.position.set(0, 1.25, 6.4);
      camera.lookAt(0, -0.1, 0);
    }
  };
}

const CENAS = { biblioteca: cenaBiblioteca, calculadora: cenaCalculadora };

// ------------------------------------------------------------------ motor: um renderer para todas as cenas
let R = null, bufW = 0, bufH = 0, raf = 0, ult = 0, perdido = false;
const palcos = [];

// pausa compartilhada com as telas vivas (inicio-ui.js): botão "Pausar animação", lembrado neste navegador
const CHAVE_PAUSA = "lv-anim-pausa";
function pausado() { try { return localStorage.getItem(CHAVE_PAUSA) === "1"; } catch (e) { return false; } }
function parado() { return REDUZ || pausado(); }
function pausar(v) {
  if (window.LV_PAUSA) { window.LV_PAUSA.pausar(v); return; }
  try { if (v) localStorage.setItem(CHAVE_PAUSA, "1"); else localStorage.removeItem(CHAVE_PAUSA); } catch (e) { /* segue */ }
  window.dispatchEvent(new CustomEvent("lv-pausa", { detail: v }));
}
window.addEventListener("lv-pausa", () => {
  palcos.forEach((p) => { atualizarBotao(p); if (p.vis) desenhar(p, 0); });
  if (!parado()) acordar();
});
function atualizarBotao(p) {
  const v = pausado();
  p.botao.setAttribute("aria-pressed", v ? "true" : "false");
  p.botao.setAttribute("aria-label", v ? "Retomar animação" : "Pausar animação");
  p.botao.title = v ? "Retomar animação" : "Pausar animação";
}

function criarRenderer() {
  if (R) return !perdido;
  try {
    const c = document.createElement("canvas");
    const r = new WebGLRenderer({ canvas: c, antialias: true, alpha: true, powerPreference: "low-power" });
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = SRGBColorSpace;
    c.addEventListener("webglcontextlost", (e) => { e.preventDefault(); perdido = true; });
    // a placa de vídeo voltou: o three.js refaz os recursos; volta a desenhar
    c.addEventListener("webglcontextrestored", () => { perdido = false; palcos.forEach((p) => { if (p.vis) desenhar(p, 0); }); acordar(); });
    R = r;
    return true;
  } catch (e) {
    return false;
  }
}

function desenhar(p, dt) {
  const w = p.cv.width, h = p.cv.height;
  if (!w || !h || perdido) return;
  if (w > bufW || h > bufH) { bufW = Math.max(bufW, w); bufH = Math.max(bufH, h); R.setSize(bufW, bufH, false); }
  // mouse com mola; rolagem pela posição da seção na tela
  p.tx = aprox(p.tx, p.mx, dt || 1, 4);
  p.ty = aprox(p.ty, p.my, dt || 1, 4);
  if (!p.porMotion) {
    const r = p.el.getBoundingClientRect(), vh = window.innerHeight || 1;
    p.prog = lim((vh - r.top) / (vh + r.height), 0, 1);
  }
  p.cena.update(p.t, dt, p);
  R.setViewport(0, 0, w, h);
  R.setScissor(0, 0, w, h);
  R.setScissorTest(true);
  R.render(p.cena.scene, p.cena.camera);
  p.ctx.clearRect(0, 0, w, h);
  p.ctx.drawImage(R.domElement, 0, bufH - h, w, h, 0, 0, w, h);
}

function descartar(p) {
  try { p.ro && p.ro.disconnect(); p.io && p.io.disconnect(); p.cancelaRolagem && p.cancelaRolagem(); } catch (e) { /* segue */ }
  p.cena.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => { if (m.map && m.map !== TEX_BRILHO) m.map.dispose(); m.dispose(); });
  });
}
// palcos de páginas que o runtime já tirou da tela (o inicio.js chama a cada troca de página)
export function limpar() {
  for (let i = palcos.length - 1; i >= 0; i--) if (!palcos[i].el.isConnected) { descartar(palcos[i]); palcos.splice(i, 1); }
}

function laco(agora) {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (agora - ult) / 1000));
  ult = agora;
  limpar();
  if (parado()) return;
  let algum = false;
  palcos.forEach((p) => {
    if (!p.vis || document.hidden) return;
    algum = true;
    p.t += dt;
    desenhar(p, dt);
  });
  if (algum) raf = requestAnimationFrame(laco);
}
function acordar() {
  if (parado() || raf) return;
  ult = performance.now();
  raf = requestAnimationFrame(laco);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) acordar(); });

function medir(p) {
  const r = p.palco.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * DPR)), h = Math.max(1, Math.round(r.height * DPR));
  if (p.cv.width !== w || p.cv.height !== h) { p.cv.width = w; p.cv.height = h; }
  p.cena.camera.aspect = r.width / Math.max(1, r.height);
  // telas estreitas: afasta a câmera para a cena caber
  p.cena.camera.zoom = lim(p.cena.camera.aspect / 1.9, 0.72, 1);
  // em telas estreitas a câmera se afasta: os rótulos crescem na mesma medida para continuar legíveis
  const f = 1 + (1 - p.cena.camera.zoom) * 1.4;
  p.cena.scene.traverse((o) => { if (o.isSprite && o.userData.base) o.scale.copy(o.userData.base).multiplyScalar(f); });
  p.cena.camera.updateProjectionMatrix();
  if (parado()) desenhar(p, 0);
}

export async function montar(el, tipo) {
  if (!el || el.__lv3d || !CENAS[tipo]) return;
  el.__lv3d = true;
  limpar();
  if (!criarRenderer()) return;
  try { await Promise.race([document.fonts && document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]); } catch (e) { /* segue */ }
  if (!el.isConnected) return;
  let cena;
  try { cena = CENAS[tipo](); } catch (e) { if (window.console) console.warn("inicio3d", e); return; }

  const palco = document.createElement("div");
  palco.className = "lv3d-palco";
  palco.setAttribute("aria-hidden", "true");
  const cv = document.createElement("canvas");
  palco.appendChild(cv);
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "lv3d-pausa";
  botao.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path class="p" d="M5 3.5v9M11 3.5v9"/><path class="r" d="M5 3.2l8 4.8-8 4.8z"/></svg>';
  botao.addEventListener("click", () => pausar(!pausado()));
  el.insertBefore(palco, el.firstChild);
  palco.insertAdjacentElement("afterend", botao);
  el.classList.add("lv3d-on", "lv3d-" + tipo);

  // com "reduzir movimento", a cena começa no quadro mais completo; pausada, para onde estiver
  const p = { el, palco, cv, botao, ctx: cv.getContext("2d"), cena, t: REDUZ ? cena.tParado : (pausado() ? cena.tParado : 0), vis: false, prog: 0.5, mx: 0, my: 0, tx: 0, ty: 0 };
  palcos.push(p);
  atualizarBotao(p);
  if (REDUZ) botao.hidden = true;

  const M = window.Motion;
  if (M && M.scroll) {
    try { p.cancelaRolagem = M.scroll((v) => { p.prog = v; }, { target: el, offset: ["start end", "end start"] }); p.porMotion = true; } catch (e) { /* segue */ }
  }
  if (!REDUZ && !TOQUE) {
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      p.mx = lim(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      p.my = lim(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    });
    el.addEventListener("pointerleave", () => { p.mx = 0; p.my = 0; });
  }
  p.ro = new ResizeObserver(() => medir(p));
  p.ro.observe(palco);
  medir(p);
  p.io = new IntersectionObserver((es) => {
    const v = es[es.length - 1].isIntersecting;
    p.vis = v;
    if (v) { if (parado()) desenhar(p, 0); else acordar(); }
  }, { rootMargin: "60px 0px" });
  p.io.observe(palco);
}
