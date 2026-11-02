/**
 * shaders.js: GLSL sources, kept as JavaScript template strings.
 *
 * Naming: VS_* / FS_* are the vertex / fragment shaders of one material, GLSL_* are chunks shared by several
 * materials. The terrain is the same analytic height field as sim.js, evaluated on the GPU. Constants such as
 * the wave count, the level geometry and the wind direction are injected from sim.js so both sides always agree.
 */
// fine sand ripples: wave vectors, phase drifts and glitter cell scale (the matching phases are computed on the CPU, see src/game/03-environment.js)
const RIPPLE = {
  kr: 12.5,
  w1: [0.41, -0.19],
  w2: [-0.21, 0.63],
  w3: [0.07, 0.11],
  pw1: [0.067, 0.031],
  pw2: [-0.041, 0.093],
  cellScale: 60
};
// formats a pair of numbers as a GLSL vec2 literal
const V2 = (a) => `vec2(${a[0].toFixed(4)}, ${a[1].toFixed(4)})`;

// height-field chunk: dune waves (same maths as sim.js terrain) plus the Jbel level; shared by the terrain and wisp vertex shaders
const GLSL_TERRAIN = `
uniform vec4 uK[${NCOMP}];
uniform vec4 uQ[${NCOMP}];
uniform vec4 uM[${NCOMP}];
uniform vec4 uP[${NCOMP}];
uniform float uAmp;
uniform float uLvl; uniform vec4 uJO;
uniform vec4 uJA[${JBEL.NM}]; uniform vec4 uJB[${JBEL.NM}]; uniform vec4 uJC[${JBEL.NM}];
/* Jbel level: same formula as jbelAdd (sim.js). p is local to the player; uJO = the (s, t) of the player in the level frame */
vec3 jbel(vec2 p) {
  float s = uJO.x + dot(p, vec2(${JBEL.dx.toFixed(7)}, ${JBEL.dz.toFixed(7)}));
  float t = uJO.y + dot(p, vec2(${JBEL.nx.toFixed(7)}, ${JBEL.nz.toFixed(7)}));
  float h = ${JBEL.floor.toFixed(2)}; float hs = 0.0; float ht = 0.0;
  for (int i = 0; i < ${JBEL.NM}; i++) {
    vec4 A = uJA[i]; vec4 B = uJB[i]; vec4 C = uJC[i];
    float R = B.z;
    float qs = s - 0.5 * (A.x + A.y), qt = t - A.z;
    float ds = abs(qs) - (0.5 * (A.y - A.x) - R), dt = abs(qt) - (A.w - R);
    vec2 o = max(vec2(ds, dt), 0.0);
    float len = length(o);
    float sd = len + min(max(ds, dt), 0.0) - R;
    if (sd < ${JBEL.Wc.toFixed(2)}) {
      vec2 g = len > 1e-5 ? sign(vec2(qs, qt)) * o / len : (ds > dt ? vec2(sign(qs), 0.0) : vec2(0.0, sign(qt)));
      float u = clamp((sd + ${JBEL.Wc.toFixed(2)}) / ${(2 * JBEL.Wc).toFixed(2)}, 0.0, 1.0);
      float w = 1.0 - u * u * (3.0 - 2.0 * u);
      float dwd = -6.0 * u * (1.0 - u) / ${(2 * JBEL.Wc).toFixed(2)};
      float T = B.x + B.w * (s - A.x); float dT = B.w;
      if (C.x > 0.0) {
        float a1 = s * ${JBEL.k1.toFixed(5)} + C.y, a2 = s * ${JBEL.k2.toFixed(5)} + C.y * 2.3;
        T += C.x * (0.6 * sin(a1) + 0.4 * sin(a2));
        dT += C.x * (0.6 * ${JBEL.k1.toFixed(5)} * cos(a1) + 0.4 * ${JBEL.k2.toFixed(5)} * cos(a2));
      }
      float us = clamp((s - (A.y - ${JBEL.Wc.toFixed(2)} - ${JBEL.L.toFixed(2)})) / ${JBEL.L.toFixed(2)}, 0.0, 1.0);
      T += B.y * us * us * (3.0 - 2.0 * us); dT += B.y * 6.0 * us * (1.0 - us) / ${JBEL.L.toFixed(2)};
      float amp = T - ${JBEL.floor.toFixed(2)}; float H = ${JBEL.floor.toFixed(2)} + amp * w;
      if (H > h) { h = H; hs = dT * w + amp * dwd * g.x; ht = amp * dwd * g.y; }
    }
  }
  return vec3(h, hs * ${JBEL.dx.toFixed(7)} + ht * ${JBEL.nx.toFixed(7)}, hs * ${JBEL.dz.toFixed(7)} + ht * ${JBEL.nz.toFixed(7)});
}
/* Rendering only: the cliff vertices are pulled onto two clean lines (the top edge and the foot of the wall) instead of
   landing at random on the slope, which avoids sawtooth artefacts. Physics (sim.js) is untouched: the visual edge is the
   point where the ground really starts to drop. k = snap width on the top side (about one mesh cell). */
vec3 jbSnap(vec2 p, float k) {
  float s = uJO.x + dot(p, vec2(${JBEL.dx.toFixed(7)}, ${JBEL.dz.toFixed(7)}));
  float t = uJO.y + dot(p, vec2(${JBEL.nx.toFixed(7)}, ${JBEL.nz.toFixed(7)}));
  float best = 1e9; vec2 bg = vec2(0.0);
  for (int i = 0; i < ${JBEL.NM}; i++) {
    vec4 A = uJA[i]; vec4 B = uJB[i]; float R = B.z;
    float qs = s - 0.5 * (A.x + A.y), qt = t - A.z;
    float ds = abs(qs) - (0.5 * (A.y - A.x) - R), dt = abs(qt) - (A.w - R);
    vec2 o = max(vec2(ds, dt), 0.0);
    float len = length(o);
    float sd = len + min(max(ds, dt), 0.0) - R;
    if (sd < best) { best = sd; bg = len > 1e-5 ? sign(vec2(qs, qt)) * o / len : (ds > dt ? vec2(sign(qs), 0.0) : vec2(0.0, sign(qt))); }
  }
  float tg = best;
  if (best < 0.0 && best > -${JBEL.rim.toFixed(2)} - k) tg = -${JBEL.rim.toFixed(2)};
  else if (best >= 0.0 && best < ${JBEL.foot.toFixed(2)}) tg = ${JBEL.foot.toFixed(2)};
  vec2 d = bg * (best - tg);
  return vec3(p - vec2(${JBEL.dx.toFixed(7)} * d.x + ${JBEL.nx.toFixed(7)} * d.y, ${JBEL.dz.toFixed(7)} * d.x + ${JBEL.nz.toFixed(7)} * d.y), abs(best - tg) > 1e-4 ? 1.0 : 0.0);
}
/* height and gradient at p (local coordinates): returns (h, dh/dx, dh/dz); lod fades the fine components out with distance */
vec3 terrain(vec2 p, float lod) {
  float h = 0.0; vec2 g = vec2(0.0);
  float farK = 0.16 * smoothstep(90.0, 320.0, length(p));
  for (int i = 0; i < ${NCOMP}; i++) {
    vec4 K = uK[i]; vec4 Q = uQ[i]; vec4 M = uM[i]; vec4 P = uP[i];
    float amp = K.z * mix(1.0, lod, Q.w);
    float qa = dot(Q.xy, p) + P.y;
    float wq = Q.z * cos(qa);
    float th = dot(K.xy, p) + P.x + Q.z * sin(qa);
    vec2 dth = K.xy + wq * Q.xy;
    float th2 = th + K.w * sin(th);
    float dth2 = 1.0 + K.w * cos(th);
    float sn = sin(th2); float cs = cos(th2);
    float r = sqrt(sn * sn + P.w + farK * M.w);
    float f = mix(sn, 0.64 - r, M.w);
    float df = mix(cs, -sn * cs / r, M.w);
    float ea = dot(M.xy, p) + P.z;
    float E = 1.0 - M.z * 0.5 * (1.0 - sin(ea));
    float dE = M.z * 0.5 * cos(ea);
    h += amp * E * f;
    g += amp * (E * df * dth2 * dth + f * dE * M.xy);
  }
  vec3 r = vec3(h, g) * uAmp;
  if (uLvl > 0.5) r += jbel(p);
  return r;
}
/* cheap height from the 4 largest components only: used by the sun-shadow ray steps */
float heightBig(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 K = uK[i]; vec4 Q = uQ[i]; vec4 M = uM[i]; vec4 P = uP[i];
    float th = dot(K.xy, p) + P.x + Q.z * sin(dot(Q.xy, p) + P.y);
    float sn = sin(th + K.w * sin(th));
    float f = mix(sn, 0.64 - sqrt(sn * sn + P.w), M.w);
    h += K.z * (1.0 - M.z * 0.5 * (1.0 - sin(dot(M.xy, p) + P.z))) * f;
  }
  h *= uAmp;
  if (uLvl > 0.5) h += jbel(p).x;
  return h;
}
`;

