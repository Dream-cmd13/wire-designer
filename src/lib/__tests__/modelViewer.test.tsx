// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import * as testing from '@testing-library/react';
import { getCameraFit } from '../models/modelView';
import { ModelViewer } from '@/components/models/ModelViewer';
import * as THREE from 'three';
import type { ParsedModel } from '../models/modelTypes';

const mocks = vi.hoisted(() => ({ dispose: vi.fn(), controlsDispose: vi.fn(), disconnect: vi.fn(), draw: vi.fn(), update: vi.fn(), controls: null as import('three/addons/controls/TrackballControls.js').TrackballControls | null, scene: null as import('three').Scene | null, creationFailures: 0, resize: () => {}, camera: null as import('three').PerspectiveCamera | null, target: null as import('three').Vector3 | null }));
vi.mock('three', async (load) => {
  const actual = await load<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    constructor() { if (mocks.creationFailures > 0) { mocks.creationFailures--; throw new Error('WebGL unavailable'); } }
    domElement = document.createElement('canvas');
    setPixelRatio() {} setSize() {} forceContextLoss() {} render(scene: import('three').Scene, camera: import('three').PerspectiveCamera) { mocks.scene = scene; mocks.camera = camera; mocks.draw(); } dispose() { mocks.dispose(); }
  } };
});
vi.mock('three/addons/controls/TrackballControls.js', async (load) => {
  const actual = await load<typeof import('three/addons/controls/TrackballControls.js')>();
  return { TrackballControls: class extends actual.TrackballControls {
    constructor(camera: import('three').PerspectiveCamera, canvas: HTMLCanvasElement) { super(camera,canvas); mocks.controls = this; mocks.target = this.target; }
    update() { mocks.update(this); super.update(); }
    dispose() { mocks.controlsDispose(this); super.dispose(); }
  } };
});
vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { mocks.resize = callback; } observe() {} disconnect = mocks.disconnect; });
const model: ParsedModel = { meshes: [{ name: 'part', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]) }], boundsMm: { min: [0,0,0], max: [1,1,0] }, triangleCount: 1 };
let frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
let canvasLeft = 0; let canvasTop = 0;
function tick() { testing.act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(16)); }); }
function pointer(type: string, x = 400, y = 300, button = 0) {
  const event = new MouseEvent(type, { bubbles:true,clientX:x+canvasLeft,clientY:y+canvasTop,button,buttons:type==='pointerup'?0:1 });
  Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'},isPrimary:{value:true}});
  testing.fireEvent(type==='pointermove'||type==='pointerup' ? document : document.querySelector('canvas')!, event);
}
function drag(dx: number, dy: number) { pointer('pointerdown'); for(let i=1;i<=10;i++) { pointer('pointermove',400+dx*i/10,300+dy*i/10); tick(); } pointer('pointerup',400+dx,300+dy); tick(); }
function pose() { return [...mocks.camera!.position,...mocks.controls!.target,...mocks.camera!.up,...mocks.camera!.quaternion,mocks.camera!.zoom]; }
const pickingModel: ParsedModel = {
  meshes:[{name:'asymmetric',positions:new Float32Array([-2,-1,-1,0,-1,-1,0,-1,1,-2,-1,1,1,-1,-1,1,-1,1]),
    indices:new Uint32Array([0,1,2,0,2,3,1,4,5,1,5,2]),faceRanges:[{faceId:0,firstTriangle:0,lastTriangle:1},{faceId:1,firstTriangle:2,lastTriangle:3}]}],
  boundsMm:{min:[-2,-1,-1],max:[1,-1,1]},triangleCount:4,
};
function pointOnModel(x: number, z: number) {
  mocks.camera!.updateMatrixWorld(true);
  const point = new THREE.Vector3(x+0.5,0,z).project(mocks.camera!);
  return [400+point.x*400,300-point.y*300];
}
function clickPoint(x: number, y: number) { pointer('pointerdown',x,y); pointer('pointerup',x,y); }
function faceFills() {
  const objects: THREE.Mesh[] = [];
  mocks.scene!.traverse((object) => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) objects.push(object); });
  return objects;
}
beforeEach(() => {
  frames = new Map(); canvasLeft = 0; canvasTop = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++frameId; frames.set(id,callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockImplementation(() => ({ x:canvasLeft,y:canvasTop,left:canvasLeft,top:canvasTop,width:800,height:600,right:canvasLeft+800,bottom:canvasTop+600,toJSON:()=>({}) }));
  HTMLCanvasElement.prototype.setPointerCapture = () => {};
  HTMLCanvasElement.prototype.releasePointerCapture = () => {};
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => { testing.cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); mocks.creationFailures = 0; });
describe('camera fit and canvas ownership', () => {
  it('picks full CAD faces with a real Raycaster, reuses identical faces, clears blank and preserves display changes', () => {
    const {rerender} = testing.render(<ModelViewer model={pickingModel} modelKey="pick" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    const [x,y] = pointOnModel(-1,0); clickPoint(x,y);
    expect(testing.screen.getByTestId('model-selection').textContent).toBe('曲面 1');
    const fill = faceFills()[0]; expect(fill.geometry.index!.count).toBe(6);
    expect(fill.geometry.getAttribute('position').count).toBe(4);
    clickPoint(...pointOnModel(-1.5,0.6) as [number,number]); expect(faceFills()).toEqual([fill]);
    testing.fireEvent.change(testing.screen.getByLabelText('背景'),{target:{value:'dark'}});
    testing.fireEvent.change(testing.screen.getByLabelText('边线'),{target:{value:'none'}});
    testing.act(() => mocks.resize()); testing.fireEvent(document,new Event('fullscreenchange'));
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    expect(faceFills()).toEqual([fill]);
    clickPoint(...pointOnModel(0.5,0) as [number,number]);
    expect(testing.screen.getByTestId('model-selection').textContent).toBe('曲面 2'); expect(faceFills()).toHaveLength(1);
    clickPoint(5,5); expect(faceFills()).toHaveLength(0);
    clickPoint(...pointOnModel(-1,0) as [number,number]);
    rerender(<ModelViewer model={{...pickingModel}} modelKey="pick" />);
    expect(faceFills()).toHaveLength(0);
  });
  it('accepts slight jitter and consumes pending camera movement before raycasting, but rejects out-and-back drags', () => {
    testing.render(<ModelViewer model={pickingModel} modelKey="gesture" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    const [x,y] = pointOnModel(-1,0);
    const intersections = vi.spyOn(THREE.Raycaster.prototype,'intersectObjects');
    const before = mocks.camera!.quaternion.clone();
    pointer('pointerdown',x,y); pointer('pointermove',x+2,y); pointer('pointerup',x+2,y);
    expect(faceFills()).toHaveLength(1);
    const prior = faceFills()[0];
    expect(before.angleTo(mocks.camera!.quaternion)).toBeGreaterThan(0.001);
    const expected = new THREE.Raycaster(); expected.setFromCamera(new THREE.Vector2((x+2)/400-1,1-y/300),mocks.camera!);
    const actual = intersections.mock.contexts[0] as THREE.Raycaster;
    expect(actual.ray.direction.distanceTo(expected.ray.direction)).toBeLessThan(1e-10);
    pointer('pointerdown',x,y); pointer('pointermove',x+20,y); pointer('pointermove',x,y); pointer('pointerup',x,y);
    expect(faceFills()).toEqual([prior]);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'清除选择'})); expect(faceFills()).toHaveLength(0);
  });
  it('invalidates a mouse click candidate on a second pointer without blocking controls', () => {
    testing.render(<ModelViewer model={pickingModel} modelKey="multi" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    const [x,y]=pointOnModel(-1,0); pointer('pointerdown',x,y);
    const second=new MouseEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,button:0});
    Object.defineProperties(second,{pointerId:{value:2},pointerType:{value:'touch'},isPrimary:{value:false}});
    testing.fireEvent(document.querySelector('canvas')!,second); pointer('pointerup',x,y);
    expect(faceFills()).toHaveLength(0); testing.fireEvent(window,new Event('blur'));
    const before=pose(); drag(100,0); expect(pose()).not.toEqual(before);
  });
  it.each(['right','outside','pointercancel','blur','fullscreenchange','wheel'])('does not select after %s', (kind) => {
    testing.render(<ModelViewer model={pickingModel} modelKey="no-pick" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    const [x,y] = pointOnModel(-1,0); pointer('pointerdown',x,y,kind==='right'?2:0);
    if (['pointercancel','blur','fullscreenchange'].includes(kind)) testing.fireEvent(kind==='blur'?window:kind==='fullscreenchange'?document:document.querySelector('canvas')!,new Event(kind,{bubbles:true}));
    if (kind==='wheel') testing.fireEvent.wheel(document.querySelector('canvas')!,{deltaY:-100});
    pointer('pointerup',kind==='outside'?-1:x,y,kind==='right'?2:0);
    expect(faceFills()).toHaveLength(0);
  });
  it('keeps calibrated controls after preset and blur reconstruction', () => {
    testing.render(<ModelViewer model={model} modelKey="speed" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    expect(mocks.controls!.rotateSpeed).toBeCloseTo(Math.PI*4/3);
    pointer('pointerdown'); testing.fireEvent(window,new Event('blur'));
    expect(mocks.controls!.rotateSpeed).toBeCloseTo(Math.PI*4/3);
  });
  it('never revives selection when the same parsed object returns after an empty state, and releases selection GPU ownership', () => {
    const {rerender,unmount} = testing.render(<ModelViewer model={pickingModel} modelKey="revive" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'})); clickPoint(...pointOnModel(-1,0) as [number,number]);
    const fill=faceFills()[0]; const geometryDispose=vi.spyOn(fill.geometry,'dispose'); const materialDispose=vi.spyOn(fill.material as THREE.Material,'dispose');
    rerender(<ModelViewer model={null} modelKey="revive" />);
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
    rerender(<ModelViewer model={pickingModel} modelKey="revive" />);
    expect(testing.screen.getByTestId('model-selection').textContent).toBe('');
    expect(testing.screen.getByRole('button',{name:'清除选择'})).toHaveProperty('disabled',true);
    unmount(); expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
  });
  it('picks the nearest surface inside the camera clipping planes, including off-axis clicks', () => {
    const layered: ParsedModel={meshes:[{name:'depth',positions:new Float32Array([
      -2,-1,-1,1,-1,-1,1,-1,1,-2,-1,1,-2,1,-1,1,1,-1,1,1,1,-2,1,1]),
      indices:new Uint32Array([0,1,2,0,2,3,4,5,6,4,6,7]),
      faceRanges:[{faceId:0,firstTriangle:0,lastTriangle:1},{faceId:1,firstTriangle:2,lastTriangle:3}]}],
      boundsMm:{min:[-2,-1,-1],max:[1,1,1]},triangleCount:4};
    testing.render(<ModelViewer model={layered} modelKey="clip" />);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'前视'}));
    const camera=mocks.camera!; const distance=camera.position.length();
    camera.near=distance-0.9; camera.updateProjectionMatrix();
    // The front face is clipped by 0.1; a corner ray reaches it at a longer Euclidean
    // distance than camera.near, so simply copying near/far into Raycaster is wrong.
    const worldPoint=new THREE.Vector3(1.4,1,0.9);
    const rayDirection=worldPoint.clone().sub(camera.position).normalize();
    expect((distance-1)/rayDirection.y).toBeGreaterThan(camera.near);
    const point=worldPoint.project(camera);
    clickPoint(400+point.x*400,300-point.y*300);
    expect(testing.screen.getByTestId('model-selection').textContent).toBe('曲面 2');
    camera.near=0.01; camera.far=distance-2; camera.updateProjectionMatrix();
    clickPoint(400,300); expect(testing.screen.getByTestId('model-selection').textContent).toBe('');
  });
  it('updates the active controls on one scoped RAF after pointer events and stops on unmount', () => {
    const { unmount } = testing.render(<React.StrictMode><ModelViewer model={model} modelKey="raf" /></React.StrictMode>);
    expect(frames.size).toBe(1); const active = mocks.controls; const initial = pose();
    drag(120,0); expect(pose()).not.toEqual(initial);
    expect(mocks.update).toHaveBeenLastCalledWith(active);
    const draws = mocks.draw.mock.calls.length; tick(); tick(); expect(mocks.draw.mock.calls.length).toBe(draws);
    unmount(); expect(frames.size).toBe(0); const updates = mocks.update.mock.calls.length; tick();
    expect(mocks.update).toHaveBeenCalledTimes(updates);
  });
  it('refreshes screen coordinates before pointerdown when only canvas position changes', () => {
    testing.render(<ModelViewer model={model} modelKey="offset" />);
    canvasLeft = 150; canvasTop = -200; pointer('pointerdown');
    expect(mocks.controls!.screen).toMatchObject({ left:150,top:-200,width:800,height:600 });
    pointer('pointerup'); drag(120,0); expect(pose().every(Number.isFinite)).toBe(true);
  });
  it.each(['pointercancel','lostpointercapture','blur','fullscreenchange'])('cancels a live gesture on %s without losing pose or leaving sticky motion', (kind) => {
    testing.render(<ModelViewer model={model} modelKey="cancel" />);
    pointer('pointerdown'); pointer('pointermove',450,330); tick();
    // Leave an unconsumed delta to ensure cancellation discards it, rather than applying it later.
    pointer('pointermove',480,350); const before = pose();
    testing.fireEvent(kind==='blur'?window:kind==='fullscreenchange'?document:document.querySelector('canvas')!, new Event(kind,{bubbles:true}));
    tick(); expect(pose()).toEqual(before);
    pointer('pointermove',520,400); tick(); expect(pose()).toEqual(before);
    drag(120,0); expect(pose()).not.toEqual(before);
    const released = pose(); tick(); tick(); expect(pose()).toEqual(released);
  });
  it('preserves roll through display, replacement, resize and fit, and resets presets without old deltas', () => {
    const { rerender } = testing.render(<ModelViewer model={model} modelKey="roll" />);
    drag(110,90); drag(-60,80); const before = pose(); const up = mocks.camera!.up.clone();
    expect(up.distanceTo(new (mocks.camera!.up.constructor as typeof import('three').Vector3)(0,0,1))).toBeGreaterThan(0.01);
    testing.fireEvent.change(testing.screen.getByLabelText('背景'),{target:{value:'dark'}});
    testing.fireEvent.change(testing.screen.getByLabelText('边线'),{target:{value:'none'}});
    rerender(<ModelViewer model={{...model}} modelKey="roll" />); testing.act(() => mocks.resize()); tick();
    expect(pose()).toEqual(before);
    const direction = mocks.camera!.position.clone().sub(mocks.controls!.target).normalize();
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'适配窗口'})); tick();
    expect(mocks.camera!.up.distanceTo(up)).toBeLessThan(1e-10);
    expect(direction.angleTo(mocks.camera!.position.clone().normalize())).toBeLessThan(1e-7);
    expect(mocks.controls!.target.toArray()).toEqual([0,0,0]);
    pointer('pointerdown'); pointer('pointermove',500,400);
    testing.fireEvent.click(testing.screen.getByRole('button',{name:'顶视'})); const top = pose(); tick(); tick();
    expect(mocks.update).toHaveBeenLastCalledWith(mocks.controls);
    expect(pose()).toEqual(top); expect(mocks.camera!.up.toArray()).toEqual([0,1,0]);
    expect(testing.screen.getByRole('button',{name:'顶视'}).getAttribute('aria-pressed')).toBe('true');
    drag(120,0); expect(pose()).not.toEqual(top);
  });
  it('suppresses context menus only within the canvas', () => {
    testing.render(<ModelViewer model={model} modelKey="menu" />);
    expect(testing.fireEvent.contextMenu(document.querySelector('canvas')!)).toBe(false);
    expect(testing.fireEvent.contextMenu(testing.screen.getByRole('button',{name:'前视'}))).toBe(true);
  });
  it('preserves camera position, target, up and zoom on repeated resize and same-file geometry replacement', () => {
    let width = 800; let height = 600;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    const { rerender } = testing.render(<ModelViewer model={model} modelKey="file-a" />);
    const camera = mocks.camera!; const target = mocks.target!;
    camera.position.set(2,3,4); camera.up.set(0,1,0); camera.zoom = 2; target.set(0.2,0.3,0.4);
    const canvas = document.querySelector('canvas');
    width = 300; height = 900;
    testing.act(() => { mocks.resize(); mocks.resize(); });
    expect(camera.position.toArray()).toEqual([2,3,4]); expect(camera.zoom).toBe(2);
    expect(target.toArray()).toEqual([0.2,0.3,0.4]); expect(camera.up.toArray()).toEqual([0,1,0]);
    expect(camera.aspect).toBeCloseTo(1/3);
    rerender(<ModelViewer model={{ ...model }} modelKey="file-a" />);
    expect(mocks.camera).toBe(camera); expect(document.querySelector('canvas')).toBe(canvas);
    expect(camera.position.toArray()).toEqual([2,3,4]);
    rerender(<ModelViewer model={{ ...model }} modelKey="file-b" />);
    expect(camera.position.toArray()).not.toEqual([2,3,4]); expect(mocks.target!.toArray()).toEqual([0,0,0]);
    vi.restoreAllMocks();
  });
  it('fits once when a zero-size container becomes visible', () => {
    let width = 0;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    testing.render(<ModelViewer model={model} modelKey="zero" />);
    width = 800; testing.act(() => mocks.resize());
    tick(); expect(pose().every(Number.isFinite)).toBe(true);
    const position = mocks.camera!.position.clone();
    expect(position.length()).toBeGreaterThan(1);
    mocks.camera!.position.multiplyScalar(0.5);
    testing.act(() => mocks.resize());
    expect(mocks.camera!.position.length()).toBeCloseTo(position.length() * 0.5);
  });
  it('keeps clipping and aspect finite for tiny, large, flat and zero-size containers', () => {
    for (const size of [1e-8, 1, 1e12]) for (const [width, height] of [[0,0], [1,1000], [1000,1]]) {
      const fit = getCameraFit({ min: [0,0,0], max: [size,size,0] }, width, height);
      expect(fit.distance).toBeGreaterThan(size / 2);
      expect(fit.near).toBeGreaterThan(0);
      expect(fit.far).toBeGreaterThan(fit.distance + size);
      expect(Number.isFinite(fit.distance)).toBe(true);
    }
  });
  it('supports view/edge controls and disposes each mount including StrictMode replay', () => {
    const { rerender, unmount } = testing.render(<React.StrictMode><ModelViewer modelKey="test" model={model} /></React.StrictMode>);
    for (const name of ['等轴测','前视','顶视','右视','重置视角']) testing.fireEvent.click(testing.screen.getByRole('button', { name }));
    rerender(<React.StrictMode><ModelViewer modelKey="test" model={{ ...model }} /></React.StrictMode>);
    unmount();
    expect(mocks.dispose.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.controlsDispose.mock.calls.length).toBeGreaterThan(mocks.dispose.mock.calls.length);
    expect(mocks.disconnect).toHaveBeenCalledTimes(mocks.dispose.mock.calls.length);
    expect(document.querySelector('canvas')).toBeNull();
  });
  it('shows actionable WebGL context loss and allows recreation', () => {
    testing.render(<ModelViewer modelKey="test" model={model} />);
    testing.fireEvent(document.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }));
    expect(testing.screen.getByRole('alert').textContent).toContain('WebGL');
    testing.fireEvent.click(testing.screen.getByRole('button', { name: '重建画布' }));
    expect(testing.screen.queryByRole('alert')).toBeNull();
  });
  it.each([false, true])('clears an obsolete context-loss overlay when replacing a model (empty transition: %s)', (emptyTransition) => {
    const { rerender } = testing.render(<ModelViewer modelKey="test" model={model} />);
    const oldCanvas = document.querySelector('canvas')!;
    testing.fireEvent(oldCanvas, new Event('webglcontextlost', { cancelable: true }));
    expect(testing.screen.getByRole('alert').textContent).toContain('WebGL');
    if (emptyTransition) rerender(<ModelViewer modelKey="test" model={null} />);
    rerender(<ModelViewer modelKey="test" model={{ ...model }} />);
    expect(document.querySelector('canvas')).not.toBeNull();
    if (emptyTransition) expect(document.querySelector('canvas')).not.toBe(oldCanvas);
    expect(testing.screen.queryByRole('alert')).toBeNull();
  });
  it('keeps the canvas when changing background and reports unavailable fullscreen', async () => {
    testing.render(<ModelViewer model={model} modelKey="same" />);
    const canvas = document.querySelector('canvas');
    testing.fireEvent.change(testing.screen.getByLabelText('背景'), { target: { value: 'dark' } });
    expect(document.querySelector('canvas')).toBe(canvas);
    testing.fireEvent.click(testing.screen.getByRole('button', { name: '全屏查看' }));
    expect(await testing.screen.findByText(/不支持全屏/)).toBeTruthy();
  });
  it('reports rejected fullscreen and follows fullscreenchange including native exit', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    const { unmount } = testing.render(<ModelViewer model={model} modelKey="fullscreen" />);
    testing.fireEvent.click(testing.screen.getByRole('button', { name: '全屏查看' }));
    await testing.screen.findByText(/无法进入全屏/);
    const frame = testing.screen.getByRole('button', { name: '全屏查看' }).parentElement!.parentElement!;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: frame });
    testing.fireEvent(document, new Event('fullscreenchange'));
    expect(testing.screen.getByRole('button', { name: '退出全屏' })).toBeTruthy();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    testing.fireEvent(document, new Event('fullscreenchange'));
    expect(testing.screen.getByRole('button', { name: '全屏查看' })).toBeTruthy();
    unmount(); Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen'); Reflect.deleteProperty(document, 'fullscreenElement');
  });
  it('clears an initialization error when a new model creates a healthy canvas', async () => {
    mocks.creationFailures = 1;
    const { rerender } = testing.render(<ModelViewer modelKey="test" model={model} />);
    await testing.screen.findByRole('alert');
    rerender(<ModelViewer modelKey="test" model={{ ...model }} />);
    expect(document.querySelector('canvas')).not.toBeNull();
    expect(testing.screen.queryByRole('alert')).toBeNull();
  });
  it('does not revive an obsolete error when the same model returns after an empty state', () => {
    const { rerender } = testing.render(<ModelViewer modelKey="test" model={model} />);
    testing.fireEvent(document.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }));
    expect(testing.screen.getByRole('alert')).toBeTruthy();
    rerender(<ModelViewer modelKey="test" model={null} />);
    rerender(<ModelViewer modelKey="test" model={model} />);
    expect(document.querySelector('canvas')).not.toBeNull();
    expect(testing.screen.queryByRole('alert')).toBeNull();
  });
});
