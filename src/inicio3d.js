/* Licitacon — cenas 3D da página inicial (Three.js), uma por ferramenta.
 *
 * Fonte deste arquivo: src/inicio3d.js. O site carrega o pacote gerado na raiz (inicio3d.js), montado por
 * scripts/3d/montar.mjs com o Three.js e só com as partes usadas. O inicio.js baixa o pacote quando a primeira
 * cena chega perto da tela e chama montar(elemento, tipo) para cada lugar marcado com data-lv3d="…":
 *   parecer     — tomografia (coral): páginas do edital empilhadas, cortadas por um plano; achados viram alvos com mira
 *   elaborador  — letras de luz (azul): partículas soltas se juntam formando ETP, TR e Projeto Básico
 *   calculadora — lingotes de ouro: empilham mês a mês na altura do IPCA, até o reajuste do posto
 *   gestao      — espiral do tempo (ciano): 12 meses em hélice, contratos com rastro acendendo os portais de prazo
 *   biblioteca  — 90 fontes oficiais em volta do acervo, com decisões viajando até ele (menta)
 *   comunidade  — fios de conversa (violeta): perguntas sobem e a resposta oficial desce por todos os fios
 * Cada cena tem cor, material e movimento próprios; o painel de cada uma também muda de tom (inicio.css).
 *
 * Um só WebGLRenderer para a página inteira (o celular aguenta poucos contextos): cada cena é desenhada num
 * pedaço da tela dele e copiada para o canvas 2D da sua seção. Só desenha o que está na tela e com a aba aberta.
 * Com "reduzir movimento", cada cena aparece parada no seu quadro mais completo. Sem WebGL, nada muda na página.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Sprite, SpriteMaterial, MeshStandardMaterial,
  MeshBasicMaterial, PlaneGeometry, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry,
  CapsuleGeometry, IcosahedronGeometry, TubeGeometry, CatmullRomCurve3, InstancedMesh, LineSegments,
  LineBasicMaterial, BufferGeometry, Float32BufferAttribute, Object3D, Vector3, Color, CanvasTexture,
  SRGBColorSpace, AdditiveBlending, HemisphereLight, Points, PointsMaterial, BufferAttribute, Line, PMREMGenerator, DirectionalLight, PointLight, ACESFilmicToneMapping, DoubleSide
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ------------------------------------------------------------------ cores da marca
const COR = {
  fundo: 0x0a2826, verde: 0x0fa36b, menta: 0x6fe0ae, mentaForte: 0x3fd49a, papel: 0xf4f7f6,
  alta: 0xf0716b, media: 0xf2b544, baixa: 0x5bc0da, word: 0x3b7be8, pdf: 0xe5484d
};
const CSS = { alta: "#F0716B", media: "#F2B544", baixa: "#5BC0DA", menta: "#6FE0AE", fundo: "#0A2826" };
const FONTE = "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif";

let REDUZ = false;
try { REDUZ = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue */ }
let TOQUE = false;
try { TOQUE = matchMedia("(pointer: coarse)").matches; } catch (e) { /* segue */ }
const DPR = Math.min(window.devicePixelRatio || 1, TOQUE ? 1.5 : 1.75);

