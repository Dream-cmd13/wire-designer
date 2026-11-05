import * as THREE from 'three';
import { extractFaceMesh, findFaceRange } from './modelFaces';
import { extractSurfaceEdges } from './modelEdges';
import type { ModelSelection, ParsedMesh } from './modelTypes';

export function resolveModelSelection(meshes: readonly ParsedMesh[], meshIndex: number, triangleIndex: number): ModelSelection {
  const mesh = meshes[meshIndex];
  if (!Number.isInteger(meshIndex) || !mesh || !Number.isInteger(triangleIndex) || triangleIndex < 0 || triangleIndex >= mesh.indices.length/3) return null;
  const face = mesh.faceRanges && findFaceRange(mesh.faceRanges,triangleIndex);
  return face ? {kind:'face',meshIndex,faceId:face.faceId} : {kind:'mesh',meshIndex};
}

/** Owns only selection resources. Solids and their shared materials belong to Viewer. */
export function createModelSelectionLayer(meshes: readonly ParsedMesh[], solids: readonly THREE.Mesh[], group: THREE.Group) {
  let selection: ModelSelection = null;
  let release: (() => void) | undefined;
  const clear = () => { release?.(); release = undefined; selection = null; };
  const select = (next: ModelSelection) => {
    if (selection?.kind === next?.kind && selection?.meshIndex === next?.meshIndex &&
      (selection?.kind !== 'face' || (next?.kind === 'face' && selection.faceId === next.faceId))) return;
    clear();
    if (!next) return;
    const solid = solids[next.meshIndex]; const mesh = meshes[next.meshIndex];
    if (!solid || !mesh) return;
    if (next.kind === 'mesh') {
      const original = solid.material;
      const material = new THREE.MeshBasicMaterial({color:'#FFD54F',side:THREE.DoubleSide,toneMapped:false});
      solid.material = material;
      release = () => { solid.material = original; material.dispose(); };
    } else {
      const range = mesh.faceRanges?.find((face) => face.faceId === next.faceId);
      if (!range) return;
      const compact = extractFaceMesh(mesh,range);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(compact.positions,3));
      geometry.setIndex(new THREE.BufferAttribute(compact.indices,1));
      if (compact.normals) geometry.setAttribute('normal',new THREE.BufferAttribute(compact.normals,3));
      const material = new THREE.MeshBasicMaterial({color:'#FFD54F',opacity:0.45,transparent:true,depthTest:true,depthWrite:false,
        side:THREE.DoubleSide,forceSinglePass:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false});
      const fill = new THREE.Mesh(geometry,material); fill.renderOrder = 1; group.add(fill);
      let boundary: THREE.LineSegments | undefined;
      // A display-boundary budget failure never removes the selected face fill.
      try {
        const edges = extractSurfaceEdges(compact,[{first:0,last:compact.indices.length/3-1}]);
        const edgeGeometry = new THREE.BufferGeometry(); edgeGeometry.setAttribute('position',new THREE.BufferAttribute(edges,3));
        boundary = new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:'#FFD600',depthTest:true,depthWrite:false,toneMapped:false}));
        boundary.renderOrder = 2; group.add(boundary);
      } catch { /* Optional outline; solid and face fill remain available. */ }
      release = () => {
        group.remove(fill); geometry.dispose(); material.dispose();
        if (boundary) { group.remove(boundary); boundary.geometry.dispose(); (boundary.material as THREE.Material).dispose(); }
      };
    }
    selection = next;
  };
  return {select,clear};
}
