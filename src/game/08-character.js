/**
 * 08-character.js: Character.
 *
 * The rider: materials, rig, woven carpet and the avatar mesh.
 *
 * Part of the game closure; see 01-runtime.js.
 */

/* ---------- character: the veiled traveller, an Amazigh woman of the Souss, on a woven carpet ---------- */
const charU = {
  uBase: { value: new THREE.Color() },
  uSunV: { value: new THREE.Vector3() },
  uGlow: { value: 0 },
  uNight: sharedUniforms.uNight
};
// solid-colour character material (see FS_CHAR)
function charMat(r, g, b, glow) {
  const u = {
    uBase: { value: new THREE.Color(r, g, b) },
    uSunV: charU.uSunV,
    uGlow: { value: glow || 0 },
    uNight: sharedUniforms.uNight
  };
  return new THREE.ShaderMaterial({ vertexShader: VS_CHAR, fragmentShader: FS_CHAR, uniforms: u });
}
const flagU = { uTime: terrU.uTime, uSp: { value: 0 }, uBoost: { value: 0 } }; // wind shared by the carpet and the fabrics
const rig = new THREE.Group();
rig.matrixAutoUpdate = false;
scene.add(rig);
const flipG = new THREE.Group();
flipG.position.y = 0.75;
rig.add(flipG); // flip axis: the centre of the character
const pivot = new THREE.Group();
pivot.position.y = -0.75;
flipG.add(pivot);
const body = new THREE.Group();
pivot.add(body);
const avatar = buildAvatar(THREE, { charU, flagU, charMat, body });
body.position.y = 0.06;
{
  /* the carpet: procedural weave, raised edges, fluttering fringes */
  const carpetGeo = new THREE.PlaneGeometry(1.24, 2.52, 14, 30);
  carpetGeo.rotateX(-Math.PI / 2);
  const carpet = new THREE.Mesh(
    carpetGeo,
    new THREE.ShaderMaterial({
      vertexShader: VS_CARPET,
      fragmentShader: FS_CARPET,
      side: THREE.DoubleSide,
      extensions: { derivatives: true },
      uniforms: {
        uSunV: charU.uSunV,
        uTime: flagU.uTime,
        uSp: flagU.uSp,
        uBoost: flagU.uBoost,
        uNight: sharedUniforms.uNight
      }
    })
  );
  carpet.position.y = 0.05;
  carpet.frustumCulled = false;
  pivot.add(carpet);
}
