// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createModelTrackballControls } from '@/lib/models/modelView';

const disposals: (() => void)[] = [];
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()));
function setup() {
  const camera = new PerspectiveCamera(45, 4/3, 0.01, 10000);
  camera.up.set(0,0,1); camera.position.set(100,-100,100);
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  canvas.getBoundingClientRect = () => ({ x:0,y:0,left:0,top:0,width:800,height:600,right:800,bottom:600,toJSON:()=>({}) });
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
    emit('pointerdown',400,300,button);
    for(let i=1;i<=10;i++) { emit('pointermove',400+dx*i/10,300+dy*i/10,button); sample?.(); }
    emit('pointerup',400+dx,300+dy,button);
  };
  return { camera,canvas,controls,direction,drag };
}
describe('real free-rotation pointer controls', () => {
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
