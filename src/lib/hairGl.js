/**
 * Rendu WebGL de la recoloration cheveux / barbe, photoréaliste (mode FAST, temps réel).
 *
 * Principe (par pixel, dans le shader, en espace Oklab, perceptuel) :
 * - la clarté L d'origine est conservée : sa moyenne sur la zone est déplacée vers celle de
 *   la couleur cible (`lift`), les écarts autour de la moyenne (mèches, ombres, reflets)
 *   sont gardés (`contrast`), plus un décalage manuel (`brightness`) ;
 * - la teinte vient de la cible, le chroma est celui de la cible modulé par la clarté (peu de
 *   couleur dans les zones très sombres ou très claires) et par la variation naturelle des
 *   mèches, réglable (`saturation`) ;
 * - cheveux gris : pixels peu saturés et plus clairs que la masse, ramenés vers elle selon
 *   `gray` (couverture) ;
 * - racines : masque `uRootsMask` (bande le long de la ligne des cheveux), plus sombres et
 *   moins colorées selon `roots` ;
 * - les reflets très clairs gardent une part du pixel d'origine (brillance) ;
 * - `split` : avant / après, à gauche du curseur l'image d'origine.
 * Les masques (cheveux, barbe, racines) sont des textures 8 bits bilinéaires : bords doux.
 *
 * `createHairRenderer(canvas)` renvoie null si WebGL est indisponible (repli canvas 2D).
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  // Ligne 0 des textures = haut de l'image (aucun retournement à l'envoi, valable pour
  // vidéo, image, ImageBitmap et tableaux) : le haut de l'écran échantillonne v = 0
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uHair;
uniform sampler2D uBeard;
uniform sampler2D uRootsMask;
uniform vec3 uTargetLab;     // couleur cible en Oklab
uniform float uStrength;
uniform float uSaturation;
uniform float uBrightness;
uniform float uRoots;
uniform float uGray;
uniform float uSplit;
uniform float uMirror;
uniform float uHairOn;
uniform float uBeardOn;
uniform float uHairMeanL;
uniform float uBeardMeanL;
uniform float uLift;
uniform float uContrast;
uniform float uBeardLift;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}
float cbrt(float x) { return pow(max(x, 0.0), 1.0 / 3.0); }
vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float l_ = cbrt(l);
  float m_ = cbrt(m);
  float s_ = cbrt(s);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_);
}
vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

// Recolore un pixel (Oklab) d'une zone de clarté moyenne meanL. rootsW : poids racine 0..1.
vec3 recolorLab(vec3 lab, float meanL, float lift, float rootsW) {
  float L = lab.x;
  float C = length(lab.yz);
  float tC = length(uTargetLab.yz);
  vec2 tHue = tC > 1e-4 ? uTargetLab.yz / tC : vec2(0.0);

  // Cheveux gris / blancs : peu de chroma et nettement plus clairs que la masse.
  // Couverture : leur clarté est ramenée vers celle de la masse (la teinte les couvre)
  float gray = (1.0 - smoothstep(0.02, 0.06, C)) * smoothstep(meanL + 0.04, meanL + 0.18, L);
  float Lsrc = mix(L, meanL + (L - meanL) * 0.15, gray * uGray);

  // Clarté : moyenne déplacée vers la cible, écarts (mèches, ombres) conservés
  float meanTarget = mix(meanL, uTargetLab.x, lift);
  float L2 = clamp(meanTarget + (Lsrc - meanL) * uContrast + uBrightness, 0.0, 1.0);

  // Chroma : cible × réglage, atténué dans les extrêmes de clarté, modulé par la mèche
  float tone = 1.0 - pow(abs(2.0 * L2 - 1.0), 2.4) * 0.8;
  float variation = clamp(0.75 + 0.5 * (Lsrc - meanL) / max(meanL, 0.08), 0.5, 1.35);
  float C2 = tC * uSaturation * tone * variation;

  // Racines : plus sombres et moins colorées près de la ligne des cheveux
  float r = rootsW * uRoots;
  L2 = clamp(L2 - r * 0.2, 0.0, 1.0);
  C2 *= 1.0 - r * 0.55;

  vec3 lin = oklabToLinear(vec3(L2, tHue * C2));
  // Brillance : les reflets d'origine très clairs gardent une part du pixel d'origine
  float spec = smoothstep(0.85, 1.0, L);
  return mix(lin, oklabToLinear(lab), spec * 0.5);
}

void main() {
  vec3 src = texture2D(uImage, vUv).rgb;
  vec3 lin = srgbToLinear(src);
  vec3 lab = linearToOklab(lin);
  float aH = texture2D(uHair, vUv).r * uHairOn;
  float aB = texture2D(uBeard, vUv).r * uBeardOn;
  float rootsW = texture2D(uRootsMask, vUv).r;
  vec3 outLin = lin;
  if (aH > 0.003) outLin = mix(outLin, recolorLab(lab, uHairMeanL, uLift, rootsW), min(1.0, aH * uStrength));
  if (aB > 0.003) outLin = mix(outLin, recolorLab(lab, uBeardMeanL, uLift * uBeardLift, 0.0), min(1.0, aB * uStrength));
  // Avant / après : à gauche du curseur (côté écran, même en miroir), l'original
  float x = uMirror > 0.5 ? 1.0 - vUv.x : vUv.x;
  if (x < uSplit) outLin = lin;
  gl_FragColor = vec4(linearToSrgb(outLin), 1.0);
}`;

const UNIFORMS = [
  'uImage', 'uHair', 'uBeard', 'uRootsMask', 'uTargetLab', 'uStrength', 'uSaturation', 'uBrightness', 'uRoots', 'uGray',
  'uSplit', 'uMirror', 'uHairOn', 'uBeardOn', 'uHairMeanL', 'uBeardMeanL', 'uLift', 'uContrast', 'uBeardLift',
];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

function makeTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

/** Crée le moteur de rendu sur `canvas`. Renvoie null si WebGL est indisponible. */
export function createHairRenderer(canvas) {
  const opts = { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return null;

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch {
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  UNIFORMS.forEach((name) => { u[name] = gl.getUniformLocation(program, name); });
  gl.uniform1i(u.uImage, 0);
  gl.uniform1i(u.uHair, 1);
  gl.uniform1i(u.uBeard, 2);
  gl.uniform1i(u.uRootsMask, 3);

  const texImage = makeTexture(gl);
  const texHair = makeTexture(gl);
  const texBeard = makeTexture(gl);
  const texRoots = makeTexture(gl);
  const empty = new Uint8Array([0]);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // Pas de UNPACK_FLIP_Y_WEBGL : il est ignoré pour les ImageBitmap (photos), ce qui
  // désalignerait image et masques ; l'orientation est gérée dans le vertex shader
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  function uploadMask(unit, tex, data, w, h) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (data && w && h && data.length === w * h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, empty);
  }

  return {
    gl,
    /**
     * Dessine `source` (vidéo, image, canvas) à `width` × `height` et recolore selon les masques
     * (`Uint8ClampedArray` de `maskWidth` × `maskHeight`, ou null) et les réglages.
     */
    render({
      source, width, height, hairAlpha, beardAlpha, rootsAlpha, maskWidth, maskHeight, color, hairOn, beardOn,
      hairMeanL, beardMeanL, strength = 1, saturation = 1, brightness = 0, roots = 0, gray = 0, split = 0, mirror = false,
    }) {
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texImage);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      } catch {
        return; // image pas encore prête
      }
      uploadMask(gl.TEXTURE1, texHair, hairOn ? hairAlpha : null, maskWidth, maskHeight);
      uploadMask(gl.TEXTURE2, texBeard, beardOn ? beardAlpha : null, maskWidth, maskHeight);
      uploadMask(gl.TEXTURE3, texRoots, roots > 0 ? rootsAlpha : null, maskWidth, maskHeight);
      const lab = color?.lab || [0.5, 0, 0];
      gl.uniform3f(u.uTargetLab, lab[0], lab[1], lab[2]);
      gl.uniform1f(u.uStrength, color ? strength : 0);
      gl.uniform1f(u.uSaturation, saturation);
      gl.uniform1f(u.uBrightness, brightness);
      gl.uniform1f(u.uRoots, roots);
      gl.uniform1f(u.uGray, gray);
      gl.uniform1f(u.uSplit, split);
      gl.uniform1f(u.uMirror, mirror ? 1 : 0);
      gl.uniform1f(u.uHairOn, hairOn && hairAlpha ? 1 : 0);
      gl.uniform1f(u.uBeardOn, beardOn && beardAlpha ? 1 : 0);
      gl.uniform1f(u.uHairMeanL, hairMeanL ?? 0.35);
      gl.uniform1f(u.uBeardMeanL, beardMeanL ?? 0.3);
      gl.uniform1f(u.uLift, color?.lift ?? 0.6);
      gl.uniform1f(u.uContrast, color?.contrast ?? 1);
      // Barbe : éclaircissement modéré pour les teintes claires (poils épars sur la peau)
      gl.uniform1f(u.uBeardLift, color?.light ? 0.55 : 0.8);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.deleteTexture(texImage);
      gl.deleteTexture(texHair);
      gl.deleteTexture(texBeard);
      gl.deleteTexture(texRoots);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    },
  };
}