// sky colour functions (day gradient blended with the night sky through uNight); shared by the terrain, sky and flag shaders
const GLSL_SKY = `
uniform vec3 uSun; uniform float uNight;
/* night sky (Tiziri level): milky indigo horizon, almost black zenith, moon halo */
vec3 skyNight(vec3 d) {
  float e = max(d.y, 0.0);
  vec3 c = vec3(0.17, 0.20, 0.44);
  c = mix(c, vec3(0.075, 0.115, 0.31), smoothstep(0.0, 0.20, e));
  c = mix(c, vec3(0.022, 0.045, 0.15), smoothstep(0.16, 0.85, e));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(0.30, 0.42, 0.78) * pow(sd, 5.0) * 0.30 + vec3(0.60, 0.72, 1.0) * pow(sd, 70.0) * 0.45;
  return c;
}
/* day sky: warm horizon up to a deep blue zenith, sun glow; blended with the night sky through uNight */
vec3 skyBase(vec3 d) {
  float e = max(d.y, 0.0);
  vec3 c = vec3(1.00, 0.72, 0.46);
  c = mix(c, vec3(0.96, 0.52, 0.45), smoothstep(0.0, 0.10, e));
  c = mix(c, vec3(0.62, 0.50, 0.66), smoothstep(0.07, 0.30, e));
  c = mix(c, vec3(0.25, 0.46, 0.66), smoothstep(0.22, 0.56, e));
  c = mix(c, vec3(0.07, 0.17, 0.44), smoothstep(0.48, 1.00, e));
  float az = dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)) * 0.5 + 0.5;
  c *= mix(vec3(0.84, 0.80, 0.94), vec3(1.0), mix(az, 1.0, smoothstep(0.0, 0.6, e)));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.00, 0.56, 0.24) * pow(sd, 5.0) * 0.24;
  c += vec3(1.00, 0.78, 0.46) * pow(sd, 40.0) * 0.42;
  return mix(c, skyNight(d), uNight);
}
/* full sky: skyBase + sun disc + a few soft clouds */
vec3 skyFull(vec3 d) {
  vec3 c = skyBase(d);
  float sd = dot(d, uSun);
  c = mix(c, vec3(1.0, 0.95, 0.80) * 1.5, smoothstep(0.99955, 0.99985, sd) * (1.0 - uNight));
  if (d.y > 0.03) {
    vec2 uv = d.xz / (d.y + 0.30) * 1.3;
    float w = sin(uv.x * 1.7 + 1.3 * sin(uv.y * 0.9 + 0.7)) * 0.5 + 0.5;
    float s2 = sin(uv.y * 5.5 + uv.x * 0.8 + 2.0 * sin(uv.x * 1.3)) * 0.5 + 0.5;
    float cl = smoothstep(0.50, 0.95, w * s2) * smoothstep(0.04, 0.30, d.y) * (1.0 - smoothstep(0.65, 1.0, d.y));
    vec3 cc = mix(vec3(1.0, 0.72, 0.58), vec3(1.0, 0.90, 0.78), smoothstep(0.1, 0.5, d.y));
    c = mix(c, cc, cl * 0.30 * (1.0 - uNight));
  }
  return c;
}
/* soft shoulder: values above 0.74 are compressed instead of clipped */
vec3 tone(vec3 c) { vec3 hi = max(c - 0.74, 0.0); return min(c, vec3(0.74)) + 0.26 * (1.0 - exp(-hi / 0.26)); }
/* cheap hash noise (fract based, no sin) */
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

/* fabrics at night: the warm light turns moonlit (applied before the boost glows, which stay vivid) */
const GLSL_NG = `
uniform float uNight;
vec3 nightGrade(vec3 c) {
  float l = dot(c, vec3(0.30, 0.59, 0.11));
  vec3 n = mix(vec3(l), c, 0.6) * vec3(0.54, 0.68, 1.02) * 0.95 + vec3(0.004, 0.010, 0.032);
  return mix(c, n, uNight);
}
`;

/* ---- terrain ---- */
const VS_TERRAIN = `
${GLSL_TERRAIN}
uniform vec2 uSun2D; uniform float uSunTan;
varying vec2 vL; varying vec2 vG; varying float vH; varying float vSh;
void main() {
  vec2 p = position.xz;
  /* fine detail fades out with the distance to the player */
  float lod = 1.0 - smoothstep(35.0, 140.0, length(p));
  float snapped = 0.0;
  if (uLvl > 0.5) { vec3 sn = jbSnap(p, min(0.8 + 0.06 * length(position.xz), 12.0)); p = sn.xy; snapped = sn.z; }
  vec3 t = terrain(p, lod);
  vL = p; vG = t.yz * (1.0 - snapped); vH = t.x;
  /* sun shadow: march towards the sun over the coarse height field */
  float sh = 1.0;
#if SH_STEPS > 0
  for (int i = 0; i < SH_STEPS; i++) {
    float dd = 2.0 * exp2(float(i));
    float hs = heightBig(p + uSun2D * dd);
    float pw = 0.35 + 0.05 * dd;
    float occ = smoothstep(-pw, pw, hs - (t.x + dd * uSunTan - 0.1));
    sh = min(sh, 1.0 - occ);
  }
#endif
  vSh = sh;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, t.x, p.y, 1.0);
}`;

const FS_TERRAIN = `
${GLSL_SKY}
uniform float uTime; uniform vec2 uSun2D;
uniform vec3 uCamLocal;
uniform vec4 uRP; uniform vec2 uPP; uniform vec2 uCell;
uniform float uShAmt; uniform float uShOff; uniform float uShLen;
uniform float uFogD; uniform float uFar;
uniform float uLvl; uniform vec4 uJO;
uniform vec4 uGP; uniform vec3 uGC;
varying vec2 vL; varying vec2 vG; varying float vH; varying float vSh;
const vec2 WINDV = vec2(${WIND.x.toFixed(5)}, ${WIND.z.toFixed(5)});
const vec2 RW0 = WINDV * ${RIPPLE.kr.toFixed(3)};
const vec2 RW1 = ${V2(RIPPLE.w1)};
const vec2 RW2 = ${V2(RIPPLE.w2)};
const vec2 RW3 = ${V2(RIPPLE.w3)};
const vec2 PW1 = ${V2(RIPPLE.pw1)};
const vec2 PW2 = ${V2(RIPPLE.pw2)};
/* moonlit sand: from near-black indigo to bluish silver */
vec3 rampN(float t) {
  vec3 c = mix(vec3(0.014, 0.020, 0.075), vec3(0.055, 0.070, 0.210), smoothstep(0.0, 0.36, t));
  c = mix(c, vec3(0.115, 0.185, 0.385), smoothstep(0.34, 0.54, t));
  c = mix(c, vec3(0.195, 0.290, 0.500), smoothstep(0.50, 0.72, t));
  c = mix(c, vec3(0.360, 0.470, 0.675), smoothstep(0.70, 1.00, t));
  return c;
}
vec3 ramp(float t) {
  vec3 c = mix(vec3(0.07, 0.11, 0.30), vec3(0.24, 0.20, 0.46), smoothstep(0.0, 0.36, t));
  c = mix(c, vec3(0.80, 0.31, 0.20), smoothstep(0.34, 0.50, t));
  c = mix(c, vec3(0.99, 0.55, 0.22), smoothstep(0.48, 0.64, t));
  c = mix(c, vec3(1.00, 0.76, 0.34), smoothstep(0.62, 1.00, t));
  return c;
}
void main() {
  /* surface normal: analytic gradient up close, blending to the screen-derivative face normal (Nf) with distance */
  vec3 wp = vec3(vL.x, vH, vL.y);
  vec3 toC = uCamLocal - wp;
  float dist = length(toC);
  vec3 V = toC / dist;
  vec3 N = normalize(vec3(-vG.x, 1.0, -vG.y));
  vec3 Nf = normalize(cross(dFdx(wp), dFdy(wp)));
  if (Nf.y < 0.0) Nf = -Nf;
  N = normalize(mix(N, Nf, smoothstep(110.0, 360.0, dist)));
  float slope = length(vG);
  float alongW = dot(vG, WINDV);
  /* level: steep faces are rock (computed on the blended normal, so it is also right from afar) */
  float wall = 0.0; float sLv = 0.0; float tLv = 0.0;
  if (uLvl > 0.5) {
    sLv = uJO.x + dot(vL, vec2(${JBEL.dx.toFixed(7)}, ${JBEL.dz.toFixed(7)}));
    tLv = uJO.y + dot(vL, vec2(${JBEL.nx.toFixed(7)}, ${JBEL.nz.toFixed(7)}));
    /* the wall is a near-vertical facet: its normal comes from the geometry (the vertices are explicitly snapped there, see jbSnap) */
    float wg = smoothstep(0.7, 2.4, length(Nf.xz) / max(Nf.y, 0.03));
    N = normalize(mix(N, Nf, wg));
    wall = max(smoothstep(0.5, 2.0, length(N.xz) / max(N.y, 0.03)), wg);
  }

/* wind ripples: a small normal perturbation near the camera, masked on walls and steep slopes */
#ifdef RIPPLE
  float rf = (1.0 - smoothstep(14.0, 70.0, dist)) * (1.0 - wall);
  if (rf > 0.001) {
    float ph = dot(vL, RW0) + uRP.x + 1.6 * sin(dot(vL, RW1) + uRP.y) + 0.8 * sin(dot(vL, RW2) + uRP.z);
    float mask = 0.5 + 0.5 * sin(dot(vL, RW3) + uRP.w) * sin(dot(vL, RW2 * 1.7 + RW1) + uRP.x * 0.5);
    float wm = smoothstep(-0.30, 0.05, alongW) * (1.0 - 0.6 * smoothstep(0.45, 0.8, slope));
    vec2 dn = WINDV * (0.115 * rf * mask * mask * wm * cos(ph));
    N = normalize(vec3(-vG.x - dn.x, 1.0, -vG.y - dn.y));
  }
#endif

  /* lighting: N.L maps to a palette coordinate t; shadowed texels fall back to the dark end of the ramp (day palette or moonlit palette) */
  float nl = dot(N, uSun);
  float t = clamp(0.5 + nl * 0.55, 0.0, 1.0);
  float ts = 0.10 + 0.20 * smoothstep(0.0, 0.9, t);
  float lit = vSh;
  t = mix(ts, t, lit);
  vec3 col = mix(ramp(t), rampN(t), uNight);

  if (uLvl > 0.5) {
    /* sandstone strata: undulating bands from brick red to ochre, with a thin purple line */
    float b1 = sin(vH * 0.9 + 1.4 * sin(sLv * 0.021 + tLv * 0.013) + 0.6 * sin(tLv * 0.05));
    float b2 = sin(vH * 3.1 + 0.9 * sin(sLv * 0.07 + 1.3));
    float b3 = sin(vH * 11.0 + 2.0 * sin(tLv * 0.11 + sLv * 0.04));
    float st = 0.5 + 0.5 * (0.55 * b1 + 0.30 * b2 + 0.15 * b3);
    vec3 rockTint = mix(vec3(0.74, 0.34, 0.26), vec3(1.0, 0.64, 0.46), st);
    rockTint = mix(rockTint, vec3(0.62, 0.30, 0.36), smoothstep(0.78, 1.0, 0.5 + 0.5 * b2) * 0.55);
    col = mix(col, col * rockTint * 1.12, wall);
    /* canyon floor: deep purple, almost black */
    float dep = 1.0 - smoothstep(-72.0, -8.0, vH);
    col = mix(col, vec3(0.10, 0.08, 0.20) + col * 0.14, dep * 0.82);
  }

  /* slight darkening of the troughs and a very subtle slow colour drift */
  col *= mix(0.84, 1.0, smoothstep(-9.0, 5.0, vH));
  float pa = sin(dot(vL, PW1) + uPP.x) * 0.5 + sin(dot(vL, PW2) + uPP.y) * 0.5;
  col *= vec3(1.0 + 0.035 * pa, 1.0, 1.0 - 0.05 * pa);

  /* rim light on the edges facing away from the camera */
  float ndv = max(dot(N, V), 0.0);
  float rim = pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);
  col += mix(vec3(1.0, 0.72, 0.42), vec3(0.34, 0.52, 1.0), uNight) * rim * lit * 0.55 * smoothstep(-0.1, 0.5, nl);

  /* sand glitter */
