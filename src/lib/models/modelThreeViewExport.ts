import * as THREE from 'three';
import { safeFilename } from '@/lib/designFile';
import { buildImagePdf } from '@/lib/drawingExport';
import { DRAWING_FONT_FAMILY } from '@/lib/drawingFont';
import type { ParsedModel, Vec3 } from './modelTypes';

export const MODEL_FRONT_DIRECTIONS: Record<'-Y' | '+Y' | '-X' | '+X' | '-Z' | '+Z', Vec3> = {
  '-Y': [0,-1,0], '+Y': [0,1,0], '-X': [-1,0,0], '+X': [1,0,0], '-Z': [0,0,-1], '+Z': [0,0,1],
};
export type ModelFrontDirection = keyof typeof MODEL_FRONT_DIRECTIONS;
export const DEFAULT_MODEL_FRONT: ModelFrontDirection = '-Y';
const viewNames = { right: '右视', front: '前视', top: '顶视' };
type Rect = { x: number; y: number; width: number; height: number };
type Projection = { direction: Vec3; up: Vec3; horizontal: Vec3; sizeMm: [number, number]; rect: Rect };

// Match the 802 × 535 pt image area in buildImagePdf, not the full MediaBox.
const pdfRaster = { width: 2406, height: 1605 };
const viewPadding = 4;
const cells = {
  right: { x: 78, y: 100, width: 1056, height: 625 },
  front: { x: 1272, y: 100, width: 1056, height: 625 },
  top: { x: 1272, y: 870, width: 1056, height: 625 },
} satisfies Record<keyof typeof viewNames, Rect>;

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1]*b[2] - a[2]*b[1] || 0, a[2]*b[0] - a[0]*b[2] || 0, a[0]*b[1] - a[1]*b[0] || 0];
}

export function getModelThreeViewLayout({ min, max }: ParsedModel['boundsMm'], front: ModelFrontDirection) {
  const spans: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (spans.some((value) => !Number.isFinite(value) || value < 0) || !spans.some((value) => value > 0)) {
    throw new Error('模型包围盒无效，无法生成三视图。');
  }
  const center: Vec3 = [min[0] + spans[0]/2, min[1] + spans[1]/2, min[2] + spans[2]/2];
  const f = MODEL_FRONT_DIRECTIONS[front];
  const u: Vec3 = f[2] === 0 ? [0,0,1] : [0,1,0];
  const r = cross(u, f);
  // With axis-aligned cameras, the projected bounds of all eight corners reduce to two AABB spans.
  const spanAlong = (axis: Vec3) => spans[axis.findIndex((value) => value !== 0)];
  const project = (direction: Vec3, up: Vec3, rect: Rect): Projection => {
    const horizontal = cross(up, direction);
    return { direction, up, horizontal, sizeMm: [spanAlong(horizontal), spanAlong(up)], rect };
  };
  const views = {
    right: project(r, u, cells.right),
    front: project(f, u, cells.front),
    top: project(u, [-f[0] || 0, -f[1] || 0, -f[2] || 0], cells.top),
  };
  const pixelsPerMm = Math.min(...Object.values(views).map(({ sizeMm: [w, h], rect }) => fit(w, h, rect.width - 2 * viewPadding, rect.height - 2 * viewPadding)));
  return { views, center, pixelsPerMm, radius: Math.hypot(...spans)/2 };
}

function fit(w: number, h: number, width: number, height: number) {
  return Math.min(w > 0 ? width / w : Infinity, h > 0 ? height / h : Infinity);
}

export function getModelThreeViewFilename(sourceName: string) {
  const base = sourceName.trim().replace(/\.(step|stp|stl)$/i, '').trim();
  return `${safeFilename(base || '模型')}_三视图.pdf`;
}

