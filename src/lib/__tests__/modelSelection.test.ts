import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveModelSelection, createModelSelectionLayer } from '../models/modelSelection';
import type { ParsedMesh } from '../models/modelTypes';

const mesh = (): ParsedMesh => ({name:'part',positions:new Float32Array([0,0,0,2,0,0,2,1,0,0,1,0,0,0,1]),
  indices:new Uint32Array([0,1,2,0,2,3,0,4,1]),faceRanges:[{faceId:0,firstTriangle:0,lastTriangle:1},{faceId:1,firstTriangle:2,lastTriangle:2}]});
describe('model picking and a single owned selection layer', () => {
  it('resolves inclusive CAD faces locally to the hit mesh and falls back to whole mesh', () => {
    const meshes = [mesh(),{...mesh(),faceRanges:undefined}];
    expect(resolveModelSelection(meshes,0,0)).toEqual({kind:'face',meshIndex:0,faceId:0});
    expect(resolveModelSelection(meshes,0,1)).toEqual({kind:'face',meshIndex:0,faceId:0});
    expect(resolveModelSelection(meshes,0,2)).toEqual({kind:'face',meshIndex:0,faceId:1});
    expect(resolveModelSelection(meshes,1,2)).toEqual({kind:'mesh',meshIndex:1});
    for (const [m,t] of [[-1,0],[2,0],[0,-1],[0,3],[0,0.5],[NaN,0],[0,NaN]]) expect(resolveModelSelection(meshes,m,t)).toBeNull();
  });
  it('highlights the full face with compact geometry, reuses repeated selection, and disposes replaced layers once', () => {
    const source = mesh(); const group = new THREE.Group(); const material = new THREE.MeshStandardMaterial();
    const solid = new THREE.Mesh(new THREE.BufferGeometry(),material); group.add(solid);
    const layer = createModelSelectionLayer([source],[solid],group);
    layer.select({kind:'face',meshIndex:0,faceId:0});
    const fill = group.children.find((object) => object !== solid && object instanceof THREE.Mesh) as THREE.Mesh;
    expect(fill.geometry.index!.count).toBe(6); expect(fill.geometry.getAttribute('position').count).toBe(4);
    expect(group.children).toHaveLength(3);
    expect(fill.material).toMatchObject({depthTest:true,depthWrite:false,polygonOffset:true,opacity:0.45});
    const geometryDispose = vi.spyOn(fill.geometry,'dispose'); const materialDispose = vi.spyOn(fill.material as THREE.Material,'dispose');
    layer.select({kind:'face',meshIndex:0,faceId:0}); expect(group.children).toContain(fill); expect(geometryDispose).not.toHaveBeenCalled();
    layer.select({kind:'face',meshIndex:0,faceId:1}); expect(group.children).not.toContain(fill);
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
    layer.clear(); layer.clear(); expect(group.children).toEqual([solid]);
    expect(geometryDispose).toHaveBeenCalledOnce(); expect(source.indices).toEqual(new Uint32Array([0,1,2,0,2,3,0,4,1]));
    material.dispose(); solid.geometry.dispose();
  });
  it('restores a fallback mesh material without mutating or disposing shared solid material', () => {
    const material = new THREE.MeshStandardMaterial({color:0x123456}); const dispose = vi.spyOn(material,'dispose');
    const solids = [new THREE.Mesh(new THREE.BufferGeometry(),material),new THREE.Mesh(new THREE.BufferGeometry(),material)];
    const group = new THREE.Group(); group.add(...solids);
    const layer = createModelSelectionLayer([mesh(),mesh()],solids,group);
    layer.select({kind:'mesh',meshIndex:1}); expect(solids[0].material).toBe(material); expect(solids[1].material).not.toBe(material);
    const selectedDispose = vi.spyOn(solids[1].material,'dispose');
    layer.clear(); layer.clear(); expect(solids[1].material).toBe(material); expect(dispose).not.toHaveBeenCalled(); expect(selectedDispose).toHaveBeenCalledOnce();
    material.dispose(); solids.forEach((solid) => solid.geometry.dispose());
  });
  it('also highlights the visible reverse side of an open CAD face in a single transparent pass', () => {
    const source=mesh(); const group=new THREE.Group();
    const solid=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({side:THREE.DoubleSide})); group.add(solid);
    const layer=createModelSelectionLayer([source],[solid],group); layer.select({kind:'face',meshIndex:0,faceId:0});
    const fill=group.children.find((object)=>object!==solid && object instanceof THREE.Mesh) as THREE.Mesh;
    group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(1,0.5,-1),new THREE.Vector3(0,0,1));
    expect(ray.intersectObject(fill)).not.toHaveLength(0);
    expect(fill.material).toMatchObject({forceSinglePass:true});
    layer.clear(); solid.geometry.dispose(); (solid.material as THREE.Material).dispose();
  });
  it('keeps a selected fallback mesh visible and pickable from its reverse side', () => {
    const source=mesh(); const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(source.positions,3)); geometry.setIndex(new THREE.BufferAttribute(source.indices,1));
    const original=new THREE.MeshStandardMaterial({side:THREE.DoubleSide}); const solid=new THREE.Mesh(geometry,original);
    const group=new THREE.Group(); group.add(solid); group.updateMatrixWorld(true);
    const layer=createModelSelectionLayer([source],[solid],group);
    const ray=new THREE.Raycaster(new THREE.Vector3(1,0.5,-1),new THREE.Vector3(0,0,1));
    expect(ray.intersectObject(solid)).toHaveLength(2);
    layer.select({kind:'mesh',meshIndex:0});
    expect(ray.intersectObject(solid)).toHaveLength(2);
    layer.select({kind:'mesh',meshIndex:0}); expect(ray.intersectObject(solid)).toHaveLength(2);
    layer.clear(); expect(solid.material).toBe(original); geometry.dispose(); original.dispose();
  });
});