#ifdef GLITTER
  {
    float gf = (1.0 - smoothstep(6.0, 40.0, dist)) * (1.0 - wall);
    if (gf > 0.001) {
      vec2 ci = mod(floor(vL * ${RIPPLE.cellScale.toFixed(1)} + uCell), 4096.0);
      float r1 = hash12(ci); float r2 = hash12(ci + 17.3); float r3 = hash12(ci + 41.7);
      if (r1 > 0.955) {
        vec3 gn = normalize(N + (vec3(r2, r3 * 0.6, r1 * 5.0 - 4.0) - vec3(0.5, 0.3, 0.5)) * 1.3);
        vec3 H = normalize(uSun + V);
        float s = pow(max(dot(gn, H), 0.0), 120.0);
        col += mix(vec3(1.0, 0.86, 0.58), vec3(0.62, 0.84, 1.15), uNight) * s * (1.5 + 0.9 * uNight) * gf * lit;
      }
    }
  }
#endif

  /* the active gate lights the sand around it */
  if (uGP.w > 0.001) {
    vec3 gd = wp - uGP.xyz;
    float g2 = dot(gd, gd);
    float gl = uGP.w / (1.0 + g2 * 0.0035);
    col += uGC * gl * (0.35 + 0.65 * max(dot(N, normalize(-gd)), 0.0)) * (1.0 - wall);
  }

  /* the character's cast shadow */
  vec2 sd = uSun2D;
  vec2 d = vL + sd * (uShLen * 0.5 + uShOff);
  float a = dot(d, sd) / (uShLen * 0.5);
  float b = dot(d, vec2(-sd.y, sd.x)) / 0.40;
  float ps = (1.0 - smoothstep(0.55, 1.0, length(vec2(a, b)))) * uShAmt;
  col = mix(col, col * vec3(0.46, 0.46, 0.76), ps * (0.35 + 0.65 * lit));

  /* atmospheric haze = horizon colour in that direction */
  vec3 vd = -V;
  float fg = 1.0 - exp(-pow(dist * uFogD, 1.35));
  fg = max(fg, smoothstep(uFar * 0.78, uFar, dist));
  col = mix(col, skyBase(vd), fg);

  /* tone mapping + 1/255 dithering against colour banding */
  col = tone(col) + (hash12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---- sky (full-screen triangle, depth = 1: only drawn where there is no sand) ---- */
const VS_SKY = `
varying vec2 vN;
void main() { vN = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`;
const FS_SKY = `
${GLSL_SKY}
uniform vec3 uCR; uniform vec3 uCU; uniform vec3 uCF; uniform vec2 uTan; uniform float uTime;
varying vec2 vN;
/* 3D hash and value noise */
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/* disc coordinates around the light direction (the moon takes the sun place at night) */
vec2 moonUV(vec3 d) {
  vec3 mr = normalize(cross(uSun, vec3(0.0, 1.0, 0.0))), mu = cross(mr, uSun);
  return vec2(dot(d, mr), dot(d, mu)) / 0.046;
}
float moonDisc(vec2 mq) { return 1.0 - smoothstep(0.94, 1.0, length(mq)); }
/* starry sky: Milky Way, twinkling stars, a crescent moon and, now and then, a shooting star */
vec3 nightSky(vec3 d, float tm) {
  vec3 col = vec3(0.0);
  float ca = cos(tm * 0.0035), sa = sin(tm * 0.0035);
  vec3 q = vec3(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca);        // the vault turns very slowly
  float up = smoothstep(-0.02, 0.22, d.y);
  float moonW = 1.0 - 0.85 * pow(max(dot(d, uSun), 0.0), 6.0);
  /* Milky Way: a band, carved by dust clouds */
  float b = dot(q, vec3(-0.257, 0.714, -0.678));
  float band = exp(-b * b / 0.016);
  float n = 0.55 * vnoise(q * 5.0) + 0.30 * vnoise(q * 12.0 + 4.0) + 0.15 * vnoise(q * 27.0);
  float dust = smoothstep(0.42, 0.64, vnoise(q * 8.0 + 9.0));
  float mw = band * (0.25 + 1.0 * n) * (1.0 - 0.6 * dust * band);
  col += mix(vec3(0.20, 0.27, 0.52), vec3(0.62, 0.55, 0.62), smoothstep(0.55, 1.0, n) * band) * mw * 0.34;
  /* stars: one cell of the sphere = at most one star */
  vec3 p = q * 92.0, ip = floor(p), fp = fract(p);
  float h = hash13(ip), h2 = hash13(ip + 7.3);
  if (h < 0.05 + 0.20 * band) {
    vec3 off = 0.28 + 0.44 * vec3(hash13(ip + 1.7), hash13(ip + 3.1), hash13(ip + 5.9));
    float mag = h2 * h2;
    float r = 0.09 + 0.13 * mag;
    float st = (1.0 - smoothstep(r * 0.2, r, length(fp - off))) * (0.45 + 1.3 * mag);
    float tw = 0.74 + 0.26 * sin(tm * (1.6 + 4.5 * h2) + h * 90.0);
    col += mix(vec3(0.66, 0.80, 1.0), vec3(1.0, 0.86, 0.66), hash13(ip + 9.2)) * st * tw;
  }
  col *= up * moonW;
  /* the moon: a thick crescent, with earthshine on the whole disc */
  {
    float sd = dot(d, uSun);
    if (sd > 0.985) {
      vec2 mq = moonUV(d);
      float disc = moonDisc(mq);
      float cut = 1.0 - smoothstep(0.90, 1.0, length(mq - vec2(0.46, 0.14)) / 0.97);
      float lit = disc * (1.0 - cut);
      float cr = 0.9 + 0.1 * vnoise(vec3(mq * 4.0, 1.0));
      col += (vec3(0.95, 0.97, 1.0) * lit * cr * 1.5 + vec3(0.07, 0.10, 0.20) * disc) * smoothstep(0.5, 1.0, uNight);
    }
  }
  /* shooting star */
  {
    float slot = floor(tm / 7.0), ph = fract(tm / 7.0) / 0.10;
    if (ph < 1.0 && d.y > 0.10) {
      vec2 uv = d.xz / (d.y + 0.35);
      vec2 a = (vec2(hash12(vec2(slot, 1.0)), hash12(vec2(slot, 2.0))) - 0.5) * 2.6;
      vec2 dir = normalize(vec2(hash12(vec2(slot, 3.0)) - 0.5, hash12(vec2(slot, 4.0)) - 0.5) + vec2(0.35, 0.2));
      vec2 head = a + dir * ph * 1.0, tail = a + dir * max(ph - 0.4, 0.0) * 1.0;
      vec2 pa = uv - tail, ba = head - tail;
      float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      float m = (1.0 - smoothstep(0.0, 0.011, length(pa - ba * k))) * k * (1.0 - ph);
      col += vec3(0.85, 0.93, 1.0) * m * 1.4;
    }
  }
  return col;
}
void main() {
  vec3 d = normalize(uCF + uCR * (vN.x * uTan.x) + uCU * (vN.y * uTan.y));
  vec3 col = skyFull(d);
  if (uNight > 0.01) {
    float mf = smoothstep(0.5, 1.0, uNight);
    if (dot(d, uSun) > 0.985) col *= 1.0 - 0.9 * moonDisc(moonUV(d)) * mf;       // the dark part of the moon hides the halo
    col += nightSky(d, uTime) * vec3(uNight) * 1.0;
  }
  col = tone(col) + (hash12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---- floating dust: everything is computed in the vertex shader (no CPU cost) ---- */
const VS_WISP = `
${GLSL_TERRAIN}
attribute vec3 aR;
uniform float uTime; uniform vec2 uWindMove; uniform vec2 uCM; uniform float uPx; uniform float uBox;
varying float vA;
void main() {
  float R = uBox;
  vec2 base = aR.xy * 2.0 * R;
  vec2 mv = uWindMove * (0.7 + aR.z);
  vec2 l = mod(base + mv - uCM + R, 2.0 * R) - R;
  float lod = 1.0 - smoothstep(35.0, 140.0, length(l));
  vec3 t = terrain(l, lod);
  float y = t.x + 0.10 + aR.z * aR.z * 2.2;
  vec4 mvp = modelViewMatrix * vec4(l.x, y, l.y, 1.0);
  float dist = max(-mvp.z, 1.0);
  float tw = pow(0.5 + 0.5 * sin(uTime * (1.5 + aR.x * 4.0) + aR.y * 40.0), 3.0);
  float edge = 1.0 - smoothstep(0.55 * R, R, length(l));
  vA = (0.10 + 0.90 * tw) * edge;
  gl_PointSize = clamp((0.018 + 0.035 * aR.z) * uPx / dist, 1.3, 5.0);
  gl_Position = projectionMatrix * mvp;
}`;
const FS_WISP = `
uniform float uNight;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.60), vec3(0.50, 0.78, 1.0), uNight), a * (0.9 + 0.3 * uNight));
}`;

/* ---- sand spray ---- */
const VS_SPRAY = `
attribute float aSize; attribute float aAlpha; attribute float aTint;
uniform float uPx;
varying float vA; varying float vT;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = aAlpha; vT = aTint;
  gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.5), 0.0, 120.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS_SPRAY = `
uniform float uNight;
varying float vA; varying float vT;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (vT > 1.5) {
    /* boost glyphs: lozenges (the protective carpet motif) and yaz (a Tifinagh letter), in saffron, henna, indigo and ivory */
    float u = fract(vT);
    vec3 pal = u < 0.25 ? vec3(1.0, 0.76, 0.22) : (u < 0.5 ? vec3(0.86, 0.26, 0.14) : (u < 0.75 ? vec3(0.12, 0.16, 0.48) : vec3(1.0, 0.94, 0.78)));
    pal = mix(pal, u < 0.75 && u >= 0.5 ? vec3(0.30, 0.78, 0.98) : pal, uNight);
    vec2 q = c * 2.0; float m;
    if (fract(u * 11.0) < 0.5) {
      float l1 = abs(q.x) + abs(q.y);
      m = (1.0 - smoothstep(0.80, 0.92, l1)) * (1.0 - 0.6 * (1.0 - smoothstep(0.34, 0.46, l1)));
    } else {
      float d = min(seg(q, vec2(0.0, -0.8), vec2(0.0, 0.8)), min(min(seg(q, vec2(0.0, 0.2), vec2(0.6, 0.8)), seg(q, vec2(0.0, 0.2), vec2(-0.6, 0.8))), min(seg(q, vec2(0.0, -0.2), vec2(0.6, -0.8)), seg(q, vec2(0.0, -0.2), vec2(-0.6, -0.8)))));
      m = 1.0 - smoothstep(0.10, 0.19, d);
    }
    gl_FragColor = vec4(pal, m * clamp(vA * 1.3, 0.0, 1.0));
    return;
  }
  float r = length(c) * 2.0;
  float a = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0) * vA;
  vec3 col = mix(vec3(0.78, 0.40, 0.30), vec3(1.0, 0.76, 0.40), vT);
  col = mix(col, col * vec3(0.50, 0.68, 1.0) + vec3(0.02, 0.04, 0.10), uNight);
  gl_FragColor = vec4(col, a);
}`;

