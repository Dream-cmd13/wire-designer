import type { ParsedModel } from './modelTypes';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { Matrix4, MOUSE, Vector3, type PerspectiveCamera } from 'three';

/** CSS pixels keep rotation independent of canvas aspect ratio and DPR. */
export function syncModelControlsViewport(controls: TrackballControls): void {
  controls.handleResize();
  const { width, height } = controls.screen;
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    controls.rotateSpeed = Math.PI * width / Math.min(width, height);
  }
}

/** Free rotation includes roll; the viewer owns camera presets and instance disposal. */
export function createModelTrackballControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement): TrackballControls {
  const controls = new TrackballControls(camera, canvas);
  controls.staticMoving = true;
  controls.noRotate = false; controls.noPan = false; controls.noZoom = false;
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  controls.keys = ['', '', ''];
  syncModelControlsViewport(controls);
  return controls;
}

const HALF_FOV = Math.PI / 8;

export function getCameraFit(bounds: ParsedModel['boundsMm'], width: number, height: number,
  view?: { direction: Vector3; up: Vector3 }) {
  const halfSize = new Vector3().fromArray(bounds.max).sub(new Vector3().fromArray(bounds.min)).multiplyScalar(0.5);
  const radius = Math.max(halfSize.length(), 1e-10);
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const near = radius * 0.001;
  const tanY = Math.tan(HALF_FOV);
  const halfFov = Math.min(HALF_FOV, Math.atan(tanY * aspect));
  let distance = radius / Math.sin(halfFov) * 1.15;
  if (view) {
    const toCameraSpace = new Matrix4().lookAt(view.direction, new Vector3(), view.up).transpose();
    const corner = new Vector3();
    const fill = 0.9;
    distance = near * 2;
    // Each corner must fit both axes at its own perspective depth (distance - corner.z).
    for (const x of [-halfSize.x, halfSize.x]) {
      for (const y of [-halfSize.y, halfSize.y]) {
        for (const z of [-halfSize.z, halfSize.z]) {
          corner.set(x, y, z).applyMatrix4(toCameraSpace);
          distance = Math.max(distance, corner.z + Math.max(
            Math.abs(corner.x) / (fill * tanY * aspect), Math.abs(corner.y) / (fill * tanY), near * 2,
          ));
        }
      }
    }
  }
  return { distance, near, far: distance * 10 + radius * 10, radius, aspect };
}