function drawEdgeOnProjection(context: CanvasRenderingContext2D, model: ParsedModel, center: Vec3, view: Projection, rect: Rect, scale: number) {
  const { x, y, width, height } = rect;
  const horizontal = view.sizeMm[0] >= view.sizeMm[1];
  const length = horizontal ? width : height;
  const along = horizontal ? view.horizontal : view.up;
  const axis = along.findIndex(value => value !== 0);
  const signedScale = scale * along[axis] * (horizontal ? 1 : -1);
  const coverage = new Int32Array(length + 1);
  const pixel = (positions: Float32Array, index: number) => (positions[index * 3 + axis] - center[axis]) * signedScale + length / 2;
  // A subpixel-wide orthographic image is the union of projected triangle intervals.
  // Keep gaps along its long axis; a bounding-box line would invent material there.
  for (const { positions, indices } of model.meshes) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = pixel(positions, indices[i]), b = pixel(positions, indices[i+1]), c = pixel(positions, indices[i+2]);
      const start = Math.max(0, Math.round(Math.min(a, b, c)));
      const end = Math.min(length, Math.max(start + 1, Math.round(Math.max(a, b, c))));
      if (start < end) { coverage[start]++; coverage[end]--; }
    }
  }
  context.fillStyle = '#fff';
  context.fillRect(x, y, width, height);
  context.fillStyle = '#39434c';
  let active = 0, start = 0;
  for (let i = 0; i <= length; i++) {
    const next = active + coverage[i];
    if (!active && next) start = i;
    if (active && !next) {
      if (horizontal) context.fillRect(x + start, y + Math.floor(height / 2), i - start, 1);
      else context.fillRect(x + Math.floor(width / 2), y + start, 1, i - start);
    }
    active = next;
  }
}

function createProjectionRenderer(model: ParsedModel, center: Vec3, radius: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, radius, radius * 5);
  const material = new THREE.MeshLambertMaterial({ color: 0xb4bcc4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x39434c });
  const geometries: THREE.BufferGeometry[] = [];
  const dispose = () => {
    geometries.forEach((geometry) => geometry.dispose());
    material.dispose(); lineMaterial.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  const centered = (positions: Float32Array) => new THREE.BufferAttribute(positions.map((value, i) => value - center[i % 3]), 3);
  try {
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const light = new THREE.DirectionalLight(0xffffff, 1.7);
    scene.add(light);
    for (const mesh of model.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometries.push(geometry);
      geometry.setAttribute('position', centered(mesh.positions));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      else geometry.computeVertexNormals();
      scene.add(new THREE.Mesh(geometry, material));
      const preparedEdges = mesh.stlCreaseEdges ?? mesh.surfaceEdges;
      if (preparedEdges?.length === 0) continue;
      const edges = preparedEdges ? new THREE.BufferGeometry() : new THREE.EdgesGeometry(geometry, 30);
      geometries.push(edges);
      if (preparedEdges) edges.setAttribute('position', centered(preparedEdges));
      scene.add(new THREE.LineSegments(edges, lineMaterial));
    }
    return {
      dispose,
      isContextLost: () => renderer.getContext().isContextLost(),
      renderTo(context: CanvasRenderingContext2D, view: Projection, rect: Rect, scale: number) {
        if (Math.min(...view.sizeMm) * scale < 1) {
          drawEdgeOnProjection(context, model, center, view, rect, scale);
          return;
        }
        const { x, y, width, height } = rect;
        const halfWidth = width / (2 * scale), halfHeight = height / (2 * scale);
        camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
        camera.position.fromArray(view.direction).multiplyScalar(radius * 3);
        camera.up.fromArray(view.up);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        light.position.fromArray(view.direction)
          .addScaledVector(new THREE.Vector3(...view.up), 0.7)
          .addScaledVector(new THREE.Vector3(...view.horizontal), -0.5);
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
        if (renderer.getContext().isContextLost()) throw new Error('三视图渲染中断，请重试。');
        context.drawImage(renderer.domElement, x, y);
      },
    };
  } catch (cause) {
    dispose();
    throw cause;
  }
}

function canvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建三视图画布。');
  return context;
}

