import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type MeshKind, type Project, buildModelMesh, meshBounds } from '@traco/core';
import { useEditor } from './store.ts';

/**
 * Visualizador 3D derivado do modelo. Não guarda geometria própria: a cada commit
 * reconstrói a malha a partir do projeto (buildModelMesh), então planta e 3D
 * nunca divergem. Unidades: o modelo é em mm (Z para cima); a cena usa metros
 * com Y para cima (x, z, −y).
 */

const MATERIAL: Record<MeshKind, () => THREE.Material> = {
  wall: () => new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.9 }),
  gable: () => new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.9, side: THREE.DoubleSide }),
  slab: () => new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.95 }),
  roof: () => new THREE.MeshStandardMaterial({ color: 0xb5583a, roughness: 0.8 }),
  door: () => new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6 }),
  frame: () => new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.4, metalness: 0.3 }),
  glass: () =>
    new THREE.MeshPhysicalMaterial({ color: 0x9fd4ff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
};

const SELECT_COLOR = new THREE.Color(0x00a4ff);

const toGeometry = (positions: number[]): THREE.BufferGeometry => {
  const arr = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    arr[i] = positions[i] / 1000;
    arr[i + 1] = positions[i + 2] / 1000;
    arr[i + 2] = -positions[i + 1] / 1000;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
};

export const Viewer3D = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [stats, setStats] = useState({ parts: 0, tris: 0 });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bg = getComputedStyle(wrap).getPropertyValue('--canvas-bg').trim() || '#0b1020';
    scene.background = new THREE.Color(bg);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    camera.position.set(18, 14, 18);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(20, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(1, 1, 0x3a4a6a, 0x26324a);
    scene.add(grid);

    const model = new THREE.Group();
    scene.add(model);
    let built: Project | null = null;
    let selectionKey = '';
    let fitted = false;
    let frame = 0;

    const fit = (b: { min: number[]; max: number[] }) => {
      const min = new THREE.Vector3(b.min[0] / 1000, b.min[2] / 1000, -b.max[1] / 1000);
      const max = new THREE.Vector3(b.max[0] / 1000, b.max[2] / 1000, -b.min[1] / 1000);
      const center = min.clone().add(max).multiplyScalar(0.5);
      const size = max.clone().sub(min).length() || 10;
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(size * 0.9, size * 0.7, size * 0.9));
      camera.near = size / 500;
      camera.far = size * 50;
      camera.updateProjectionMatrix();
      const extent = Math.ceil(size * 2);
      ground.scale.set(extent, extent, 1);
      ground.position.set(center.x, 0, center.z);
      grid.scale.set(extent, 1, extent);
      grid.position.set(center.x, 0.001, center.z);
      sun.position.set(center.x + size, size * 1.5, center.z + size * 0.6);
      sun.target.position.copy(center);
      const cam = sun.shadow.camera as THREE.OrthographicCamera;
      cam.left = cam.bottom = -size;
      cam.right = cam.top = size;
      cam.far = size * 5;
      cam.updateProjectionMatrix();
    };

    const rebuild = (p: Project) => {
      for (const child of [...model.children]) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        model.remove(m);
      }
      const mesh = buildModelMesh(p);
      let tris = 0;
      for (const part of mesh.parts) {
        if (!part.positions.length) continue;
        const m = new THREE.Mesh(toGeometry(part.positions), MATERIAL[part.kind]());
        m.castShadow = part.kind !== 'glass';
        m.receiveShadow = true;
        m.userData = { entityId: part.entityId, kind: part.kind };
        model.add(m);
        tris += part.positions.length / 9;
      }
      setIssues(mesh.issues);
      setStats({ parts: mesh.parts.length, tris });
      const b = meshBounds(mesh.parts);
      if (b && !fitted) {
        fit(b);
        fitted = true;
      }
      built = p;
      selectionKey = '';
    };

    const applySelection = (ids: string[]) => {
      const key = ids.join(',');
      if (key === selectionKey) return;
      selectionKey = key;
      const sel = new Set(ids);
      for (const child of model.children) {
        const m = child as THREE.Mesh;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!('emissive' in mat)) continue;
        mat.emissive.copy(sel.has(m.userData.entityId) ? SELECT_COLOR : new THREE.Color(0));
        mat.emissiveIntensity = sel.has(m.userData.entityId) ? 0.35 : 0;
      }
    };

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const st = useEditor.getState();
      if (st.project && st.project !== built) rebuild(st.project);
      applySelection(st.selection);
      controls.update();
      renderer.render(scene, camera);
    };

    // clique seleciona o elemento (a mesma seleção da planta)
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(model.children, false)[0];
      const id = hit?.object.userData.entityId as string | undefined;
      const st = useEditor.getState();
      if (id) {
        const e = st.project?.entities[id];
        if (e && e.levelId !== st.levelId) st.setLevel(e.levelId);
        st.setSelection([id]);
      } else st.setSelection([]);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    loop();

    (wrap as HTMLDivElement & { __refit?: () => void }).__refit = () => {
      const b = meshBounds(buildModelMesh(useEditor.getState().project!).parts);
      if (b) fit(b);
    };

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      for (const child of model.children) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="viewer3d" ref={wrapRef} aria-label="Vista 3D do modelo">
      <div className="viewer3d-hud">
        <span className="chip">3D · ao vivo</span>
        <span className="faint mono">
          {stats.parts} peças · {Math.round(stats.tris).toLocaleString('pt-BR')} triângulos
        </span>
        <button
          className="btn ghost small"
          onClick={() => (wrapRef.current as (HTMLDivElement & { __refit?: () => void }) | null)?.__refit?.()}
        >
          Enquadrar
        </button>
      </div>
      {issues.length > 0 && (
        <div className="viewer3d-issues" role="status">
          <strong>{issues.length} aviso(s) de modelagem</strong>
          <ul>
            {[...new Set(issues)].slice(0, 5).map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="viewer3d-help faint">Arraste para girar · botão direito para mover · roda para zoom · clique seleciona</p>
    </div>
  );
};
