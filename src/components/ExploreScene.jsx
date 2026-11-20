import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The explorable memory: a 360° sky sphere (AI or painted panorama) with the
 * photo rebuilt in 3D from its AI depth map, plus glowing fragments to find.
 *
 * Controls: drag / swipe to look around · scroll or pinch to zoom ·
 * WASD / arrow keys to look and lean · tap or click a fragment to catch it ·
 * optional phone motion (gyro).
 */

const PHOTO_DIST = 10; // how far away the photo sits
const PHOTO_FOV = 56; // vertical angle the photo covers, in degrees
const DEPTH_STRENGTH = 6; // how far near things pop toward you
const FRAG_DIST = 7.2;
const LEAN = 1.4; // how far you can lean / step inside

const deg = THREE.MathUtils.degToRad;

/* ------------------------------ shaders ------------------------------ */

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const skyFrag = /* glsl */ `
  uniform sampler2D uTex;
  uniform sampler2D uPrev;
  uniform float uMix;
  uniform float uFade;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec2 uv = vec2(atan(d.x, -d.z) / 6.28318530718 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
    vec3 c = mix(texture2D(uPrev, uv).rgb, texture2D(uTex, uv).rgb, uMix);
    gl_FragColor = vec4(c * uFade, 1.0);
    #include <colorspace_fragment>
  }`;

