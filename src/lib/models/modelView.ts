import type { ParsedModel } from './modelTypes';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { MOUSE, type PerspectiveCamera } from 'three';

/** Free rotation includes roll; the viewer owns camera presets and instance disposal. */
export function createModelTrackballControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement): TrackballControls {
  const controls = new TrackballControls(camera, canvas);
  controls.staticMoving = true;
  controls.noRotate = false; controls.noPan = false; controls.noZoom = false;
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  controls.keys = ['', '', ''];
  return controls;
}

export function getCameraFit(bounds: ParsedModel['boundsMm'], width: number, height: number) {
  const radius = Math.max(Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])) / 2, 1e-10);
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const halfFov = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * aspect));
  const distance = radius / Math.sin(halfFov) * 1.15;
  return { distance, near: radius * 0.001, far: distance * 10 + radius * 10, radius, aspect };
}
