// scene.js — the cozy cel-shaded room in the hero. Scroll drives the camera
// from a wide shot of the room, past the window and the sleeping cat, and
// finally into the laptop screen, which hands off to the page content.
import * as THREE from 'three';

const INK = '#0b0b14';

export function createRoom({ canvas, onHover, onBubble, onPan }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#151634');
  scene.fog = new THREE.Fog('#151634', 7, 16);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);

  // ---------- materials & helpers ----------
  const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const toonCache = {};
  const toon = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    return (toonCache[key] ||= new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra }));
  };
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  function ink(mesh, t = 0.01) {
    const g = mesh.geometry;
    g.computeBoundingBox();
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    g.boundingBox.getSize(size);
    g.boundingBox.getCenter(c);
    const o = new THREE.Mesh(g, inkMat);
    const sx = size.x ? (size.x + (2 * t) / mesh.scale.x) / size.x : 1;
    const sy = size.y ? (size.y + (2 * t) / mesh.scale.y) / size.y : 1;
    const sz = size.z ? (size.z + (2 * t) / mesh.scale.z) / size.z : 1;
    o.scale.set(sx, sy, sz);
    o.position.set(c.x * (1 - sx), c.y * (1 - sy), c.z * (1 - sz));
    o.raycast = () => {};
    mesh.add(o);
    return mesh;
  }

  function add(geo, color, pos, parent = scene, outline = 0.01, matExtra) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, matExtra) : color);
    if (pos) m.position.set(...pos);
    parent.add(m);
    if (outline) ink(m, outline);
    return m;
  }
  const box = (w, h, d, color, pos, parent, outline) => add(new THREE.BoxGeometry(w, h, d), color, pos, parent, outline);
  const cyl = (rt, rb, h, color, pos, parent, outline, seg = 24) =>
    add(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, parent, outline);
  const sphere = (r, color, pos, parent, outline, scale) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), typeof color === 'string' ? toon(color) : color);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    parent = parent || scene;
    parent.add(m);
    if (outline) ink(m, outline);
    return m;
  };
  const Y = new THREE.Vector3(0, 1, 0);
  function rod(a, b, r, color, parent = scene) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const m = add(new THREE.CylinderGeometry(r, r, len, 12), color, null, parent, 0.008);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.redraw = (fn) => { fn(ctx, w, h); t.needsUpdate = true; };
    return t;
  }

  const clickables = [];
  const clickable = (obj, label, action) => {
    obj.userData.label = label;
    obj.userData.action = action;
    clickables.push(obj);
  };

  // ---------- lights ----------
  scene.add(new THREE.AmbientLight('#6a6fb8', 1.1));
  const moonLight = new THREE.DirectionalLight('#a9b8ff', 1.6);
  moonLight.position.set(-2.5, 4, -5);
  scene.add(moonLight);
  const fill = new THREE.DirectionalLight('#ffb3c7', 0.35);
  fill.position.set(4, 3, 4);
  scene.add(fill);

  // ---------- room shell ----------
  const WALL = '#3a3468';
  const wz = -1.6;
  box(8, 0.1, 8, '#27234a', [0, -0.05, 0.4], scene, 0);
  box(8, 0.1, 8, '#211e42', [0, 4.25, 0.4], scene, 0); // ceiling (keeps the rain outside)
  // back wall with a window hole: x [-1.55, -0.15], y [1.25, 2.45]
  box(2.45, 4.2, 0.12, WALL, [-2.775, 2.1, wz], scene, 0);
  box(4.15, 4.2, 0.12, WALL, [1.925, 2.1, wz], scene, 0);
  box(1.4, 1.25, 0.12, WALL, [-0.85, 0.625, wz], scene, 0);
  box(1.4, 1.75, 0.12, WALL, [-0.85, 3.325, wz], scene, 0);
  box(0.12, 4.2, 8, '#332e5e', [-3.6, 2.1, 2.4], scene, 0);
  box(0.12, 4.2, 8, '#332e5e', [3.6, 2.1, 2.4], scene, 0);
  // baseboard
  box(7.2, 0.12, 0.04, '#e9dcc0', [0, 0.06, wz + 0.08], scene, 0.006);

  // window frame + sill
  const FRAME = '#efe3c6';
  // The frame sits *inside* the wall opening (x -1.55..-0.15, y 1.25..2.45) and every
  // face is offset from the wall's faces, so no two surfaces share a plane (no z-fighting).
  const SILL_TOP = 1.268;
  const HEAD_BOT = 2.37;
  const sideH = 2.465 - SILL_TOP;
  box(1.43, 2.465 - HEAD_BOT, 0.156, FRAME, [-0.85, (HEAD_BOT + 2.465) / 2, wz + 0.019]); // head (slightly proud of the jambs)
  box(0.085, sideH, 0.15, FRAME, [-1.5175, SILL_TOP + sideH / 2, wz + 0.017]); // left jamb
  box(0.085, sideH, 0.15, FRAME, [-0.1825, SILL_TOP + sideH / 2, wz + 0.017]); // right jamb
  const innerH = HEAD_BOT - SILL_TOP;
  box(0.035, innerH, 0.04, FRAME, [-0.85, SILL_TOP + innerH / 2, wz + 0.012], scene, 0.006); // mullion
  box(1.27, 0.035, 0.034, FRAME, [-0.85, SILL_TOP + innerH / 2, wz + 0.01], scene, 0.006); // transom
  box(1.7, 0.06, 0.34, FRAME, [-0.85, SILL_TOP - 0.03, wz + 0.12]); // sill
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, innerH),
    new THREE.MeshBasicMaterial({ color: '#a9c1ff', transparent: true, opacity: 0.07, depthWrite: false })
  );
  glass.position.set(-0.85, SILL_TOP + innerH / 2, wz - 0.022);
  scene.add(glass);

  // ---------- outside: sky, moon, city, rain ----------
  const skyTex = canvasTex(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0b24');
    g.addColorStop(0.55, '#26215a');
    g.addColorStop(1, '#6a4a8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
  sky.position.set(-1, 3, -9);
  scene.add(sky);

  const glowTex = canvasTex(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,244,214,0.9)');
    g.addColorStop(0.25, 'rgba(255,236,190,0.35)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: '#fff3d1', fog: false }));
  moon.position.set(-5.0, 2.15, -8.8);
  scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moonGlow.scale.set(3.2, 3.2, 1);
  moonGlow.position.copy(moon.position).add(new THREE.Vector3(0, 0, 0.01));
  scene.add(moonGlow);
  // moon craters
  [[-0.1, 0.12, 0.08], [0.14, -0.05, 0.06], [-0.05, -0.18, 0.045]].forEach(([x, y, r]) => {
    const c = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: '#ecdcb4', fog: false }));
    c.position.set(moon.position.x + x, moon.position.y + y, moon.position.z + 0.02);
    scene.add(c);
  });

  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 260; i++) starPos.push(rand(-12, 10), rand(1, 9), -8.9);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.035, fog: false, transparent: true, opacity: 0.9 }));
  scene.add(stars);

  // city skyline with lit windows
  const cityMat = new THREE.MeshBasicMaterial({ color: '#17153a', fog: false });
  const lightsPos = [];
  for (let x = -7; x < 5; x += rand(0.45, 0.9)) {
    const w = rand(0.35, 0.8), h = rand(0.8, 3.4), z = rand(-7.6, -6.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), cityMat);
    b.position.set(x, h / 2 - 0.4, z);
    scene.add(b);
    for (let wy = 0.1; wy < h - 0.6; wy += 0.22)
      for (let wx = -w / 2 + 0.1; wx < w / 2 - 0.05; wx += 0.14)
        if (Math.random() < 0.28) lightsPos.push(x + wx, wy - 0.2, z + 0.21);
  }
  const cityLightsGeo = new THREE.BufferGeometry();
  cityLightsGeo.setAttribute('position', new THREE.Float32BufferAttribute(lightsPos, 3));
  scene.add(new THREE.Points(cityLightsGeo, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.06, fog: false })));

  // rain (only visible through the window — the wall hides the rest)
  const RAIN_N = 520;
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainSpeed = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    const x = rand(-3.5, 1.8), y = rand(-0.5, 5), z = rand(-5.5, -1.8);
    rainPos.set([x, y, z, x - 0.02, y - 0.18, z], i * 6);
    rainSpeed[i] = rand(4.5, 7);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#b7c6ff', transparent: true, opacity: 0.5, fog: false }));
  scene.add(rain);

  // ---------- desk ----------
  const WOOD = '#c98b5a';
  const deskY = 0.78;
  box(2.6, 0.06, 1.0, WOOD, [0, deskY - 0.03, -0.95]);
  [[-1.24, -0.5], [-1.24, -1.4], [1.24, -0.5], [1.24, -1.4]].forEach(([x, z]) => box(0.06, deskY - 0.06, 0.06, '#a8703f', [x, (deskY - 0.06) / 2, z]));
  box(0.55, 0.62, 0.9, '#b57b49', [0.9, 0.38, -0.97]);
  box(0.47, 0.22, 0.02, '#c98b5a', [0.9, 0.55, -0.51], scene, 0.006);
  box(0.47, 0.26, 0.02, '#c98b5a', [0.9, 0.25, -0.51], scene, 0.006);
  sphere(0.018, '#efe3c6', [0.9, 0.55, -0.49], scene, 0.004);
  sphere(0.018, '#efe3c6', [0.9, 0.25, -0.49], scene, 0.004);

  // rug
  const rug = add(new THREE.CylinderGeometry(1.3, 1.3, 0.015, 40), '#7d6fd6', [0.2, 0.01, 0.2], scene, 0.01);
  rug.scale.set(1.4, 1, 0.8);
  add(new THREE.CylinderGeometry(1.0, 1.0, 0.017, 40), '#a99cff', [0.2, 0.012, 0.2], scene, 0).scale.set(1.4, 1, 0.8);

  // ---------- laptop ----------
  const laptop = new THREE.Group();
  laptop.position.set(0.05, deskY, -0.82);
  laptop.rotation.y = -0.04;
  scene.add(laptop);
  box(0.64, 0.025, 0.44, '#cfd3e3', [0, 0.0125, 0], laptop);
  box(0.56, 0.004, 0.2, '#5b5f7a', [0, 0.027, -0.06], laptop, 0);
  box(0.16, 0.003, 0.1, '#b6bbcf', [0, 0.026, 0.13], laptop, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.025, -0.22);
  lid.rotation.x = -0.26;
  laptop.add(lid);
  box(0.64, 0.42, 0.018, '#cfd3e3', [0, 0.21, 0], lid);
  // sticker on the back of the lid
  const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: '#ffc94a' }));
  sticker.position.set(0.12, 0.27, -0.0101);
  sticker.rotation.y = Math.PI;
  lid.add(sticker);

  const screenTex = canvasTex(1024, 640, () => {});
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.3625), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.215, 0.0095);
  lid.add(screen);
  const screenLight = new THREE.PointLight('#9fb4ff', 0.9, 2.2, 2);
  screenLight.position.set(0, 0.2, 0.25);
  lid.add(screenLight);
  clickable(screen, 'open it ↓', () => document.getElementById('content')?.scrollIntoView({ behavior: 'smooth' }));

  // ---------- desk lamp ----------
  const lamp = new THREE.Group();
  lamp.position.set(-0.85, deskY, -1.18);
  scene.add(lamp);
  const LAMP = '#ff7a8a';
  cyl(0.11, 0.13, 0.04, LAMP, [0, 0.02, 0], lamp);
  rod([0, 0.04, 0], [-0.04, 0.5, 0.03], 0.016, LAMP, lamp);
  sphere(0.03, '#2d2b4a', [-0.04, 0.5, 0.03], lamp, 0.006);
  rod([-0.04, 0.5, 0.03], [0.2, 0.62, 0.2], 0.016, LAMP, lamp);
  const headPos = new THREE.Vector3(0.24, 0.6, 0.24);
  const lampTarget = new THREE.Vector3(0.55, 0, 0.45);
  const dir = headPos.clone().sub(lampTarget).normalize();
  const head = add(new THREE.ConeGeometry(0.11, 0.17, 28, 1, true), toon(LAMP, { side: THREE.DoubleSide }), null, lamp, 0.008);
  head.position.copy(headPos);
  head.quaternion.setFromUnitVectors(Y, dir);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff1c1' });
  const bulb = sphere(0.045, bulbMat, null, lamp, 0);
  bulb.position.copy(headPos).addScaledVector(dir, -0.07);
  const lampSpot = new THREE.SpotLight('#ffc27a', 9, 5, 0.95, 0.65, 1.6);
  lampSpot.position.copy(bulb.position);
  lamp.add(lampSpot);
  lampSpot.target.position.copy(lampTarget).add(new THREE.Vector3(0, 0.05, 0));
  lamp.add(lampSpot.target);
  const lampGlow = new THREE.PointLight('#ffb36b', 1.6, 3.5, 2);
  lampGlow.position.copy(bulb.position);
  lamp.add(lampGlow);
  const bulbHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf8a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  bulbHalo.scale.set(0.5, 0.5, 1);
  bulbHalo.position.copy(bulb.position);
  lamp.add(bulbHalo);
  let lampOn = true;
  const toggleLamp = () => {
    lampOn = !lampOn;
    lampSpot.intensity = lampOn ? 9 : 0;
    lampGlow.intensity = lampOn ? 1.6 : 0;
    bulbMat.color.set(lampOn ? '#fff1c1' : '#4a4766');
    bulbHalo.visible = lampOn;
    onBubble?.(lampOn ? 'click ✦ light on' : 'click — cozy mode', bulb);
  };
  lamp.traverse((o) => o.isMesh && clickable(o, 'toggle lamp', toggleLamp));

  // ---------- mug + steam ----------
  const mug = new THREE.Group();
  mug.position.set(0.55, deskY, -0.62);
  scene.add(mug);
  cyl(0.052, 0.048, 0.11, '#7fe0c3', [0, 0.055, 0], mug);
  const handle = add(new THREE.TorusGeometry(0.03, 0.009, 8, 20), '#7fe0c3', [0.058, 0.058, 0], mug, 0.004);
  handle.rotation.y = 0;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.046, 24), toon('#8a5a3c'));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = 0.1;
  mug.add(tea);
  const puffTex = canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.phase = i / 6;
    mug.add(s);
    puffs.push(s);
  }
  let steamBoost = 0;
  mug.traverse((o) => o.isMesh && clickable(o, 'sip tea', () => { steamBoost = 1; onBubble?.('still warm ☕', mug); }));

  // ---------- books ----------
  const books = new THREE.Group();
  books.position.set(-1.05, deskY, -0.72);
  scene.add(books);
  [['#a99cff', 0.3, 0.05], ['#ffc94a', 0.27, -0.12], ['#ff7a8a', 0.29, 0.1]].forEach(([c, w, r], i) => {
    const b = box(w, 0.05, 0.2, c, [0, 0.026 + i * 0.052, 0], books, 0.006);
    b.rotation.y = r;
  });

  // ---------- plant ----------
  const plant = new THREE.Group();
  plant.position.set(1.08, deskY, -1.25);
  scene.add(plant);
  cyl(0.085, 0.065, 0.14, '#e07a5f', [0, 0.07, 0], plant);
  cyl(0.09, 0.09, 0.02, '#e07a5f', [0, 0.14, 0], plant, 0.006);
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Group();
    leaf.position.set(0, 0.15, 0);
    leaf.rotation.set(Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65);
    sphere(0.05, i % 2 ? '#6fbf73' : '#58a660', [0, 0.11, 0], leaf, 0.006, [0.55, 2.3, 0.3]);
    plant.add(leaf);
    leaves.push(leaf);
  }

  // ---------- cat on the windowsill ----------
  const cat = new THREE.Group();
  cat.position.set(-1.22, 1.268, wz + 0.17);
  cat.rotation.y = Math.PI - 0.7;
  scene.add(cat);
  const CAT = '#f0a35e';
  const catBody = sphere(0.1, CAT, [0, 0.07, 0], cat, 0.008, [1.6, 0.72, 1.05]);
  const catHead = new THREE.Group();
  catHead.position.set(-0.15, 0.1, 0.04);
  cat.add(catHead);
  sphere(0.078, CAT, [0, 0, 0], catHead, 0.008);
  sphere(0.032, '#fff4e6', [-0.058, -0.022, 0], catHead, 0, [0.6, 0.7, 1.25]);
  [[-0.036, 1], [0.036, -1]].forEach(([z, s]) => {
    const ear = add(new THREE.ConeGeometry(0.03, 0.065, 4), CAT, [0.005, 0.075, z * 1.25], catHead, 0.005);
    ear.rotation.x = s * 0.4;
  });
  // front paws
  sphere(0.026, '#fff4e6', [-0.17, 0.02, 0.07], cat, 0.004, [1.4, 0.7, 1]);
  sphere(0.026, '#fff4e6', [-0.15, 0.02, -0.03], cat, 0.004, [1.4, 0.7, 1]);
  // closed eyes
  [[-0.025], [0.025]].forEach(([z]) => {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: INK }));
    e.position.set(-0.072, 0.012, z * 1.1);
    e.rotation.set(0, -Math.PI / 2, Math.PI);
    catHead.add(e);
  });
  sphere(0.009, '#ff8fa3', [-0.078, -0.008, 0], catHead, 0);
  const tail = add(new THREE.TorusGeometry(0.15, 0.02, 8, 24, Math.PI * 0.9), CAT, [0.02, 0.025, 0], cat, 0.006);
  tail.rotation.set(Math.PI / 2, 0, -0.3);
  const zzz = [];
  for (let i = 0; i < 3; i++) {
    const zt = canvasTex(64, 64, (ctx) => {
      ctx.font = 'bold 44px "Archivo Black", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.strokeText('z', 18, 46);
      ctx.fillText('z', 18, 46);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zt, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.phase = i / 3;
    cat.add(s);
    zzz.push(s);
  }
  let purr = 0;
  cat.traverse((o) => o.isMesh && clickable(o, 'pet the cat', () => { purr = 1; onBubble?.(pick(['purrrr~', 'mrrp?', '*slow blink*', 'zzz… purr']), catHead); }));

  // ---------- shelf with ping-pong paddle ----------
  const shelf = new THREE.Group();
  shelf.position.set(1.55, 2.05, wz + 0.17);
  scene.add(shelf);
  box(1.3, 0.04, 0.24, '#b57b49', [0, 0, 0], shelf);
  [[-0.58, '#ff7a8a', 0.3], [-0.53, '#7fe0c3', 0.26], [-0.48, '#ffc94a', 0.32], [-0.43, '#a99cff', 0.24], [-0.38, '#efe3c6', 0.28]].forEach(([x, c, h]) =>
    box(0.045, h, 0.18, c, [x, 0.02 + h / 2, 0], shelf, 0.006)
  );
  const leaning = box(0.045, 0.26, 0.18, '#7d6fd6', [-0.3, 0.14, 0], shelf, 0.006);
  leaning.rotation.z = -0.35;
  const paddle = new THREE.Group();
  paddle.position.set(0.15, 0.17, 0);
  paddle.rotation.z = 0.25;
  shelf.add(paddle);
  const blade = cyl(0.085, 0.085, 0.012, '#e63946', [0, 0.06, 0], paddle);
  blade.rotation.x = Math.PI / 2;
  box(0.032, 0.1, 0.02, '#c98b5a', [0, -0.07, 0], paddle);
  const ball = sphere(0.022, '#ffffff', [0.38, 0.042, 0.02], shelf, 0.005);
  // tiny dumbbell for calisthenics days
  const db = new THREE.Group();
  db.position.set(0.5, 0.045, 0);
  shelf.add(db);
  const bar = rod([-0.07, 0, 0], [0.07, 0, 0], 0.01, '#5b5f7a', db);
  cyl(0.03, 0.03, 0.03, '#2d2b4a', [-0.06, 0, 0], db, 0.004).rotation.z = Math.PI / 2;
  cyl(0.03, 0.03, 0.03, '#2d2b4a', [0.06, 0, 0], db, 0.004).rotation.z = Math.PI / 2;
  db.position.y = 0.05;
  void bar;
  let bounce = 0;
  paddle.traverse((o) => o.isMesh && clickable(o, 'ping pong?', () => { bounce = 1; onBubble?.('ping! … pong!', ball); }));
  clickable(ball, 'ping pong?', () => { bounce = 1; onBubble?.('ping! … pong!', ball); });

  // ---------- calisthenics corner: wall-mounted pull-up bar ----------
  // Two welded brackets (wall plate + arm + diagonal brace) bolted to the left wall,
  // with a round bar spanning the ends of the arms.
  const STEEL = '#b9c0d4';
  const LEFT_WALL = -3.54; // inner face of the left wall
  const pull = new THREE.Group();
  scene.add(pull);
  const BAR_Y = 2.34, ARM = 0.6;
  const barX = LEFT_WALL + ARM - 0.035;
  const bracketZ = [-1.2, -0.05];
  function squareTube(a, b, s, color, parent) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = add(new THREE.BoxGeometry(s, A.distanceTo(B), s), color, null, parent, 0.007);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
    return m;
  }
  const boltMat = new THREE.MeshBasicMaterial({ color: '#2d2b4a' });
  bracketZ.forEach((z) => {
    box(0.016, 0.58, 0.1, STEEL, [LEFT_WALL + 0.008, BAR_Y - 0.2, z], pull, 0.006); // wall plate
    [BAR_Y + 0.05, BAR_Y - 0.45].forEach((y) => {
      const bolt = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), boltMat);
      bolt.position.set(LEFT_WALL + 0.0175, y, z);
      bolt.rotation.y = Math.PI / 2;
      pull.add(bolt);
    });
    box(ARM, 0.065, 0.065, STEEL, [LEFT_WALL + ARM / 2 + 0.016, BAR_Y, z], pull, 0.007); // arm
    squareTube([LEFT_WALL + 0.02, BAR_Y - 0.43, z], [LEFT_WALL + ARM * 0.62, BAR_Y - 0.02, z], 0.05, STEEL, pull); // brace
  });
  const pullBar = add(new THREE.CylinderGeometry(0.019, 0.019, bracketZ[1] - bracketZ[0] + 0.12, 20), '#dfe4f0', null, pull, 0.006);
  pullBar.rotation.x = Math.PI / 2;
  pullBar.position.set(barX, BAR_Y + 0.004, (bracketZ[0] + bracketZ[1]) / 2);
  let pullReps = 0;
  pull.traverse((o) => o.isMesh && clickable(o, 'do a pull-up', () => {
    pullReps = (pullReps % 12) + 1;
    onBubble?.(pullReps === 12 ? '12 reps! ✦ new PR' : `pull-up #${pullReps} 💪`, pullBar);
  }));

  // ---------- calisthenics corner: parallettes on the floor ----------
  // Wooden bars with grey sleeves on black uprights and flat foot plates.
  const parallettes = new THREE.Group();
  parallettes.position.set(-3.0, 0, -1.05);
  parallettes.rotation.y = 0.35;
  parallettes.scale.setScalar(1.35);
  scene.add(parallettes);
  // soft moonlight spill so the calisthenics corner doesn't vanish into the dark
  const cornerLight = new THREE.PointLight('#a9b8ff', 2.2, 3.2, 1.6);
  cornerLight.position.set(-2.7, 1.5, -0.4);
  scene.add(cornerLight);
  const PBLACK = '#23222e';
  const P_LEN = 0.52, P_H = 0.2;
  [-0.19, 0.19].forEach((x) => {
    const p = new THREE.Group();
    p.position.x = x;
    parallettes.add(p);
    const wood = add(new THREE.CylinderGeometry(0.02, 0.02, P_LEN - 0.12, 18), '#e8c48e', null, p, 0.005);
    wood.rotation.x = Math.PI / 2;
    wood.position.y = P_H;
    [-1, 1].forEach((s) => {
      const z = s * (P_LEN / 2 - 0.035);
      const sleeve = add(new THREE.CylinderGeometry(0.025, 0.025, 0.075, 18), '#b6bac6', null, p, 0.005);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.set(0, P_H, z);
      const cap = add(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 18), PBLACK, null, p, 0);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(0, P_H, z + s * 0.04);
      box(0.042, P_H - 0.03, 0.042, PBLACK, [0, (P_H - 0.03) / 2 + 0.008, z], p, 0.005); // upright
      box(0.24, 0.012, 0.075, PBLACK, [0, 0.006, z], p, 0.005); // foot plate
      const knob = add(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 14), PBLACK, null, p, 0.004);
      knob.rotation.z = Math.PI / 2;
      knob.position.set(x > 0 ? 0.034 : -0.034, P_H - 0.07, z);
    });
  });
  parallettes.traverse((o) => o.isMesh && clickable(o, 'L-sit?', () => onBubble?.(pick(['L-sit: 10s… 11s… ✦', 'doing a handstand 🤸', 'planche...']), parallettes)));

  // ---------- cork board with sticky notes ----------
  const board = new THREE.Group();
  board.position.set(0.62, 1.62, wz + 0.07);
  scene.add(board);
  box(0.86, 0.6, 0.025, '#c9a06b', [0, 0, 0], board);
  const noteData = [
    ['#ffe27a', ['train', 'BabyLM', '<100M words!'], -0.27, 0.12, 0.08],
    ['#ffb3c7', ['CSE 120', 'pset due', 'fri'], 0.02, 0.13, -0.06],
    ['#9fead0', ['ping pong', '@ 6pm 🏓'], 0.28, 0.1, 0.1],
    ['#cfc6ff', ['drink', 'water :)'], -0.2, -0.15, -0.1],
    ['#ffe27a', ['ship', 'samson.dev'], 0.13, -0.14, 0.05],
  ];
  const notes = [];
  noteData.forEach(([c, lines, x, y, r]) => {
    const tex = canvasTex(256, 256, () => {});
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshToonMaterial({ map: tex, gradientMap: grad }));
    n.position.set(x, y, 0.015);
    n.rotation.z = r;
    board.add(n);
    const pin = sphere(0.012, '#e63946', [x, y + 0.08, 0.03], board, 0.003);
    void pin;
    notes.push({ tex, c, lines });
  });

  // ---------- poster ----------
  const posterTex = canvasTex(512, 720, () => {});
  const poster = add(new THREE.PlaneGeometry(0.62, 0.87), new THREE.MeshToonMaterial({ map: posterTex, gradientMap: grad }), [-2.45, 1.95, wz + 0.07], scene, 0);
  poster.rotation.z = 0.03;
  box(0.66, 0.91, 0.01, INK, [-2.45, 1.95, wz + 0.064], scene, 0).rotation.z = 0.03;

  // ---------- string lights ----------
  const fairy = [];
  const fairyColors = ['#ffd27a', '#ff9fb2', '#9fead0', '#cfc6ff'];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const x = -3.1 + t * 6.2;
    const y = 3.35 - Math.sin(t * Math.PI * 3) ** 2 * 0.22 - 0.05;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: fairyColors[i % 4] }));
    m.position.set(x, y, wz + 0.1);
    m.userData.base = new THREE.Color(fairyColors[i % 4]);
    m.userData.phase = Math.random() * Math.PI * 2;
    scene.add(m);
    fairy.push(m);
  }
  const wireCurve = new THREE.CatmullRomCurve3(fairy.map((f) => f.position.clone().add(new THREE.Vector3(0, 0.035, 0))));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 120, 0.004, 4), new THREE.MeshBasicMaterial({ color: '#1e1c3a' })));

  // ---------- draw textures (after fonts are ready) ----------
  function drawScreen(ctx, w, h, t = 0) {
    ctx.fillStyle = '#121433';
    ctx.fillRect(0, 0, w, h);
    // stars
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      const s = rnd() < 0.15 ? 3 : 2;
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
    // menu bar
    ctx.fillStyle = '#1e2050';
    ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = '#ffc94a';
    ctx.font = '30px VT323, monospace';
    ctx.fillText('☾ samson.dev', 18, 29);
    ctx.fillStyle = '#cfd3ff';
    const now = new Date();
    ctx.textAlign = 'right';
    ctx.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), w - 18, 29);
    ctx.textAlign = 'left';
    // name tag
    const tw = 600, th = 400, tx = (w - tw) / 2, ty = 120;
    ctx.fillStyle = INK;
    roundRect(ctx, tx + 14, ty + 14, tw, th, 28);
    ctx.fill();
    ctx.fillStyle = '#ffc94a';
    roundRect(ctx, tx, ty, tw, th, 28);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = '74px "Archivo Black", Impact, sans-serif';
    ctx.fillText('HELLO', w / 2, ty + 92);
    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.fillText('my name is', w / 2, ty + 132);
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, tx + 34, ty + 158, tw - 68, th - 192, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '96px "Archivo Black", Impact, sans-serif';
    ctx.fillText('SAMSON', w / 2, ty + 300);
    ctx.textAlign = 'left';
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ffc94a';
      ctx.fillRect(w - 46, h - 44, 18, 28);
    }
  }
  function drawNote(ctx, w, h, c, lines) {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = '#26213f';
    ctx.textAlign = 'center';
    ctx.font = '54px Caveat, cursive';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 100 + i * 56 - (lines.length - 2) * 20));
  }
  function drawPoster(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff9f68');
    g.addColorStop(0.6, '#ff6f91');
    g.addColorStop(1, '#845ec2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(w / 2, 300, 150, 0, Math.PI * 2);
    ctx.fill();
    // stripes through the sun
    ctx.fillStyle = '#ff6f91';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, 330 + i * 26, w, 6 + i * 3);
    // skyline
    ctx.fillStyle = '#2b2350';
    let x = 0;
    let s = 3;
    while (x < w) {
      s = (s * 9301 + 49297) % 233280;
      const bw = 30 + (s % 50), bh = 60 + (s % 160);
      ctx.fillRect(x, 470 - bh, bw, bh + 10);
      x += bw + 4;
    }
    ctx.fillRect(0, 470, w, 250);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.font = '62px "Archivo Black", Impact, sans-serif';
    ctx.fillText('BKLYN', w / 2, 560);
    ctx.font = '38px VT323, monospace';
    ctx.fillText('— ✈ —', w / 2, 605);
    ctx.font = '62px "Archivo Black", Impact, sans-serif';
    ctx.fillText('SAN DIEGO', w / 2, 670);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const redrawAll = () => {
    screenTex.userData.redraw((c, w, h) => drawScreen(c, w, h, 0));
    notes.forEach((n) => n.tex.userData.redraw((c, w, h) => drawNote(c, w, h, n.c, n.lines)));
    posterTex.userData.redraw(drawPoster);
  };
  redrawAll();
  Promise.all([
    document.fonts.load('80px "Archivo Black"'),
    document.fonts.load('30px VT323'),
    document.fonts.load('50px Caveat'),
    document.fonts.load('700 30px "Space Grotesk"'),
  ]).then(redrawAll, redrawAll);

  // ---------- camera path ----------
  scene.updateMatrixWorld(true);
  const screenCenter = new THREE.Vector3();
  const screenNormal = new THREE.Vector3();
  screen.getWorldPosition(screenCenter);
  screen.getWorldDirection(screenNormal);
  const near = screenCenter.clone().addScaledVector(screenNormal, 0.62);
  const close = screenCenter.clone().addScaledVector(screenNormal, 0.16);
  const posPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.9, 2.25, 3.5),
    new THREE.Vector3(0.9, 2.0, 2.7),
    new THREE.Vector3(-1.5, 1.75, 1.5),
    new THREE.Vector3(-0.35, 1.38, 0.55),
    near,
    close,
  ], false, 'centripetal');
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 1.25, -1.0),
    new THREE.Vector3(-0.7, 1.55, -1.5),
    new THREE.Vector3(-0.5, 1.35, -1.45),
    new THREE.Vector3(0.0, 1.05, -1.0),
    screenCenter.clone(),
    screenCenter.clone().addScaledVector(screenNormal, -0.05),
  ], false, 'centripetal');

  // ---------- interaction ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const parallax = new THREE.Vector2();
  let hovered = null;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  canvas.addEventListener('pointerleave', () => pointer.set(9, 9));

  // Swipe / drag to look around. The view turns the way the finger moves:
  // swipe left -> look toward the pull-up bar, swipe right -> look toward the ping-pong shelf.
  // (Vertical swipes stay native page scrolling thanks to `touch-action: pan-y` on the canvas.)
  let pan = 0, panTarget = 0, drag = null, dragged = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, start: panTarget, id: e.pointerId };
    dragged = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) {
      dragged = true;
      canvas.classList.add('dragging');
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      onPan?.();
    }
    if (dragged) panTarget = Math.max(-1, Math.min(1, drag.start + (dx / canvas.clientWidth) * 2.4));
  });
  const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', () => {
    if (dragged) { dragged = false; return; } // a drag is not a click
    if (hovered) hovered.userData.action();
  });

  function project(obj) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // swipe targets: the pull-up bar on the left, the ping-pong shelf on the right
  const panLeftGoal = new THREE.Vector3(), panRightGoal = new THREE.Vector3();
  pullBar.getWorldPosition(panLeftGoal);
  paddle.getWorldPosition(panRightGoal);
  panRightGoal.x -= 0.15; // center on the books + paddle, not just the paddle
  // signed horizontal angle (around Y) that turns the look direction toward `goal`
  function yawTo(look, goal) {
    const dx = look.x - camera.position.x, dz = look.z - camera.position.z;
    const ox = goal.x - camera.position.x, oz = goal.z - camera.position.z;
    return Math.atan2(dz * ox - dx * oz, dx * ox + dz * oz);
  }

  // ---------- loop ----------
  let progress = 0, target = 0, running = true, last = performance.now(), time = 0, screenTick = 0;
  let rainVisible = true;
  const tmp = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 62 : camera.aspect < 1.2 ? 50 : 40;
    // on tall phone screens, aim the opening shot further left so the calisthenics corner is in frame
    const portrait = camera.aspect < 0.8;
    lookPath.points[0].set(portrait ? -1.25 : -0.3, portrait ? 1.35 : 1.25, -1.0);
    posPath.points[0].set(portrait ? 2.4 : 2.9, 2.25, 3.5);
    lookPath.updateArcLengths();
    posPath.updateArcLengths();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    progress += (target - progress) * Math.min(1, dt * 5);
    if (!Number.isFinite(progress)) progress = target;
    const p = Math.min(0.9995, Math.max(0, progress));
    posPath.getPointAt(p, camera.position);
    lookPath.getPointAt(p, tmp);
    const pf = 1 - Math.min(1, p / 0.85); // parallax fades as we approach the screen
    if (pointer.x < 5) parallax.lerp(pointer, dt * 3);
    else parallax.lerp({ x: 0, y: 0 }, dt * 2);
    camera.position.x += parallax.x * 0.18 * pf;
    camera.position.y += parallax.y * 0.1 * pf;
    // turn the view left/right (yaw around the camera), fading out as we dive into the laptop
    pan += (panTarget - pan) * Math.min(1, dt * 6);
    const panFade = 1 - Math.min(1, Math.max(0, (p - 0.7) / 0.2));
    if (Math.abs(pan) > 0.0005 && panFade > 0) {
      // a full swipe turns exactly far enough to center the pull-up bar (left) or the shelf (right)
      const goal = pan < 0 ? panLeftGoal : panRightGoal;
      const lim = yawTo(tmp, goal);
      const yaw = pan < 0 ? Math.max(0, lim) * -pan : Math.min(0, lim) * pan;
      tmp.sub(camera.position).applyAxisAngle(Y, yaw * panFade).add(camera.position);
    }
    camera.lookAt(tmp);

    // rain
    if (rainVisible) {
      const a = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        const d = rainSpeed[i] * dt;
        a[i * 6 + 1] -= d;
        a[i * 6 + 4] -= d;
        if (a[i * 6 + 4] < -0.6) {
          const y = 5 + Math.random();
          a[i * 6 + 1] = y;
          a[i * 6 + 4] = y - 0.18;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // steam
    steamBoost = Math.max(0, steamBoost - dt * 0.4);
    puffs.forEach((s) => {
      const k = (time * (0.25 + steamBoost * 0.4) + s.userData.phase) % 1;
      s.position.set(Math.sin(k * 6 + s.userData.phase * 10) * 0.02, 0.12 + k * 0.28, 0);
      const sc = 0.04 + k * 0.1;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(k * Math.PI) * (0.35 + steamBoost * 0.4);
    });

    // cat breathing + zzz
    purr = Math.max(0, purr - dt * 0.5);
    const breath = 1 + Math.sin(time * 1.6) * 0.035 + Math.sin(time * 30) * 0.01 * purr;
    catBody.scale.set(1.7, 0.75 * breath, 1.05 * breath);
    catHead.rotation.z = Math.sin(time * 0.8) * 0.04 + purr * 0.15;
    tail.rotation.z = -0.3 + Math.sin(time * 1.1) * 0.06 + Math.sin(time * 8) * 0.12 * purr;
    zzz.forEach((z) => {
      const k = (time * 0.22 + z.userData.phase) % 1;
      z.position.set(-0.2 - k * 0.08, 0.18 + k * 0.3, 0.06 + Math.sin(k * 6) * 0.03);
      const sc = 0.04 + k * 0.05;
      z.scale.set(sc, sc, 1);
      z.material.opacity = Math.sin(k * Math.PI) * 0.95;
    });

    // ping pong ball bounce
    if (bounce > 0) {
      bounce = Math.max(0, bounce - dt * 0.45);
      const k = 1 - bounce;
      ball.position.y = 0.042 + Math.abs(Math.sin(k * Math.PI * 6)) * 0.25 * bounce;
      ball.position.x = 0.38 + Math.sin(k * Math.PI * 3) * 0.12;
    }

    leaves.forEach((l, i) => (l.rotation.y = Math.sin(time * 0.6 + i) * 0.05));
    fairy.forEach((f) => {
      const k = 0.65 + 0.35 * Math.sin(time * 1.4 + f.userData.phase);
      f.material.color.copy(f.userData.base).multiplyScalar(k);
    });
    stars.material.opacity = 0.75 + Math.sin(time * 2) * 0.15;

    screenTick += dt;
    if (screenTick > 0.5) {
      screenTick = 0;
      screenTex.userData.redraw((c, w, h) => drawScreen(c, w, h, time));
    }

    // hover
    if (pointer.x < 5 && p < 0.9) {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickables, false)[0];
      const obj = hit ? hit.object : null;
      if (obj !== hovered) {
        hovered = obj;
        canvas.style.cursor = obj ? 'pointer' : '';
        onHover?.(obj ? obj.userData.label : null);
      }
    } else if (hovered) {
      hovered = null;
      canvas.style.cursor = '';
      onHover?.(null);
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    setProgress(v) { target = Math.max(0, Math.min(1, v)); },
    jump(v) { target = progress = Math.max(0, Math.min(1, v)); },
    setRunning(v) {
      if (v === running) return;
      running = v;
      if (v) { last = performance.now(); requestAnimationFrame(frame); }
    },
    setRain(v) { rainVisible = v; rain.visible = v; },
    nudge(d) { panTarget = Math.max(-1, Math.min(1, panTarget + d)); onPan?.(); },
    project,
  };
}

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