function hasModelPixels(context: CanvasRenderingContext2D, { x, y, width, height }: Rect) {
  const { data } = context.getImageData(x, y, width, height);
  for (let i = 0; i < data.length; i += 4) if (data[i+3] && data[i] < 245) return true;
  return false;
}

export function createModelThreeViewRenderer(model: ParsedModel) {
  const { center, radius } = getModelThreeViewLayout(model.boundsMm, DEFAULT_MODEL_FRONT);
  const source = createProjectionRenderer(model, center, radius);
  return {
    dispose: source.dispose,
    isContextLost: source.isContextLost,
    draw(canvas: HTMLCanvasElement, front: ModelFrontDirection) {
      const { width, height } = canvas;
      const context = canvasContext(canvas);
      const { views } = getModelThreeViewLayout(model.boundsMm, front);
      const [w, h] = views.front.sizeMm;
      const rect = { x: 0, y: 0, width, height };
      source.renderTo(context, views.front, rect, fit(w, h, width - 40, height - 32));
      if (!hasModelPixels(context, rect)) throw new Error('当前前视方向未绘制出模型。');
    },
    buildPdf(sourceName: string, front: ModelFrontDirection, signal: AbortSignal) {
      return buildModelThreeViewPdf(source, model, sourceName, front, signal);
    },
  };
}

function addLabels(context: CanvasRenderingContext2D, sourceName: string, front: ModelFrontDirection) {
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 2;
  context.strokeRect(26, 26, pdfRaster.width - 52, pdfRaster.height - 52);
  context.fillStyle = '#0f172a';
  context.font = `bold 44px ${DRAWING_FONT_FAMILY}`;
  context.textAlign = 'center';
  for (const key of Object.keys(cells) as (keyof typeof cells)[]) {
    const { x, y, width, height } = cells[key];
    context.fillText(viewNames[key], x + width/2, y + height + 60);
  }
  context.textAlign = 'left';
  context.fillText('模型', 120, 1030);
  context.font = `40px ${DRAWING_FONT_FAMILY}`;
  // Wrap the displayed filename within its own quadrant; the download name remains independent.
  let line = '', index = 0;
  for (const character of (sourceName.trim() || '模型')) {
    if (context.measureText(line + character + '…').width > 955) {
      if (index === 2) { line += '…'; break; }
      context.fillText(line, 120, 1090 + index++ * 52);
      line = '';
    }
    line += character;
  }
  context.fillText(line, 120, 1090 + index * 52);
  context.fillStyle = '#334155';
  context.font = `36px ${DRAWING_FONT_FAMILY}`;
  context.fillText(`第一角法｜三视图同比例｜前视从 ${front.replace('-', '−')} 看`, 120, 1345);
  context.fillText('仅供外形参考，不用于加工或量测', 120, 1410);
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function buildModelThreeViewPdf(source: ReturnType<typeof createProjectionRenderer>, model: ParsedModel, sourceName: string, front: ModelFrontDirection, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const { views, pixelsPerMm } = getModelThreeViewLayout(model.boundsMm, front);
  const canvas = document.createElement('canvas');
  canvas.width = pdfRaster.width; canvas.height = pdfRaster.height;
  const context = canvasContext(canvas);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const key of Object.keys(viewNames) as (keyof typeof viewNames)[]) {
    await yieldToUi();
    signal.throwIfAborted();
    const view = views[key];
    source.renderTo(context, view, view.rect, pixelsPerMm);
    if (!hasModelPixels(context, view.rect)) throw new Error(`未能绘制模型${viewNames[key]}图，请重试。`);
  }
  addLabels(context, sourceName, front);
  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob?.type === 'image/jpeg' ? resolve(blob) : reject(new Error('三视图图像编码失败，请重试。')), 'image/jpeg', 0.96);
  });
  const image = await jpeg.arrayBuffer();
  signal.throwIfAborted();
  const pdf = buildImagePdf(new Uint8Array(image), canvas.width, canvas.height);
  return new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
}
