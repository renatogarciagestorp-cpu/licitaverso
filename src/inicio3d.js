/* Licitacon — cenas 3D da página inicial (Three.js), uma por ferramenta.
 *
 * Fonte deste arquivo: src/inicio3d.js. O site carrega o pacote gerado na raiz (inicio3d.js), montado por
 * scripts/3d/montar.mjs com o Three.js e só com as partes usadas. O inicio.js baixa o pacote quando a primeira
 * cena chega perto da tela e chama montar(elemento, tipo) para cada lugar marcado com data-lv3d="…":
 *   parecer     — folha do edital lida por um feixe de luz; três trechos acendem com os alfinetes ALTA/MÉDIA/BAIXA
 *   elaborador  — as seções do ETP caem uma a uma e montam o documento; no fim saem Word e PDF
 *   calculadora — o valor do posto como uma coluna dos 6 módulos da IN 05/2017, que se abre e se junta
 *   gestao      — trilho do tempo com os contratos passando pelos portais de reajuste, repactuação e prorrogação
 *   biblioteca  — 90 fontes oficiais em volta do acervo, com decisões viajando até ele
 *   comunidade  — balões de pergunta subindo das pessoas, com a resposta oficial em destaque
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
  SRGBColorSpace, AdditiveBlending, HemisphereLight, DirectionalLight, PointLight, ACESFilmicToneMapping, DoubleSide
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

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

// ------------------------------------------------------------------ 1. Parecerista
function cenaParecer() {
  const { scene, camera } = base(32);
  const W = 3.0, H = 3.9, LINHAS = 15, y0 = 1.25, passo = 0.165;
  const larguras = [0.92, 0.84, 0.95, 0.7, 0.9, 0.82, 0.96, 0.62, 0.88, 0.93, 0.76, 0.9, 0.85, 0.94, 0.58];
  const texPag = textura(600, 780, (g, w, h) => {
    g.fillStyle = "#F7FAF9"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#0F3431"; g.fillRect(0, 0, w, 74);
    g.font = "800 26px " + FONTE; g.fillStyle = "#6FE0AE"; g.textBaseline = "middle";
    g.fillText("EDITAL · PREGÃO ELETRÔNICO", 34, 38);
    g.fillStyle = "#C9D6D2";
    for (let i = 0; i < LINHAS; i++) {
      const py = Math.round(((H / 2 - (y0 - i * passo)) / H) * h);
      caixa(g, 34, py - 7, (w - 68) * larguras[i], 14, 7); g.fill();
    }
    g.fillStyle = "#E3EBE8"; caixa(g, 34, h - 96, w - 68, 50, 10); g.fill();
  });
  const pagina = new Group();
  const folha = new Mesh(new PlaneGeometry(W, H), new MeshStandardMaterial({ map: texPag, roughness: 0.75, metalness: 0 }));
  pagina.add(folha);
  // folhas de trás: o edital tem volume
  for (let i = 1; i <= 2; i++) {
    const f = new Mesh(new PlaneGeometry(W, H), new MeshStandardMaterial({ color: 0xdfe8e5, roughness: 0.9 }));
    f.position.set(i * 0.09, -i * 0.07, -i * 0.06);
    pagina.add(f);
  }
  // feixe de leitura
  const feixe = new Group();
  const barra = new Mesh(new BoxGeometry(W + 0.24, 0.035, 0.035), new MeshBasicMaterial({ color: COR.menta }));
  const halo = new Mesh(new PlaneGeometry(W + 0.5, 0.7), new MeshBasicMaterial({
    map: textura(16, 128, (g, w, h) => {
      const r = g.createLinearGradient(0, 0, 0, h);
      r.addColorStop(0, "rgba(111,224,174,0)"); r.addColorStop(0.5, "rgba(111,224,174,0.75)"); r.addColorStop(1, "rgba(111,224,174,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }), transparent: true, blending: AdditiveBlending, depthWrite: false
  }));
  halo.position.z = 0.02;
  feixe.add(barra, halo);
  feixe.position.z = 0.05;
  pagina.add(feixe);
  // achados
  const achados = [[2, COR.alta, "ALTA", CSS.alta, -0.55], [7, COR.media, "MÉDIA", CSS.media, 0.55], [12, COR.baixa, "BAIXA", CSS.baixa, -0.15]].map(([linha, cor, nome, css, px], k) => {
    const y = y0 - linha * passo;
    const marca = new Mesh(new PlaneGeometry(W - 0.3, 0.13), new MeshBasicMaterial({ color: cor, transparent: true, opacity: 0, depthWrite: false }));
    marca.position.set(0, y, 0.006);
    const pino = new Group();
    const haste = new Mesh(new CylinderGeometry(0.012, 0.012, 0.55, 8), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    haste.rotation.x = Math.PI / 2; haste.position.z = 0.275;
    const bola = new Mesh(new SphereGeometry(0.1, 24, 16), new MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.45, roughness: 0.3 }));
    bola.position.z = 0.56;
    const luz = brilho(cor, 0.7, 0.55); luz.position.z = 0.56;
    const et = rotulo(nome, { cor: css, borda: css, altura: 0.4, depthTest: false });
    et.position.set(0.62, 0.0, 0.66);
    pino.add(haste, bola, luz, et);
    pino.position.set(px, y, 0);
    pino.scale.setScalar(0.001);
    pagina.add(marca, pino);
    return { y, marca, pino };
  });
  // a folha fica deitada sobre a "mesa" e os alfinetes ficam em pé
  pagina.rotation.x = -1.02;
  const mesa = new Group();
  mesa.add(pagina);
  mesa.rotation.y = 0.38;
  mesa.position.set(-0.35, 0.2, 0);
  scene.add(mesa);
  const ciclo = 7.2, topo = H / 2 - 0.25, fundo = -H / 2 + 0.35;
  return {
    scene, camera, tParado: 4.5,
    update(t, dt, p) {
      const c = t % ciclo;
      const yScan = topo + (fundo - topo) * suave(0, 3.4, c);
      feixe.position.y = yScan;
      const some = suave(6.3, 7.0, c);
      feixe.visible = c < 3.6;
      achados.forEach((a, k) => {
        const tAcende = 3.4 * (topo - a.y) / (topo - fundo);
        const v = lim((c - tAcende) / 0.55, 0, 1);
        a.marca.material.opacity = 0.42 * saiCubica(v) * (1 - some);
        const s = Math.max(0.001, saiVolta(v) * (1 - some));
        a.pino.scale.setScalar(s);
        a.pino.position.z = 0.04 * Math.sin(t * 2 + k);
      });
      mesa.position.y = 0.2 + 0.06 * Math.sin(t * 0.9);
      mirar(camera, p, 8.6, new Vector3(0, 0.1, 0), { ang: 0.05, alt: 0.2 });
    }
  };
}

// ------------------------------------------------------------------ 2. Elaborador
function cenaElaborador() {
  const { scene, camera } = base(30);
  const secoes = ["Descrição da necessidade", "Requisitos da contratação", "Estimativa das quantidades", "Estimativa do valor", "Justificativa do parcelamento"];
  const grupo = new Group();
  const LW = 2.9, LD = 1.75, LH = 0.07, VAO = 0.13;
  const geo = new RoundedBoxGeometry(LW, LH, LD, 2, 0.03);
  const laterais = new MeshStandardMaterial({ color: COR.papel, roughness: 0.7 });
  const folhas = secoes.map((titulo, i) => {
    const tex = textura(640, 386, (g, w, h) => {
      g.fillStyle = "#F7FAF9"; g.fillRect(0, 0, w, h);
      g.beginPath(); g.arc(70, 78, 34, 0, Math.PI * 2); g.fillStyle = "#0FA36B"; g.fill();
      g.font = "800 36px " + FONTE; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(i + 1), 70, 80);
      g.textAlign = "left"; g.fillStyle = "#0F3431"; g.font = "800 34px " + FONTE;
      g.fillText(titulo, 124, 80);
      g.fillStyle = "#CFDCD8";
      [0.86, 0.74, 0.9, 0.6].forEach((f, k) => { caixa(g, 40, 150 + k * 50, (w - 80) * f, 16, 8); g.fill(); });
    });
    const topoMat = new MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const m = new Mesh(geo, [laterais, laterais, topoMat, laterais, laterais, laterais]);
    const borda = new Mesh(new BoxGeometry(LW + 0.04, 0.012, LD + 0.04), new MeshBasicMaterial({ color: COR.menta, transparent: true, opacity: 0 }));
    borda.position.y = -LH / 2 - 0.004;
    m.add(borda);
    m.userData = { borda, alvoY: i * VAO };
    grupo.add(m);
    return m;
  });
  // caneta: escreve na folha de cima
  const caneta = new Group();
  const corpo = new Mesh(new CylinderGeometry(0.06, 0.06, 1.0, 20), new MeshStandardMaterial({ color: 0x0f3431, roughness: 0.35, metalness: 0.2 }));
  const anel = new Mesh(new CylinderGeometry(0.065, 0.065, 0.12, 20), new MeshStandardMaterial({ color: COR.menta, roughness: 0.3, metalness: 0.4 }));
  anel.position.y = -0.38;
  const ponta = new Mesh(new ConeGeometry(0.06, 0.2, 20), new MeshStandardMaterial({ color: 0xd9e4e0, metalness: 0.7, roughness: 0.25 }));
  ponta.position.y = -0.6; ponta.rotation.x = Math.PI;
  caneta.add(corpo, anel, ponta);
  caneta.rotation.set(0.35, 0, -0.45);
  grupo.add(caneta);
  // saídas: Word e PDF
  const saidas = [["W", COR.word, -1], ["PDF", COR.pdf, 1]].map(([txt, cor, lado]) => {
    const tex = textura(256, 320, (g, w, h) => {
      g.fillStyle = "#fff"; caixa(g, 0, 0, w, h, 26); g.fill();
      g.fillStyle = "#" + new Color(cor).getHexString(); caixa(g, 0, 0, w, 120, 26); g.fill(); g.fillRect(0, 60, w, 60);
      g.fillStyle = "#fff"; g.font = "800 64px " + FONTE; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, w / 2, 64);
      g.fillStyle = "#D5DFDC"; [0.8, 0.65, 0.75].forEach((f, k) => { caixa(g, 30, 160 + k * 40, (w - 60) * f, 14, 7); g.fill(); });
    });
    const m = new Mesh(new PlaneGeometry(0.62, 0.78), new MeshStandardMaterial({ map: tex, transparent: true, side: DoubleSide, roughness: 0.6 }));
    m.userData.lado = lado;
    m.scale.setScalar(0.001);
    grupo.add(m);
    return m;
  });
  grupo.position.set(0, 0.25, 0);
  scene.add(grupo);
  const ciclo = 8.5;
  return {
    scene, camera, tParado: 6.0,
    update(t, dt, p) {
      const c = t % ciclo;
      const sobe = suave(7.6, 8.4, c);
      let topoY = -0.2;
      folhas.forEach((f, i) => {
        const t0 = 0.25 + i * 0.75;
        const v = lim((c - t0) / 0.7, 0, 1);
        const y = f.userData.alvoY + (1 - quique(v)) * 2.4 + sobe * (1.2 + i * 0.25);
        f.position.y = y;
        f.rotation.y = (1 - saiCubica(v)) * 0.6 * (i % 2 ? 1 : -1);
        f.visible = v > 0;
        const brilhoBorda = lim((c - t0 - 0.6) / 0.3, 0, 1) * (1 - suave(t0 + 1.2, t0 + 2.4, c) * 0.7);
        f.userData.borda.material.opacity = brilhoBorda * (1 - sobe);
        if (v > 0) topoY = Math.max(topoY, y);
      });
      // a caneta segue a folha de cima e rabisca
      caneta.position.set(0.55 + 0.35 * Math.sin(t * 5.2), topoY + 0.72 + 0.05 * Math.abs(Math.sin(t * 10.4)), 0.1 + 0.18 * Math.cos(t * 2.6));
      caneta.visible = c < 4.6 && c > 0.3;
      saidas.forEach((s, k) => {
        const v = lim((c - 4.6 - k * 0.25) / 0.6, 0, 1) * (1 - suave(7.3, 7.9, c));
        s.scale.setScalar(Math.max(0.001, saiVolta(v)));
        s.position.set(s.userData.lado * (1.95 + 0.05 * Math.sin(t * 1.4 + k)), 0.55 + v * 0.35 + 0.05 * Math.sin(t * 1.7 + k), 0.2);
        s.rotation.set(-0.15, -s.userData.lado * 0.35 + 0.08 * Math.sin(t + k), 0);
      });
      grupo.rotation.y = -0.35 + 0.06 * Math.sin(t * 0.5);
      mirar(camera, p, 8.4, new Vector3(0, 0.5, 0), { alt: 0.42, ang: 0.15 });
    }
  };
}

// ------------------------------------------------------------------ 3. Calculadora
// A planilha do posto como uma coluna dos 6 módulos da IN 05/2017: um módulo por vez sai como uma gaveta,
// com o nome e o valor; no alto, o valor mensal e o arco do reajuste pelo IPCA.
function cenaCalculadora() {
  const { scene, camera } = base(32);
  const mods = [["Módulo 1 · Remuneração", 2512.4], ["Módulo 2 · Encargos", 2268.13], ["Módulo 3 · Rescisão", 196.07], ["Módulo 4 · Reposição", 412.55], ["Módulo 5 · Insumos", 318.9], ["Módulo 6 · Indiretos e tributos", 1244.61]];
  const total = mods.reduce((t, m) => t + m[1], 0);
  const ALT = 2.5, LADO = 1.1, X0 = -1.15;
  const brl = (v) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const coluna = new Group();
  const cores = [0x0b6b4b, 0x0f8a5f, 0x14a873, 0x2fbf86, 0x55d29d, 0x8be3bb];
  let acc = 0;
  const camadas = mods.map(([nome, v], i) => {
    const h = Math.max(0.09, ALT * v / total);
    const m = new Mesh(new RoundedBoxGeometry(LADO, h - 0.012, LADO, 2, Math.min(0.05, h / 2.4)), new MeshStandardMaterial({ color: cores[i], roughness: 0.38, metalness: 0.08, emissive: COR.menta, emissiveIntensity: 0 }));
    const y = acc + h / 2;
    acc += h;
    m.position.y = y;
    const et = rotulo(nome + "  " + brl(v), { altura: 0.42, ponto: "#" + new Color(cores[i]).getHexString(), depthTest: false });
    et.material.opacity = 0;
    coluna.add(m);
    scene.add(et);
    return { m, et, y, h };
  });
  coluna.position.set(X0, -0.75, 0);
  // piso em grade de planilha
  const linhas = [];
  for (let i = -5; i <= 5; i++) linhas.push(-4, 0, i * 0.5, 4, 0, i * 0.5);
  for (let i = -8; i <= 8; i++) linhas.push(i * 0.5, 0, -2.5, i * 0.5, 0, 2.5);
  const gGrade = new BufferGeometry(); gGrade.setAttribute("position", new Float32BufferAttribute(linhas, 3));
  const grade = new LineSegments(gGrade, new LineBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.16 }));
  grade.position.y = coluna.position.y - 0.01;
  // arco do reajuste no alto da coluna
  const anelFundo = new Mesh(new TorusGeometry(0.88, 0.025, 8, 80), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }));
  const anelArco = new Mesh(new TorusGeometry(0.88, 0.05, 10, 80, 0.001), new MeshBasicMaterial({ color: COR.menta }));
  const anel = new Group(); anel.add(anelFundo, anelArco);
  anel.rotation.x = Math.PI / 2;
  anel.position.set(X0, coluna.position.y + ALT + 0.12, 0);
  const valor = rotulo("Valor do posto  R$ 6.952,66", { altura: 0.44, fundo: "rgba(7,30,28,0.92)", borda: CSS.menta, depthTest: false });
  valor.position.set(X0 + 0.2, coluna.position.y + ALT + 0.62, 0);
  const reaj = rotulo("IPCA  +4,87%", { altura: 0.4, cor: "#0A2826", fundo: CSS.menta, depthTest: false });
  reaj.position.set(X0 - 1.55, coluna.position.y + ALT - 0.1, 0);
  scene.add(grade, coluna, anel, valor, reaj);
  const PASSO = 1.25, ciclo = PASSO * 6 + 1.2;
  let arcoAtual = -1;
  return {
    scene, camera, tParado: 1.0 + PASSO * 0.55,
    update(t, dt, p) {
      const c = t % ciclo;
      camadas.forEach((k, i) => {
        const t0 = 0.6 + i * PASSO;
        const v = suave(t0, t0 + 0.35, c) * (1 - suave(t0 + PASSO - 0.3, t0 + PASSO, c));
        k.m.position.x = v * 0.75;
        k.m.position.z = v * 0.55;
        k.m.material.emissiveIntensity = v * 0.35;
        k.et.material.opacity = v;
        k.et.position.set(X0 + 0.75 + LADO / 2 + 0.25 + k.et.scale.x / 2, coluna.position.y + k.y, 0.55);
      });
      const arco = Math.max(0.001, Math.PI * 2 * 0.62 * saiCubica(suave(0.1, 1.2, c)) * (1 - suave(ciclo - 0.7, ciclo - 0.1, c)));
      if (Math.abs(arco - arcoAtual) > 0.01) {
        anelArco.geometry.dispose();
        anelArco.geometry = new TorusGeometry(0.88, 0.05, 10, 80, arco);
        arcoAtual = arco;
      }
      reaj.material.opacity = suave(0.6, 1.1, c) * (1 - suave(ciclo - 0.8, ciclo - 0.3, c));
      coluna.rotation.y = 0.18 * Math.sin(t * 0.4);
      mirar(camera, p, 10.6, new Vector3(0.55, 0.95, 0), { alt: 0.24, ang: -0.12 });
    }
  };
}

// ------------------------------------------------------------------ 4. Gestão Contratual
function cenaGestao() {
  const { scene, camera } = base(34);
  const curva = new CatmullRomCurve3([
    new Vector3(-4.2, -0.6, 1.4), new Vector3(-2.2, -0.2, 0.2), new Vector3(0, 0.1, -0.4),
    new Vector3(2.0, 0.5, -1.2), new Vector3(4.0, 1.0, -2.6)
  ]);
  const trilho = new Mesh(new TubeGeometry(curva, 160, 0.035, 10, false), new MeshBasicMaterial({ color: COR.menta, transparent: true, opacity: 0.55 }));
  scene.add(trilho);
  // meses
  const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const geoMes = new BoxGeometry(0.16, 0.04, 0.16);
  const matMes = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  MESES.forEach((m, i) => { void m;
    const u = (i + 0.5) / 12, pos = curva.getPointAt(u);
    const cubo = new Mesh(geoMes, matMes); cubo.position.copy(pos); scene.add(cubo);
  });
  // portais: reajuste, repactuação, prorrogação
  const portais = [[0.3, COR.media, "Reajuste", CSS.media], [0.6, COR.baixa, "Repactuação", CSS.baixa], [0.86, COR.menta, "Prorrogação", CSS.menta]].map(([u, cor, nome, css]) => {
    const pos = curva.getPointAt(u), tan = curva.getTangentAt(u);
    const anel = new Mesh(new TorusGeometry(0.42, 0.04, 12, 48), new MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.3, roughness: 0.3 }));
    anel.position.copy(pos);
    anel.lookAt(pos.clone().add(tan));
    const luz = brilho(cor, 1.4, 0.0); luz.position.copy(pos);
    const et = rotulo(nome, { altura: 0.4, borda: css, cor: css });
    et.position.copy(pos).add(new Vector3(0, 0.82, 0));
    scene.add(anel, luz, et);
    return { u, anel, luz, cor };
  });
  // contratos
  const contratos = [[COR.verde, 0.0, 0.055], [COR.media, 0.38, 0.045], [COR.alta, 0.7, 0.05]].map(([cor, u0, vel]) => {
    const g = new Group();
    const m = new Mesh(new CapsuleGeometry(0.13, 0.36, 6, 16), new MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.25, roughness: 0.3 }));
    m.rotation.z = Math.PI / 2;
    const l = brilho(cor, 0.9, 0.5);
    g.add(m, l);
    scene.add(g);
    return { g, u0, vel };
  });
  const tmp = new Vector3();
  return {
    scene, camera, tParado: 3.0,
    update(t, dt, p) {
      portais.forEach((pt) => { pt.calor = 0; });
      contratos.forEach((k) => {
        const u = (k.u0 + t * k.vel) % 1;
        const pos = curva.getPointAt(u);
        k.g.position.copy(pos).add(tmp.set(0, 0.16, 0));
        k.g.lookAt(tmp.copy(pos).add(curva.getTangentAt(u)).add(new Vector3(0, 0.16, 0)));
        k.g.rotateY(Math.PI / 2);
        const s = suave(0, 0.04, u) * (1 - suave(0.96, 1, u));
        k.g.scale.setScalar(Math.max(0.001, s));
        portais.forEach((pt) => { pt.calor = Math.max(pt.calor, 1 - lim(Math.abs(u - pt.u) / 0.06, 0, 1)); });
      });
      portais.forEach((pt, i) => {
        pt.anel.material.emissiveIntensity = 0.25 + pt.calor * 1.4;
        pt.luz.material.opacity = pt.calor * 0.85;
        pt.anel.scale.setScalar(1 + pt.calor * 0.12 + 0.02 * Math.sin(t * 2 + i));
      });
      mirar(camera, p, 9.6, new Vector3(0, 0.15, -0.4), { alt: 0.32, ang: 0.08, rolagem: 0.5 });
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

// ------------------------------------------------------------------ 6. Comunidade
function cenaComunidade() {
  const { scene, camera } = base(32);
  const pessoas = [-2.1, -0.7, 0.7, 2.1].map((x, i) => {
    const g = new Group();
    const cab = new Mesh(new SphereGeometry(0.2, 24, 16), new MeshStandardMaterial({ color: [0x9fe7c6, 0xffffff, 0x6fe0ae, 0xc3d9d3][i], roughness: 0.5 }));
    cab.position.y = 0.32;
    const corpo = new Mesh(new CapsuleGeometry(0.22, 0.2, 6, 16), new MeshStandardMaterial({ color: [0x0f8a5f, 0x14504a, 0x0fa36b, 0x1d6b5f][i], roughness: 0.5 }));
    corpo.scale.set(1, 0.7, 0.75);
    g.add(cab, corpo);
    g.position.set(x, -0.9, 0);
    scene.add(g);
    return g;
  });
  const texLinhas = (oficial) => textura(512, 170, (g, w) => {
    if (oficial) {
      g.fillStyle = "#0A2826"; g.font = "800 50px " + FONTE; g.textBaseline = "middle"; g.fillText("✓ Resposta oficial", 30, 58);
      g.fillStyle = "rgba(10,40,38,0.4)";
      [0.86, 0.62].forEach((f, k) => { caixa(g, 30, 104 + k * 30, (w - 60) * f, 13, 7); g.fill(); });
    } else {
      g.fillStyle = "#C9D6D2";
      [0.9, 0.72, 0.5].forEach((f, k) => { caixa(g, 28, 38 + k * 40, (w - 56) * f, 16, 8); g.fill(); });
    }
  });
  const tPerg = texLinhas(false), tOfi = texLinhas(true);
  const geoB = new RoundedBoxGeometry(1.5, 0.5, 0.14, 3, 0.1);
  const geoF = new PlaneGeometry(1.42, 0.47);
  const geoRabo = new ConeGeometry(0.09, 0.2, 12);
  const N = 6, baloes = [];
  for (let i = 0; i < N; i++) {
    const oficial = i % 3 === 2;
    const g = new Group();
    const matB = new MeshStandardMaterial({ color: oficial ? COR.menta : 0xffffff, roughness: 0.45, transparent: true, emissive: oficial ? COR.mentaForte : 0x000000, emissiveIntensity: oficial ? 0.25 : 0 });
    const b = new Mesh(geoB, matB);
    const f = new Mesh(geoF, new MeshBasicMaterial({ map: oficial ? tOfi : tPerg, transparent: true, depthWrite: false }));
    f.position.z = 0.075;
    const rabo = new Mesh(geoRabo, matB);
    rabo.rotation.z = Math.PI; rabo.position.set(-0.45, -0.3, 0);
    g.add(b, f, rabo);
    const mats = [matB, f.material];
    if (oficial) {
      const l = brilho(COR.menta, 2.2, 0.35); l.position.z = -0.1; g.add(l);
    }
    g.userData = { oficial, de: i % 4, fase: i / N, mats };
    scene.add(g);
    baloes.push(g);
  }
  const DUR = 7;
  return {
    scene, camera, tParado: 3.3,
    update(t, dt, p) {
      baloes.forEach((g, i) => {
        const u = ((t / DUR) + g.userData.fase) % 1;
        const quem = pessoas[g.userData.de];
        const oficial = g.userData.oficial;
        const x = (oficial ? 0.2 : quem.position.x * 0.75) + 0.25 * Math.sin(t * 0.8 + i * 2);
        g.position.set(x, -0.35 + u * 3.1, -0.3 - (i % 3) * 0.45);
        const sc = (oficial ? 1.15 : 0.92) * saiVolta(suave(0, 0.12, u) * 1.0);
        g.scale.setScalar(Math.max(0.001, sc));
        const op = 1 - suave(0.62, 0.88, u);
        g.userData.mats.forEach((m) => { m.opacity = op; });
        g.rotation.y = 0.18 * Math.sin(t * 0.7 + i);
        g.rotation.z = 0.04 * Math.sin(t * 1.1 + i);
      });
      pessoas.forEach((g, i) => { g.position.y = -0.9 + 0.04 * Math.sin(t * 2 + i * 1.3); });
      mirar(camera, p, 8.6, new Vector3(0, 0.55, 0), { alt: 0.1, ang: 0.0 });
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
    ms.forEach((m) => { if (m.map && m.map !== TEX_BRILHO) m.map.dispose(); m.dispose(); });
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
    mx: 0, my: 0, tx: 0, ty: 0, desloca: el.classList.contains("lvh-art") ? 0.13 : 0, cartao: TOQUE || REDUZ ? null : el.querySelector(".lvh-demo, .lvh-art-doc"), ultCartao: ""
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
