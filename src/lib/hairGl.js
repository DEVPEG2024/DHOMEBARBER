/**
 * Rendu WebGL de la recoloration cheveux / barbe (réaliste et rapide).
 *
 * Par pixel, dans le shader : la teinte et la saturation de la couleur cible remplacent
 * celles du pixel, mais la luminosité d'origine est conservée en la déplaçant vers celle
 * de la cible (paramètre `lift`) tout en gardant les écarts autour de la moyenne (`contrast`) :
 * les mèches, les ombres et les reflets restent, la couleur change. Les reflets très clairs
 * gardent une pointe de blanc (brillance), la saturation baisse dans les extrêmes.
 * Deux masques (cheveux, barbe) en textures 8 bits, échantillonnés en bilinéaire : bords doux.
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
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uHair;
uniform sampler2D uBeard;
uniform vec3 uColor;
uniform float uStrength;
uniform float uHairOn;
uniform float uBeardOn;
uniform float uHairMeanL;
uniform float uBeardMeanL;
uniform float uTargetL;
uniform float uLift;
uniform float uContrast;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = (mx + mn) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = mx - mn;
  if (d > 0.0001) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 c) {
  if (c.y < 0.0001) return vec3(c.z);
  float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
  float p = 2.0 * c.z - q;
  return vec3(hue2rgb(p, q, c.x + 1.0 / 3.0), hue2rgb(p, q, c.x), hue2rgb(p, q, c.x - 1.0 / 3.0));
}

vec3 recolor(vec3 src, float meanL, float lift) {
  float L = luma(src);
  vec3 target = rgb2hsl(uColor);
  // Luminosité moyenne déplacée vers la cible, texture (écarts) conservée
  float meanTarget = mix(meanL, uTargetL, lift);
  float L2 = clamp(meanTarget + (L - meanL) * uContrast, 0.0, 1.0);
  // Saturation atténuée dans les très sombres et très clairs (rendu naturel)
  float sat = target.y * (1.0 - pow(abs(2.0 * L2 - 1.0), 2.2) * 0.85);
  vec3 outc = hsl2rgb(vec3(target.x, sat, L2));
  // Brillance : les reflets d'origine gardent une pointe de blanc
  float spec = smoothstep(0.72, 1.0, L);
  outc = mix(outc, vec3(1.0), spec * 0.35);
  return outc;
}

void main() {
  vec3 src = texture2D(uImage, vUv).rgb;
  float aH = texture2D(uHair, vUv).r * uHairOn;
  float aB = texture2D(uBeard, vUv).r * uBeardOn;
  vec3 col = src;
  if (aH > 0.003) col = mix(col, recolor(src, uHairMeanL, uLift), min(1.0, aH * uStrength));
  // Barbe : éclaircissement plus doux (poils fins sur la peau)
  if (aB > 0.003) col = mix(col, recolor(src, uBeardMeanL, uLift * 0.85), min(1.0, aB * uStrength));
  gl_FragColor = vec4(col, 1.0);
}`;

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
  ['uImage', 'uHair', 'uBeard', 'uColor', 'uStrength', 'uHairOn', 'uBeardOn', 'uHairMeanL', 'uBeardMeanL', 'uTargetL', 'uLift', 'uContrast']
    .forEach((name) => { u[name] = gl.getUniformLocation(program, name); });
  gl.uniform1i(u.uImage, 0);
  gl.uniform1i(u.uHair, 1);
  gl.uniform1i(u.uBeard, 2);

  const texImage = makeTexture(gl);
  const texHair = makeTexture(gl);
  const texBeard = makeTexture(gl);
  const empty = new Uint8Array([0]);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // Pas de UNPACK_FLIP_Y_WEBGL : il est ignoré pour les ImageBitmap (photos), ce qui
  // désalignerait image et masques ; l'orientation est gérée dans le vertex shader
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  function uploadMask(tex, data, w, h) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (data && w && h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, empty);
  }

  return {
    gl,
    /**
     * Dessine `source` (vidéo, image, canvas) à `width` × `height` et recolore selon les masques
     * (`Uint8ClampedArray` de `maskWidth` × `maskHeight`, ou null).
     */
    render({ source, width, height, hairAlpha, beardAlpha, maskWidth, maskHeight, color, strength, hairOn, beardOn, hairMeanL, beardMeanL }) {
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texImage);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      } catch {
        return; // image pas encore prête
      }
      gl.activeTexture(gl.TEXTURE1);
      uploadMask(texHair, hairOn ? hairAlpha : null, maskWidth, maskHeight);
      gl.activeTexture(gl.TEXTURE2);
      uploadMask(texBeard, beardOn ? beardAlpha : null, maskWidth, maskHeight);
      const c = color?.rgb || { r: 0, g: 0, b: 0 };
      gl.uniform3f(u.uColor, c.r / 255, c.g / 255, c.b / 255);
      gl.uniform1f(u.uStrength, color ? strength : 0);
      gl.uniform1f(u.uHairOn, hairOn && hairAlpha ? 1 : 0);
      gl.uniform1f(u.uBeardOn, beardOn && beardAlpha ? 1 : 0);
      gl.uniform1f(u.uHairMeanL, hairMeanL ?? 0.3);
      gl.uniform1f(u.uBeardMeanL, beardMeanL ?? 0.25);
      gl.uniform1f(u.uTargetL, color?.targetL ?? 0.4);
      gl.uniform1f(u.uLift, color?.lift ?? 0.6);
      gl.uniform1f(u.uContrast, color?.contrast ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.deleteTexture(texImage);
      gl.deleteTexture(texHair);
      gl.deleteTexture(texBeard);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    },
  };
}
