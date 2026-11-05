// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createModelTrackballControls, syncModelControlsViewport } from '@/lib/models/modelView';

const disposals: (() => void)[] = [];
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()));
function setup(width = 800, height = 600) {
  const camera = new PerspectiveCamera(45, 4/3, 0.01, 10000);
  camera.up.set(0,0,1); camera.position.set(100,-100,100);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  Object.defineProperties(canvas, { clientWidth: { value: width }, clientHeight: { value: height } });
  canvas.getBoundingClientRect = () => ({ x:0,y:0,left:0,top:0,width,height,right:width,bottom:height,toJSON:()=>({}) });
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  const controls = createModelTrackballControls(camera, canvas);
  camera.lookAt(controls.target); controls.update();
  disposals.push(() => { controls.dispose(); canvas.remove(); });
  const direction = () => camera.position.clone().sub(controls.target).normalize();
  const emit = (type: string, x: number, y: number, button = 0) => {
    const event = new MouseEvent(type, { clientX:x,clientY:y,button,buttons:type==='pointerup'?0:1,bubbles:true });
    Object.defineProperties(event, { pointerId: { value:1 }, pointerType: { value:'mouse' } });
    (type === 'pointerdown' ? canvas : document).dispatchEvent(event); controls.update();
  };
  const drag = (dx: number, dy: number, button = 0, sample?: () => void) => {
    emit('pointerdown',width/2,height/2,button);
    for(let i=1;i<=10;i++) { emit('pointermove',width/2+dx*i/10,height/2+dy*i/10,button); sample?.(); }
    emit('pointerup',width/2+dx,height/2+dy,button);
  };
  return { camera,canvas,controls,direction,drag };
}
describe('real free-rotation pointer controls', () => {
  it('uses CSS dimensions at DPR 1/2 and survives zero viewport sizes without changing pose', () => {
    const { camera,canvas,controls,drag } = setup();
    const initial = camera.quaternion.clone();
    for (const dpr of [1,2]) {
      Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:dpr});
      camera.position.set(0,-100,0); camera.up.set(0,0,1); camera.lookAt(controls.target); controls.update();
      const before = camera.quaternion.clone(); syncModelControlsViewport(controls); drag(100,0);
      expect(before.angleTo(camera.quaternion)*180/Math.PI).toBeCloseTo(60,4);
    }
    const pose = camera.quaternion.clone(); const speed = controls.rotateSpeed;
    const rect = canvas.getBoundingClientRect;
    canvas.getBoundingClientRect = () => ({...rect(),width:0,height:0});
    syncModelControlsViewport(controls);
    expect(controls.rotateSpeed).toBe(speed); expect(camera.quaternion.equals(pose)).toBe(true);
    canvas.getBoundingClientRect = rect; syncModelControlsViewport(controls);
    expect(controls.screen.width).toBe(800); expect(initial.equals(pose)).toBe(false);
  });
  it.each([[800,600,60],[1330,706,50.9915],[1760,706,50.9915],[600,800,60]])('calibrates 100 CSS px at %i x %i to %f degrees in both axes', (width,height,degrees) => {
    for (const [dx,dy] of [[100,0],[0,100]]) {
      const { camera, controls, drag } = setup(width,height);
      camera.position.set(0,-100,0); camera.up.set(0,0,1); camera.lookAt(controls.target); controls.update();
      const before = camera.quaternion.clone(); drag(dx,dy);
      expect(Math.abs(before.angleTo(camera.quaternion)*180/Math.PI-degrees)).toBeLessThan(1);
    }
  });
  it('turns a quarter short-side drag by 90 degrees and accumulates 360 degrees over one short side', () => {
    const {camera,controls,drag}=setup(1330,706); camera.position.set(0,-100,0); camera.lookAt(controls.target); controls.update();
    let previous=camera.quaternion.clone(); let total=0;
    for(let i=0;i<4;i++) {
      const before=total;
      drag(706/4,0,0,()=>{const next=camera.quaternion.clone(); total+=previous.angleTo(next)*180/Math.PI; previous=next;});
      expect(total-before).toBeCloseTo(90,4);
    }
    expect(total).toBeCloseTo(360,4);
  });
  it('keeps horizontal motion effective after the exact 120px vertical pole sequence', () => {
    const { direction, drag } = setup(); drag(0,120); const before = direction(); drag(120,0);
    expect(before.angleTo(direction())).toBeGreaterThan(0.01);
  });
  it.each([[120,0],[0,120]])('rotates with pure dx=%i dy=%i and keeps every camera component finite', (dx,dy) => {
    const { camera, direction, drag } = setup(); const before = direction(); drag(dx,dy);
    expect(before.angleTo(direction())).toBeGreaterThan(0.01);
    expect([...camera.position,...camera.up,...camera.quaternion].every(Number.isFinite)).toBe(true);
  });
  it('accumulates a complete turn through both world hemispheres without stopping at a pole', () => {
    const { direction,drag } = setup(); let previous = direction(); let total = 0; const z: number[] = [];
    for(let i=0;i<24;i++) drag(0,120,0,() => { const next = direction(); total += previous.angleTo(next); z.push(next.z); previous = next; });
    expect(total).toBeGreaterThan(2*Math.PI); expect(Math.min(...z)).toBeLessThan(-0.9); expect(Math.max(...z)).toBeGreaterThan(0.9);
  });
  it('pans position and target together with right drag, preserving direction and distance', () => {
    const { camera,controls,direction,drag } = setup();
    const position = camera.position.clone(); const target = controls.target.clone(); const before = direction();
    const distance = camera.position.distanceTo(controls.target); drag(120,60,2);
    expect(controls.target.distanceTo(target)).toBeGreaterThan(1);
    expect(camera.position.clone().sub(position).distanceTo(controls.target.clone().sub(target))).toBeLessThan(1e-10);
    expect(before.angleTo(direction())).toBeLessThan(1e-7); expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance,10);
  });
  it('zooms with wheel and middle drag within limits while preserving orientation', () => {
    const { camera,canvas,controls,direction,drag } = setup(); const before = direction(); const distance = camera.position.distanceTo(controls.target);
    controls.minDistance = 80; controls.maxDistance = 200;
    const wheel = (deltaY: number) => { canvas.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true})); controls.update(); };
    wheel(-100); expect(camera.position.distanceTo(controls.target)).toBeLessThan(distance);
    const afterWheel = camera.position.distanceTo(controls.target);
    drag(0,60,1); expect(before.angleTo(direction())).toBeLessThan(1e-7);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(afterWheel);
    for(let i=0;i<60;i++) wheel(-100); expect(camera.position.distanceTo(controls.target)).toBeCloseTo(80);
    for(let i=0;i<20;i++) wheel(500); expect(camera.position.distanceTo(controls.target)).toBeCloseTo(200);
  });
  it.each(['KeyA','KeyS','KeyD'])('does not let %s change ordinary left drag into another mode', (code) => {
    const { controls,direction,drag } = setup(); const before = direction(); const target = controls.target.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code })); drag(120,0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    expect(before.angleTo(direction())).toBeGreaterThan(0.01); expect(controls.target.toArray()).toEqual(target.toArray());
  });
});
