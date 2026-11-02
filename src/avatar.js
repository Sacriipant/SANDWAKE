/**
 * avatar.js: the veiled traveller, an Amazigh woman of the Souss: a slender silhouette, a long embroidered silk
 * dress open over a satin underskirt, a starry night cape, a hood, a translucent sequined veil, braids, wide
 * sleeves and silver jewellery (fibulae, diadem, tazerzit).
 * Everything is procedural. The fabrics are dense meshes animated in the vertex shader (skirts, cape, sleeves, veil).
 */
/**
 * Builds the procedural avatar.
 * @param {object} THREE  the three.js namespace
 * @param {object} X      shared pieces from src/game/08-character.js: { charU, flagU, charMat, body }
 *                        (character and flag uniforms, solid-material factory, group the avatar is added to)
 * @returns {{head, mats, animate, rig}}  animate(state, dt) poses the skeleton every frame
 */
function buildAvatar(THREE, X) {
  const { charU, flagU, charMat, body } = X;
  const PI = Math.PI,
    TAU = PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const IVORY = [0.96, 0.89, 0.74],
    SAFFRON = [0.99, 0.67, 0.16],
    RED = [0.66, 0.11, 0.09],
    TEAL = [0.06, 0.52, 0.54];
  const NIGHT = [0.07, 0.08, 0.27],
    VIOLET = [0.3, 0.2, 0.52],
    GOLD = [1.0, 0.86, 0.52],
    SILVER = [0.84, 0.84, 0.88];
  const SKIN = [0.68, 0.46, 0.34],
    CORAL = [0.88, 0.22, 0.16],
    AMBER = [0.95, 0.55, 0.1],
    DEEPTEAL = [0.04, 0.3, 0.36];
  const mats = [];

  /* ---------- materials ---------- */
  // cloth material factory: o = { mode, pat, a, b, c, acc, acc2, glow, len, ph, y0, lift, rip, side, trans } (see the uP / uF tables in shaders.js)
  const cm = (base, o) => {
    o = o || {};
    const mode = o.mode || 0;
    const u = {
      uBase: { value: new THREE.Color(base[0], base[1], base[2]) },
      uAcc: { value: new THREE.Color().fromArray(o.acc || [1, 1, 1]) },
      uAcc2: { value: new THREE.Color().fromArray(o.acc2 || [0, 0, 0]) },
      uSunV: charU.uSunV,
      uGlow: { value: o.glow || 0 },
      uP: { value: new THREE.Vector4(o.pat || 0, o.a || 0, o.b || 0, o.c || 0) },
      uBoost: flagU.uBoost,
      uTime: flagU.uTime,
      uSp: flagU.uSp,
      uNight: charU.uNight,
      uF: { value: new THREE.Vector4(mode, o.len || 1, o.ph || 0, o.y0 || 0) },
      uWL: { value: new THREE.Vector3(0, 0, -1) },
      uW: { value: new THREE.Vector2(o.lift === undefined ? 1 : o.lift, o.rip === undefined ? 1 : o.rip) }
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VS_CLOTH,
      fragmentShader: FS_CLOTH,
      uniforms: u,
      side: o.side ? THREE.DoubleSide : THREE.FrontSide,
      transparent: !!o.trans,
      depthWrite: !o.trans,
      extensions: { derivatives: false }
    });
    m.userData.merge = !mode && !o.trans;
    mats.push(m);
    return m;
  };
  const SM = {};
  // flat-shaded solid material, cached by colour and glow (merged into static batches)
  const solid = (c, glow) => {
    const key = c.join(',') + '|' + (glow || 0);
    if (!SM[key]) {
      SM[key] = charMat(c[0], c[1], c[2], glow || 0);
      SM[key].userData.merge = true;
    }
    return SM[key];
  };
  const mSilver = cm(SILVER, { pat: 5 }),
    mGold = cm(GOLD, { pat: 5 });
  const mSkin = cm(SKIN, { pat: 13, a: 99, glow: 0.04 });

  /* ---------- geometry ---------- */
  const V2 = (a, b) => new THREE.Vector2(a, b);
  const smooth = (pts, n) =>
    new THREE.SplineCurve(pts.map((p) => V2(p[0], p[1]))).getPoints(n).map((p) => V2(Math.max(p.x, 0), p.y));
  const profAt = (pts, y) => {
    // radius of a profile (increasing in y) at height y
    for (let i = 1; i < pts.length; i++)
      if (y <= pts[i].y) {
        const a = pts[i - 1],
          b = pts[i];
        return a.x + (b.x - a.x) * clamp((y - a.y) / (b.y - a.y || 1), 0, 1);
      }
    return pts[pts.length - 1].x;
  };
  const fixSeam = (g, stride, count) => {
    // smooth the normals across the seam (column 0 = last column)
    const N = g.attributes.normal;
    for (let j = 0; j < stride; j++) {
      const a = j,
        b = count * stride + j;
      const x = N.getX(a) + N.getX(b),
        y = N.getY(a) + N.getY(b),
        z = N.getZ(a) + N.getZ(b),
        l = Math.hypot(x, y, z) || 1;
      N.setXYZ(a, x / l, y / l, z / l);
      N.setXYZ(b, x / l, y / l, z / l);
    }
  };
  /* flattened lathe: zs = z scale along y, scalloped hem (hem), z offset (zo) */
  const shell = (pts, seg, phiS, phiL, o) => {
    o = o || {};
    const g = new THREE.LatheGeometry(pts, seg, phiS, phiL);
    const P = g.attributes.position,
      nP = pts.length;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i),
        y = P.getY(i),
        z = P.getZ(i);
      if (o.zo) z += o.zo(y);
      if (o.zs) z *= o.zs(y);
      if (o.hem) {
        const j = i % nP;
        if (j < 3) y += o.hem.amp * (0.5 + 0.5 * Math.cos(Math.atan2(x, z) * o.hem.n)) * [1, 0.45, 0.15][j];
      }
      P.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    if (Math.abs(phiL - TAU) < 1e-4) fixSeam(g, nP, seg);
    return g;
  };
  /* parametric surface (u, v) in [0, 1]^2: the normals point away from the vertical axis */
  const surf = (nu, nv, fn, cx, cz) => {
    const pos = [],
      uvs = [],
      idx = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const p = fn(i / nu, j / nv);
        pos.push(p[0], p[1], p[2]);
        uvs.push(i / nu, j / nv);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i,
          b = a + 1,
          c = a + nu + 1,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    let s = 0;
    const N = g.attributes.normal,
      P = g.attributes.position;
    for (let i = 0; i < P.count; i++) s += N.getX(i) * (P.getX(i) - (cx || 0)) + N.getZ(i) * (P.getZ(i) - (cz || 0));
    if (s < 0) {
      for (let t = 0; t < idx.length; t += 3) {
        const q = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = q;
      }
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  };
  const put = (parent, geo, mat, p, r, s) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  };
  const ball = (parent, r, mat, p, s, seg) =>
    put(parent, new THREE.SphereGeometry(r, seg || 14, Math.max(6, ((seg || 14) * 0.6) | 0)), mat, p, null, s);
  const torus = (parent, R, r, mat, p, rot, tseg, rseg) =>
    put(parent, new THREE.TorusGeometry(R, r, rseg || 8, tseg || 24), mat, p, rot);
  const tube = (parent, pts, r, mat, segs) =>
    put(
      parent,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
        segs || 24,
        r,
        6,
        false
      ),
      mat
    );
  /* merges the static pieces that share a material under one root (fewer draw calls) */
  const mergeGeos = (list) => {
    let n = 0,
      ni = 0;
    for (const g of list) {
      n += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2),
      idx = n < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
    let o = 0,
      oi = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (g.index) {
        for (let k = 0; k < g.index.count; k++) idx[oi + k] = g.index.array[k] + o;
        oi += g.index.count;
      } else {
        for (let k = 0; k < c; k++) idx[oi + k] = o + k;
        oi += c;
      }
      o += c;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  };
  const bake = (root, others) => {
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(),
      tmp = new THREE.Matrix4();
    const buckets = new Map(),
      kill = [];
    (function walk(n) {
      for (const c of n.children) {
        if (others.indexOf(c) >= 0) continue;
        if (c.isMesh && c.material.userData.merge) {
          const g = c.geometry.clone();
          g.applyMatrix4(tmp.multiplyMatrices(inv, c.matrixWorld));
          if (!buckets.has(c.material)) buckets.set(c.material, []);
          buckets.get(c.material).push(g);
          kill.push(c);
        } else if (!c.isMesh) walk(c);
      }
    })(root);
    kill.forEach((c) => c.parent.remove(c));
    buckets.forEach((list, mat) => {
      const m = new THREE.Mesh(mergeGeos(list), mat);
      m.frustumCulled = false;
      root.add(m);
    });
  };

  /* ================= skeleton =================
   pelvis (hipG, at the waist) -> torso (spineG) -> neck / head; the skirts hang from the pelvis (skG); arms and legs are
   two-segment chains solved by inverse kinematics every frame (see animate). upG: an "absolute" frame that keeps the old coordinates. */
  const HIP0 = 1.12;
  const hipG = new THREE.Group();
  hipG.position.y = HIP0;
  body.add(hipG);
  const spineG = new THREE.Group();
  hipG.add(spineG);
  const upG = new THREE.Group();
  upG.position.y = -HIP0;
  spineG.add(upG);
  const skG = new THREE.Group();
  skG.position.y = 0.2;
  body.add(skG);

  /* ================= legs: satin sirwal tight at the ankle, embroidered babouches (thigh, shin, foot) ================= */
  const L1 = 0.5,
    L2 = 0.46,
    ANK = 0.092;
  const mSat = cm(DEEPTEAL, { pat: 12, acc: SAFFRON, acc2: RED, a: 0.07, side: 1 });
  const thighGeo = new THREE.LatheGeometry(
    [V2(0, -L1)].concat(
      smooth(
        [
          [0.08, -L1],
          [0.088, -0.36],
          [0.097, -0.18],
          [0.102, 0.0]
        ],
        12
      ),
      [V2(0, 0)]
    ),
    22
  );
  const shinGeo = new THREE.LatheGeometry(
    [V2(0, -L2)].concat(
      smooth(
        [
          [0.04, -L2],
          [0.045, -0.4],
          [0.055, -0.3],
          [0.067, -0.18],
          [0.077, -0.06],
          [0.08, 0.0]
        ],
        14
      ),
      [V2(0, 0)]
    ),
    22
  );
  const slipGeo = (() => {
    // babouche: sole, upper, raised toe
    const parts = [];
    const sole = new THREE.SphereGeometry(1, 20, 12);
    sole.scale(0.05, 0.03, 0.118);
    sole.translate(0, 0.03, 0.045);
    parts.push(sole);
    const cone = new THREE.ConeGeometry(0.034, 0.15, 16, 1);
    cone.rotateX(PI / 2 - 0.42);
    cone.translate(0, 0.066, 0.17);
    parts.push(cone);
    const heel = new THREE.SphereGeometry(0.03, 12, 8);
    heel.scale(1.1, 0.9, 0.8);
    heel.translate(0, 0.036, -0.05);
    parts.push(heel);
    return mergeGeos(parts);
  })();
  const legs = [];
  for (const sg of [-1, 1]) {
    const thigh = new THREE.Group(),
      shin = new THREE.Group(),
      foot = new THREE.Group();
    body.add(thigh);
    body.add(shin);
    body.add(foot);
    put(thigh, thighGeo, mSat);
    ball(thigh, 0.102, mSat, [0, 0, 0], null, 14);
    put(shin, shinGeo, mSat);
    ball(shin, 0.08, mSat, [0, 0, 0], null, 14);
    torus(foot, 0.0425, 0.0045, mSilver, [0, ANK + 0.004, 0], [PI / 2, 0, 0], 22, 6);
    put(foot, new THREE.CylinderGeometry(0.03, 0.034, ANK + 0.014, 14), mSkin, [0, (ANK + 0.014) / 2, 0]);
    put(foot, slipGeo, solid([0.98, 0.78, 0.16], 0.02));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      ball(foot, 0.0055, mSilver, [Math.cos(a) * 0.043, ANK - 0.012, Math.sin(a) * 0.043], null, 8);
    }
    legs.push({ sg, thigh, shin, foot });
  }

  /* ================= dark turquoise satin underskirt + ivory silk dress open at the front ================= */
  const underPts = smooth(
    [
      [0.3, 0.3],
      [0.285, 0.44],
      [0.25, 0.62],
      [0.215, 0.8],
      [0.178, 0.96],
      [0.15, 1.06],
      [0.138, 1.12]
    ],
    20
  );
  const zsSkirt = (y) => 0.8 + 0.2 * clamp((0.95 - y) / 0.45, 0, 1);
  put(
    skG,
    shell(underPts, 64, 0, TAU, { zs: zsSkirt }),
    cm(DEEPTEAL, {
      pat: 12,
      acc: SAFFRON,
      acc2: RED,
      a: 0.05,
      mode: 2,
      len: 0.84,
      y0: 1.12,
      ph: 0.4,
      rip: 0.8,
      side: 1
    }),
    [0, -0.2, 0]
  );
  const GAP = 0.95;
  const overPts = smooth(
    [
      [0.43, 0.2],
      [0.382, 0.34],
      [0.322, 0.52],
      [0.25, 0.72],
      [0.208, 0.9],
      [0.172, 1.03],
      [0.148, 1.11],
      [0.142, 1.16]
    ],
    24
  );
  put(
    skG,
    shell(overPts, 76, GAP / 2, TAU - GAP, { zs: zsSkirt, hem: { n: 9, amp: 0.045 } }),
    cm(IVORY, { pat: 9, acc: SAFFRON, acc2: RED, a: GAP / 2, b: 0.17, mode: 2, len: 0.96, y0: 1.16, ph: 1.9, side: 1 }),
    [0, -0.2, 0]
  );

  /* ================= fitted bodice (hip yoke + upper torso), woven belt ================= */
  const bodPts = smooth(
    [
      [0.172, 0.98],
      [0.158, 1.04],
      [0.14, 1.1],
      [0.136, 1.14],
      [0.15, 1.2],
      [0.17, 1.26],
      [0.182, 1.31],
      [0.188, 1.36],
      [0.172, 1.405],
      [0.118, 1.432],
      [0.054, 1.455]
    ],
    26
  );
  const zsB = (y) => 0.74 + 0.12 * clamp((1.1 - y) / 0.15, 0, 1);
  const mBod = cm(RED, { pat: 10, acc: SAFFRON, acc2: [0.3, 0.04, 0.05] });
  put(upG, shell(bodPts, 52, 0, TAU, { zs: zsB }), mBod); // the belt covers the junction with the skirt
  for (const sx of [-1, 1]) ball(upG, 0.068, mBod, [sx * 0.058, 1.265, 0.088], [1, 0.95, 0.86], 18);
  put(
    upG,
    shell(
      smooth(
        [
          [0.156, 1.02],
          [0.162, 1.05],
          [0.162, 1.17],
          [0.156, 1.2]
        ],
        8
      ),
      56,
      0,
      TAU,
      { zs: () => 0.82 }
    ),
    cm([0.62, 0.1, 0.1], { pat: 2, acc: SAFFRON, acc2: NIGHT })
  );
  torus(upG, 0.034, 0.0075, mGold, [0, 1.09, 0.134], null, 28, 8);
  ball(upG, 0.02, solid(TEAL, 0.25), [0, 1.09, 0.142], [1, 1, 0.7], 12);

  /* ================= starry night cape: a dense surface draped over the shoulders ================= */
  const CY = 1.445;
  const capeR = (v) =>
    0.172 + 0.17 * (0.15 * v + 0.85 * Math.pow(Math.max(v, 0), 1.6)) - 0.022 * Math.exp(-Math.pow((v - 0.3) / 0.1, 2));
  const capeGeo = surf(72, 40, (u, v) => {
    const tm = 1.55 + 0.35 * v,
      th = (u - 0.5) * 2 * tm;
    const H = 0.96 + 0.1 * Math.cos(th * 1.1);
    const r = capeR(v) + 0.011 * Math.sin(th * 5.0 + v * 2.0) * v;
    return [r * Math.sin(th), CY - v * H, -r * Math.cos(th)];
  });
  put(
    upG,
    capeGeo,
    cm(NIGHT, { pat: 7, acc: GOLD, acc2: RED, mode: 2, len: 1.06, y0: CY, ph: 0.0, lift: 1.0, rip: 1.0, side: 1 })
  );

  /* ================= arms: wide silk sleeves, slim forearms, detailed hands, bracelets ================= */
  /* shoulder and elbow are real joints: the upper arm (narrow sleeve) and the forearm (pagoda sleeve, bare wrist) are two groups
     re-oriented every frame; a silk sphere at the elbow closes the fold. */
  const AL1 = 0.28,
    AL2 = 0.335,
    SHY = 1.375,
    SHX = 0.2;
  const sleeveA = new THREE.LatheGeometry(
    smooth(
      [
        [0.1, -AL1],
        [0.095, -0.24],
        [0.088, -0.18],
        [0.078, -0.12],
        [0.066, -0.06],
        [0.054, -0.01],
        [0.048, 0.02]
      ],
      14
    ).concat([V2(0, 0.035)]),
    36
  );
  const sleeveB = new THREE.LatheGeometry(
    smooth(
      [
        [0.165, -0.19],
        [0.148, -0.145],
        [0.128, -0.09],
        [0.11, -0.04],
        [0.1, 0.0]
      ],
      14
    ),
    40
  );
  const mElbow = cm(IVORY, { pat: 0 });
  const armsA = [];
  for (const sx of [-1, 1]) {
    const upper = new THREE.Group(),
      arm = new THREE.Group();
    upper.position.set(sx * SHX, SHY, 0);
    upG.add(upper);
    arm.position.set(sx * SHX, SHY - AL1, 0);
    upG.add(arm);
    const mA = cm(IVORY, {
      pat: 9,
      acc: SAFFRON,
      acc2: RED,
      a: 0,
      b: 0,
      c: 5,
      mode: 3,
      len: 0.5,
      y0: 0.03,
      ph: sx * 2.2,
      lift: 1.3,
      rip: 1.4,
      side: 1
    });
    put(upper, sleeveA, mA);
    const mB = cm(IVORY, {
      pat: 9,
      acc: SAFFRON,
      acc2: RED,
      a: 0,
      b: 0.58,
      c: 5,
      mode: 3,
      len: 0.5,
      y0: 0.03 + AL1,
      ph: sx * 2.2,
      lift: 1.3,
      rip: 1.4,
      side: 1
    });
    put(arm, sleeveB, mB);
    ball(arm, 0.1, mElbow, [0, 0, 0], null, 16);
    put(arm, new THREE.CylinderGeometry(0.0235, 0.02, 0.22, 14), mSkin, [0, -0.5 + AL1, 0]);
    for (let i = 0; i < 4; i++)
      torus(arm, 0.0235, 0.0042, mSilver, [0, -0.555 + AL1 - i * 0.012, 0], [PI / 2, 0, 0], 16, 6);
    put(arm, new THREE.CylinderGeometry(0.0268, 0.0268, 0.022, 16), mGold, [0, -0.6 + AL1, 0]);
    /* hand: palm, four fingers with two slightly curved phalanges, thumb */
    const hand = new THREE.Group();
    hand.position.set(0, -AL2, 0);
    hand.rotation.x = 0.22;
    arm.add(hand);
    ball(hand, 1, mSkin, [0, -0.04, 0], null, 16).geometry.scale(0.03, 0.042, 0.0135);
    const finger = (x, y, z, lens, a0, a1, r0) => {
      let py = y,
        pz = z;
      lens.forEach((L, j) => {
        const a = j === 0 ? a0 : a1,
          dy = -Math.cos(a),
          dz = Math.sin(a),
          rr = r0 * (1 - j * 0.14);
        put(
          hand,
          new THREE.CylinderGeometry(rr * 0.92, rr, L, 8),
          mSkin,
          [x, py + (dy * L) / 2, pz + (dz * L) / 2],
          [PI - a, 0, 0]
        );
        py += dy * L;
        pz += dz * L;
        ball(hand, rr * 0.95, mSkin, [x, py, pz], null, 8);
      });
    };
    [
      [-1.5, 0.034, 0.03],
      [-0.5, 0.036, 0.034],
      [0.5, 0.036, 0.032],
      [1.5, 0.03, 0.026]
    ].forEach((f, i) =>
      finger(f[0] * 0.0135, -0.074, 0.0, [f[2] + 0.006, f[1]], 0.1 + i * 0.03, 0.55, 0.0078 - (i === 3 ? 0.0012 : 0))
    );
    {
      const tx = -sx * 0.028;
      put(
        hand,
        new THREE.CylinderGeometry(0.0078, 0.0088, 0.034, 8),
        mSkin,
        [tx, -0.058, 0.01],
        [PI - 0.9, 0, sx * 0.55]
      );
      ball(hand, 0.0072, mSkin, [tx - sx * 0.01, -0.083, 0.02], null, 8);
    }
    torus(hand, 0.0082, 0.0025, mGold, [0.0135 * 0.5, -0.088, 0.0042], [PI / 2, 0, 0], 12, 5);
    armsA.push({ sg: sx, upper, arm, mA, mB });
  }

  /* ================= head: fine face, glowing kohl eyes, litham, starry hood, silver diadem, veil, braids ================= */
  const NY = 1.475;
  const neck = new THREE.Group();
  neck.position.set(0, NY, 0);
  upG.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0);
  neck.add(head);
  const HX = 0.0965,
    HY = 0.111,
    HZ = 0.103;
  const taper = (y) => 1 - 0.3 * Math.pow(clamp(-y / HY, 0, 1), 1.3);
  const faceZ = (x, y, off) => {
    const tp = taper(y),
      q = 1 - (x / (HX * tp)) * (x / (HX * tp)) - (y / HY) * (y / HY);
    return q > 0 ? HZ * tp * Math.sqrt(q) + (off || 0) : 0;
  };
  put(neck, new THREE.CylinderGeometry(0.042, 0.052, 0.15, 28), mSkin, [0, 0.0, 0]);
  const faceGeo = (() => {
    const W = 48,
      Hs = 32,
      g = new THREE.SphereGeometry(1, W, Hs),
      P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const nx = P.getX(i),
        ny = P.getY(i),
        nz = P.getZ(i);
      let y = HY * ny * (ny < 0 ? 1.04 : 1.0);
      const tp = taper(y);
      let x = HX * nx * tp,
        z = HZ * nz * tp;
      if (nz > 0) {
        z += 0.0045 * Math.exp(-Math.pow((y - 0.036) / 0.011, 2)) * Math.exp(-Math.pow(x / 0.05, 2)); // brow ridges
        z += 0.01 * Math.exp(-Math.pow(x / 0.01, 2)) * Math.exp(-Math.pow((y - 0.012) / 0.034, 2)); // nose bridge
        z += 0.004 * Math.exp(-Math.pow(Math.abs(x) - 0.055, 2) / 0.0004) * Math.exp(-Math.pow((y + 0.02) / 0.022, 2)); // cheekbones
      }
      P.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const N = g.attributes.normal; // sphere seam: columns 0 and W of each row
    for (let iy = 0; iy <= Hs; iy++) {
      const a = iy * (W + 1),
        b = a + W,
        x = N.getX(a) + N.getX(b),
        y = N.getY(a) + N.getY(b),
        z = N.getZ(a) + N.getZ(b),
        l = Math.hypot(x, y, z) || 1;
      N.setXYZ(a, x / l, y / l, z / l);
      N.setXYZ(b, x / l, y / l, z / l);
    }
    return g;
  })();
  put(head, faceGeo, cm(SKIN, { pat: 13, a: 0.0, glow: 0.04 }));
  /* hair: a dark cap under the hood */
  {
    const hair = new THREE.SphereGeometry(1, 36, 16, 0, TAU, 0, 0.8);
    hair.scale(HX * 1.05, HY * 1.045, HZ * 1.06);
    put(head, hair, cm([0.03, 0.03, 0.09], { pat: 0 }));
  }
  /* eyes: sclera, glowing turquoise iris, pupil, heavy eyelid, almond-shaped kohl extended into a wing */
  const eyeY = 0.016,
    eyeX = 0.038,
    irisMat = solid([0.12, 0.7, 0.72], 0.75),
    kohl = solid([0.03, 0.02, 0.025], 0),
    lid = solid([0.3, 0.19, 0.15], 0);
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * eyeX, eyeY, faceZ(eyeX, eyeY, -0.0005));
    e.rotation.y = sx * 0.4;
    head.add(e);
    ball(e, 1, solid([0.95, 0.91, 0.84], 0.12), [0, 0, 0], null, 16).geometry.scale(0.0108, 0.0082, 0.0046);
    ball(e, 1, kohl, [0, 0, -0.0012], null, 16).geometry.scale(0.0131, 0.01, 0.0044);
    ball(e, 1, irisMat, [0, -0.0003, 0.003], null, 14).geometry.scale(0.0068, 0.0068, 0.003);
    ball(e, 0.003, solid([0.01, 0.01, 0.015], 0), [0, -0.0003, 0.0047], [1, 1, 0.5], 8);
    ball(e, 0.0012, solid([1, 1, 1], 1.0), [sx * -0.0022, 0.0022, 0.0053], null, 6);
    ball(e, 1, lid, [0, 0.0043, 0.0013], null, 14).geometry.scale(0.0114, 0.0052, 0.0044);
    ball(e, 1, kohl, [sx * 0.0148, 0.0036, -0.0003], null, 8).geometry.scale(0.008, 0.0017, 0.0025);
    e.children[e.children.length - 1].rotation.z = sx * 0.4;
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) / 2,
        c = new THREE.ConeGeometry(0.0008, 0.005, 4);
      put(e, c, kohl, [sx * t * 0.0075, 0.0072 - Math.abs(t) * 0.0014, 0.003], [0.25, 0, -sx * t * 0.45]);
    }
    const bx = [sx * 0.017, 0.034],
      bm = [sx * 0.04, 0.0425],
      be = [sx * 0.062, 0.0355];
    const bz = (p) => faceZ(Math.abs(p[0]), p[1], 0.0022);
    tube(
      head,
      [
        [bx[0], bx[1], bz(bx)],
        [bm[0], bm[1], bz(bm)],
        [be[0], be[1], bz(be)]
      ],
      0.0021,
      solid([0.05, 0.03, 0.025], 0),
      10
    );
  }
  /* litham: silk veil over the lower face, stretched over the nose, edged with an embroidered border */
  const lithGeo = surf(
    36,
    20,
    (u, v) => {
      const ph = (u - 0.5) * 3.1;
      const yT = -0.006 + 0.022 * Math.exp(-Math.pow(ph / 0.3, 2)),
        yB = -0.118 + 0.05 * Math.pow(Math.abs(ph) / 1.55, 2);
      const yy = yT + v * (yB - yT),
        tp = taper(Math.max(yy, -HY * 0.95)),
        rho = Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(yy, -HY * 0.97) / HY, 2)));
      const bump = 0.02 * Math.exp(-Math.pow(ph / 0.22, 2)) * Math.exp(-Math.pow((yy + 0.004) / 0.03, 2));
      const infl = 0.0065 + 0.0025 * Math.sin(ph * 9 + v * 3);
      return [(HX * tp * rho + infl) * Math.sin(ph), yy, (HZ * tp * rho + infl + bump) * Math.cos(ph)];
    },
    0,
    0
  );
  put(head, lithGeo, cm(VIOLET, { pat: 12, acc: SAFFRON, acc2: RED, a: 0.055, side: 1 }));
  /* hood in night cloth: ample dome, collar-like fall over the shoulders, opening on the face */
  const hoodGap = 0.64;
  const hoodPts = smooth(
    [
      [0.196, -0.095],
      [0.176, -0.03],
      [0.15, 0.035],
      [0.141, 0.1],
      [0.14, 0.16],
      [0.129, 0.215],
      [0.108, 0.262],
      [0.077, 0.296],
      [0.038, 0.318],
      [0.0, 0.328]
    ],
    26
  );
  put(
    neck,
    shell(hoodPts, 60, hoodGap, TAU - 2 * hoodGap, {
      zs: () => 0.98,
      zo: (y) => -0.05 * clamp((y - 0.18) / 0.17, 0, 1)
    }),
    cm(NIGHT, { pat: 7, a: 1, b: 1, c: hoodGap, acc: GOLD, acc2: RED, side: 1 })
  );
  /* silver diadem on the forehead, pearl pendants */
  const dY = 0.074;
  const diaGeo = surf(
    40,
    3,
    (u, v) => {
      const ph = (u - 0.5) * 2.5,
        yy = dY + (v - 0.5) * 0.0105 - 0.004 * (ph * ph) * 0.35,
        rho = Math.sqrt(1 - Math.pow(yy / HY, 2));
      return [(HX * rho + 0.0045) * Math.sin(ph), yy, (HZ * rho + 0.0045) * Math.cos(ph)];
    },
    0,
    0
  );
  put(head, diaGeo, cm(SILVER, { pat: 5, side: 1 }));
  for (let i = -6; i <= 6; i++) {
    const ph = i * 0.19,
      yy = dY - 0.004 * ph * ph * 0.35 - 0.01,
      rho = Math.sqrt(1 - Math.pow(dY / HY, 2));
    const px = (HX * rho + 0.0055) * Math.sin(ph),
      pz = (HZ * rho + 0.0055) * Math.cos(ph);
    const c = [CORAL, TEAL, AMBER][((i % 3) + 3) % 3];
    put(head, new THREE.CylinderGeometry(0.0058, 0.0058, 0.0016, 10), mSilver, [px, yy, pz], [PI / 2, ph, 0]);
    ball(head, 0.004, solid(c, 0.15), [px * 1.003, yy - 0.0085 - (i === 0 ? 0.004 : 0), pz * 1.003], null, 8);
    if (i === 0) {
      ball(head, 0.005, mSilver, [px, yy - 0.0215, pz + 0.001], [1, 1.4, 0.8], 8);
      ball(head, 0.0036, solid(TEAL, 0.4), [px, yy - 0.0215, pz + 0.0045], [1, 1.2, 0.6], 8);
    }
  }
  for (const sx of [-1, 1]) {
    // temple chains: pearls hanging along the cheeks
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const x = 0.072 + k * 0.003,
        y = 0.066 - k * 0.019;
      pts.push([sx * x, y, faceZ(x, y, 0.009)]);
    }
    tube(head, pts, 0.0016, mSilver, 12);
    pts.slice(1).forEach((p, k) => ball(head, 0.0044, solid([CORAL, AMBER, TEAL][k % 3], 0.12), p, null, 8));
  }
  /* gauze veil (translucent, silver sequins): a long piece attached to the hood that streams behind */
  const VL = 1.55,
    VY = 0.215;
  const veilGeo = surf(24, 48, (u, v) => {
    const yBody = NY + VY - v * VL,
      vc = clamp((CY - yBody) / 1.06, 0, 1.15),
      up = clamp((yBody - CY) / (NY + VY - CY), 0, 1);
    const r = (capeR(vc) + 0.04 + 0.02 * Math.sin(v * 6.0)) * (1 - up) + 0.145 * up,
      th = (u - 0.5) * 2 * (0.1 / r + 0.03 * v);
    return [r * Math.sin(th), VY - v * VL, -r * Math.cos(th)];
  });
  put(
    neck,
    veilGeo,
    cm([0.62, 0.52, 0.9], {
      pat: 8,
      acc: [1.0, 0.95, 0.85],
      acc2: SAFFRON,
      mode: 2,
      len: VL,
      y0: VY,
      ph: 2.6,
      lift: 1.7,
      rip: 1.5,
      side: 1,
      trans: true
    })
  );
  /* dark braids adorned with silver beads, following the back and then floating */
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const yBody = 1.46 - k * 0.062,
        vc = clamp((CY - yBody) / 1.06, 0, 1.1),
        r = capeR(vc) + 0.032,
        th = sx * (0.3 + 0.05 * Math.sin(k * 0.5));
      pts.push([r * Math.sin(th), yBody - NY, -r * Math.cos(th)]);
    }
    put(
      neck,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
        40,
        0.0165,
        8,
        false
      ),
      cm([0.07, 0.045, 0.04], {
        pat: 11,
        acc: SILVER,
        acc2: TEAL,
        mode: 2,
        len: 0.78,
        y0: 1.46 - NY,
        ph: sx * 1.3,
        lift: 1.2,
        rip: 0.7,
        side: 1
      })
    );
  }

  /* ================= jewellery: triangular fibulae, chain, tazerzit necklace, amulet ================= */
  for (const sx of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(sx * 0.128, 1.352, 0.113);
    f.rotation.set(-0.12, sx * 0.75, 0);
    upG.add(f);
    const tri = new THREE.Shape();
    tri.moveTo(-0.046, 0.0);
    tri.lineTo(0.046, 0.0);
    tri.lineTo(0.0, -0.105);
    tri.closePath();
    put(
      f,
      new THREE.ExtrudeGeometry(tri, {
        depth: 0.006,
        bevelEnabled: true,
        bevelSize: 0.004,
        bevelThickness: 0.003,
        bevelSegments: 2
      }),
      mSilver
    );
    torus(f, 0.015, 0.0045, mSilver, [0, 0.006, 0.006], null, 20, 6);
    [
      [-0.024, -0.018, TEAL],
      [0.024, -0.018, SAFFRON],
      [0, -0.058, CORAL],
      [0, -0.03, TEAL]
    ].forEach((d) => ball(f, 0.0085, solid(d[2], 0.2), [d[0], d[1], 0.009], [1, 1, 0.55], 10));
    for (let i = 0; i < 5; i++) ball(f, 0.0036, mGold, [-0.04 + i * 0.02, 0.0, 0.007], null, 6);
  }
  const chain = [];
  for (let k = 0; k <= 12; k++) {
    const t = (k / 12) * 2 - 1,
      ph = t * 0.78,
      y = 1.352 - 0.08 * (1 - t * t);
    chain.push([profAt(bodPts, y) * Math.sin(ph) * 1.0, y, profAt(bodPts, y) * zsB(y) * Math.cos(ph) + 0.02]);
  }
  tube(upG, chain, 0.003, mSilver, 40);
  chain.forEach((p, k) => {
    if (k % 2 === 0 && k > 0 && k < 12) ball(upG, 0.0062, mGold, p, null, 8);
  });
  const bc = [CORAL, AMBER, TEAL, SILVER, AMBER];
  for (let i = 0; i < 17; i++) {
    const t = i / 8 - 1,
      ph = t * 0.95,
      y = 1.422 - 0.07 * (1 - t * t),
      rr = profAt(bodPts, y),
      c = bc[i % bc.length],
      big = i % 4 === 0 ? 1.35 : 1.0;
    ball(
      upG,
      0.0125 * big,
      c === SILVER ? mSilver : solid(c, 0.08),
      [rr * Math.sin(ph), y, rr * zsB(y) * Math.cos(ph) + 0.016],
      null,
      10
    );
  }
  {
    const ay = 1.255,
      az = profAt(bodPts, ay) * zsB(ay) + 0.03;
    put(upG, new THREE.CylinderGeometry(0.036, 0.036, 0.008, 4), mSilver, [0, ay, az], [PI / 2, PI / 4, 0]);
    ball(upG, 0.0125, solid(TEAL, 0.4), [0, ay, az + 0.007], [1, 1, 0.6], 10);
    ball(upG, 0.0058, solid(CORAL, 0.1), [0, ay - 0.05, az], null, 8);
    ball(upG, 0.0058, mSilver, [0, ay - 0.04, az], null, 8);
  }

  /* ---- merging of the static pieces (fewer draw calls); the animated fabrics stay separate ---- */
  const moving = [hipG, spineG, skG, neck, head];
  legs.forEach((l) => moving.push(l.thigh, l.shin, l.foot));
  armsA.forEach((a) => moving.push(a.upper, a.arm));
  const roots = [upG, neck, head];
  legs.forEach((l) => roots.push(l.thigh, l.shin, l.foot));
  armsA.forEach((a) => roots.push(a.upper, a.arm));
  const skip = moving.concat([upG]);
  roots.forEach((r) => bake(r, skip));
  body.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  /* ================= animation: the pose comes from the gameplay =================
     Inputs (s): speed, boost, take-off (0..1), vertical speed, tuck, jump charge, steering, carpet roll, accelerations,
     landing impact, flip. The pelvis lowers (knees bent), the torso leans and twists, the head keeps the horizon;
     the hands aim at target positions (outwards, down, forwards) followed by springs (inertia, overshoot), then the elbows and knees are solved. */
  const DOWN = new THREE.Vector3(0, -1, 0),
    AXY = new THREE.Vector3(0, 1, 0),
    V = new THREE.Vector3(),
    QT = new THREE.Quaternion();
  const sm = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  // damped spring step: o = { x, v } follows tgt with stiffness K and damping C
  const spr = (o, tgt, K, C, dt) => {
    o.v += (K * (tgt - o.x) - C * o.v) * dt;
    o.x += o.v * dt;
  };
  const S3 = () => ({ x: 0, v: 0 });
  const st = { bob: S3(), lean: S3(), sway: S3(), fl: 0, idleT: 0 };
  armsA.forEach((a) => {
    a.o = S3();
    a.d = S3();
    a.f = S3();
    a.o.x = 0.17;
    a.d.x = 0.52;
    a.f.x = 0.07;
  });
  const E = [0, 0, 0, 0, 0, 0],
    W0 = new THREE.Vector3(),
    QW = new THREE.Quaternion();
  /* two segments l1, l2 from o towards t; pole = the direction the elbow / knee bends towards. E = [elbow, wrist] */
  const ik2 = (ox, oy, oz, tx, ty, tz, l1, l2, px, py, pz) => {
    const dx = tx - ox,
      dy = ty - oy,
      dz = tz - oz,
      d = Math.hypot(dx, dy, dz) || 1e-6;
    const dc = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-3, d));
    const ux = dx / d,
      uy = dy / d,
      uz = dz / d;
    const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc),
      h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pd = px * ux + py * uy + pz * uz;
    let qx = px - ux * pd,
      qy = py - uy * pd,
      qz = pz - uz * pd,
      ql = Math.hypot(qx, qy, qz);
    if (ql < 1e-4) {
      qx = 1 - ux * ux;
      qy = -ux * uy;
      qz = -ux * uz;
      ql = Math.hypot(qx, qy, qz) || 1;
    }
    qx /= ql;
    qy /= ql;
    qz /= ql;
    E[0] = ox + ux * a + qx * h;
    E[1] = oy + uy * a + qy * h;
    E[2] = oz + uz * a + qz * h;
    E[3] = ox + ux * dc;
    E[4] = oy + uy * dc;
    E[5] = oz + uz * dc;
  };
  const aim = (g, x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    g.quaternion.setFromUnitVectors(DOWN, V.set(x / l, y / l, z / l));
  };
  /* orients the palm (local +z of the hand) towards n by rotating around the limb axis u */
  const palm = (g, ux, uy, uz, nx, ny, nz) => {
    V.set(0, 0, 1).applyQuaternion(g.quaternion);
    const d0 = nx * ux + ny * uy + nz * uz;
    let px = nx - ux * d0,
      py = ny - uy * d0,
      pz = nz - uz * d0;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const c = V.x * px + V.y * py + V.z * pz;
    const sn = (V.y * pz - V.z * py) * ux + (V.z * px - V.x * pz) * uy + (V.x * py - V.y * px) * uz;
    g.quaternion.multiply(QT.setFromAxisAngle(AXY, -Math.atan2(sn, c)));
  };

  // poses the skeleton from the gameplay state s over a time step dt (seconds); see the animation header above
  function animate(s, dt) {
    dt = clamp(dt, 0.0005, 0.05);
    const t = s.t;
    const run = sm(1.5, 20, s.speed),
      fast = sm(16, 60, s.speed),
      bk = s.boostK,
      air = s.air,
      cr = s.crouch,
      ch = s.charge;
    const descend = sm(1.5, -6, s.vy);
    st.fl += (s.flip - st.fl) * (1 - Math.exp(-8 * dt));
    const fl = st.fl,
      steer = s.steer * run;
    /* body inertia: vertical suspension, forward / backward torso sway, lateral rocking */
    if (s.land > 0) st.bob.v -= Math.min(s.land, 12) * 0.2;
    const n = Math.max(1, Math.ceil(dt / 0.012)),
      h = dt / n;
    for (let i = 0; i < n; i++) {
      spr(st.bob, clamp(-0.0045 * s.accY * (1 - air), -0.07, 0.03), 170, 15, h);
      spr(st.lean, clamp(0.012 * s.accF, -0.22, 0.22), 55, 10, h);
      spr(st.sway, clamp(-0.5 * steer * run, -0.2, 0.2), 40, 8, h);
    }
    st.bob.x = clamp(st.bob.x, -0.14, 0.05);
    /* pelvis: bent knees (more with speed, tucked, on the way down from a jump, in a flip) */
    let d = 0.025 + 0.04 * run + 0.025 * bk + 0.16 * cr;
    d = lerp(d, 0.05 + 0.08 * descend + 0.11 * fl, air);
    const hipY = HIP0 - clamp(d, 0, 0.32) + st.bob.x;
    /* torso: leaning forward with speed and boost, straightened on the way up, curled in a flip */
    let pitch = 0.04 + 0.11 * run + 0.16 * bk + 0.34 * cr + 0.1 * ch;
    pitch = lerp(pitch, -0.06 + 0.16 * descend + 0.4 * fl, air);
    pitch += st.lean.x + 0.012 * Math.sin(t * 1.3) * (1 - run);
    const hipYaw = 0.2 * (1 - 0.5 * air) - 0.08 * steer;
    const idle = (1 - run) * (1 - air);
    const chestYaw = -0.8 * hipYaw - 0.3 * steer + 0.05 * Math.sin(t * 0.45) * idle;
    const sRoll = -0.45 * s.roll + st.sway.x;
    hipG.position.set(0.012 * Math.sin(t * 0.5) * idle, hipY, 0);
    hipG.rotation.set(0.25 * pitch, hipYaw, -0.1 * s.roll + 0.02 * Math.sin(t * 0.5) * idle);
    spineG.rotation.set(0.75 * pitch, chestYaw, sRoll);
    skG.position.set(hipG.position.x, 0.2, 0);
    skG.rotation.y = hipYaw * 0.85;
    const sy = clamp((hipY - 0.16) / 0.96, 0.6, 1.05);
    const wd = 1 + (1 - sy) * 1.3;
    skG.scale.set(wd, sy, wd);
    /* head: looks where we are going (the turn), keeps the horizon and stays upright, breathes */
    const look = -0.36 * steer + 0.22 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1.0) * idle;
    neck.rotation.set(
      -0.75 * pitch * 0.9 - 0.1 * air + 0.07 * bk + 0.02 * Math.sin(t * 0.9) - st.bob.x * 0.8,
      clamp(look - hipYaw - chestYaw, -0.9, 0.9),
      -(s.roll + sRoll) * 0.6 + 0.015 * Math.sin(t * 0.6)
    );
    /* arms: hand targets (outwards, down, forwards) relative to the shoulder, then springs */
    const cp = -0.75 * pitch,
      cc = Math.cos(cp),
      cs = Math.sin(cp);
    W0.set(0, 0.0, -1).applyQuaternion(QW.copy(hipG.quaternion).multiply(spineG.quaternion).invert()); // the wind comes from the front: expressed in the torso frame
    for (const A of armsA) {
      const sg = A.sg,
        lead = sg < 0;
      let o = 0.17 + 0.012 * Math.sin(t * 0.8 + sg),
        dn = 0.52,
        f = 0.07 + 0.03 * Math.sin(t * 0.9 + sg * 1.7);
      /* gliding: the lead arm rises in front, bent; the other trails behind, lower and more open */
      const go = lead ? lerp(0.2, 0.26, fast) : lerp(0.3, 0.4, fast),
        gd = lead ? lerp(0.3, 0.22, fast) : lerp(0.46, 0.38, fast),
        gf = lead ? lerp(0.32, 0.34, fast) : lerp(-0.14, -0.24, fast);
      o = lerp(o, go + 0.015 * Math.sin(t * 1.3 + sg), run);
      dn = lerp(dn, gd, run);
      f = lerp(f, gf, run);
      const si = -sg * steer;
      if (si > 0) {
        dn += 0.1 * si;
        f += 0.12 * si;
      } else {
        dn += 0.16 * si;
        o -= 0.14 * si;
      }
      o = lerp(o, 0.22, cr);
      dn = lerp(dn, 0.36, cr);
      f = lerp(f, -0.24, cr);
      o = lerp(o, 0.26, ch);
      dn = lerp(dn, 0.4, ch);
      f = lerp(f, -0.42, ch);
      const ad = lerp(-0.14, 0.12, descend),
        af = lerp(0.26, 0.3, descend),
        ao = lerp(0.32, 0.4, descend); // airborne: elbows bent, hands rising in front then coming back down
      o = lerp(o, ao, air);
      dn = lerp(dn, ad, air);
      f = lerp(f, af, air);
      const bw = bk * (1 - 0.6 * air);
      o = lerp(o, 0.18, bw);
      dn = lerp(dn, 0.38, bw);
      f = lerp(f, -0.3, bw);
      o = lerp(o, 0.2, fl);
      dn = lerp(dn, 0.4, fl);
      f = lerp(f, 0.34, fl);
      o += 0.012 * Math.sin(t * 5.0 + sg) * fast;
      dn -= st.bob.x * 0.8;
      for (let i = 0; i < n; i++) {
        spr(A.o, o, 60, 10, h);
        spr(A.d, dn, 60, 10, h);
        spr(A.f, f, 60, 10, h);
      }
      const wy = -A.d.x,
        wz = A.f.x;
      const hx = sg * (SHX + A.o.x),
        hy = SHY + wy * cc - wz * cs,
        hz = wy * cs + wz * cc;
      ik2(sg * SHX, SHY, 0, hx, hy, hz, AL1, AL2, sg * 0.4, -0.85, -0.35);
      A.upper.position.set(sg * SHX, SHY, 0);
      aim(A.upper, E[0] - sg * SHX, E[1] - SHY, E[2]);
      A.arm.position.set(E[0], E[1], E[2]);
      const ux = E[3] - E[0],
        uy = E[4] - E[1],
        uz = E[5] - E[2],
        ul = Math.hypot(ux, uy, uz) || 1;
      aim(A.arm, ux, uy, uz);
      palm(A.arm, ux / ul, uy / ul, uz / ul, -sg * 0.6, -0.45, 0.55);
      A.mA.uniforms.uWL.value.copy(W0).applyQuaternion(QT.copy(A.upper.quaternion).invert());
      A.mB.uniforms.uWL.value.copy(W0).applyQuaternion(QT.copy(A.arm.quaternion).invert());
    }
    /* legs: feet planted on the carpet (staggered stance: the right foot ahead), knees pointing forward */
    const step = 0.36 + 0.1 * cr + 0.06 * run,
      sw = 0.135 + 0.035 * cr,
      cy = Math.cos(hipYaw),
      sy2 = Math.sin(hipYaw);
    for (const L of legs) {
      const sg = L.sg,
        fx = sg * sw,
        fz = sg < 0 ? step * 0.58 : -step * 0.42;
      const hx0 = sg * 0.085,
        hx = hipG.position.x + hx0 * cy,
        hz = -hx0 * sy2,
        hy = hipY - 0.1;
      L.foot.position.set(fx, 0, fz);
      L.foot.rotation.y = sg * 0.28 + hipYaw * 0.5;
      ik2(hx, hy, hz, fx, ANK, fz, L1, L2, sg * 0.25, 0.05, 1);
      L.thigh.position.set(hx, hy, hz);
      aim(L.thigh, E[0] - hx, E[1] - hy, E[2] - hz);
      L.shin.position.set(E[0], E[1], E[2]);
      aim(L.shin, E[3] - E[0], E[4] - E[1], E[5] - E[2]);
      L.foot.position.set(E[3], E[4] - ANK, E[5]);
    }
  }

  return { head: neck, mats, animate, rig: { hipG, spineG, skG, neck, legs, arms: armsA } };
}
