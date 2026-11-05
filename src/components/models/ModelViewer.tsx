import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { createModelTrackballControls, getCameraFit, syncModelControlsViewport } from '@/lib/models/modelView';
import type { ModelSelection, ModelViewPreset, ParsedModel } from '@/lib/models/modelTypes';
import { createModelSelectionLayer, resolveModelSelection } from '@/lib/models/modelSelection';

const views: Record<ModelViewPreset, { label: string; direction: [number, number, number]; up: [number, number, number] }> = {
  iso: { label: '等轴测', direction: [1,-1,1], up: [0,0,1] },
  front: { label: '前视', direction: [0,-1,0], up: [0,0,1] },
  top: { label: '顶视', direction: [0,0,1], up: [0,1,0] },
  right: { label: '右视', direction: [1,0,0], up: [0,0,1] },
};
type EdgeMode = 'none' | 'feature' | 'surface';
type Background = 'light' | 'dark';
interface ViewerApi {
  view: (preset: ModelViewPreset) => void;
  fit: () => void;
  replace: (model: ParsedModel, key: string | null) => void;
  display: (edges: EdgeMode, background: Background) => void;
  clearSelection: () => void;
}

export function ModelViewer({ model, modelKey, status }: { model: ParsedModel | null; modelKey: string | null; status?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const controlsApi = useRef<ViewerApi | null>(null);
  const latestModel = useRef(model);
  useEffect(() => { latestModel.current = model; }, [model]);
  const [edgeChoice, setEdgeChoice] = useState<{ key: string | null; mode: EdgeMode } | null>(null);
  const [background, setBackground] = useState<Background>('light');
  const [view, setView] = useState<ModelViewPreset | 'free'>('iso');
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ model: ParsedModel; generation: number; message: string } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [picked, setPicked] = useState<{model: ParsedModel; key: string | null; generation: number; selection: ModelSelection} | null>(null);
  const selection = picked?.model === model && picked?.key === modelKey && picked?.generation === generation ? picked.selection : null;
  if (picked && (picked.model !== model || picked.key !== modelKey || picked.generation !== generation)) setPicked(null);
  const failureMessage = failure?.model === model && failure?.generation === generation ? failure.message : null;
  if (failure && failure.model !== model) { setFailure(null); setGeneration(generation + 1); }
  const hasModel = Boolean(model);
  const supportsSurface = Boolean(model?.meshes.length && model.meshes.every((mesh) => mesh.surfaceEdges?.length));
  const chosenEdges = edgeChoice?.key === modelKey ? edgeChoice.mode : supportsSurface ? 'surface' : 'feature';
  const edges = chosenEdges === 'surface' && !supportsSurface ? 'feature' : chosenEdges;

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    const container = host.current;
    if (!container || !hasModel) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch {
      let active = true;
      queueMicrotask(() => {
        // The replace effect supplies the current model even if WebGL initialization failed.
        if (active && latestModel.current) setFailure({ model: latestModel.current, generation, message: '无法创建 WebGL 画布，请开启硬件加速或换用支持 WebGL 的浏览器。' });
      });
      return () => { active = false; };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x697585, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(2,-3,5); scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xe0eaff, 1); fill.position.set(-3,2,1); scene.add(fill);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000); camera.up.set(0,0,1);
    let controls = createModelTrackballControls(camera, renderer.domElement);
    const material = new THREE.MeshStandardMaterial({ color: 0xbfc5cc, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x425063, transparent: true, opacity: 0.75, depthTest: true });
    let group = new THREE.Group(); scene.add(group);
    let geometries: THREE.BufferGeometry[] = [];
    let featureLines: THREE.LineSegments[] = []; let surfaceLines: THREE.LineSegments[] = [];
    let current: ParsedModel | null = null; let currentKey: string | null | undefined;
    let fitted = false; let pendingPreset: ModelViewPreset | null = 'iso';
    let programmatic = false;
    let freeView = false;
    const activePointers = new Set<number>();
    let edgeMode: EdgeMode = 'feature';
    const renderScene = () => renderer.render(scene, camera);
    let solids: THREE.Mesh[] = [];
    let selectionLayer: ReturnType<typeof createModelSelectionLayer> | undefined;
    const raycaster = new THREE.Raycaster();
    let clickCandidate: {id: number; x: number; y: number; dragged: boolean} | null = null;
    const clearSelection = () => {
      selectionLayer?.clear(); setPicked(null); renderScene();
    };
    const rotation = camera.quaternion.clone();
    const onChange = () => {
      if (!programmatic && !freeView && 1 - Math.abs(rotation.dot(camera.quaternion)) > 1e-10) { freeView = true; setView('free'); }
      rotation.copy(camera.quaternion); renderScene();
    };
    const rebuildControls = () => {
      clickCandidate = null;
      const target = controls.target.clone(); const quaternion = camera.quaternion.clone();
      const { minDistance, maxDistance } = controls;
      const pointers = [...activePointers]; activePointers.clear();
      controls.removeEventListener('change', onChange); controls.dispose();
      for (const id of pointers) if (renderer.domElement.hasPointerCapture?.(id)) renderer.domElement.releasePointerCapture(id);
      controls = createModelTrackballControls(camera, renderer.domElement);
      controls.target.copy(target); controls.minDistance = minDistance; controls.maxDistance = maxDistance;
      camera.quaternion.copy(quaternion);
      controls.addEventListener('change', onChange);
    };
    const fit = (preset?: ModelViewPreset) => {
      if (!current || !container.clientWidth || !container.clientHeight) { if (preset) pendingPreset = preset; return; }
      programmatic = true;
      const sizing = getCameraFit(current.boundsMm, container.clientWidth, container.clientHeight);
      const direction = preset ? new THREE.Vector3().fromArray(views[preset].direction) : camera.position.clone().sub(controls.target);
      if (direction.lengthSq() === 0) direction.set(1,-1,1);
      if (preset) camera.up.fromArray(views[preset].up);
      camera.aspect = sizing.aspect; camera.zoom = 1;
      camera.position.copy(direction.normalize().multiplyScalar(sizing.distance));
      camera.near = sizing.near; camera.far = sizing.far;
      controls.target.set(0,0,0); camera.lookAt(controls.target); camera.updateProjectionMatrix();
      // Explicit fit/presets discard unfinished input, including a pending wheel delta.
      rebuildControls();
      controls.minDistance = sizing.radius * 0.01; controls.maxDistance = sizing.distance * 10;
      controls.update();
      if (preset) freeView = false;
      rotation.copy(camera.quaternion); programmatic = false; fitted = true; pendingPreset = null; renderScene();
    };
    const display = (mode: EdgeMode, theme: Background) => {
      edgeMode = mode;
      featureLines.forEach((line) => { line.visible = mode === 'feature'; });
      surfaceLines.forEach((line) => { line.visible = mode === 'surface'; });
      scene.background = new THREE.Color(theme === 'light' ? '#eef1f5' : '#202936');
      edgeMaterial.color.set(theme === 'light' ? 0x425063 : 0x9daebf);
      renderScene();
    };
    const resize = () => {
      const width = container.clientWidth; const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      syncModelControlsViewport(controls);
      if (!fitted) fit(pendingPreset ?? 'iso');
      renderScene();
    };
    const api: ViewerApi = {
      view: (preset) => { fit(preset); setView(preset); }, fit: () => fit(), display, clearSelection,
      replace: (next, key) => {
        clickCandidate = null;
        // A new parse invalidates both CAD ids and any unconsumed input against old geometry.
        if (activePointers.size) rebuildControls();
        selectionLayer?.clear(); solids = [];
        geometries.forEach((geometry) => geometry.dispose()); geometries = []; featureLines = []; surfaceLines = [];
        scene.remove(group); group.clear(); group = new THREE.Group(); scene.add(group);
        for (const mesh of next.meshes) {
          const geometry = new THREE.BufferGeometry(); geometries.push(geometry);
          geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
          geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
          if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3)); else geometry.computeVertexNormals();
          const solid = new THREE.Mesh(geometry, material); solids.push(solid); group.add(solid);
          const featureGeometry = new THREE.EdgesGeometry(geometry, 30); geometries.push(featureGeometry);
          const feature = new THREE.LineSegments(featureGeometry, edgeMaterial); featureLines.push(feature); group.add(feature);
          if (mesh.surfaceEdges?.length) {
            const edgeGeometry = new THREE.BufferGeometry(); geometries.push(edgeGeometry);
            edgeGeometry.setAttribute('position', new THREE.BufferAttribute(mesh.surfaceEdges, 3));
            const surface = new THREE.LineSegments(edgeGeometry, edgeMaterial); surfaceLines.push(surface); group.add(surface);
          }
        }
        group.position.fromArray(next.boundsMm.min.map((value, i) => -(value + next.boundsMm.max[i]) / 2) as [number,number,number]);
        current = next;
        selectionLayer = createModelSelectionLayer(next.meshes,solids,group);
        if (key !== currentKey) { fitted = false; pendingPreset = 'iso'; currentKey = key; fit('iso'); queueMicrotask(() => { if (controlsApi.current === api) setView('iso'); }); }
        featureLines.forEach((line) => { line.visible = edgeMode === 'feature'; });
        surfaceLines.forEach((line) => { line.visible = edgeMode === 'surface'; });
        resize();
      },
    };
    controlsApi.current = api;
    const observer = new ResizeObserver(resize); observer.observe(container);
    controls.addEventListener('change', onChange);
    let alive = true;
    let animationFrame = 0;
    const animate = () => {
      if (!alive) return;
      // Hidden zero-size surfaces must not consume pointer coordinates with zero divisors.
      if (container.clientWidth && container.clientHeight) controls.update();
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    const pointerStart = (event: PointerEvent) => {
      syncModelControlsViewport(controls);
      if (!controls.screen.width || !controls.screen.height) { event.stopImmediatePropagation(); return; }
      const single = activePointers.size === 0;
      activePointers.add(event.pointerId);
      clickCandidate = single && event.pointerType === 'mouse' && event.isPrimary && event.button === 0
        ? {id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false} : null;
    };
    const pointerMove = (event: PointerEvent) => {
      if (clickCandidate?.id === event.pointerId && Math.hypot(event.clientX-clickCandidate.x,event.clientY-clickCandidate.y) > 4) clickCandidate.dragged = true;
    };
    const pointerEnd = (event: PointerEvent) => {
      pointerMove(event);
      const candidate = clickCandidate; clickCandidate = null;
      activePointers.delete(event.pointerId);
      if (!candidate || candidate.id !== event.pointerId || candidate.dragged || event.button !== 0 || !current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return;
      // Capture-phase pointerup runs before Trackball removes its pointer. Apply the final move now.
      controls.update(); camera.updateMatrixWorld(true); group.updateWorldMatrix(true,true);
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
      const hit = raycaster.intersectObjects(solids,false).find(({point}) => {
        // Perspective clipping is camera-space depth, not distance along an off-axis ray.
        const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
        return depth >= camera.near && depth <= camera.far;
      });
      const next = hit?.faceIndex != null ? resolveModelSelection(current.meshes,solids.indexOf(hit.object as THREE.Mesh),hit.faceIndex) : null;
      selectionLayer?.select(next);
      setPicked({model:current,key:currentKey ?? null,generation,selection:next}); renderScene();
    };
    const cancelClick = () => { clickCandidate = null; };
    const cancelGesture = () => { cancelClick(); if (activePointers.size) rebuildControls(); };
    renderer.domElement.addEventListener('pointerdown', pointerStart, true);
    document.addEventListener('pointermove', pointerMove, true);
    document.addEventListener('pointerup', pointerEnd, true);
    renderer.domElement.addEventListener('wheel', cancelClick, true);
    renderer.domElement.addEventListener('pointercancel', cancelGesture, true);
    renderer.domElement.addEventListener('lostpointercapture', cancelGesture);
    window.addEventListener('blur', cancelGesture);
    document.addEventListener('fullscreenchange', cancelGesture);
    const lost = (event: Event) => { event.preventDefault(); if (current) setFailure({ model: current, generation, message: 'WebGL 上下文已丢失，请重建画布或释放其他页面的显卡资源。' }); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      if (controlsApi.current === api) controlsApi.current = null;
      alive = false; cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener('pointerdown', pointerStart, true);
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', pointerEnd, true);
      renderer.domElement.removeEventListener('wheel', cancelClick, true);
      renderer.domElement.removeEventListener('pointercancel', cancelGesture, true);
      renderer.domElement.removeEventListener('lostpointercapture', cancelGesture);
      window.removeEventListener('blur', cancelGesture);
      document.removeEventListener('fullscreenchange', cancelGesture);
      observer.disconnect(); controls.removeEventListener('change', onChange); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      selectionLayer?.clear();
      geometries.forEach((geometry) => geometry.dispose()); material.dispose(); edgeMaterial.dispose();
      group.clear(); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [hasModel, generation]);

  useEffect(() => { if (model) controlsApi.current?.replace(model, modelKey); }, [model, modelKey, generation]);
  useEffect(() => { controlsApi.current?.display(edges, background); }, [edges, background, model, generation]);

  const toggleFullscreen = async () => {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else if (frame.current?.requestFullscreen) await frame.current.requestFullscreen();
      else setFullscreenError('当前浏览器不支持全屏查看。');
    } catch { setFullscreenError('无法进入全屏，请检查浏览器权限后重试。'); }
  };
  const button = 'rounded border border-slate-200 px-3 py-2 hover:bg-slate-100 disabled:opacity-40 aria-pressed:bg-blue-100 aria-pressed:text-blue-800';
  return <div ref={frame} className="flex min-h-80 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white fullscreen:h-screen">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2 text-xs">
      {(Object.keys(views) as ModelViewPreset[]).map((preset) => <button className={button} aria-pressed={view === preset} disabled={!model} key={preset} onClick={() => controlsApi.current?.view(preset)}>{views[preset].label}</button>)}
      <button className={button} disabled={!model} onClick={() => controlsApi.current?.view('iso')}>重置视角</button>
      <button className={button} disabled={!model} onClick={() => controlsApi.current?.fit()}>适配窗口</button>
      <label>边线 <select aria-label="边线" className="rounded border p-1" value={edges} disabled={!model} onChange={(event) => setEdgeChoice({ key: modelKey, mode: event.target.value as EdgeMode })}>
        <option value="none">无边线</option><option value="feature">特征边</option><option value="surface" disabled={!supportsSurface}>曲面边界</option>
      </select></label>
      <label>背景 <select aria-label="背景" className="rounded border p-1" value={background} onChange={(event) => setBackground(event.target.value as Background)}><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <button className={button} onClick={() => void toggleFullscreen()}>{fullscreen ? '退出全屏' : '全屏查看'}</button>
      <button className={button} disabled={!selection} onClick={() => controlsApi.current?.clearSelection()}>清除选择</button>
      <span data-testid="model-selection" aria-live="polite">{selection?.kind === 'face' ? `曲面 ${selection.faceId+1}` : selection?.kind === 'mesh' ? `网格：${model?.meshes[selection.meshIndex].name || '未命名'}` : ''}</span>
      <span className="ml-auto basis-full text-right text-slate-500"><span className="inline-block w-16">{view === 'free' ? '自由视角 · ' : ''}</span>点击选择曲面 · 左键拖动旋转 · 右键拖动平移 · 滚轮缩放</span>
    </div>
    {(status || fullscreenError) && <div className="flex flex-wrap gap-3 bg-white px-3 py-2 text-xs" role="status">{status}{fullscreenError}</div>}
    <div className="relative min-h-64 flex-1">
      <div className="absolute inset-0" ref={host} aria-label="三维模型画布" />
      {!model && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">选择 STEP / STL 文件开始预览</div>}
      {failureMessage && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-sm text-red-700">
        {failureMessage}<button className="rounded border px-4 py-2" onClick={() => { setFailure(null); setGeneration((value) => value + 1); }}>重建画布</button>
      </div>}
    </div>
  </div>;
}