// ------------------------------------------------------------------ utilidades
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const suave = (a, b, v) => { const t = lim((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const saiCubica = (t) => 1 - Math.pow(1 - lim(t, 0, 1), 3);
const saiVolta = (t) => { t = lim(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const quique = (t) => {
  t = lim(t, 0, 1);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const aprox = (atual, alvo, dt, k) => atual + (alvo - atual) * (1 - Math.exp(-k * dt));

function textura(w, h, desenhar) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  desenhar(g, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function caixa(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
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

// Etiqueta em pílula, sempre de frente para a câmera.
function rotulo(texto, op) {
  op = op || {};
  const tam = 40, pad = 22, peso = op.peso || 800;
  const medir = document.createElement("canvas").getContext("2d");
  medir.font = peso + " " + tam + "px " + FONTE;
  const larg = Math.ceil(medir.measureText(texto).width) + pad * 2 + (op.ponto ? 30 : 0);
  const alt = Math.round(tam * 1.75);
  const tex = textura(larg, alt, (g, w, h) => {
    caixa(g, 1, 1, w - 2, h - 2, h / 2);
    g.fillStyle = op.fundo || "rgba(7,30,28,0.88)"; g.fill();
    if (op.borda) { g.lineWidth = 3; g.strokeStyle = op.borda; g.stroke(); }
    let x = pad;
    if (op.ponto) { g.beginPath(); g.arc(x + 9, h / 2, 9, 0, Math.PI * 2); g.fillStyle = op.ponto; g.fill(); x += 30; }
    g.font = peso + " " + tam + "px " + FONTE;
    g.fillStyle = op.cor || "#fff"; g.textBaseline = "middle";
    g.fillText(texto, x, h / 2 + 2);
  });
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: op.depthTest !== false }));
  const a = op.altura || 0.3;
  s.scale.set(a * larg / alt, a, 1);
  s.userData.base = s.scale.clone();
  return s;
}

function luzes(cena, forca) {
  forca = forca || 1;
  cena.add(new HemisphereLight(0xe6fff4, 0x0a2826, 1.25 * forca));
  const d = new DirectionalLight(0xffffff, 2.1 * forca);
  d.position.set(3, 5, 6);
  cena.add(d);
  const p = new PointLight(COR.mentaForte, 22 * forca, 14, 2);
  p.position.set(-4, 1.5, 3);
  cena.add(p);
}

function base(fov) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov || 34, 2, 0.1, 60);
  camera.position.set(0, 0, 9);
  luzes(scene);
  return { scene, camera };
}

// Câmera que olha para "alvo" e se inclina com o mouse (tx, ty) e com a rolagem (prog 0..1).
function mirar(cam, p, raio, alvo, op) {
  op = op || {};
  const giroX = (op.giroX == null ? 0.22 : op.giroX) * p.tx + (op.rolagem == null ? 0.35 : op.rolagem) * (p.prog - 0.5);
  const giroY = (op.giroY == null ? 0.12 : op.giroY) * p.ty;
  const ang0 = op.ang || 0, alt0 = op.alt || 0;
  const a = ang0 + giroX, e = alt0 + giroY;
  cam.position.set(alvo.x + raio * Math.sin(a) * Math.cos(e), alvo.y + raio * Math.sin(e), alvo.z + raio * Math.cos(a) * Math.cos(e));
  cam.lookAt(alvo);
}

// ------------------------------------------------------------------ peças comuns
let TEX_PONTO = null, TEX_ANEL = null, AMBIENTE = null;
function texPonto() {
  if (TEX_PONTO) return TEX_PONTO;
  TEX_PONTO = textura(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.32, "rgba(255,255,255,0.85)");
    r.addColorStop(0.6, "rgba(255,255,255,0.18)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  return TEX_PONTO;
}
function texAnel() {
  if (TEX_ANEL) return TEX_ANEL;
  TEX_ANEL = textura(128, 128, (g, w) => {
    g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
    g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,1)"; g.shadowColor = "rgba(255,255,255,1)"; g.shadowBlur = 8; g.stroke();
  });
  return TEX_ANEL;
}
function nuvem(n, tam) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(n * 3), 3));
  return new Points(g, new PointsMaterial({ size: tam, map: texPonto(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
}
function segmentos(pontos, cor, opac) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pontos, 3));
  return new LineSegments(g, new LineBasicMaterial({ color: cor, transparent: true, opacity: opac, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
}
const tmpC = new Color();
function pintar(cores, i, hex, k) { tmpC.set(hex); cores[i * 3] = tmpC.r * k; cores[i * 3 + 1] = tmpC.g * k; cores[i * 3 + 2] = tmpC.b * k; }
function aleatorio(semente) { let s = semente; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Etiqueta de painel (HUD): texto com cantos de mira, sem fundo cheio. Linha de baixo opcional, menor.
function hud(texto, cor, op) {
  op = op || {};
  const tam = 38, sub = op.sub || "", pad = 26;
  const m = document.createElement("canvas").getContext("2d");
  m.font = "800 " + tam + "px " + FONTE;
  let larg = m.measureText(texto).width;
  if (sub) { m.font = "600 " + Math.round(tam * 0.62) + "px " + FONTE; larg = Math.max(larg, m.measureText(sub).width); }
  const W = Math.ceil(larg) + pad * 2, H = Math.round(tam * (sub ? 2.55 : 1.8));
  const tex = textura(W, H, (g, w, h) => {
    g.fillStyle = "rgba(4,10,14,0.55)"; caixa(g, 0, 0, w, h, 8); g.fill();
    g.strokeStyle = cor; g.lineWidth = 3; const c = 14;
    [[2, 2, 1, 1], [w - 2, 2, -1, 1], [2, h - 2, 1, -1], [w - 2, h - 2, -1, -1]].forEach(([x, y, dx, dy]) => {
      g.beginPath(); g.moveTo(x + dx * c, y); g.lineTo(x, y); g.lineTo(x, y + dy * c); g.stroke();
    });
    g.textBaseline = "middle"; g.fillStyle = op.corTexto || cor;
    g.font = "800 " + tam + "px " + FONTE; g.fillText(texto, pad, sub ? h * 0.36 : h / 2 + 2);
    if (sub) { g.fillStyle = "rgba(255,255,255,0.78)"; g.font = "600 " + Math.round(tam * 0.62) + "px " + FONTE; g.fillText(sub, pad, h * 0.74); }
  });
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  const a = op.altura || 0.36;
  s.scale.set(a * W / H, a, 1);
  s.userData.base = s.scale.clone();
  s.renderOrder = 10;
  return s;
}

// Mantém uma etiqueta inteira dentro do painel (no celular a câmera se afasta e as pontas cortariam).
function dentro(et, cam) {
  const dist = Math.max(1, cam.position.distanceTo(et.position));
  const meiaH = Math.tan((cam.fov * Math.PI) / 360) * dist / (cam.zoom || 1), meiaW = meiaH * cam.aspect;
  const m = Math.max(0, meiaW - et.scale.x / 2 - 0.12);
  et.position.x = lim(et.position.x, -m, m);
}

// ------------------------------------------------------------------ 1. Parecerista — tomografia do edital (coral)
// As páginas do edital ficam empilhadas no espaço; um plano de varredura atravessa a pilha. Cada página acende
// quando é cortada e, onde há problema, aparece um alvo com mira na cor da gravidade.
function cenaParecer() {
  const { scene, camera } = base(34);
  const CORAL = 0xff7a6b;
  const pilha = new Group();
  const PW = 2.0, PH = 2.6, NP = 7, DZ = 0.36;
  const texPag = textura(400, 520, (g, w, h) => {
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 15; i++) { const l = [0.9, 0.7, 0.95, 0.6, 0.85][i % 5]; caixa(g, 34, 50 + i * 30, (w - 68) * l, 7, 3); g.fill(); }
  });
  const paginas = [];
  for (let i = 0; i < NP; i++) {
    const m = new Mesh(new PlaneGeometry(PW, PH), new MeshBasicMaterial({ map: texPag, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false }));
    m.position.z = (i - (NP - 1) / 2) * DZ;
    pilha.add(m);
    paginas.push(m);
  }
  // plano de varredura
  const corte = new Group();
  corte.add(new Mesh(new PlaneGeometry(PW + 0.5, PH + 0.5), new MeshBasicMaterial({ color: CORAL, transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false })));
  const bx = (PW + 0.5) / 2, by = (PH + 0.5) / 2;
  corte.add(segmentos([-bx, by, 0, bx, by, 0, bx, by, 0, bx, -by, 0, bx, -by, 0, -bx, -by, 0, -bx, -by, 0, -bx, by, 0], CORAL, 0.95));
  pilha.add(corte);
  // achados: página, posição, cor, gravidade, dispositivo
  const ACH = [[1, -0.45, 0.65, COR.alta, "ALTA", "art. 82, § 1º", CSS.alta], [3, 0.5, -0.1, COR.media, "MÉDIA", "art. 86, § 8º", CSS.media], [5, -0.2, -0.75, COR.baixa, "BAIXA", "erro material", CSS.baixa]].map(([pg, x, y, cor, nome, sub, css], k) => {
    const g = new Group();
    g.position.set(x, y, paginas[pg].position.z + 0.01);
    const luz = brilho(cor, 0.9, 0.9);
    const mira = new Sprite(new SpriteMaterial({ map: texAnel(), color: cor, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    mira.scale.setScalar(0.5);
    const cruz = segmentos([-0.42, 0, 0, -0.26, 0, 0, 0.26, 0, 0, 0.42, 0, 0, 0, -0.42, 0, 0, -0.26, 0, 0, 0.26, 0, 0, 0.42, 0], cor, 0.9);
    g.add(luz, mira, cruz);
    pilha.add(g);
    const et = hud(nome, css, { sub, altura: 0.5 });
    scene.add(et);
    const fio = segmentos([0, 0, 0, 0, 0, 0], cor, 0.6);
    scene.add(fio);
    return { pg, g, mira, cruz, luz, et, fio, lado: k === 1 ? 1 : -1, v: 0, mundo: new Vector3() };
  });
  pilha.rotation.set(-0.12, -0.72, 0);
  pilha.position.set(-0.2, 0.05, 0);
  scene.add(pilha);
  const ciclo = 8, TV = 3.8, z0 = paginas[0].position.z - 0.35, z1 = paginas[NP - 1].position.z + 0.35;
  return {
    scene, camera, tParado: 6.0,
    update(t, dt, p) {
      const c = t % ciclo, some = suave(7.0, 7.9, c);
      const zc = z0 + (z1 - z0) * suave(0.2, TV, c);
      corte.position.z = zc;
      corte.visible = c < TV + 0.3 && c > 0.1;
      paginas.forEach((m, i) => {
        const d = Math.abs(m.position.z - zc);
        const lido = m.position.z < zc ? 0.06 : 0;
        m.material.opacity = 0.14 + lido + (corte.visible ? 0.6 * Math.exp(-d * d / 0.02) : 0);
        m.material.color.setHex(d < 0.2 && corte.visible ? 0xffd0c8 : 0xffffff);
      });
      pilha.updateMatrixWorld();
      ACH.forEach((a, k) => {
        const passou = zc > paginas[a.pg].position.z || c > TV;
        const alvo = passou && c < 7.9 ? 1 : 0;
        a.v = aprox(a.v, alvo * (1 - some), dt || 1, 6);
        a.g.visible = a.v > 0.01;
        a.mira.scale.setScalar(0.55 + 0.9 * (1 - a.v) + 0.06 * Math.sin(t * 5 + k));
        a.mira.material.opacity = a.v;
        a.cruz.material.opacity = 0.9 * a.v;
        a.cruz.rotation.z = t * 0.8;
        a.luz.material.opacity = 0.9 * a.v;
        a.mundo.set(0, 0, 0); a.g.localToWorld(a.mundo);
        a.et.position.set(a.mundo.x + a.lado * 1.55, a.mundo.y + 0.12, a.mundo.z + 0.3);
        dentro(a.et, camera);
        a.et.material.opacity = a.v;
        const F = a.fio.geometry.attributes.position.array;
        F.set([a.mundo.x, a.mundo.y, a.mundo.z, a.et.position.x - a.lado * a.et.scale.x / 2, a.et.position.y, a.et.position.z]);
        a.fio.geometry.attributes.position.needsUpdate = true;
        a.fio.material.opacity = 0.6 * a.v;
      });
      pilha.rotation.y = -0.72 + 0.08 * Math.sin(t * 0.35);
      mirar(camera, p, 8.4, new Vector3(0, 0, 0), { alt: 0.14 });
    }
  };
}

// ------------------------------------------------------------------ 2. Elaborador — letras de luz (azul)
// Milhares de partículas giram soltas (as respostas) e se juntam formando o documento da vez: ETP, TR, Projeto Básico.
function amostrarTexto(texto, n, alturaMundo, larguraMax, rnd) {
  const fs = 150, c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = "800 " + fs + "px " + FONTE;
  const wpx = Math.ceil(g.measureText(texto).width) + 20, hpx = Math.round(fs * 1.25);
  c.width = wpx; c.height = hpx;
  g.font = "800 " + fs + "px " + FONTE; g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(texto, 10, hpx / 2);
  const d = g.getImageData(0, 0, wpx, hpx).data, cand = [];
  for (let y = 0; y < hpx; y += 3) for (let x = 0; x < wpx; x += 3) if (d[(y * wpx + x) * 4 + 3] > 140) cand.push([x, y]);
  const esc = Math.min(alturaMundo / fs, larguraMax / wpx), out = [];
  for (let i = 0; i < n; i++) {
    const q = cand[Math.floor(rnd() * cand.length)] || [wpx / 2, hpx / 2];
    out.push(new Vector3((q[0] - wpx / 2) * esc + (rnd() - 0.5) * 0.02, (hpx / 2 - q[1]) * esc + (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.18));
  }
  return out;
}
function cenaElaborador() {
  const { scene, camera } = base(34);
  const AZUL = 0x6ea8ff;
  const N = TOQUE ? 1500 : 2400, rnd = aleatorio(5);
  const DOCS = [["ETP", "Estudo Técnico Preliminar"], ["TR", "Termo de Referência"], ["Projeto Básico", "obras e serviços de engenharia"]];
  const alvos = DOCS.map(([w]) => amostrarTexto(w, N, w.length > 4 ? 1.25 : 2.1, 5.6, rnd));
  const pontos = nuvem(N, 0.085);
  const P = pontos.geometry.attributes.position.array, C = pontos.geometry.attributes.color.array;
  const solto = [];
  for (let i = 0; i < N; i++) solto.push({ r: 0.6 + rnd() * 2.4, a: rnd() * Math.PI * 2, y: (rnd() - 0.5) * 2.6, v: 0.25 + rnd() * 0.5, atraso: rnd() * 0.5, tom: rnd() });
  scene.add(pontos);
  const subs = DOCS.map(([, s]) => { const e = hud(s, "#9cc3ff", { altura: 0.36 }); e.position.set(0, -1.3, 0.4); e.material.opacity = 0; scene.add(e); return e; });
  const FASE = 3.6, ciclo = FASE * DOCS.length;
  const sp = new Vector3();
  return {
    scene, camera, tParado: 2.6,
    update(t, dt, p) {
      const c = t % ciclo, k = Math.floor(c / FASE), u = c - k * FASE, ant = (k + DOCS.length - 1) % DOCS.length;
      for (let i = 0; i < N; i++) {
        const s = solto[i], ang = s.a + t * s.v;
        sp.set(Math.cos(ang) * s.r, s.y + 0.15 * Math.sin(t * 0.7 + i), Math.sin(ang) * s.r * 0.55);
        const ida = saiCubica(lim((u - 0.0) / 0.8, 0, 1));           // a palavra anterior se desfaz
        const volta = saiCubica(lim((u - 0.9 - s.atraso) / 1.0, 0, 1)); // e a nova se forma
        const a = alvos[ant][i], b = alvos[k][i];
        let x = a.x + (sp.x - a.x) * ida, y = a.y + (sp.y - a.y) * ida, z = a.z + (sp.z - a.z) * ida;
        x += (b.x - x) * volta; y += (b.y - y) * volta; z += (b.z - z) * volta;
        P[i * 3] = x; P[i * 3 + 1] = y + 0.15; P[i * 3 + 2] = z;
        const brilhoP = 1.0 + 1.5 * volta;
        pintar(C, i, s.tom > 0.85 ? 0xffffff : AZUL, brilhoP);
      }
      pontos.geometry.attributes.position.needsUpdate = true;
      pontos.geometry.attributes.color.needsUpdate = true;
      subs.forEach((e, j) => { e.material.opacity = j === k ? suave(1.7, 2.2, u) * (1 - suave(FASE - 0.4, FASE, u)) : 0; });
      pontos.rotation.y = 0.12 * Math.sin(t * 0.4) + p.tx * 0.25;
      pontos.rotation.x = p.ty * 0.12;
      camera.position.set(0, 0, 7.4); camera.lookAt(0, 0, 0);
    }
  };
}

// ------------------------------------------------------------------ 3. Calculadora — lingotes de ouro (dourado)
// Mês a mês, lingotes caem e empilham na altura do IPCA do mês; no fim, o reajuste aplicado ao valor do posto.
function cenaCalculadora() {
  const { scene, camera } = base(30);
  if (!AMBIENTE) { const pm = new PMREMGenerator(R); AMBIENTE = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  scene.environment = AMBIENTE;
  const IPCA = [0.42, 0.31, 0.38, 0.43, 0.26, 0.24, 0.21, 0.44, 0.48, 0.56, 0.62, 0.39];
  const MESES = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set"];
  const LH = 0.13, colX = (i) => -2.48 + i * 0.45;
  const pilhas = IPCA.map((v) => Math.max(2, Math.round(v * 14)));
  const total = pilhas.reduce((a, b) => a + b, 0);
  const ouro = new InstancedMesh(new RoundedBoxGeometry(0.36, LH * 0.9, 0.22, 2, 0.025), new MeshStandardMaterial({ color: 0xe8b04a, metalness: 1, roughness: 0.26, envMapIntensity: 1.3 }), total);
  const quem = [];
  pilhas.forEach((n, i) => { for (let j = 0; j < n; j++) quem.push([i, j]); });
  ouro.frustumCulled = false;
  scene.add(ouro);
  // reflexo dourado no chão, sem piso sólido
  const reflexo = brilho(0xf2b544, 1, 0.22); reflexo.scale.set(7, 1.1, 1); reflexo.position.set(0, -0.12, 0); scene.add(reflexo);
  scene.add(segmentos((() => { const o = []; for (let i = 0; i < 12; i++) o.push(colX(i) - 0.2, -LH / 2 + 0.002, 0.2, colX(i) + 0.2, -LH / 2 + 0.002, 0.2); return o; })(), 0xf2b544, 0.5));
  const meses = [0, 3, 6, 9, 11].map((i) => { const e = rotulo(MESES[i], { altura: 0.22, fundo: "rgba(20,14,4,0.75)", cor: "#F2D49A", peso: 700 }); e.position.set(colX(i), -0.35, 0.45); scene.add(e); return e; });
  void meses;
  const etIdx = hud("IPCA · 12 meses", "#F2B544", { altura: 0.36 }); etIdx.position.set(-1.9, 1.75, 0); scene.add(etIdx);
  const etFim = hud("+4,87%", "#F2B544", { sub: "posto: R$ 6.952,66", altura: 0.62 }); scene.add(etFim);
  const brilhoTopo = brilho(0xffd27a, 1.4, 0); scene.add(brilhoTopo);
  const o = new Object3D(), ciclo = 9, T0 = 0.3, PASSO = 0.32;
  return {
    scene, camera, tParado: 6.5,
    update(t, dt, p) {
      const c = t % ciclo, some = suave(8.1, 8.8, c);
      let topoUlt = 0;
      quem.forEach(([i, j], k) => {
        const t0 = T0 + i * PASSO + j * 0.05;
        const v = lim((c - t0) / 0.45, 0, 1);
        const y = j * LH + (1 - quique(v)) * 2.2 + some * 0.0;
        o.position.set(colX(i) + (j % 2 ? 0.015 : -0.015), v > 0 ? y : -50, 0);
        o.rotation.set(0, (j % 2 ? 0.06 : -0.04) + (1 - v) * 0.8, 0);
        o.scale.setScalar(Math.max(0.001, 1 - some));
        o.updateMatrix();
        ouro.setMatrixAt(k, o.matrix);
        if (i === 11 && v > 0) topoUlt = Math.max(topoUlt, y);
      });
      ouro.instanceMatrix.needsUpdate = true;
      const fim = suave(T0 + 12 * PASSO + 0.5, T0 + 12 * PASSO + 1.0, c) * (1 - some);
      etFim.material.opacity = fim;
      etFim.position.set(1.35, 1.7 + 0.12 * (1 - fim), 0.2);
      etIdx.material.opacity = 1 - some;
      brilhoTopo.position.set(colX(11), topoUlt + 0.25, 0.1);
      brilhoTopo.material.opacity = 0.7 * fim;
      mirar(camera, p, 9.4, new Vector3(0, 0.55, 0), { alt: 0.3, ang: -0.32 + 0.12 * Math.sin(t * 0.25), rolagem: 0.3 });
    }
  };
}

// ------------------------------------------------------------------ 4. Gestão Contratual — espiral do tempo (ciano)
// Os 12 meses sobem em hélice. Cada contrato percorre a espiral deixando rastro; ao chegar a um portal de prazo,
// o portal acende e mostra o que vence.
function cenaGestao() {
  const { scene, camera } = base(34);
  const CIANO = 0x5bd6f0;
  const R0 = 1.75, VOLTAS = 1.15, Y0 = -1.25, Y1 = 1.45;
  const ponto = (u, v) => { const a = u * Math.PI * 2 * VOLTAS - 0.6; return (v || new Vector3()).set(Math.cos(a) * R0, Y0 + u * (Y1 - Y0), Math.sin(a) * R0); };
  const amostras = []; for (let i = 0; i <= 120; i++) amostras.push(ponto(i / 120));
  const helice = new Group();
  const curva = new CatmullRomCurve3(amostras);
  helice.add(new Mesh(new TubeGeometry(curva, 240, 0.022, 8, false), new MeshBasicMaterial({ color: CIANO, transparent: true, opacity: 0.55, toneMapped: false })));
  // eixo e meses
  helice.add(segmentos([0, Y0 - 0.2, 0, 0, Y1 + 0.2, 0], CIANO, 0.18));
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], marcas = [];
  MESES.forEach((m, i) => {
    const q = ponto((i + 0.5) / 12);
    marcas.push(0, q.y, 0, q.x, q.y, q.z);
    if (i % 3 === 0) { const e = rotulo(m, { altura: 0.2, fundo: "rgba(4,18,24,0.75)", cor: "#A9E6F4", peso: 700 }); e.position.copy(q).multiplyScalar(1.18); e.position.y = q.y; helice.add(e); }
  });
  helice.add(segmentos(marcas, CIANO, 0.12));
  // portais de prazo
  const PORTAIS = [[0.22, COR.media, "Reajuste", "Vigilância · 018/2024", CSS.media], [0.55, COR.baixa, "Repactuação", "Limpeza · 025/2025", CSS.baixa], [0.84, COR.menta, "Prorrogação", "Manutenção · 007/2023", CSS.menta]].map(([u, cor, nome, sub, css]) => {
    const pos = ponto(u), tan = curva.getTangentAt(u);
    const anel = new Mesh(new TorusGeometry(0.24, 0.025, 10, 40), new MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.7, toneMapped: false }));
    anel.position.copy(pos); anel.lookAt(pos.clone().add(tan));
    const luz = brilho(cor, 1.1, 0); luz.position.copy(pos);
    helice.add(anel, luz);
    const et = hud(nome, css, { sub, altura: 0.48 }); et.material.opacity = 0; scene.add(et);
    return { u, anel, luz, et, calor: 0, pos, mundo: new Vector3() };
  });
  // contratos com rastro
  const RASTRO = 26, CONTR = [[0.0, 0.085, CIANO], [0.36, 0.07, COR.media], [0.7, 0.078, COR.alta]];
  const rastro = nuvem(CONTR.length * RASTRO, 0.13);
  const RP = rastro.geometry.attributes.position.array, RC = rastro.geometry.attributes.color.array;
  helice.add(rastro);
  const cabecas = CONTR.map(([, , cor]) => { const s = brilho(cor, 0.5, 0.95); helice.add(s); return s; });
  scene.add(helice);
  const tmp = new Vector3();
  return {
    scene, camera, tParado: 3.1,
    update(t, dt, p) {
      PORTAIS.forEach((g) => { g.alvo = 0; });
      CONTR.forEach(([u0, vel, cor], k) => {
        const u = (u0 + t * vel) % 1;
        ponto(u, cabecas[k].position);
        cabecas[k].material.opacity = suave(0, 0.03, u) * (1 - suave(0.97, 1, u));
        for (let j = 0; j < RASTRO; j++) {
          const uj = u - j * 0.006, idx = k * RASTRO + j;
          ponto(Math.max(0, uj), tmp);
          RP[idx * 3] = tmp.x; RP[idx * 3 + 1] = tmp.y; RP[idx * 3 + 2] = tmp.z;
          pintar(RC, idx, cor, uj < 0 ? 0 : Math.pow(1 - j / RASTRO, 1.6) * 1.1 * cabecas[k].material.opacity);
        }
        PORTAIS.forEach((g) => { const d = u - g.u; if (d > -0.015 && d < 0.09) g.alvo = 1; });
      });
      rastro.geometry.attributes.position.needsUpdate = true;
      rastro.geometry.attributes.color.needsUpdate = true;
      helice.rotation.y = t * 0.16 + p.tx * 0.4;
      helice.updateMatrixWorld();
      PORTAIS.forEach((g, i) => {
        g.calor = REDUZ ? (i === 0 ? 1 : 0) : aprox(g.calor, g.alvo, dt || 1, 5);
        g.anel.scale.setScalar(1 + g.calor * 0.6);
        g.luz.material.opacity = g.calor * 0.9;
        g.mundo.copy(g.pos); helice.localToWorld(g.mundo);
        g.et.position.set(g.mundo.x + (g.mundo.x > 0 ? 1.0 : -1.0), g.mundo.y + 0.35, g.mundo.z + 0.4);
        dentro(g.et, camera);
        g.et.material.opacity = g.calor;
      });
      mirar(camera, p, 8.6, new Vector3(0, 0.05, 0), { alt: 0.2, giroX: 0.1, rolagem: 0.2 });
    }
  };
}

// ------------------------------------------------------------------ 5. Biblioteca Jurídica
function cenaBiblioteca() {
  const { scene, camera } = base(34);
  const mundo = new Group();
  const nucleo = new Mesh(new IcosahedronGeometry(0.5, 1), new MeshStandardMaterial({ color: COR.verde, emissive: COR.mentaForte, emissiveIntensity: 0.5, roughness: 0.3, flatShading: true }));
  const casca = new Mesh(new IcosahedronGeometry(0.62, 1), new MeshBasicMaterial({ color: COR.menta, wireframe: true, transparent: true, opacity: 0.35 }));
  const halo = brilho(COR.menta, 2.6, 0.55);
  mundo.add(nucleo, casca, halo);
  const N = 90, R = 2.15, nos = [];
  const inst = new InstancedMesh(new SphereGeometry(0.055, 12, 8), new MeshStandardMaterial({ color: 0xffffff, emissive: COR.menta, emissiveIntensity: 0.35, roughness: 0.4 }), N);
  const o = new Object3D(), linhas = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
    const v = new Vector3(Math.cos(th) * r * R, y * R * 0.82, Math.sin(th) * r * R);
    nos.push(v);
    o.position.copy(v); o.scale.setScalar(i % 9 === 0 ? 1.6 : 1); o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
    inst.setColorAt(i, new Color(i % 9 === 0 ? COR.menta : 0xffffff));
    linhas.push(v.x, v.y, v.z, v.x * 0.25, v.y * 0.25, v.z * 0.25);
  }
  inst.instanceMatrix.needsUpdate = true;
  const gl = new BufferGeometry(); gl.setAttribute("position", new Float32BufferAttribute(linhas, 3));
  const raios = new LineSegments(gl, new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.13 }));
  mundo.add(inst, raios);
  // decisões chegando ao acervo
  const P = TOQUE ? 14 : 22;
  const pulsos = [];
  for (let i = 0; i < P; i++) {
    const s = brilho(i % 4 === 0 ? COR.media : COR.menta, 0.32, 0.95);
    mundo.add(s);
    pulsos.push({ s, de: nos[(i * 37) % N], fase: i / P, vel: 0.28 + (i % 5) * 0.04 });
  }
  scene.add(mundo);
  const et = rotulo("90 fontes → o acervo, nos dias úteis", { altura: 0.36, borda: CSS.menta, depthTest: false });
  et.position.set(0, -2.15, 0.6);
  scene.add(et);
  return {
    scene, camera, tParado: 2.0,
    update(t, dt, p) {
      mundo.rotation.y = t * 0.16 + p.tx * 0.5;
      mundo.rotation.x = -0.12 + p.ty * 0.25 + (p.prog - 0.5) * 0.4;
      casca.rotation.y = -t * 0.3;
      nucleo.rotation.x = t * 0.2;
      const pul = 1 + 0.06 * Math.sin(t * 3);
      nucleo.scale.setScalar(pul);
      pulsos.forEach((k) => {
        const f = (k.fase + t * k.vel) % 1;
        const e = f * f;
        k.s.position.copy(k.de).multiplyScalar(1 - e * 0.85);
        k.s.material.opacity = suave(0, 0.15, f) * (1 - suave(0.85, 1, f)) * 0.95;
      });
      camera.position.set(0, 0.2, 8.2);
      camera.lookAt(0, -0.05, 0);
    }
  };
}

// ------------------------------------------------------------------ 6. Comunidade — fios de conversa (violeta)
// Cada pessoa puxa um fio; as perguntas sobem por eles, que se entrelaçam até o especialista. De tempos em tempos
// a resposta oficial desce em verde por todos os fios ao mesmo tempo: fica para todo mundo.
function cenaComunidade() {
  const { scene, camera } = base(34);
  const VIOL = 0xb69cff, ROSA = 0xff9ad5;
  const NF = TOQUE ? 6 : 8, SEG = 56;
  const topo = new Vector3(0, 1.45, 0);
  const bases = [];
  for (let i = 0; i < NF; i++) bases.push(new Vector3(-2.7 + (i * 5.4) / (NF - 1), -1.45, 0.55 * Math.cos(i * 1.7)));
  const fios = bases.map(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const cor = new Float32Array((SEG + 1) * 3);
    for (let s = 0; s <= SEG; s++) { const f = s / SEG; tmpC.set(VIOL).lerp(new Color(ROSA), f * 0.7); cor.set([tmpC.r * (0.35 + 0.5 * f), tmpC.g * (0.35 + 0.5 * f), tmpC.b * (0.35 + 0.5 * f)], s * 3); }
    g.setAttribute("color", new BufferAttribute(cor, 3));
    const l = new Line(g, new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    scene.add(l);
    return l;
  });
  const pessoas = bases.map((b) => { const s = brilho(0xe9ddff, 0.5, 0.9); s.position.copy(b); scene.add(s); return s; });
  const esp = brilho(COR.menta, 1.5, 0.9); esp.position.copy(topo); scene.add(esp);
  const aro = new Sprite(new SpriteMaterial({ map: texAnel(), color: COR.menta, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  aro.position.copy(topo); scene.add(aro);
  const etEsp = hud("Especialista", CSS.menta, { sub: "resposta oficial", altura: 0.46 }); etEsp.position.set(1.25, 1.65, 0.4); scene.add(etEsp);
  const etPerg = hud("Perguntas", "#CDBBFF", { altura: 0.34 }); etPerg.position.set(-2.35, -0.95, 0.5); scene.add(etPerg);
  // pontos que viajam: 3 perguntas por fio subindo e 1 resposta por fio descendo
  const NQ = NF * 3, viaj = nuvem(NQ + NF, 0.17);
  const VP = viaj.geometry.attributes.position.array, VC = viaj.geometry.attributes.color.array;
  scene.add(viaj);
  const q = new Vector3();
  function noFio(i, s, t, v) {
    const b = bases[i], e = s * s * (3 - 2 * s);
    const fase = t * 0.8 + i * 0.85 + s * 5.5, amp = 4 * s * (1 - s) * 0.55;
    return (v || q).set(b.x + (topo.x - b.x) * e + Math.cos(fase) * amp, b.y + (topo.y - b.y) * s, b.z + (topo.z - b.z) * e + Math.sin(fase) * amp);
  }
  const ONDA = 3.2;
  return {
    scene, camera, tParado: 1.0,
    update(t, dt, p) {
      fios.forEach((l, i) => {
        const A = l.geometry.attributes.position.array;
        for (let s = 0; s <= SEG; s++) { noFio(i, s / SEG, t); A[s * 3] = q.x; A[s * 3 + 1] = q.y; A[s * 3 + 2] = q.z; }
        l.geometry.attributes.position.needsUpdate = true;
      });
      for (let k = 0; k < NQ; k++) {
        const i = k % NF, s = (t * 0.17 + i * 0.37 + Math.floor(k / NF) / 3) % 1;
        noFio(i, s, t);
        VP.set([q.x, q.y, q.z], k * 3);
        pintar(VC, k, 0xf1e9ff, 0.9 * suave(0, 0.08, s) * (1 - suave(0.9, 1, s)));
      }
      const w = (t % ONDA) / 1.7;
      for (let i = 0; i < NF; i++) {
        const k = NQ + i;
        if (w <= 1) { noFio(i, 1 - w, t); VP.set([q.x, q.y, q.z], k * 3); pintar(VC, k, COR.menta, 1.6 * (1 - suave(0.85, 1, w))); }
        else { VP.set([0, -50, 0], k * 3); pintar(VC, k, 0, 0); }
      }
      viaj.geometry.attributes.position.needsUpdate = true;
      viaj.geometry.attributes.color.needsUpdate = true;
      const flash = Math.max(0, 1 - (t % ONDA) / 0.6);
      esp.scale.setScalar(1.5 * (1 + 0.5 * flash));
      aro.scale.setScalar(0.4 + saiCubica(1 - flash) * 1.6);
      aro.material.opacity = flash * 0.9;
      pessoas.forEach((s, i) => { s.material.opacity = 0.65 + 0.3 * Math.sin(t * 2 + i); });
      mirar(camera, p, 8.2, new Vector3(0, 0.05, 0), { alt: 0.08, giroX: 0.25 });
    }
  };
}

const CENAS = { parecer: cenaParecer, elaborador: cenaElaborador, calculadora: cenaCalculadora, gestao: cenaGestao, biblioteca: cenaBiblioteca, comunidade: cenaComunidade };

// ------------------------------------------------------------------ motor: um renderer para todas as cenas
let R = null, bufW = 0, bufH = 0, raf = 0, ult = 0, perdido = false;
const palcos = [];

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
  if (p.cartao) {
    const rx = (-p.ty * 3.5).toFixed(2), ry = (p.tx * 4.5).toFixed(2);
    const s = "perspective(1100px) rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
    if (s !== p.ultCartao) { p.cartao.style.transform = Math.abs(p.tx) + Math.abs(p.ty) < 0.002 ? "" : s; p.ultCartao = s; }
  }
}

function descartar(p) {
  try { p.ro && p.ro.disconnect(); p.io && p.io.disconnect(); p.cancelaRolagem && p.cancelaRolagem(); } catch (e) { /* segue */ }
  p.cena.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => { if (m.map && m.map !== TEX_BRILHO && m.map !== TEX_PONTO && m.map !== TEX_ANEL) m.map.dispose(); m.dispose(); });
  });
}

function laco(agora) {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (agora - ult) / 1000));
  ult = agora;
  let algum = false;
  for (let i = palcos.length - 1; i >= 0; i--) {
    const p = palcos[i];
    if (!p.el.isConnected) { descartar(p); palcos.splice(i, 1); continue; }
    if (!p.vis || document.hidden) continue;
    algum = true;
    p.t += dt;
    desenhar(p, dt);
  }
  if (algum && !REDUZ) raf = requestAnimationFrame(laco);
}
function acordar() {
  if (REDUZ || raf) return;
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
  if (p.desloca) p.cena.camera.setViewOffset(r.width, r.height, 0, r.height * p.desloca, r.width, r.height);
  p.cena.camera.updateProjectionMatrix();
  if (REDUZ) desenhar(p, 0);
}

export async function montar(el, tipo) {
  if (!el || el.__lv3d || !CENAS[tipo]) return;
  el.__lv3d = true;
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
  el.insertBefore(palco, el.firstChild);
  el.classList.add("lv3d-on", "lv3d-" + tipo);

  const p = {
    el, palco, cv, ctx: cv.getContext("2d"), cena, t: REDUZ ? cena.tParado : 0, vis: false, prog: 0.5,
    mx: 0, my: 0, tx: 0, ty: 0, desloca: 0, cartao: null, ultCartao: ""
  };
  palcos.push(p);

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
    if (v && !p.vis && !p.entrou) {
      p.entrou = true;
      if (M && M.animate && !REDUZ) {
        try { M.animate(palco, { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }); } catch (e) { /* segue */ }
      }
    }
    p.vis = v;
    if (v) { if (REDUZ) desenhar(p, 0); else acordar(); }
  }, { rootMargin: "60px 0px" });
  p.io.observe(palco);
}