/* ---- wake in the sand (multiplicative) ---- */
const VS_TRAIL = `
attribute float aSide; attribute float aBirth; attribute float aOn;
uniform float uTime;
varying float vSide; varying float vA; varying float vDist;
void main() {
  vSide = aSide;
  float age = uTime - aBirth;
  vA = aOn * (1.0 - smoothstep(10.0, 28.0, age));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS_TRAIL = `
varying float vSide; varying float vA; varying float vDist;
void main() {
  float s = abs(vSide);
  float prof = 1.0 - smoothstep(0.45, 1.0, s);
  float core = 1.0 - smoothstep(0.0, 0.55, s);
  float a = vA * (0.55 * prof + 0.35 * core) * (1.0 - smoothstep(60.0, 150.0, vDist));
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.58, 0.56, 0.80), a), 1.0);
}`;

/* ---- character ---- */
const VS_CHAR = `
varying vec3 vN; varying vec3 vP;
void main() {
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS_CHAR = `
${GLSL_NG}
uniform vec3 uBase; uniform vec3 uSunV; uniform float uGlow;
varying vec3 vN; varying vec3 vP;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(-vP);
  float nl = dot(N, uSunV);
  float t = clamp(0.5 + nl * 0.62, 0.0, 1.0);
  vec3 shadow = uBase * vec3(0.62, 0.52, 0.92) + vec3(0.06, 0.035, 0.10);
  vec3 lit = uBase * vec3(1.30, 1.06, 0.84) + vec3(0.10, 0.05, 0.0);
  vec3 col = mix(shadow, lit, smoothstep(0.2, 0.85, t));
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += mix(vec3(1.0, 0.70, 0.40), vec3(0.70, 0.95, 1.5), uNight) * rim * (0.35 + 0.65 * smoothstep(0.1, 0.8, t)) * 0.8;
  col = nightGrade(col);
  col += uBase * uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---- recharge orbs: a glowing sphere with a star, warm on the ground and blue in the air ---- */
const VS_ORB = `
attribute float aType; attribute float aPh;
uniform float uTime; uniform float uPx;
varying float vA; varying float vT; varying float vPh;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 1.7 + aPh * 6.2831) * 0.22;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.5);
  float pulse = 1.0 + 0.10 * sin(uTime * 3.1 + aPh * 21.0);
  float fin = step(1.5, aType);
  float diam = mix(mix(1.5, 2.1, aType), 5.2, fin) * pulse;
  gl_PointSize = clamp(diam * uPx / dist, mix(7.0, 16.0, fin), mix(260.0, 420.0, fin));
  vA = mix(1.0 - smoothstep(210.0, 300.0, dist), 1.0 - smoothstep(780.0, 900.0, dist), fin) * smoothstep(1.2, 3.5, dist);
  vT = aType; vPh = aPh;
  gl_Position = projectionMatrix * mv;
}`;
const FS_ORB = `
uniform float uTime;
varying float vA; varying float vT; varying float vPh;
void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r = length(c);
  float ang = uTime * 0.55 + vPh * 6.2831, cs = cos(ang), sn = sin(ang);
  vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  float l1 = abs(q.x) + abs(q.y), li = max(abs(q.x), abs(q.y));
  float star = 1.0 - smoothstep(0.0, 0.05, min(li - 0.30, l1 - 0.43));
  float ring = (1.0 - smoothstep(0.0, 0.05, abs(l1 - 0.60) - 0.025)) * 0.85;
  float core = 1.0 - smoothstep(0.0, 0.16, r);
  float halo = pow(max(0.0, 1.0 - r), 2.2);
  float rays = (1.0 - smoothstep(0.0, 0.04, abs(c.x))) * (1.0 - smoothstep(0.0, 0.9, abs(c.y)))
             + (1.0 - smoothstep(0.0, 0.04, abs(c.y))) * (1.0 - smoothstep(0.0, 0.9, abs(c.x)));
  rays *= 0.35 + 0.35 * sin(uTime * 2.3 + vPh * 30.0);
  vec3 warm = mix(vec3(1.0, 0.62, 0.16), vec3(1.0, 0.95, 0.78), core);
  vec3 cool = mix(vec3(0.10, 0.74, 0.78), vec3(0.86, 1.0, 1.0), core);
  vec3 col = mix(warm, cool, min(vT, 1.0));
  float fin = step(1.5, vT);
  col = mix(col, mix(vec3(1.0, 0.80, 0.26), vec3(1.0, 0.98, 0.86), core), fin);
  rays *= 1.0 + 0.9 * fin;
  float a = clamp(star * 0.95 + ring * 0.7 + core + halo * 0.55 + rays * 0.5, 0.0, 1.0) * vA;
  gl_FragColor = vec4(col * (0.85 + 0.8 * star + 0.5 * core), a);
}`;

/* ---- light column above each orb (visible from afar, facing the camera) ---- */
const VS_PILLAR = `
attribute vec2 aCorner; attribute float aType; attribute float aH;
varying vec2 vC; varying float vT; varying float vD;
void main() {
  vec3 c = position;
  vec3 d = vec3(cameraPosition.x - c.x, 0.0, cameraPosition.z - c.z);
  float dl = max(length(d), 1e-3);
  vec3 right = vec3(d.z, 0.0, -d.x) / dl;
  float w = mix(mix(0.55, 0.8, aType), 2.4, step(1.5, aType));
  vec3 p = c + right * aCorner.x * w + vec3(0.0, aCorner.y * aH, 0.0);
  vC = aCorner; vT = aType; vD = dl;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FS_PILLAR = `
varying vec2 vC; varying float vT; varying float vD;
void main() {
  float across = 1.0 - smoothstep(0.0, 1.0, abs(vC.x));
  float along = pow(1.0 - vC.y, 1.7);
  float base = smoothstep(0.0, 0.04, vC.y);
  float fin = step(1.5, vT);
  float a = across * across * along * base * mix(0.34, 0.55, fin) * mix(1.0 - smoothstep(180.0, 320.0, vD), 1.0 - smoothstep(700.0, 880.0, vD), fin) * smoothstep(2.0, 9.0, vD);
  vec3 col = mix(vec3(1.0, 0.72, 0.24), vec3(0.35, 0.90, 0.92), min(vT, 1.0));
  col = mix(col, vec3(1.0, 0.86, 0.40), fin);
  gl_FragColor = vec4(col, a);
}`;

/* ---- start flag: a pole and a red cloth with a saffron zigzag flapping in the wind (aF = pole 0 / cloth 1, u, v) ---- */
const VS_FLAG = `
attribute vec3 aF;
uniform float uTime;
varying vec3 vF; varying float vSh; varying float vDist;
void main() {
  vec3 p = position;
  float u = aF.y, v = aF.z, c = aF.x;
  float ph = uTime * 4.4 - u * 5.5 + v * 1.4;
  float amp = c * u * (0.17 + 0.07 * sin(uTime * 0.8));
  p.z += sin(ph) * amp;
  p.y += cos(ph * 0.9) * amp * 0.22 - c * u * u * 0.10;
  vSh = cos(ph) * u * c;
  vF = aF;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS_FLAG = `
${GLSL_SKY}
varying vec3 vF; varying float vSh; varying float vDist;
uniform float uFogD;
void main() {
  vec3 col;
  float u = vF.y, v = vF.z;
  if (vF.x < 0.5) col = vec3(0.34, 0.17, 0.11);
  else {
    if (u > 0.80 && abs(v - 0.5) < (u - 0.80) * 2.6) discard;
    col = vec3(0.80, 0.15, 0.10);
    float zz = abs(fract(u * 6.0) - 0.5) * 0.20;
    float d = abs(v - 0.5) - (0.07 + zz);
    col = mix(vec3(1.0, 0.72, 0.22), col, smoothstep(-0.012, 0.012, d));
    col *= 0.86 + 0.28 * vSh;
  }
  float fg = 1.0 - exp(-pow(vDist * uFogD, 1.35));
  col = mix(col, vec3(0.9, 0.55, 0.40), fg);
  gl_FragColor = vec4(tone(col), 1.0);
}`;

/* ---- Tiziri light gates: a lozenge (the carpets' protective motif) drawn by a ribbon that always faces the camera,
   a second lozenge (the target, or the shockwave when the gate is crossed) and a light column. Everything fits in a
   single draw call: the state of each gate arrives through two uniform arrays (filled in src/game/15-simulation.js). ---- */
const VS_GATE = `
uniform vec4 uGA[${TIZIRI.gates.length}]; uniform vec4 uGB[${TIZIRI.gates.length}];
attribute vec4 aG; attribute float aSd;
varying vec4 vP; varying vec4 vM;
const float GW = ${TIZIRI.GW.toFixed(3)};
/* corners of the lozenge in the gate plane: top, right, bottom, left (GW = half-width ratio) */
vec2 vtx(float k) { k = mod(k, 4.0); return k < 0.5 ? vec2(0.0, 1.0) : (k < 1.5 ? vec2(GW, 0.0) : (k < 2.5 ? vec2(0.0, -1.0) : vec2(-GW, 0.0))); }
void main() {
  /* aG = (gate index, ring 0 outer / 1 inner / 2 column, edge index, position along the edge); aSd = side of the ribbon (-1..1) */
  int gi = int(aG.x + 0.5);
  vec4 A = uGA[gi], B = uGB[gi];
  float ring = aG.y, R = A.w, mode = B.z, flash = B.w;
  float fin = step(15.0, R);
  vec3 C = A.xyz, U = vec3(-B.y, 0.0, B.x);
  vec3 P; float sPar = 0.0, along = 0.0;
  float vis = 1.0;
  if (ring < 1.5) {
    float sc = 1.0;
    if (ring > 0.5) { sc = (mode > 0.5 && mode < 1.5) ? 0.5 : 1.0 + 0.9 * (1.0 - flash); vis = (mode > 0.5 && mode < 1.5) ? 1.0 : flash; }
    vec2 v0 = vtx(aG.z) * R * sc, v1 = vtx(aG.z + 1.0) * R * sc;
    vec3 p0 = C + U * v0.x + vec3(0.0, v0.y, 0.0), p1 = C + U * v1.x + vec3(0.0, v1.y, 0.0);
    vec3 T = p1 - p0; float L = length(T); T /= L;
    vec3 mid = 0.5 * (p0 + p1);
    float dist = length(mid - cameraPosition);
    float w = max(1.1, dist * 0.010) * (1.0 + 0.5 * fin) * (ring > 0.5 ? 0.6 : 1.0);
    float f = mix(-0.5 * w / L, 1.0 + 0.5 * w / L, aG.w);
    P = mix(p0, p1, f);
    vec3 side = normalize(cross(T, P - cameraPosition));
    P += side * aSd * w;
    sPar = aG.z + clamp(f, 0.0, 1.0);
  } else {
    float top = C.y + R + 460.0;
    P = vec3(C.x, mix(C.y + R * 0.92, top, aG.w), C.z);
    vec3 view = P - cameraPosition;
    float dist = length(view);
    float w = (2.6 + dist * 0.006) * (1.0 + 0.8 * fin);
    P += normalize(vec3(view.z, 0.0, -view.x) + vec3(1e-4)) * aSd * w;
    along = aG.w;
    vis = (mode > 0.5 && mode < 1.5) ? 1.0 : fin * (mode < 0.5 ? 0.45 : 0.0);
  }
  vP = vec4(sPar, aSd, ring, along);
  vM = vec4(mode, flash, fin, vis);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const FS_GATE = `
uniform float uTime;
varying vec4 vP; varying vec4 vM;
void main() {
  float ring = vP.z, mode = vM.x, flash = vM.y, fin = vM.z, vis = vM.w;
  if (vis < 0.003) discard;
  float c = 1.0 - abs(vP.y);
  vec3 saff = vec3(1.0, 0.50, 0.12), gold = vec3(1.0, 0.74, 0.26), ivo = vec3(0.50, 0.66, 1.0), teal = vec3(0.14, 0.78, 0.74);
  float act = step(0.5, mode) * step(mode, 1.5), past = step(1.5, mode);
  vec3 base = past > 0.5 ? teal : (act > 0.5 ? mix(saff, gold, 0.4 + 0.6 * fin) : mix(ivo, gold, fin));
  vec3 col; float a;
  if (ring > 1.5) {
    /* light column: narrow core, wide halo, fading towards the sky */
    float h = vP.w;
    float core = pow(c, 3.0), halo = pow(c, 1.3);
    a = (0.85 * core + 0.30 * halo) * pow(1.0 - h, 1.35) * (0.80 + 0.20 * sin(uTime * 2.3 + h * 9.0)) * (0.7 + 0.5 * fin);
    col = mix(base, vec3(1.0, 0.9, 0.7), core * 0.35);
  } else {
    float s = vP.x;
    float core = pow(c, 5.0), halo = pow(c, 1.5) * 0.30;
    float zz = abs(fract(s * 9.0) - 0.5) * 2.0;
    float zig = 1.0 - smoothstep(0.0, 0.16, abs(vP.y - (zz - 0.5) * 0.85));
    float flow = 0.0;
    if (act > 0.5) { float ph = fract(s * 4.0 - uTime * 0.8); flow = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.55, ph)); }
    if (ring > 0.5) {
      /* inner target (rotating dotted line) or shockwave */
      float dash = smoothstep(0.35, 0.5, abs(fract(s * 7.0 + (act > 0.5 ? uTime * 0.5 : 0.0)) - 0.5) * 2.0);
      a = (core * 0.9 + halo) * (act > 0.5 ? (0.45 + 0.55 * dash) * 0.75 : 1.0);
      col = mix(base, vec3(1.0, 0.95, 0.8), past > 0.5 ? 0.6 : 0.2);
    } else {
      float breathe = 0.80 + 0.20 * sin(uTime * 1.7 + s * 3.0);
      float lvl = act > 0.5 ? 1.0 : (past > 0.5 ? 0.42 : (0.50 + 0.35 * fin));
      a = (core * 1.0 + halo + zig * (act > 0.5 ? 0.75 : 0.30) * (0.4 + 0.6 * c) + flow * 0.9 * c) * lvl * breathe;
      a *= 1.0 + 2.2 * flash;
      col = mix(base, vec3(1.0, 0.92, 0.72), clamp(core * 0.22 + flash * 0.6 + flow * 0.15, 0.0, 1.0));
    }
  }
  a *= vis;
  gl_FragColor = vec4(col, a);
}`;

/* ---- navigation arrow (mini-scene at the top of the screen): gold and ember, red zigzag along the axis, indigo outline ---- */
const VS_NAV = `
varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec3 vV;
void main() {
  vL = position; vLN = normal; vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS_NAV = `
uniform float uA; uniform float uT;
varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec3 vV;
void main() {
  vec3 N = normalize(vN), V = normalize(vV);
  vec3 L = normalize(vec3(-0.35, 0.80, 0.50));
  float d = dot(N, L) * 0.5 + 0.5;
  vec3 gold = vec3(1.0, 0.80, 0.32), ember = vec3(0.80, 0.30, 0.15);
  vec3 col = mix(ember, gold, smoothstep(0.12, 0.95, d));
  float top = smoothstep(0.55, 0.9, vLN.y);
  col = mix(ember * 0.75, col, 0.35 + 0.65 * top);
  /* red zigzag running from the tail to the tip (top face) */
  float zz = abs(fract(vL.z * 2.3) - 0.5) * 2.0;
  float ln = abs(vL.x - (zz - 0.5) * 0.15) - 0.040;
  float m = (1.0 - smoothstep(0.0, 0.022, ln)) * top * smoothstep(-1.12, -0.80, vL.z) * (1.0 - smoothstep(0.62, 0.90, vL.z));
  col = mix(col, vec3(0.62, 0.11, 0.08), m * 0.9);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(1.0, 0.86, 0.56) * fr * 0.35;
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.95, 0.80) * pow(max(dot(N, H), 0.0), 36.0) * 0.45;
  col *= 1.0 + 0.07 * sin(uT * 3.2);
  gl_FragColor = vec4(min(col, vec3(1.0)), uA);
}`;
const VS_NAVO = `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS_NAVO = `
uniform float uA;
void main() { gl_FragColor = vec4(0.09, 0.06, 0.22, 0.92 * uA); }`;

/* ---- woven carpet (motifs inspired by Taznakht carpets: nested lozenges, zigzag border, fringes) ---- */
const VS_CARPET = `
uniform float uTime; uniform float uSp; uniform float uBoost;
varying vec2 vUV; varying vec3 vN; varying vec3 vP;
const vec2 HS = vec2(0.62, 1.05);
/* vertical displacement of the carpet at plane position q: flutter along the edges (grows with speed and boost), lifted front, side curl, drooping back and shaking fringes */
float bend(vec2 q) {
  float v = q.y / HS.y, u = q.x / HS.x, av = abs(v);
  float edge = smoothstep(0.2, 1.25, av);
  float fl = sin(q.y * 5.0 - uTime * (4.0 + uSp * 10.0) + q.x * 2.3) * (0.010 + 0.030 * uSp + 0.028 * uBoost) * edge;
  fl += sin(q.y * 9.0 - uTime * (7.0 + uSp * 12.0) - q.x * 3.1) * 0.006 * edge * (0.4 + uSp);
  float lift = 0.17 * smoothstep(0.3, 1.2, v) * (0.30 + 0.70 * uSp);
  float curl = 0.05 * u * u * (0.35 + 0.65 * smoothstep(0.0, 1.2, av));
  float droop = -0.07 * smoothstep(0.6, 1.2, -v) * (1.0 - 0.5 * uSp);
  float fr = smoothstep(1.0, 1.2, av);
  return fl + lift + curl + droop - fr * 0.10 + fr * sin(uTime * 9.0 + q.x * 14.0) * 0.012 * (0.5 + uSp);
}
void main() {
  vec2 q = position.xz;
  vec3 p = vec3(q.x, position.y + bend(q), q.y);
  float e = 0.03;
  float dx = bend(q + vec2(e, 0.0)) - bend(q - vec2(e, 0.0));
  float dz = bend(q + vec2(0.0, e)) - bend(q - vec2(0.0, e));
  vUV = vec2(q.x / HS.x, q.y / HS.y);
  vN = normalMatrix * normalize(vec3(-dx, 2.0 * e, -dz));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS_CARPET = `
${GLSL_NG}
uniform vec3 uSunV; uniform float uTime; uniform float uBoost; uniform float uSp;
varying vec2 vUV; varying vec3 vN; varying vec3 vP;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
/* palette of the woven design: red field, indigo, saffron, ivory, henna and teal */
const vec3 RED = vec3(0.60, 0.10, 0.08), DRED = vec3(0.34, 0.05, 0.07), IVO = vec3(0.96, 0.87, 0.68);
const vec3 IND = vec3(0.06, 0.08, 0.27), SAF = vec3(0.99, 0.67, 0.16), ORG = vec3(0.92, 0.38, 0.12), TEAL = vec3(0.08, 0.46, 0.50);
void main() {
  /* pattern computed per texel, no texture: nested lozenges and borders; gold = amount of metallic thread that catches the boost glow */
  float av = abs(vUV.y);
  vec3 col; float gold = 0.0;
  if (av > 1.0) {
    /* fringes: a solid knot, then strands that taper off */
    float k = (av - 1.0) / 0.2;
    float fx = vUV.x * 13.0, f = abs(fract(fx) - 0.5);
    if (k > 0.16 && f > 0.19 * (1.0 - 0.55 * k)) discard;
    col = IVO * (0.80 + 0.2 * h21(vec2(floor(fx), 2.0))); gold = 0.7;
  } else {
    vec2 g = vec2(vUV.x * 11.0, vUV.y * 21.0);
    vec2 c = floor(g), f = fract(g);
    vec2 qc = abs(c + 0.5);
    float dx = 11.0 - qc.x, dy = 21.0 - qc.y, d = min(dx, dy);
    col = RED * (1.0 + (h21(vec2(floor(g.y * 0.5), 3.0)) - 0.5) * 0.22);
    if (d < 1.0) { col = IND; }
    else if (d < 2.0) { col = SAF; gold = 1.0; }
    else if (d < 4.6) {
      float s = dx < dy ? c.y : c.x, r = floor(d) - 2.0, pz = abs(mod(s, 4.0) - 2.0);
      col = DRED * 1.15;
      if (abs(r - pz) < 0.5) { col = IVO; gold = 0.8; }
      else if (abs(r - pz - 1.0) < 0.5) col = IND;
    }
    else if (d < 5.6) { col = IVO; gold = 0.6; }
    else {
      float yc = c.y + 0.5, xc = c.x + 0.5;
      float cy = clamp(floor(yc / 10.4 + 0.5), -1.0, 1.0) * 10.4;
      float m = abs(xc) + abs(yc - cy);
      float alt = mod(abs(floor(yc / 10.4 + 0.5)), 2.0);
      if (m < 5.0) {
        if (m < 1.0) { col = IVO; gold = 1.0; }
        else if (m < 2.0) col = IND;
        else if (m < 3.0) { col = mix(SAF, ORG, alt); gold = 1.0 - alt * 0.4; }
        else if (m < 4.0) col = mix(DRED, TEAL, alt * 0.9);
        else { col = mix(IVO, SAF, alt); gold = 0.9; }
      } else if (mod(c.x + c.y, 2.0) < 1.0 && m < 9.0) { col = ORG * 0.95; }
    }
    float wv = 1.0 - smoothstep(0.35, 1.2, fwidth(g.y));
    col *= 1.0 - wv * (0.16 * smoothstep(0.36, 0.5, abs(f.y - 0.5)) + 0.07 * smoothstep(0.38, 0.5, abs(f.x - 0.5)));
    col *= 0.93 + 0.14 * h21(c);
  }
  /* lighting: two-tone shading with a rim light; the back face is plain dark red */
  vec3 N = normalize(vN); if (!gl_FrontFacing) { N = -N; col = DRED * 0.9; gold = 0.0; }
  vec3 V = normalize(-vP);
  float t = clamp(0.5 + dot(N, uSunV) * 0.62, 0.0, 1.0);
  vec3 shadow = col * vec3(0.55, 0.50, 0.90) + vec3(0.03, 0.02, 0.08);
  vec3 lit = col * vec3(1.22, 1.04, 0.86) + vec3(0.07, 0.03, 0.0);
  col = mix(shadow, lit, smoothstep(0.2, 0.85, t));
  col += mix(vec3(1.0, 0.70, 0.40), vec3(0.70, 0.95, 1.5), uNight) * pow(1.0 - max(dot(N, V), 0.0), 2.8) * 0.30;
  col = nightGrade(col);
  col += vec3(1.0, 0.72, 0.26) * uBoost * gold * (0.55 + 0.45 * sin(vUV.y * 7.0 + uTime * 16.0)) * 0.85;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---- the traveller's fabrics: embroidered silk, starry night cape, sequined veil, silver, cloth fluttering in the wind ----
   uP = (pattern, a, b, c): 0 plain wool · 1 zigzag edging below y=a · 2 striped belt · 3 turban folds
   4 cape (legacy) · 5 silver · 6 striped floating panel · 7 starry night cloth · 8 sequined veil (translucent)
   9 embroidered silk with hem · 10 bodice · 11 braid · 12 satin · 13 skin shaded by the hood
   uF = (mode, length, phase, y0): mode 1 = streaming panel (flag) · 2 = soft cloth (skirt, cape) · 3 = sleeve
   uW = (lift strength, fold strength) */
const VS_CLOTH = `
uniform float uTime; uniform float uSp; uniform float uBoost; uniform vec4 uF; uniform vec2 uW; uniform vec3 uWL;
varying vec3 vN; varying vec3 vP; varying vec3 vO; varying vec2 vK; varying vec2 vUV;
void main() {
  /* uF.x > 0 turns the mesh into flowing cloth (see the uF / uW table above); k = 0 at the attachment line, 1 at the free hem */
  vec3 p = position; vec3 n = normal;
  float k = 0.0;
  if (uF.x > 0.5) {
    k = clamp((uF.w - position.y) / uF.y, 0.0, 1.0);
    float sf = clamp(uSp + uBoost * 0.35, 0.0, 1.0) * smoothstep(0.0, 0.5, k);
    if (uF.x < 1.5) {
      float yn = uF.w + (position.y - uF.w) * (1.0 - 0.9 * sf);
      p.z -= (yn - position.y) + 0.10 * k * k;
      p.y = yn;
      float ph = k * 9.0 - uTime * (8.0 + uSp * 16.0) + uF.z;
      p.x += sin(ph) * 0.055 * k * (0.25 + sf);
      p.y += cos(ph * 0.8) * 0.035 * k * sf;
      p.z += sin(ph * 1.3 + 1.0) * 0.03 * k * (0.3 + sf);
    } else {
      /* soft cloth: the hem lifts and streams backwards (mostly at the back), folds travel along the fabric */
      vec2 rd = normalize(position.xz + vec2(1e-4, 1e-4));
      float bw = uF.x > 2.5 ? 1.0 : mix(0.22, 1.0, clamp(0.5 - 0.5 * rd.y, 0.0, 1.0));
      float lift = 0.52 * sf * k * bw * uW.x;
      if (uF.x > 2.5) {
        /* sleeve: the arm can point anywhere, the hem swings like a pendulum around the arm axis, downwind (uWL, local frame) */
        float wm = length(uWL.xz); vec2 wd = uWL.xz / max(wm, 1e-3);
        float aL = max(uF.w - position.y, 0.0), th = 0.95 * lift * wm;
        p.xz += wd * (aL * sin(th) + 0.05 * k * k * uW.x * wm); p.y += aL * (1.0 - cos(th));
      } else {
        float yn = uF.w + (position.y - uF.w) * (1.0 - lift);
        p.z -= (yn - position.y) * 0.9 + 0.05 * k * k * bw * uW.x;
        p.y = yn;
      }
      float aa = atan(position.x, position.z);
      float t = uTime * (2.2 + uSp * 8.0);
      float ph = aa * 7.0 + k * 5.5 - t + uF.z;
      float amp = k * (0.45 + 2.2 * sf) * uW.y;
      float w = sin(ph + 1.3 * sin(aa * 3.0 + uTime * 1.1));
      p.xz += rd * w * 0.014 * amp;
      p.x += sin(k * 6.0 - t * 1.6 + uF.z + position.z * 8.0) * 0.02 * k * (0.2 + sf) * uW.y;
      p.y += sin(ph * 0.7) * 0.012 * k * sf * uW.y;
      n.xz += rd * cos(ph) * 0.28 * amp;
      n = normalize(n);
    }
  }
  vK = vec2(uv.x, k); vUV = uv;
  vO = position;
  vN = normalMatrix * n;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vP = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS_CLOTH = `
${GLSL_NG}
uniform vec3 uBase; uniform vec3 uAcc; uniform vec3 uAcc2; uniform vec3 uSunV; uniform float uGlow; uniform vec4 uP; uniform float uBoost; uniform float uTime;
varying vec3 vN; varying vec3 vP; varying vec3 vO; varying vec2 vK; varying vec2 vUV;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
/* 1 inside the lozenge of the unit grid cell g, else 0 */
float lozenge(vec2 g) { vec2 f = abs(fract(g) - 0.5); return 1.0 - step(0.5, f.x + f.y); }
const vec3 SAF = vec3(0.99, 0.67, 0.16); const vec3 RED = vec3(0.66, 0.11, 0.09); const vec3 TEAL = vec3(0.06, 0.52, 0.54);
const vec3 IVO = vec3(0.96, 0.88, 0.72); const vec3 SIL = vec3(0.82, 0.82, 0.86);
void main() {
  vec3 N = normalize(vN); bool back = !gl_FrontFacing; if (back) N = -N;
  vec3 V = normalize(-vP);
  float a = atan(vO.x, vO.z);
  vec3 col = uBase; float met = 0.0; float gold = 0.0; float sheen = 0.0; float al = 1.0;
  /* pattern selected by uP.x (see the table above) */
  float pat = uP.x;
  if (pat < 0.5) { col *= 0.94 + 0.10 * h21(floor(vO.xy * 90.0 + vO.z * 61.0)); }
  else if (pat < 1.5) {
    col *= 0.94 + 0.10 * h21(floor(vO.xy * 90.0 + vO.z * 61.0));
    float b = (vO.y - uP.y) / 0.11;
    if (b < 2.6) {
      float z = abs(fract(a * 3.2) - 0.5) * 2.0;
      if (b < 1.0) col = uAcc2; else col = abs(b - 1.8 - z * 0.7) < 0.38 ? uAcc : col;
      gold = 0.5;
    }
  }
  else if (pat < 2.5) {
    float s = fract(vO.y * 22.0), t = fract(a * 7.0 + floor(vO.y * 22.0) * 0.5);
    col = mix(uBase, uAcc, step(0.66, s)); col = mix(col, uAcc2, step(0.88, s));
    col *= 0.90 + 0.18 * step(0.5, t); gold = step(0.66, s) * 0.6;
  }
  else if (pat < 3.5) {
    float f = sin(a * 3.0 + vO.y * 38.0) * 0.5 + 0.5;
    col *= 0.86 + 0.14 * f; col = mix(col, uAcc, step(0.9, fract(vO.y * 13.0 + a * 0.3)) * 0.5);
  }
  else if (pat < 4.5) {
    col *= 0.94 + 0.10 * h21(floor(vO.xy * 90.0 + vO.z * 61.0));
    float ea = abs(a);
    if (ea < 0.72) { col = mix(uAcc, uAcc2, step(0.5, fract(vO.y * 14.0))); gold = 0.5; }
    else if (ea > 2.45 && vO.y > uP.y && vO.y < uP.z) {
      vec2 g = vec2(a * 5.2, vO.y * 15.0);
      float l = lozenge(g), l2 = lozenge(g * 2.0 + 0.25);
      col = mix(uBase * 1.2, uAcc, l); col = mix(col, uAcc2, l2 * l * 0.9); gold = l * 0.5;
    } else if (vO.y < uP.w + 0.10) { col = abs(fract(a * 3.4) - 0.5) * 2.0 > (vO.y - uP.w) * 10.0 ? uAcc : uAcc2; gold = 0.4; }
  }
  else if (pat < 5.5) { met = 1.0; col *= 0.95; }
  else if (pat < 6.5) {
    float e = vK.y;
    col = mix(uBase, uAcc, step(0.76, e) * step(e, 0.82));
    col = mix(col, uAcc2, step(0.86, e) * step(e, 0.90));
    col = mix(col, uAcc, step(0.94, e));
    col *= 0.94 + 0.08 * step(0.5, fract(vK.x * 8.0)); gold = step(0.76, e) * 0.6;
  }
  else if (pat < 7.5) {
    /* night cloth: indigo gradient, folds, twinkling starry sky, band of lozenges on the back, woven hem + fringes */
    float u = vUV.x, v = mix(vUV.y, 1.0 - vUV.y, uP.y);
    col = mix(uBase * 1.45, uBase * mix(0.58, 1.05, uP.z), smoothstep(0.0, 0.95, v));
    col *= 0.90 + 0.10 * sin(a * 7.0 + v * 5.5);
    vec2 g = vec2(u * 54.0, v * 34.0), c = floor(g), f = fract(g) - 0.5;
    float h = h21(c);
    if (h > 0.80) {
      vec2 o = (vec2(h21(c + 7.1), h21(c + 3.3)) - 0.5) * 0.5;
      float s = smoothstep(0.27, 0.0, length(f - o)) * (0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 60.0));
      col += uAcc * s * 1.2; gold += s * 0.8;
    }
    vec2 g2 = vec2(u * 15.0, v * 10.0), c2 = floor(g2), f2 = fract(g2) - 0.5;
    float h2 = h21(c2 + 11.0);
    if (h2 > 0.72) {
      vec2 q = abs(f2 - (vec2(h21(c2 + 1.7), h21(c2 + 9.2)) - 0.5) * 0.4);
      float s2 = smoothstep(0.12, 0.0, q.x + q.y) + 0.6 * smoothstep(0.018, 0.0, min(q.x, q.y)) * smoothstep(0.30, 0.0, max(q.x, q.y));
      s2 *= 0.7 + 0.3 * sin(uTime * 2.2 + h2 * 50.0);
      col += uAcc * s2 * 1.4; gold += s2;
    }
    if (uP.z < 0.5) {
      float cu = abs(u - 0.5);
      if (cu < 0.085 && v > 0.10 && v < 0.84) {
        vec2 q = vec2((u - 0.5) / 0.085, (v - 0.10) / 0.74 * 6.5);
        vec2 ff = vec2(q.x, fract(q.y) * 2.0 - 1.0);
        float dd = abs(ff.x) + abs(ff.y), row = mod(floor(q.y), 2.0);
        col = uBase * 1.9;
        if (dd < 0.94) col = uAcc;
        if (dd < 0.76) col = mix(uAcc2, TEAL, row);
        if (dd < 0.40) col = IVO;
        gold += step(0.76, dd) * step(dd, 0.94) * 0.9;
      } else if (cu < 0.100 && v > 0.09 && v < 0.85) { col = uAcc; gold += 0.7; }
      float b = (v - 0.90) / 0.10;
      if (b > 0.0) {
        float zz = abs(fract(u * 46.0) - 0.5) * 2.0;
        if (b < 0.12) { col = uAcc; gold = 0.9; }
        else if (b < 0.22) col = uAcc2;
        else if (b < 0.80) { col = zz > (b - 0.22) * 1.7 ? IVO : TEAL; gold = 0.4; }
        else col = uAcc;
      }
      if (v > 0.978 && fract(u * 100.0) > 0.55) discard;
      if (u < 0.022 || u > 0.978) { col = mix(uAcc, uAcc2, step(0.5, fract(v * 40.0))); gold = 0.6; }
    } else if (abs(a) < uP.w + 0.10) {
      col = mix(uAcc2, uAcc, step(0.5, fract(vUV.y * 46.0))); gold = 0.7;
    }
    sheen = 0.25;
  }
  else if (pat < 8.5) {
    /* gauze veil: transparent, embroidered along the edges, sprinkled with silver sequins */
    float u = vUV.x, e = vK.y;
    vec2 g = vec2(u * 18.0, e * 70.0), c = floor(g), f = fract(g) - 0.5;
    float h = h21(c);
    al = 0.56 + 0.10 * sin(e * 14.0 - uTime * 2.0 + u * 5.0);
    col = uBase * (0.92 + 0.10 * h21(floor(vO.xy * 140.0)));
    if (h > 0.90) {
      float s = smoothstep(0.32, 0.0, length(f)) * (0.5 + 0.5 * sin(uTime * (2.0 + h * 4.0) + h * 90.0));
      col += uAcc * s * 1.3; al = max(al, 0.95 * s); gold += s;
    }
    if (u < 0.045 || u > 0.955 || e > 0.965) { col = uAcc2; al = 0.9; gold += 0.5; }
    al *= 0.35 + 0.65 * smoothstep(0.0, 0.06, e);
    sheen = 0.4;
  }
  else if (pat < 9.5) {
    /* embroidered silk: folds, lozenge hem (saffron, henna, turquoise), edging along the opening */
    float b = vUV.y, hh = uP.z;
    col = uBase * (0.93 + 0.07 * sin(a * 11.0 + b * 3.0));
    sheen = 0.9;
    if (b < hh) {
      float q = b / hh;
      if (q < 0.10) { col = uAcc; gold = 0.9; }
      else if (q < 0.20) { col = uAcc2; }
      else if (q < 0.90) {
        vec2 gc = vec2(a * (uP.w > 0.5 ? uP.w : 8.0), (q - 0.2) / 0.7 * 2.0);
        gc.x += 0.5 * floor(gc.y);
        vec2 ff = fract(gc) - 0.5;
        float d = abs(ff.x) + abs(ff.y);
        col = IVO * 0.95;
        if (d < 0.50) col = uAcc2;
        if (d < 0.34) col = uAcc;
        if (d < 0.15) col = TEAL;
        gold = step(d, 0.50) * 0.5;
      } else { col = uAcc; gold = 0.9; }
    }
    if (uP.y > 0.01) {
      float de = abs(a) - uP.y;
      if (de < 0.09) { col = mix(uAcc2, uAcc, step(0.5, fract(b * 30.0))); gold = 0.6; }
    }
  }
  else if (pat < 10.5) {
    /* fitted bodice: chain of lozenges in the centre, embroidered neckline and yoke */
    float ea = abs(a), y = vO.y;
    col = uBase * (0.93 + 0.07 * h21(floor(vO.xy * 90.0 + vO.z * 61.0)));
    sheen = 0.6;
    if (y > 1.436) { col = uAcc; gold = 0.7; }
    else if (y > 1.420) { col = uAcc2; }
    if (ea < 0.20 && y < 1.420) {
      vec2 q = vec2(a / 0.20, y * 13.0);
      vec2 ff = vec2(q.x, fract(q.y) * 2.0 - 1.0);
      float d = abs(ff.x) + abs(ff.y);
      col = uAcc2;
      if (d < 0.92) col = uAcc;
      if (d < 0.50) col = TEAL;
      gold = step(d, 0.92) * 0.6;
    }
    if (y > 1.03 && y < 1.075) { col = mix(col, uAcc, 0.35); }
  }
  else if (pat < 11.5) {
    /* braid: rows of chevrons, silver and turquoise beads at the tip */
    float e = vK.y;
    float zig = abs(fract(e * 46.0 + a * 0.5) - 0.5);
    col = uBase * (0.62 + 0.75 * smoothstep(0.1, 0.4, zig));
    if (e > 0.80) { float s = step(0.5, fract(e * 34.0)); col = mix(SIL, TEAL, s); met = 1.0 - s; gold = 0.3; }
    sheen = 0.6;
  }
  else if (pat < 12.5) {
    /* satin: highlights, stripes, embroidered band on the hem (uP.y = height) */
    col = uBase * (0.88 + 0.12 * sin(a * 16.0 + vO.y * 6.0));
    if (vUV.y < uP.y) { col = mix(uAcc, uAcc2, step(0.5, fract(a * 6.0))); gold = 0.7; }
    else if (vUV.y < uP.y + 0.015) { col = uAcc; gold = 0.7; }
    sheen = 1.0;
  }
  else {
    /* skin: the hood's shadow falls on the upper face */
    float yy = vO.y - uP.y;
    float sh = smoothstep(0.014, 0.088, yy);
    col = uBase * mix(1.0, 0.40, sh);
    col = mix(col, col * vec3(0.72, 0.64, 1.0), sh * 0.55);
  }
  if (back) col *= 0.80;
  float t = clamp(0.5 + dot(N, uSunV) * 0.62, 0.0, 1.0);
  vec3 shadow = col * vec3(0.56, 0.50, 0.90) + vec3(0.04, 0.025, 0.09);
  vec3 lit = col * vec3(1.16, 1.03, 0.90) + vec3(0.06, 0.03, 0.0);
  vec3 o = mix(shadow, lit, smoothstep(0.2, 0.85, t));
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  o += mix(vec3(1.0, 0.70, 0.40), vec3(0.70, 0.95, 1.5), uNight) * rim * (0.30 + 0.60 * smoothstep(0.1, 0.8, t)) * 0.7;
  if (sheen > 0.0) {
    vec3 R = reflect(-uSunV, N);
    float sp = pow(max(dot(R, V), 0.0), 9.0);
    o += vec3(1.0, 0.86, 0.62) * sp * 0.30 * sheen * (0.35 + 0.65 * t);
    o += col * 0.12 * sheen * pow(1.0 - max(dot(N, V), 0.0), 2.0) * t;
  }
  if (met > 0.5) {
    vec3 R = reflect(-uSunV, N);
    float sp = pow(max(dot(R, V), 0.0), 22.0);
    o = mix(o, vec3(0.78, 0.78, 0.82) * (0.36 + 0.55 * t), 0.55) + vec3(1.0, 0.92, 0.70) * sp * 0.7;
  }
  o = nightGrade(o);
  o += uBase * uGlow;
  o += vec3(1.0, 0.72, 0.26) * uBoost * (gold + met * 0.35) * (0.5 + 0.5 * sin(vO.y * 20.0 + uTime * 16.0)) * 0.7;
  gl_FragColor = vec4(o, al);
}`;

/* ---- Tifinagh letters flying off behind the carpet during boost (4x3 glyph atlas) ---- */
const VS_GLYPH = `
attribute float aSize; attribute float aAlpha; attribute float aGlyph; attribute float aRot;
uniform float uPx;
varying float vA; varying float vG; varying float vR;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = aAlpha; vG = aGlyph; vR = aRot;
  gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.5), 0.0, 160.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS_GLYPH = `
uniform sampler2D uTex;
varying float vA; varying float vG; varying float vR;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vR), sn = sin(vR);
  c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) discard;
  float g = floor(vG + 0.5);
  vec2 cell = vec2(mod(g, 4.0), floor(g / 4.0));
  float m = texture2D(uTex, (cell + vec2(c.x, 1.0 - c.y)) / vec2(4.0, 3.0)).a;
  if (m < 0.02) discard;
  vec3 col = mix(vec3(1.0, 0.62, 0.18), vec3(1.0, 0.93, 0.64), m * m);
  gl_FragColor = vec4(col * (0.9 + 0.7 * m), m * vA);
}`;
