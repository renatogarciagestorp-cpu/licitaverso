/* Licitacon — cena 3D da Biblioteca Jurídica (Three.js): 90 fontes oficiais em volta do acervo, com decisões viajando até ele.
 *
 * Fonte deste arquivo: src/inicio3d.js. O site carrega o pacote gerado na raiz (inicio3d.js), montado por
 * scripts/3d/montar.mjs com o Three.js e só com as partes usadas. O inicio.js baixa o pacote quando a cena chega perto
 * da tela e chama montar(elemento, tipo) para o lugar marcado com data-lv3d="biblioteca".
 * As outras ferramentas (Parecerista, Elaborador, Calculadora, Gestão e Comunidade) usam telas vivas em GSAP
 * (inicio-ui.js), que mostram a própria ferramenta trabalhando.
 *
 * Um só WebGLRenderer; a cena é desenhada num pedaço da tela dele e copiada para o canvas 2D do palco. Só desenha com
 * o palco à vista e a aba aberta. Com "reduzir movimento", aparece parada no quadro mais completo. O botão "Pausar
 * animação" (o mesmo das telas vivas) para a cena. Sem WebGL, nada muda na página.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Sprite, SpriteMaterial, MeshStandardMaterial,
  MeshBasicMaterial, SphereGeometry, IcosahedronGeometry, InstancedMesh, LineSegments,
  LineBasicMaterial, BufferGeometry, Float32BufferAttribute, Object3D, Vector3, Color, CanvasTexture,
  SRGBColorSpace, AdditiveBlending, HemisphereLight, DirectionalLight, PointLight, ACESFilmicToneMapping
} from "three";

// ------------------------------------------------------------------ cores da marca
const COR = {
  fundo: 0x0a2826, verde: 0x0fa36b, menta: 0x6fe0ae, mentaForte: 0x3fd49a,
  alta: 0xf0716b, media: 0xf2b544, baixa: 0x5bc0da
};
const CSS = { alta: "#F0716B", media: "#F2B544", baixa: "#5BC0DA", menta: "#6FE0AE", fundo: "#0A2826" };
const FONTE = "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif";

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


// ------------------------------------------------------------------ Biblioteca Jurídica
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

const CENAS = { biblioteca: cenaBiblioteca };

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
    if (v && !p.vis && !p.entrou) {
      p.entrou = true;
      if (M && M.animate && !REDUZ) {
        try { M.animate(palco, { opacity: [0, 1], scale: [0.97, 1] }, { duration: 0.9, ease: [0.22, 1, 0.36, 1] }); } catch (e) { /* segue */ }
      }
    }
    p.vis = v;
    if (v) { if (parado()) desenhar(p, 0); else acordar(); }
  }, { rootMargin: "60px 0px" });
  p.io.observe(palco);
}
