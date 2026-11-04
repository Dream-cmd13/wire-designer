import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createModelOrbitControls, getCameraFit } from '@/lib/models/modelView';
import type { ModelViewPreset, ParsedModel } from '@/lib/models/modelTypes';

const views: Record<ModelViewPreset, { label: string; direction: [number, number, number]; up: [number, number, number] }> = {
  iso: { label: '等轴测', direction: [1,-1,1], up: [0,0,1] },
  front: { label: '前视', direction: [0,-1,0], up: [0,0,1] },
  top: { label: '顶视', direction: [0,0,1], up: [0,1,0] },
  right: { label: '右视', direction: [1,0,0], up: [0,0,1] },
};

export function ModelViewer({ model }: { model: ParsedModel | null }) {
  const host = useRef<HTMLDivElement>(null);
  const controlsApi = useRef<{ view: (preset: ModelViewPreset) => void; edges: (value: boolean) => void } | null>(null);
  const [edges, setEdges] = useState(true);
  const [failure, setFailure] = useState<{ model: ParsedModel; generation: number; message: string } | null>(null);
  const [generation, setGeneration] = useState(0);
  const failureMessage = failure?.model === model && failure?.generation === generation ? failure.message : null;
  // Drop obsolete errors (and their mesh buffers) when leaving a model.
  if (failure && failure.model !== model) setFailure(null);

  useEffect(() => {
    const container = host.current;
    if (!container || !model) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch {
      // An asynchronous result avoids a synchronous effect state cascade.
      let active = true;
      queueMicrotask(() => { if (active) setFailure({ model, generation, message: '无法创建 WebGL 画布，请开启硬件加速或换用支持 WebGL 的浏览器。' }); });
      return () => { active = false; };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9edf2');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667080, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(2,-3,5); scene.add(light);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000); camera.up.set(0,0,1);
    let controls = createModelOrbitControls(camera, renderer.domElement, new THREE.Vector3(0,0,1));
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0xdde1e5, roughness: 0.65, metalness: 0.15, side: THREE.DoubleSide });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x485465, transparent: true, opacity: 0.6 });
    const geometries: THREE.BufferGeometry[] = [];
    const edgeObjects: THREE.LineSegments[] = [];
    for (const mesh of model.meshes) {
      const geometry = new THREE.BufferGeometry(); geometries.push(geometry);
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3)); else geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry, material));
      const edgeGeometry = new THREE.EdgesGeometry(geometry, 30); geometries.push(edgeGeometry);
      const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial); edgeObjects.push(lines); group.add(lines);
    }
    group.position.fromArray(model.boundsMm.min.map((value, i) => -(value + model.boundsMm.max[i]) / 2) as [number,number,number]);
    scene.add(group);
    const renderScene = () => renderer.render(scene, camera);
    const applyView = (preset: ModelViewPreset) => {
      const fit = getCameraFit(model.boundsMm, container.clientWidth, container.clientHeight);
      const up = new THREE.Vector3().fromArray(views[preset].up);
      if (!camera.up.equals(up)) {
        controls.removeEventListener('change', renderScene);
        controls = createModelOrbitControls(camera, renderer.domElement, up, controls);
        controls.addEventListener('change', renderScene);
      }
      camera.position.fromArray(views[preset].direction).normalize().multiplyScalar(fit.distance);
      camera.near = fit.near; camera.far = fit.far; camera.updateProjectionMatrix();
      controls.minDistance = fit.radius * 0.01; controls.maxDistance = fit.distance * 3;
      controls.target.set(0,0,0); camera.lookAt(controls.target); controls.update(); renderScene();
    };
    const resize = () => {
      const width = container.clientWidth; const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      const fit = getCameraFit(model.boundsMm, width, height);
      camera.aspect = fit.aspect;
      const direction = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(direction, fit.distance);
      camera.near = fit.near; camera.far = fit.far;
      controls.minDistance = fit.radius * 0.01; controls.maxDistance = fit.distance * 3;
      camera.updateProjectionMatrix(); controls.update(); renderScene();
    };
    const api = { view: applyView, edges: (visible: boolean) => { edgeObjects.forEach((line) => { line.visible = visible; }); renderScene(); } };
    controlsApi.current = api;
    // Initial visibility is reapplied in the separate edges effect.
    const observer = new ResizeObserver(resize); observer.observe(container);
    controls.addEventListener('change', renderScene);
    const lost = (event: Event) => { event.preventDefault(); setFailure({ model, generation, message: 'WebGL 上下文已丢失，请重建画布或释放其他页面的显卡资源。' }); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    applyView('iso'); resize();
    return () => {
      if (controlsApi.current === api) controlsApi.current = null;
      observer.disconnect(); controls.removeEventListener('change', renderScene); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      geometries.forEach((geometry) => geometry.dispose()); material.dispose(); edgeMaterial.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [model, generation]);

  useEffect(() => { controlsApi.current?.edges(edges); }, [edges, model, generation]);

  return <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-2 text-xs">
      {(Object.keys(views) as ModelViewPreset[]).map((preset) => <button className="rounded border border-slate-200 px-3 py-2 hover:bg-slate-100 disabled:opacity-40" disabled={!model} key={preset} onClick={() => controlsApi.current?.view(preset)}>{views[preset].label}</button>)}
      <button className="rounded border px-3 py-2" disabled={!model} onClick={() => controlsApi.current?.view('iso')}>重置视角</button>
      <button className="rounded border px-3 py-2" aria-pressed={edges} disabled={!model} onClick={() => setEdges(!edges)}>网格特征边</button>
      <span className="ml-auto text-slate-500">左键旋转 · 滚轮缩放 · 右键平移</span>
    </div>
    <div className="relative min-h-64 flex-1">
      <div className="absolute inset-0" ref={host} aria-label="三维模型画布" />
      {!model && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 pointer-events-none">选择 STEP / STL 文件开始预览</div>}
      {failureMessage && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-sm text-red-700">
        {failureMessage}<button className="rounded border px-4 py-2" onClick={() => { setFailure(null); setGeneration((value) => value + 1); }}>重建画布</button>
      </div>}
    </div>
  </div>;
}