const photoVert = /* glsl */ `
  uniform sampler2D uDepth;
  uniform float uStrength;
  uniform float uDist;
  uniform float uGrow;
  varying vec2 vUv;
  varying float vD;
  void main() {
    vUv = uv;
    float d = texture2D(uDepth, uv).r;
    vD = d;
    float z = d * uStrength * uGrow;
    vec3 p = position;
    // pull near points toward the viewer but rescale them so that, from the
    // centre, the photo looks exactly like the original (parallax appears as you move)
    p.xy *= (uDist - z) / uDist;
    p.z += z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const photoFrag = /* glsl */ `
  uniform sampler2D uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vD;
  void main() {
    vec4 c = texture2D(uColor, vUv);
    // soft, dream-like edges that melt into the 360° world
    vec2 e = smoothstep(vec2(0.0), vec2(0.14, 0.16), vUv) * smoothstep(vec2(0.0), vec2(0.14, 0.12), 1.0 - vUv);
    float edge = e.x * e.y;
    // hide the "rubber sheet" stretched between near and far objects
    float stretch = fwidth(vD);
    float keep = 1.0 - smoothstep(0.012, 0.05, stretch);
    gl_FragColor = vec4(c.rgb, edge * mix(0.15, 1.0, keep) * uOpacity);
    #include <colorspace_fragment>
  }`;

/* ------------------------------ helpers ------------------------------ */

function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.translate(s / 2, s / 2);
  x.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    x.rotate(Math.PI / 4);
    x.beginPath();
    x.moveTo(0, -s * 0.46);
    x.quadraticCurveTo(s * 0.04, 0, 0, s * (i % 2 ? 0.3 : 0.46));
    x.quadraticCurveTo(-s * 0.04, 0, 0, -s * 0.46);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loadTexture(url, { srgb = true, mips = true } = {}) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (!mips) {
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
        }
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

export function directionFrom(yaw, pitch, dist = 1) {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    Math.sin(pitch) * dist,
    -Math.cos(yaw) * Math.cos(pitch) * dist
  );
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

/* ------------------------------ component ------------------------------ */

export default function ExploreScene({ image, depth, pano, fragments, found, onCollect, onInteract, hintRef, color, gyro }) {
  const mountRef = useRef(null);
  const S = useRef(null); // the three.js world lives here, outside React state
  const cb = useRef({});
  cb.current = { onCollect, onInteract };

  /* ---------- build the world once ---------- */
  useEffect(() => {
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x05060f);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 300);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 0, 1.6);

    const blank = new THREE.DataTexture(new Uint8Array([6, 7, 18, 255]), 1, 1);
    blank.needsUpdate = true;

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 72, 36),
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: blank }, uPrev: { value: blank }, uMix: { value: 1 }, uFade: { value: 0 } },
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    sky.renderOrder = -1;
    scene.add(sky);

    const glow = glowTexture();
    const star = starTexture();
    const tint = new THREE.Color(color);

    // fragments
    const frags = fragments.map((f, i) => {
      const group = new THREE.Group();
      group.position.copy(directionFrom(f.yaw, f.pitch, FRAG_DIST));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: tint, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(3.4);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, color: new THREE.Color('#fff8e6'), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.scale.setScalar(0.9);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.userData.index = i;
      group.add(halo, core, hit);
      group.renderOrder = 2;
      scene.add(group);
      return { group, halo, core, hit, base: group.position.clone(), phase: i * 1.7, collectedAt: null, gone: false };
    });

    // dust motes drifting around you, in 3D
    const dustGeo = new THREE.BufferGeometry();
    const N = 260;
    const dp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 3 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      dp[i * 3] = Math.cos(a) * r;
      dp[i * 3 + 1] = (Math.random() - 0.4) * 8;
      dp[i * 3 + 2] = Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: glow, color: tint, size: 0.16, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(dust);

    const state = {
      renderer, scene, camera, sky, frags, dust, photo: null, glow, star,
      yaw: 0, pitch: 0, curYaw: 0, curPitch: 0.0,
      gyroYaw: 0, gyroPitch: 0,
      fov: 68, lean: new THREE.Vector3(), hover: new THREE.Vector2(), keys: new Set(),
      skyFade: { from: 0, to: 1, t0: performance.now(), dur: 1800 },
      skyMix: null, born: performance.now(), interacted: false,
    };
    S.current = state;
    if (import.meta.env.DEV) window.__reveScene = state; // handy for debugging in the console

    /* ----- resize ----- */
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    /* ----- input ----- */
    const canvas = renderer.domElement;
    const pointers = new Map();
    let downAt = null;
    let pinch = null;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const interact = () => {
      if (!state.interacted) {
        state.interacted = true;
        cb.current.onInteract?.();
      }
    };

    const tryCollect = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const live = frags.filter((f) => !f.collectedAt && !f.gone).map((f) => f.hit);
      const hit = raycaster.intersectObjects(live, false)[0];
      if (hit) cb.current.onCollect?.(hit.object.userData.index);
    };

    const onDown = (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable (e.g. synthetic); fine */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov };
        downAt = null;
      }
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
      if (e.pointerType === 'mouse' && !pointers.size) {
        const r = canvas.getBoundingClientRect();
        state.hover.set((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
      }
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        // the button was released somewhere we didn't hear about — end the drag
        pointers.delete(e.pointerId);
        downAt = null;
        canvas.style.cursor = 'grab';
        return;
      }
      if (pointers.size === 2 && pinch) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        state.fov = THREE.MathUtils.clamp(pinch.fov * (pinch.d / d), 35, 90);
        interact();
        return;
      }
      const k = 0.0042 * (state.fov / 70);
      state.yaw += (e.clientX - p.x) * k;
      state.pitch = THREE.MathUtils.clamp(state.pitch + (e.clientY - p.y) * k, deg(-80), deg(80));
      p.x = e.clientX;
      p.y = e.clientY;
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) interact();
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && performance.now() - downAt.t < 500) {
        tryCollect(e.clientX, e.clientY);
      }
      downAt = null;
      if (!pointers.size) canvas.style.cursor = 'grab';
    };
    const onWheel = (e) => {
      e.preventDefault();
      state.fov = THREE.MathUtils.clamp(state.fov + e.deltaY * 0.03, 35, 90);
      interact();
    };
    const KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (!KEYS.includes(k) || e.target.closest?.('input,textarea')) return;
      e.preventDefault();
      if (e.type === 'keydown') {
        state.keys.add(k);
        interact();
      } else state.keys.delete(k);
    };
    const onBlur = () => state.keys.clear();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);

    /* ----- render loop ----- */
    const tmp = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    let last = performance.now();
    let raf;

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      // keyboard look + lean
      const K = state.keys;
      if (K.has('arrowleft') || K.has('q')) state.yaw += 1.4 * dt;
      if (K.has('arrowright') || K.has('e')) state.yaw -= 1.4 * dt;
      if (K.has('arrowup')) state.pitch = Math.min(deg(80), state.pitch + 1.1 * dt);
      if (K.has('arrowdown')) state.pitch = Math.max(deg(-80), state.pitch - 1.1 * dt);
      const fwd = (K.has('w') ? 1 : 0) - (K.has('s') ? 1 : 0);
      const side = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
      if (fwd || side) {
        const y = state.curYaw;
        // camera looks along (-sin y, 0, -cos y); its right is (cos y, 0, -sin y)
        state.lean.x += (-Math.sin(y) * fwd + Math.cos(y) * side) * 2.2 * dt;
        state.lean.z += (-Math.cos(y) * fwd - Math.sin(y) * side) * 2.2 * dt;
        const len = Math.hypot(state.lean.x, state.lean.z);
        if (len > LEAN) { state.lean.x *= LEAN / len; state.lean.z *= LEAN / len; }
      }

      // smooth look
      const targetYaw = state.yaw + state.gyroYaw;
      const targetPitch = THREE.MathUtils.clamp(state.pitch + state.gyroPitch, deg(-85), deg(85));
      const a = 1 - Math.pow(0.0008, dt);
      state.curYaw += (targetYaw - state.curYaw) * a;
      state.curPitch += (targetPitch - state.curPitch) * a;
      camera.rotation.set(state.curPitch, state.curYaw, 0);

      // arrival: step in from slightly behind, widen into the scene
      const intro = ease(Math.min(1, (now - state.born) / 2600));
      const hoverX = state.hover.x * 0.55;
      const hoverY = -state.hover.y * 0.3;
      tmp.set(state.lean.x + hoverX, state.lean.y + hoverY + Math.sin(t * 0.4) * 0.04, state.lean.z + 1.6 * (1 - intro));
      camera.position.lerp(tmp, 1 - Math.pow(0.002, dt));
      const fovTarget = state.fov + 12 * (1 - intro);
      if (Math.abs(camera.fov - fovTarget) > 0.01) {
        camera.fov += (fovTarget - camera.fov) * (1 - Math.pow(0.004, dt));
        camera.updateProjectionMatrix();
      }
      sky.position.copy(camera.position);

      // sky fade-in and AI crossfade
      const sf = state.skyFade;
      sky.material.uniforms.uFade.value = sf.from + (sf.to - sf.from) * ease(Math.min(1, (now - sf.t0) / sf.dur));
      if (state.skyMix) {
        const m = Math.min(1, (now - state.skyMix) / 2500);
        sky.material.uniforms.uMix.value = ease(m);
        if (m >= 1) state.skyMix = null;
      }

      // photo grows out of the wall into 3D
      if (state.photo) {
        const u = state.photo.material.uniforms;
        const pt = Math.min(1, (now - state.photo.userData.born) / 2200);
        u.uOpacity.value = ease(pt);
        u.uGrow.value = ease(Math.min(1, pt * 1.2));
      }

      // fragments
      camera.getWorldDirection(camDir);
      let nearest = null;
      let nearestAngle = Infinity;
      for (const f of frags) {
        if (f.gone) continue;
        if (f.collectedAt) {
          const c = Math.min(1, (now - f.collectedAt) / 750);
          const e = ease(c);
          f.group.position.lerpVectors(f.base, camera.position.clone().add(camDir.clone().multiplyScalar(2.2)), e);
          f.halo.scale.setScalar(3.4 + e * 6);
          f.halo.material.opacity = 0.9 * (1 - c);
          f.core.material.opacity = 1 - c;
          f.core.material.rotation += dt * 6;
          if (c >= 1) { f.gone = true; f.group.visible = false; }
          continue;
        }
        f.group.position.set(f.base.x, f.base.y + Math.sin(t * 1.1 + f.phase) * 0.18, f.base.z);
        tmp.copy(f.group.position).sub(camera.position).normalize();
        const ang = tmp.angleTo(camDir);
        const near = ang < deg(14);
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + f.phase);
        f.halo.material.opacity = (near ? 0.85 : 0.45) + pulse * 0.2;
        f.halo.scale.setScalar((near ? 4.2 : 3.2) + pulse * 0.5);
        f.core.material.rotation = Math.sin(t * 0.7 + f.phase) * 0.4;
        f.core.scale.setScalar(near ? 1.15 : 0.85);
        if (ang < nearestAngle) { nearestAngle = ang; nearest = f; }
      }

      // dust drift
      dust.rotation.y += dt * 0.012;
      dust.position.y = Math.sin(t * 0.2) * 0.3;

      // hint arrow toward the nearest fragment, when it's off-screen
      const hint = hintRef?.current;
      if (hint) {
        let show = false;
        if (nearest) {
          tmp.copy(nearest.group.position).project(camera);
          const behind = tmp.z > 1;
          const offscreen = behind || Math.abs(tmp.x) > 0.92 || Math.abs(tmp.y) > 0.88;
          if (offscreen && now - state.born > 5000) {
            const v = nearest.group.position.clone().applyMatrix4(camera.matrixWorldInverse);
            let ang2 = Math.atan2(v.y, v.x);
            if (behind && Math.abs(v.x) < 0.2) ang2 = 0;
            const w = el.clientWidth, h = el.clientHeight;
            const rx = w / 2 - 44, ry = h / 2 - 64;
            const x = w / 2 + Math.cos(ang2) * rx;
            const y = h / 2 - Math.sin(ang2) * ry;
            hint.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${-ang2}rad)`;
            show = true;
          }
        }
        hint.style.opacity = show ? '1' : '0';
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      scene.traverse((o) => {
        o.geometry?.dispose();
        const m = o.material;
        if (m) {
          Object.values(m.uniforms || {}).forEach((u) => u.value?.isTexture && u.value.dispose());
          m.map?.dispose?.();
          m.dispose();
        }
      });
      glow.dispose();
      star.dispose();
      renderer.dispose();
      el.removeChild(canvas);
      S.current = null;
    };
    // the world is rebuilt per memory (the parent remounts us), so build once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- sky panorama (crossfades when the AI version arrives) ---------- */
  useEffect(() => {
    if (!pano) return;
    let alive = true;
    loadTexture(pano, { mips: false }).then((tex) => {
      const s = S.current;
      if (!alive || !s) return tex.dispose();
      const u = s.sky.material.uniforms;
      const hadOne = u.uTex.value && u.uTex.value.image && u.uTex.value.image.width > 1;
      if (hadOne) {
        if (u.uPrev.value !== u.uTex.value && u.uPrev.value.image?.width > 1) u.uPrev.value.dispose();
        u.uPrev.value = u.uTex.value;
        u.uMix.value = 0;
        s.skyMix = performance.now();
      } else {
        u.uPrev.value = tex;
        u.uMix.value = 1;
        s.skyFade = { from: u.uFade.value, to: 1, t0: performance.now(), dur: 1600 };
      }
      u.uTex.value = tex;
    }).catch((e) => console.warn('[scene] panorama failed to load', e));
    return () => { alive = false; };
  }, [pano]);

  /* ---------- the photo, rebuilt in 3D ---------- */
  useEffect(() => {
    if (!image || !depth) return;
    let alive = true;
    Promise.all([loadTexture(image), loadTexture(depth, { srgb: false })]).then(([colorTex, depthTex]) => {
      const s = S.current;
      if (!alive || !s) { colorTex.dispose(); depthTex.dispose(); return; }
      const aspect = colorTex.image.width / colorTex.image.height;
      const h = 2 * PHOTO_DIST * Math.tan(deg(PHOTO_FOV / 2));
      const w = Math.min(h * aspect, 2 * PHOTO_DIST * Math.tan(deg(62)));
      const seg = 256;
      const geo = new THREE.PlaneGeometry(w, h, aspect >= 1 ? seg : Math.round(seg * aspect), aspect >= 1 ? Math.round(seg / aspect) : seg);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: colorTex },
          uDepth: { value: depthTex },
          uStrength: { value: DEPTH_STRENGTH },
          uDist: { value: PHOTO_DIST },
          uGrow: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: photoVert,
        fragmentShader: photoFrag,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, -PHOTO_DIST);
      mesh.renderOrder = 1;
      mesh.userData.born = performance.now();
      if (s.photo) {
        s.scene.remove(s.photo);
        s.photo.geometry.dispose();
        s.photo.material.dispose();
      }
      s.photo = mesh;
      s.scene.add(mesh);
    }).catch((e) => console.warn('[scene] photo failed to load', e));
    return () => { alive = false; };
  }, [image, depth]);

  /* ---------- caught fragments ---------- */
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    s.frags.forEach((f, i) => {
      if (found.has(i) && !f.collectedAt) f.collectedAt = performance.now();
    });
  }, [found]);

  /* ---------- phone motion ---------- */
  useEffect(() => {
    if (!gyro) return;
    let base = null;
    let lastAlpha = null;
    let unwrapped = 0;
    const onOrient = (e) => {
      const s = S.current;
      if (!s || e.alpha == null) return;
      if (lastAlpha != null) {
        let d = e.alpha - lastAlpha;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        unwrapped += d;
      }
      lastAlpha = e.alpha;
      if (!base) base = { beta: e.beta };
      s.gyroYaw = deg(unwrapped);
      s.gyroPitch = deg(THREE.MathUtils.clamp(e.beta - 90, -80, 80));
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      if (S.current) { S.current.gyroYaw = 0; S.current.gyroPitch = 0; }
    };
  }, [gyro]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
