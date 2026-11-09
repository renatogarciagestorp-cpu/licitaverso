/* Licitacon — cenas 3D da página inicial (Three.js), uma por ferramenta.
 *
 * Fonte deste arquivo: src/inicio3d.js. O site carrega o pacote gerado na raiz (inicio3d.js), montado por
 * scripts/3d/montar.mjs com o Three.js e só com as partes usadas. O inicio.js baixa o pacote quando a primeira
 * cena chega perto da tela e chama montar(elemento, tipo) para cada lugar marcado com data-lv3d="…":
 *   parecer     — o edital como matriz de pontos; o feixe lê, três trechos acendem ALTA/MÉDIA/BAIXA e avisam o parecer
 *   elaborador  — a nuvem de respostas se organiza seção por seção na minuta; o PNCP alimenta a estimativa do valor
 *   calculadora — superfície de dados com as 12 colunas do IPCA e a curva acumulada até o reajuste
 *   gestao      — radar da carteira: cada anel é um contrato, o ponteiro é o tempo e os marcos avisam o núcleo
 *   biblioteca  — 90 fontes oficiais em volta do acervo, com decisões viajando até ele
 *   comunidade  — rede de pessoas; perguntas vão ao especialista e a resposta oficial volta para todos
 * Todas no mesmo estilo: pontos de luz, linhas finas, núcleo facetado e pulsos, nas cores da marca.
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
  SRGBColorSpace, AdditiveBlending, HemisphereLight, Points, PointsMaterial, BufferAttribute, Line, DirectionalLight, PointLight, ACESFilmicToneMapping, DoubleSide
} from "three";

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

// ------------------------------------------------------------------ peças comuns do estilo (pontos de luz, núcleo, pulsos)
let TEX_PONTO = null, TEX_ANEL = null;
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
// Nuvem de pontos com cor por ponto (soma luz: quanto mais perto, mais brilha).
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
function circulo(r, seg) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    out.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  return out;
}
// Núcleo facetado com casca em arame e halo, como o acervo da Biblioteca.
function nucleo(r, cor) {
  const g = new Group();
  const n = new Mesh(new IcosahedronGeometry(r, 1), new MeshStandardMaterial({ color: COR.verde, emissive: cor || COR.mentaForte, emissiveIntensity: 0.5, roughness: 0.3, flatShading: true }));
  const c = new Mesh(new IcosahedronGeometry(r * 1.24, 1), new MeshBasicMaterial({ color: COR.menta, wireframe: true, transparent: true, opacity: 0.35 }));
  const h = brilho(cor || COR.menta, r * 5.2, 0.5);
  g.add(n, c, h);
  g.userData = { n, c, h };
  return g;
}
function girarNucleo(nu, t, extra) {
  nu.userData.n.rotation.x = t * 0.2;
  nu.userData.c.rotation.y = -t * 0.3;
  const s = 1 + 0.05 * Math.sin(t * 3) + (extra || 0) * 0.18;
  nu.userData.n.scale.setScalar(s);
  nu.userData.h.material.opacity = 0.5 + (extra || 0) * 0.4;
}
// Pulsos de luz que viajam de um ponto a outro (decisões, avisos, perguntas, respostas).
function criarPulsos(pai, n, tam) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    const s = brilho(0xffffff, tam, 0);
    s.visible = false;
    pai.add(s);
    lista.push({ s, ativo: false, de: new Vector3(), para: new Vector3() });
  }
  return {
    disparar(de, para, dur, cor, t, fim) {
      const k = lista.find((x) => !x.ativo);
      if (!k) return;
      k.ativo = true; k.de.copy(de); k.para.copy(para); k.t0 = t; k.dur = dur; k.fim = fim;
      k.s.material.color.set(cor); k.s.visible = true; k.s.position.copy(de);
    },
    atualizar(t) {
      lista.forEach((k) => {
        if (!k.ativo) return;
        const u = (t - k.t0) / k.dur;
        if (u >= 1 || u < 0) { k.ativo = false; k.s.visible = false; if (u >= 1 && k.fim) k.fim(t); return; }
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        k.s.position.lerpVectors(k.de, k.para, e);
        k.s.material.opacity = 0.15 + 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      });
    },
    apagar() { lista.forEach((k) => { k.ativo = false; k.s.visible = false; }); }
  };
}
// Onda que se abre a partir de um ponto (aviso, achado, resposta).
function criarOndas(pai, n) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    const s = new Sprite(new SpriteMaterial({ map: texAnel(), color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; pai.add(s); lista.push({ s, ativo: false });
  }
  return {
    disparar(pos, cor, t, tam) {
      const k = lista.find((x) => !x.ativo) || lista[0];
      k.ativo = true; k.t0 = t; k.tam = tam || 1; k.s.position.copy(pos); k.s.material.color.set(cor); k.s.visible = true;
    },
    atualizar(t) {
      lista.forEach((k) => {
        if (!k.ativo) return;
        const u = (t - k.t0) / 1.1;
        if (u >= 1 || u < 0) { k.ativo = false; k.s.visible = false; return; }
        k.s.scale.setScalar(k.tam * (0.15 + saiCubica(u) * 1.0));
        k.s.material.opacity = (1 - u) * 0.9;
      });
    }
  };
}
// Legenda em pílula no pé da cena, igual à da Biblioteca.
function legenda(scene, texto, y) {
  const et = rotulo(texto, { altura: 0.34, borda: CSS.menta, depthTest: false });
  et.position.set(0, y, 0.6);
  et.renderOrder = 10;
  scene.add(et);
  return et;
}
const tmpC = new Color();
function pintar(cores, i, hex, k) { tmpC.set(hex); cores[i * 3] = tmpC.r * k; cores[i * 3 + 1] = tmpC.g * k; cores[i * 3 + 2] = tmpC.b * k; }

// ------------------------------------------------------------------ 1. Parecerista — varredura do edital
// O edital é uma matriz de pontos (cada linha do texto, uma fileira de luz). O feixe lê de cima a baixo; três
// trechos acendem com a gravidade, sobem os marcadores e mandam pulsos ao núcleo do parecer.
function cenaParecer() {
  const { scene, camera } = base(34);
  const mesa = new Group(), doc = new Group();
  const LIN = 16, W = 3.3, H = 2.9, PX = 0.082;
  const larg = [0.55, 0.95, 0.88, 0.92, 0.7, 0.96, 0.84, 0.9, 0.62, 0.94, 0.86, 0.91, 0.74, 0.95, 0.83, 0.5];
  const pts = [];
  for (let l = 0; l < LIN; l++) {
    const y = H / 2 - 0.25 - l * (H - 0.5) / (LIN - 1);
    const n = Math.floor(((W - 0.4) * larg[l]) / PX);
    for (let i = 0; i < n; i++) pts.push({ x: -W / 2 + 0.2 + i * PX, y, l, i });
  }
  const N = pts.length;
  const pontos = nuvem(N, 0.12);
  const P = pontos.geometry.attributes.position.array, C = pontos.geometry.attributes.color.array;
  pts.forEach((q, k) => { P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = 0; });
  doc.add(pontos);
  // moldura com cantos de mira (HUD)
  const c = 0.32, x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2;
  doc.add(segmentos([
    x0, y1, 0, x0 + c, y1, 0, x0, y1, 0, x0, y1 - c, 0, x1, y1, 0, x1 - c, y1, 0, x1, y1, 0, x1, y1 - c, 0,
    x0, y0, 0, x0 + c, y0, 0, x0, y0, 0, x0, y0 + c, 0, x1, y0, 0, x1 - c, y0, 0, x1, y0, 0, x1, y0 + c, 0
  ], COR.menta, 0.7));
  doc.add(segmentos([x0, y1, 0, x1, y1, 0, x1, y1, 0, x1, y0, 0, x1, y0, 0, x0, y0, 0, x0, y0, 0, x0, y1, 0], COR.menta, 0.12));
  // feixe de leitura
  const feixe = segmentos([x0 - 0.15, 0, 0.01, x1 + 0.15, 0, 0.01], COR.menta, 0.95);
  const brilhoFeixe = brilho(COR.menta, 1.2, 0.5); brilhoFeixe.scale.set(W + 0.6, 0.5, 1);
  const grupoFeixe = new Group(); grupoFeixe.add(feixe, brilhoFeixe); doc.add(grupoFeixe);
  // achados
  const ACH = [[3, 2, 13, COR.alta, "ALTA", CSS.alta], [8, 20, 31, COR.media, "MÉDIA", CSS.media], [13, 10, 21, COR.baixa, "BAIXA", CSS.baixa]].map(([l, a, b, cor, nome, css]) => {
    const meus = []; pts.forEach((q, k) => { if (q.l === l && q.i >= a && q.i <= b) meus.push(k); });
    const cx = pts[meus[Math.floor(meus.length / 2)]].x, y = pts[meus[0]].y;
    const haste = segmentos([cx, y, 0, cx, y, 1.0], cor, 0.8);
    const no = brilho(cor, 0.55, 0.9); no.position.set(cx, y, 1.0);
    const et = rotulo(nome, { cor: css, borda: css, altura: 0.36, depthTest: false });
    et.position.set(cx + 0.55, y, 1.05); et.renderOrder = 10;
    const g = new Group(); g.add(haste, no, et); g.scale.set(1, 1, 0.001); g.visible = false;
    doc.add(g);
    return { l, y, cor, meus, g, no, topo: new Vector3(), disparou: false };
  });
  doc.rotation.x = -1.0;
  mesa.add(doc);
  mesa.rotation.y = 0.3;
  mesa.position.set(-0.6, -0.1, 0);
  scene.add(mesa);
  const parecer = nucleo(0.32); parecer.position.set(2.55, 0.8, 0.2); scene.add(parecer);
  const etP = rotulo("Parecer", { altura: 0.32, borda: CSS.menta, depthTest: false }); etP.position.set(2.55, 0.17, 0.3); etP.renderOrder = 10; scene.add(etP);
  const fios = segmentos(new Array(18).fill(0), COR.menta, 0.25); scene.add(fios);
  const pulsos = criarPulsos(scene, 8, 0.36), ondas = criarOndas(scene, 4);
  legenda(scene, "Edital lido item a item → parecer", -1.75);
  const ciclo = 8.5, topo = H / 2 - 0.1, fundo = -H / 2 + 0.1, LEITURA = 3.6;
  let ultC = 99, flash = 0;
  return {
    scene, camera, tParado: 5.2,
    update(t, dt, p) {
      const c = t % ciclo;
      if (c < ultC) { ACH.forEach((a) => { a.disparou = false; }); pulsos.apagar(); }
      ultC = c;
      const ys = topo + (fundo - topo) * suave(0, LEITURA, c);
      grupoFeixe.position.y = ys;
      grupoFeixe.visible = c < LEITURA + 0.2;
      const some = suave(7.4, 8.2, c);
      mesa.updateMatrixWorld();
      ACH.forEach((a, k) => {
        const tA = LEITURA * (topo - a.y) / (topo - fundo);
        const v = lim((c - tA) / 0.5, 0, 1) * (1 - some);
        a.v = v;
        a.g.visible = v > 0.001;
        a.g.scale.set(1, 1, Math.max(0.001, saiVolta(v)));
        a.no.scale.setScalar(0.55 * (1 + 0.15 * Math.sin(t * 4 + k)));
        a.topo.set(pts[a.meus[Math.floor(a.meus.length / 2)]].x, a.y, 1.0);
        doc.localToWorld(a.topo);
        if (!a.disparou && c > LEITURA + 0.4 + k * 0.35 && c < 7) {
          a.disparou = true;
          pulsos.disparar(a.topo, parecer.position, 1.0, a.cor, t, (tt) => { flash = 1; ondas.disparar(parecer.position, COR.menta, tt, 1.6); });
        }
      });
      // brilho de cada ponto: base fraca, o feixe acende ao passar, o achado fica na cor da gravidade
      const marca = new Map(); ACH.forEach((a) => a.meus.forEach((k) => marca.set(k, a)));
      for (let k = 0; k < N; k++) {
        const q = pts[k], d = (q.y - ys) / 0.13, f = c < LEITURA + 0.2 ? Math.exp(-d * d) : 0;
        const a = marca.get(k);
        if (a && a.v > 0) { pintar(C, k, a.cor, 0.8 + 0.8 * a.v); P[k * 3 + 2] = 0.05 * a.v * (1 + Math.sin(t * 3 + q.i * 0.4)); }
        else { pintar(C, k, COR.menta, 0.55 + 1.1 * f + (q.y > ys && c < LEITURA ? 0 : 0.2)); P[k * 3 + 2] = 0; }
      }
      pontos.geometry.attributes.color.needsUpdate = true;
      pontos.geometry.attributes.position.needsUpdate = true;
      // fios dos marcadores ao núcleo
      const F = fios.geometry.attributes.position.array;
      ACH.forEach((a, k) => { F.set([a.topo.x, a.topo.y, a.topo.z, parecer.position.x, parecer.position.y, parecer.position.z], k * 6); });
      fios.geometry.attributes.position.needsUpdate = true;
      fios.material.opacity = 0.28 * Math.max(...ACH.map((a) => a.v));
      flash = Math.max(0, flash - (dt || 0) * 1.5);
      girarNucleo(parecer, t, flash);
      pulsos.atualizar(t); ondas.atualizar(t);
      mesa.position.y = -0.1 + 0.05 * Math.sin(t * 0.9);
      mirar(camera, p, 7.8, new Vector3(0.25, 0.1, 0), { ang: 0.0, alt: 0.24 });
    }
  };
}

// ------------------------------------------------------------------ 2. Elaborador — do questionário à minuta
// Uma nuvem solta (as respostas) se organiza seção por seção até virar a minuta; o PNCP alimenta a estimativa do valor.
function cenaElaborador() {
  const { scene, camera } = base(34);
  const doc = new Group();
  const SEC = 5, ROWS = 3, PX = 0.085, RY = 0.115, GAP = 0.2, W = 2.9;
  const larg = [[0.9, 0.82, 0.6], [0.94, 0.7, 0.86], [0.8, 0.92, 0.55], [0.88, 0.95, 0.72], [0.93, 0.66, 0.84]];
  const alvos = [], secoes = [];
  const altura = SEC * (ROWS * RY + GAP);
  for (let s = 0; s < SEC; s++) {
    const yS = altura / 2 - s * (ROWS * RY + GAP) - 0.05;
    secoes.push({ y: yS, ini: alvos.length });
    for (let r = 0; r < ROWS; r++) {
      const n = Math.floor(((W - 0.45) * larg[s][r]) / PX);
      for (let i = 0; i < n; i++) alvos.push({ x: -W / 2 + 0.45 + i * PX, y: yS - r * RY, s });
    }
    secoes[s].fim = alvos.length;
  }
  const N = alvos.length, AMB = TOQUE ? 140 : 260;
  const pontos = nuvem(N + AMB, 0.12);
  const P = pontos.geometry.attributes.position.array, C = pontos.geometry.attributes.color.array;
  // posição solta de cada ponto: uma nuvem à esquerda que gira devagar
  const solto = [];
  let semente = 7;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  for (let k = 0; k < N + AMB; k++) {
    const r = 0.5 + rnd() * 1.6, a = rnd() * Math.PI * 2, y = (rnd() - 0.5) * 2.4;
    solto.push({ r, a, y, vel: 0.15 + rnd() * 0.25, atraso: rnd() * 0.45 });
  }
  doc.add(pontos);
  // número de cada seção: um nó que acende quando a seção fecha
  const nos = secoes.map((s, i) => {
    const n = brilho(COR.menta, 0.42, 0); n.position.set(-W / 2 + 0.15, s.y - RY, 0);
    const et = rotulo(String(i + 1), { altura: 0.3, fundo: "rgba(7,30,28,0.9)", borda: CSS.menta, depthTest: false });
    et.position.set(-W / 2 + 0.15, s.y - RY, 0.02); et.material.opacity = 0; et.renderOrder = 10;
    doc.add(n, et);
    return { n, et };
  });
  // moldura da minuta
  const x0 = -W / 2 - 0.1, x1 = W / 2 + 0.1, y0 = -altura / 2 - 0.15, y1 = altura / 2 + 0.15, c = 0.28;
  const moldura = segmentos([
    x0, y1, 0, x0 + c, y1, 0, x0, y1, 0, x0, y1 - c, 0, x1, y1, 0, x1 - c, y1, 0, x1, y1, 0, x1, y1 - c, 0,
    x0, y0, 0, x0 + c, y0, 0, x0, y0, 0, x0, y0 + c, 0, x1, y0, 0, x1 - c, y0, 0, x1, y0, 0, x1, y0 + c, 0
  ], COR.menta, 0);
  doc.add(moldura);
  doc.position.set(0.85, 0.2, 0);
  doc.rotation.y = -0.28;
  scene.add(doc);
  // PNCP em órbita, alimentando a seção 4 (estimativa do valor)
  const pncp = nucleo(0.17, COR.media); scene.add(pncp);
  const etPncp = rotulo("PNCP", { altura: 0.28, cor: CSS.media, borda: CSS.media, depthTest: false }); etPncp.renderOrder = 10; scene.add(etPncp);
  const pulsos = criarPulsos(scene, 10, 0.3);
  const saida = rotulo("Word · PDF", { altura: 0.34, cor: "#0A2826", fundo: CSS.menta, depthTest: false }); saida.renderOrder = 10; scene.add(saida);
  legenda(scene, "Respostas do questionário → minuta do ETP", -1.85);
  const ciclo = 10, T0 = 0.6, PASSO = 0.85, DUR = 1.1;
  let proxPncp = 0, ultC = 99;
  const alvoV = new Vector3();
  return {
    scene, camera, tParado: 6.6,
    update(t, dt, p) {
      const c = t % ciclo;
      if (c < ultC) proxPncp = 0;
      ultC = c;
      const volta = suave(8.6, 9.6, c);
      for (let k = 0; k < N + AMB; k++) {
        const s = solto[k], ang = s.a + t * s.vel;
        const sx = -1.6 + Math.cos(ang) * s.r * 0.75, sz = Math.sin(ang) * s.r * 0.6, sy = s.y + 0.08 * Math.sin(t + k);
        // nuvem em coordenadas do documento (o grupo do documento está deslocado e girado)
        let x = sx - doc.position.x, y = sy - doc.position.y, z = sz;
        let brilhoP = 0.2;
        if (k < N) {
          const q = alvos[k];
          const v = saiCubica(lim((c - T0 - q.s * PASSO - s.atraso) / DUR, 0, 1)) * (1 - volta);
          x += (q.x - x) * v; y += (q.y - y) * v; z += (0 - z) * v;
          brilhoP = 0.7 + 0.8 * v;
          pintar(C, k, v > 0.98 ? 0xd9fff0 : COR.menta, brilhoP);
        } else pintar(C, k, COR.menta, 0.42);
        P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
      }
      pontos.geometry.attributes.position.needsUpdate = true;
      pontos.geometry.attributes.color.needsUpdate = true;
      nos.forEach((n, i) => {
        const v = lim((c - T0 - i * PASSO - DUR - 0.2) / 0.4, 0, 1) * (1 - volta);
        n.n.material.opacity = v * 0.9; n.et.material.opacity = v;
      });
      moldura.material.opacity = 0.75 * suave(T0 + 4 * PASSO + DUR, T0 + 4 * PASSO + DUR + 0.6, c) * (1 - volta);
      // PNCP: orbita e manda preços para a seção 4 enquanto ela se forma
      const ang = t * 0.9;
      pncp.position.set(2.75 + 0.25 * Math.cos(ang), 1.2 + 0.25 * Math.sin(ang), 0.3);
      etPncp.position.set(pncp.position.x, pncp.position.y + 0.42, 0.4);
      girarNucleo(pncp, t, 0);
      const t4 = T0 + 3 * PASSO;
      if (c > t4 - 0.6 && c < t4 + 1.4 && c >= proxPncp) {
        proxPncp = c + 0.28;
        alvoV.set(0.6 * (Math.random() - 0.2), secoes[3].y - RY, 0); doc.localToWorld(alvoV);
        pulsos.disparar(pncp.position, alvoV, 0.7, COR.media, t);
      }
      pulsos.atualizar(t);
      const vs = suave(T0 + 4 * PASSO + DUR + 0.3, T0 + 4 * PASSO + DUR + 0.9, c) * (1 - volta);
      saida.material.opacity = vs;
      saida.position.set(doc.position.x + 0.2, doc.position.y + altura / 2 + 0.5 + 0.1 * (1 - vs), 0.3);
      doc.rotation.y = -0.28 + 0.06 * Math.sin(t * 0.4);
      mirar(camera, p, 8.8, new Vector3(0.35, 0.05, 0), { alt: 0.08, ang: 0.05 });
    }
  };
}

// ------------------------------------------------------------------ 3. Calculadora — superfície de índices
// Uma superfície de dados ondula; 12 colunas de luz sobem com o IPCA de cada mês e a curva acumulada se desenha
// até o reajuste aplicado ao valor do posto.
function cenaCalculadora() {
  const { scene, camera } = base(34);
  const GX = TOQUE ? 34 : 46, GZ = TOQUE ? 16 : 20, LX = 6.6, LZ = 3.0;
  const sup = nuvem(GX * GZ, 0.09);
  const S = sup.geometry.attributes.position.array, SC = sup.geometry.attributes.color.array;
  const mundo = new Group(); mundo.add(sup);
  const IPCA = [0.42, 0.31, 0.38, 0.43, 0.26, 0.24, 0.21, 0.44, 0.48, 0.56, 0.62, 0.39];
  const MESES = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set"];
  const ESC = 2.1, ALT = 14, colX = (i) => -2.75 + i * 0.5;
  const col = nuvem(12 * ALT, 0.12);
  const CP = col.geometry.attributes.position.array, CC = col.geometry.attributes.color.array;
  mundo.add(col);
  const topos = IPCA.map((v, i) => { const n = brilho(COR.menta, 0.38, 0); n.position.set(colX(i), 0, 0.3); mundo.add(n); return n; });
  // curva acumulada
  let acc = 1; const acum = IPCA.map((v) => (acc *= 1 + v / 100) - 1);
  const curvaPts = acum.map((a, i) => new Vector3(colX(i), 0.35 + a * 100 * 0.42, -0.6));
  const curva = new Line(new BufferGeometry().setFromPoints(curvaPts), new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.95, blending: AdditiveBlending, toneMapped: false }));
  mundo.add(curva);
  const nosCurva = curvaPts.map((q) => { const s = brilho(COR.menta, 0.26, 0); s.position.copy(q); mundo.add(s); return s; });
  const etIdx = rotulo("IPCA · 12 meses", { altura: 0.32, borda: CSS.menta, depthTest: false }); etIdx.renderOrder = 10;
  etIdx.position.set(-2.6, 1.55, -0.6); mundo.add(etIdx);
  const etFim = rotulo("+4,87%  →  R$ 6.952,66", { altura: 0.36, cor: "#0A2826", fundo: CSS.menta, depthTest: false }); etFim.renderOrder = 10;
  mundo.add(etFim);
  const etMeses = [0, 3, 6, 9, 11].map((i) => { const e = rotulo(MESES[i], { altura: 0.22, fundo: "rgba(7,30,28,0.7)", cor: "#C3D9D3", peso: 700 }); e.position.set(colX(i), -0.32, 0.75); mundo.add(e); return e; });
  void etMeses;
  mundo.position.y = -0.55;
  scene.add(mundo);
  legenda(scene, "Índice oficial → reajuste calculado", -1.95);
  const ciclo = 9, T0 = 0.4, PASSO = 0.24;
  return {
    scene, camera, tParado: 5.5,
    update(t, dt, p) {
      const c = t % ciclo, some = suave(8.0, 8.8, c);
      for (let ix = 0; ix < GX; ix++) for (let iz = 0; iz < GZ; iz++) {
        const k = ix * GZ + iz, x = -LX / 2 + (ix / (GX - 1)) * LX, z = -LZ / 2 + (iz / (GZ - 1)) * LZ;
        const y = 0.09 * Math.sin(x * 1.3 + t * 0.9) + 0.07 * Math.cos(z * 2.1 - t * 0.7);
        S[k * 3] = x; S[k * 3 + 1] = y - 0.12; S[k * 3 + 2] = z;
        pintar(SC, k, COR.menta, 0.42 + (y + 0.16) * 2.4);
      }
      sup.geometry.attributes.position.needsUpdate = true;
      sup.geometry.attributes.color.needsUpdate = true;
      IPCA.forEach((v, i) => {
        const g = saiCubica(lim((c - T0 - i * PASSO) / 0.55, 0, 1)) * (1 - some);
        const h = v * ESC * g;
        for (let j = 0; j < ALT; j++) {
          const k = i * ALT + j, f = j / (ALT - 1);
          CP[k * 3] = colX(i); CP[k * 3 + 1] = f * h; CP[k * 3 + 2] = 0.3;
          pintar(CC, k, i === 10 ? COR.media : COR.menta, g > 0 ? 0.6 + 1.0 * f : 0);
        }
        topos[i].position.y = h; topos[i].material.opacity = g * 0.85;
      });
      col.geometry.attributes.position.needsUpdate = true;
      col.geometry.attributes.color.needsUpdate = true;
      const prog = lim((c - T0 - 0.3) / (12 * PASSO + 0.3), 0, 1) * (1 - some);
      const nCurva = Math.max(0, Math.min(12, Math.floor(prog * 12) + 1));
      curva.geometry.setDrawRange(0, prog > 0 ? nCurva : 0);
      nosCurva.forEach((s, i) => { s.material.opacity = i < nCurva && prog > 0 ? 0.9 : 0; });
      const fim = suave(T0 + 12 * PASSO + 0.4, T0 + 12 * PASSO + 1.0, c) * (1 - some);
      etFim.material.opacity = fim;
      etFim.position.set(colX(11) - 0.4, curvaPts[11].y + 0.5 + 0.1 * (1 - fim), -0.6);
      etIdx.material.opacity = 1 - some;
      mundo.rotation.y = 0.05 * Math.sin(t * 0.35);
      mirar(camera, p, 9.2, new Vector3(0, 0.1, 0), { alt: 0.42, ang: -0.18 });
    }
  };
}

// ------------------------------------------------------------------ 4. Gestão Contratual — radar de prazos
// Cada anel é um contrato da carteira e o ponteiro é o tempo (uma volta, 12 meses). Quando passa por um marco,
// o ponto acende, solta uma onda e o aviso viaja até o núcleo da carteira, que o envia por e-mail.
function cenaGestao() {
  const { scene, camera } = base(34);
  const disco = new Group();
  const RAIOS = [0.85, 1.3, 1.75, 2.2], STATUS = [COR.menta, COR.menta, COR.media, COR.alta];
  RAIOS.forEach((r, i) => disco.add(segmentos(circulo(r, 96), STATUS[i], i < 2 ? 0.35 : 0.45)));
  // meses na borda
  const marcas = [];
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI * 2, r0 = 2.42, r1 = m % 3 === 0 ? 2.68 : 2.55;
    marcas.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
  }
  disco.add(segmentos(marcas, COR.menta, 0.5));
  disco.add(segmentos(circulo(2.42, 120), COR.menta, 0.12));
  // ponteiro com rastro
  const RASTRO = 26, rastro = [];
  for (let k = 0; k < RASTRO; k++) { const d = -k * 0.035; rastro.push(0, 0, 0, Math.cos(d) * 2.42, 0, Math.sin(d) * 2.42); }
  const gR = new BufferGeometry(); gR.setAttribute("position", new Float32BufferAttribute(rastro, 3));
  const coresR = []; for (let k = 0; k < RASTRO; k++) { const f = Math.pow(1 - k / RASTRO, 2.2) * (k === 0 ? 1.4 : 0.55); coresR.push(0, 0, 0, 0.44 * f, 0.88 * f, 0.68 * f); }
  gR.setAttribute("color", new Float32BufferAttribute(coresR, 3));
  const ponteiro = new LineSegments(gR, new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  disco.add(ponteiro);
  // marcos de cada contrato
  const MARCOS = [
    [0, 0.7, COR.media, "Reajuste · Vigilância", CSS.media], [1, 2.2, COR.menta, "Prorrogação · Limpeza", CSS.menta],
    [2, 3.6, COR.baixa, "Repactuação · Manutenção", CSS.baixa], [3, 5.0, COR.alta, "Fim da vigência · Impressão", CSS.alta],
    [1, 4.3, COR.media, "Reajuste · Limpeza", CSS.media], [2, 0.2, COR.menta, "Prorrogação · Manutenção", CSS.menta]
  ].map(([anel, a, cor, nome, css]) => {
    const r = RAIOS[anel], pos = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const no = brilho(cor, 0.36, 0.75); no.position.copy(pos); disco.add(no);
    const et = rotulo(nome, { altura: 0.3, cor: css, borda: css, depthTest: false }); et.renderOrder = 10; et.material.opacity = 0; scene.add(et);
    return { a, cor, pos, no, et, calor: 0, mundo: new Vector3() };
  });
  disco.rotation.x = 0.42;
  disco.position.y = -0.15;
  scene.add(disco);
  const carteira = nucleo(0.3); carteira.position.copy(disco.position); scene.add(carteira);
  const pulsos = criarPulsos(scene, 10, 0.34), ondas = criarOndas(scene, 6);
  legenda(scene, "Carteira em 12 meses · aviso antes do prazo", -2.05);
  const VOLTA = 8;
  let angAnt = null, flash = 0;
  const cima = new Vector3();
  return {
    scene, camera, tParado: 2.6,
    update(t, dt, p) {
      const ang = ((t / VOLTA) * Math.PI * 2) % (Math.PI * 2);
      ponteiro.rotation.y = -ang;
      disco.updateMatrixWorld();
      MARCOS.forEach((m) => {
        m.mundo.copy(m.pos); disco.localToWorld(m.mundo);
        // o ponteiro gira no sentido do ângulo crescente (em x/z): passou pelo marco?
        if (angAnt !== null) {
          const passou = (angAnt <= m.a && ang >= m.a) || (angAnt > ang && (m.a >= angAnt || m.a <= ang));
          if (passou) {
            m.calor = 1;
            ondas.disparar(m.mundo, m.cor, t, 1.3);
            pulsos.disparar(m.mundo, carteira.position, 0.9, m.cor, t, (tt) => {
              flash = 1;
              cima.copy(carteira.position); cima.y += 1.9;
              pulsos.disparar(carteira.position, cima, 0.9, COR.menta, tt);
            });
          }
        }
        m.calor = Math.max(0, m.calor - (dt || 0) * 0.55);
        m.no.scale.setScalar(0.36 * (1 + m.calor * 1.4));
        m.et.material.opacity = REDUZ ? (m.a < 2.4 ? 1 : 0) : lim(m.calor * 1.6, 0, 1);
        m.et.position.copy(m.mundo).add(new Vector3(0, 0.42, 0));
      });
      angAnt = ang;
      flash = Math.max(0, flash - (dt || 0) * 1.4);
      girarNucleo(carteira, t, flash);
      pulsos.atualizar(t); ondas.atualizar(t);
      mirar(camera, p, 8.4, new Vector3(0, -0.05, 0), { alt: 0.32, ang: 0, rolagem: 0.25 });
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

// ------------------------------------------------------------------ 6. Comunidade — rede de conhecimento
// Pessoas são nós de uma rede. As perguntas viajam até o especialista no centro; a resposta oficial volta em verde
// para quem perguntou e para os vizinhos, porque fica no fórum para todos.
function cenaComunidade() {
  const { scene, camera } = base(34);
  const rede = new Group();
  const N = TOQUE ? 34 : 46, nos = [];
  let semente = 11;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
    const k = 0.75 + rnd() * 0.35;
    nos.push(new Vector3(Math.cos(th) * r * 2.7 * k, y * 1.25 * k, Math.sin(th) * r * 1.5 * k));
  }
  const pontos = nuvem(N, 0.2);
  const P = pontos.geometry.attributes.position.array, C = pontos.geometry.attributes.color.array;
  nos.forEach((v, i) => { P.set([v.x, v.y, v.z], i * 3); });
  rede.add(pontos);
  // ligações: cada pessoa com as 2 mais próximas, e algumas direto com o especialista
  const lig = [];
  nos.forEach((v, i) => {
    const perto = nos.map((w, j) => [j, v.distanceToSquared(w)]).filter((x) => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
    perto.forEach(([j]) => { if (j > i) lig.push(v.x, v.y, v.z, nos[j].x, nos[j].y, nos[j].z); });
    if (i % 4 === 0) lig.push(v.x, v.y, v.z, 0, 0, 0);
  });
  rede.add(segmentos(lig, COR.menta, 0.22));
  const esp = nucleo(0.3); rede.add(esp);
  scene.add(rede);
  const etEsp = rotulo("Especialista", { altura: 0.3, borda: CSS.menta, depthTest: false }); etEsp.renderOrder = 10; scene.add(etEsp);
  const pulsos = criarPulsos(rede, 22, 0.3), ondas = criarOndas(rede, 5);
  legenda(scene, "Perguntas → resposta oficial do especialista", -1.95);
  const calor = new Float32Array(N);
  const centro = new Vector3();
  let prox = 0.3, flash = 0, quem = 0;
  return {
    scene, camera, tParado: 2.4,
    update(t, dt, p) {
      if (t + 5 < prox) prox = t;
      while (t >= prox) {
        quem = (quem * 7 + 13) % N;
        const i = quem, de = nos[i];
        calor[i] = Math.max(calor[i], 0.6);
        pulsos.disparar(de, centro, 1.1, 0xffffff, prox, (tt) => {
          flash = 1;
          ondas.disparar(centro, COR.menta, tt, 2.4);
          // a resposta volta para quem perguntou e para dois vizinhos
          const viz = nos.map((w, j) => [j, de.distanceToSquared(w)]).sort((a, b) => a[1] - b[1]).slice(0, 3);
          viz.forEach(([j], n) => pulsos.disparar(centro, nos[j], 0.9 + n * 0.15, COR.menta, tt, () => { calor[j] = 1; }));
        });
        prox += 1.35;
      }
      for (let i = 0; i < N; i++) {
        calor[i] = Math.max(0, calor[i] - (dt || 0) * 0.6);
        const base = 0.95 + 0.2 * Math.sin(t * 1.3 + i);
        pintar(C, i, calor[i] > 0.05 ? COR.menta : 0xcfe9df, base + calor[i] * 0.9);
      }
      pontos.geometry.attributes.color.needsUpdate = true;
      flash = Math.max(0, flash - (dt || 0) * 1.3);
      girarNucleo(esp, t, flash);
      pulsos.atualizar(t); ondas.atualizar(t);
      rede.rotation.y = t * 0.12 + p.tx * 0.4;
      rede.rotation.x = 0.12 + p.ty * 0.2 + (p.prog - 0.5) * 0.3;
      etEsp.position.set(0, -0.62, 0.9);
      camera.position.set(0, 0.2, 8.4);
      camera.lookAt(0, -0.1, 0);
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
