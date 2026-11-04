import type { ParsedModel } from './modelTypes';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PerspectiveCamera, Vector3 } from 'three';

/** OrbitControls caches the camera up axis at construction time. */
export function createModelOrbitControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement, up: Vector3, previous?: OrbitControls) {
  previous?.dispose();
  camera.up.copy(up);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  return controls;
}

export function getCameraFit(bounds: ParsedModel['boundsMm'], width: number, height: number) {
  const radius = Math.max(Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])) / 2, 1e-10);
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const halfFov = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * aspect));
  const distance = radius / Math.sin(halfFov) * 1.15;
  return { distance, near: radius * 0.001, far: distance * 10 + radius * 10, radius, aspect };
}
