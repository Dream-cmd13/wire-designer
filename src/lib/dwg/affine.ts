import type { DwgPoint } from '@/lib/dwg/dwgTypes';

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_AFFINE: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export interface Similarity {
  scale: number;
  rotation: number;
  mirrored: boolean;
}

export function applyAffine(transform: Affine, point: DwgPoint): DwgPoint {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  };
}

/** 先应用 inner，再应用 outer。 */
export function multiplyAffine(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function translationAffine(x: number, y: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function scaleAffine(x: number, y: number): Affine {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

export function rotationAffine(angle: number): Affine {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** 判断是否为相似变换（等比缩放 + 旋转，可能含镜像）；非相似时返回 null。 */
export function similarityOf(transform: Affine): Similarity | null {
  const scaleX = Math.hypot(transform.a, transform.b);
  const scaleY = Math.hypot(transform.c, transform.d);
  if (scaleX === 0 || scaleY === 0) return null;
  const orthogonal = (transform.a * transform.c + transform.b * transform.d) / (scaleX * scaleY);
  if (Math.abs(orthogonal) > 1e-9) return null;
  if (Math.abs(scaleX - scaleY) > 1e-9 * Math.max(scaleX, scaleY)) return null;
  return {
    scale: scaleX,
    rotation: Math.atan2(transform.b, transform.a),
    mirrored: transform.a * transform.d - transform.b * transform.c < 0,
  };
}
