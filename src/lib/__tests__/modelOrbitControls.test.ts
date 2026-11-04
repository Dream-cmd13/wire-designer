// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createModelOrbitControls } from '@/lib/models/modelView';

describe('real OrbitControls coordinate frame', () => {
  it('can horizontally orbit after switching from Z-up to the top view Y-up', () => {
    const camera = new PerspectiveCamera(); const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
    camera.up.set(0,0,1); camera.position.set(100,-100,100);
    let controls = createModelOrbitControls(camera, canvas, new Vector3(0,0,1));
    controls = createModelOrbitControls(camera, canvas, new Vector3(0,1,0), controls);
    camera.position.set(0,0,100); controls.target.set(0,0,0); camera.lookAt(controls.target); controls.update();
    const before = camera.position.clone();
    controls.rotateLeft(Math.PI/4);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(70);
    controls.dispose(); canvas.remove();
  });
});
