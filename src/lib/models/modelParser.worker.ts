import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { normalizeMeshes, STEP_OPTIONS, STL_UNIT_SCALE, type ParsedMesh, type ParseReply, type ParseRequest } from './modelTypes';

interface OcctResult {
  success: boolean;
  meshes: { name: string; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } }[];
}
interface OcctEngine { ReadStepFile(bytes: Uint8Array, options: typeof STEP_OPTIONS): OcctResult }
type OcctFactory = (options: { locateFile: (file: string) => string }) => Promise<OcctEngine>;

self.onmessage = async ({ data }: MessageEvent<ParseRequest>) => {
  const { requestId, buffer, format, stlUnit, assetBase } = data;
  const reply = (message: ParseReply) => self.postMessage(message);
  try {
    let meshes: ParsedMesh[];
    if (format === 'step') {
      reply({ requestId, type: 'phase', phase: 'engine' });
      // Same-origin ESM wrapper of the package's published glue; no runtime CDN.
      const engineUrl = `${assetBase}occt-import-js.mjs`;
      const { default: factory } = await import(/* @vite-ignore */ engineUrl) as { default: OcctFactory };
      const engine = await factory({ locateFile: (file) => `${assetBase}${file}` });
      reply({ requestId, type: 'phase', phase: 'parsing' });
      const result = engine.ReadStepFile(new Uint8Array(buffer), STEP_OPTIONS);
      if (!result.success) throw new Error('STEP 解析失败，请检查文件是否损坏或未包含可显示实体。');
      // OCCT already applies assembly placements to exported meshes; use all of them.
      meshes = result.meshes.map((mesh) => {
        if (!mesh.index.array.every((value) => Number.isInteger(value) && value >= 0)) throw new Error('模型索引无效。');
        return { name: mesh.name, positions: new Float32Array(mesh.attributes.position.array), normals: mesh.attributes.normal ? new Float32Array(mesh.attributes.normal.array) : undefined, indices: new Uint32Array(mesh.index.array) };
      });
    } else {
      reply({ requestId, type: 'phase', phase: 'parsing' });
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      const positions = new Float32Array(geometry.getAttribute('position').array);
      const normal = geometry.getAttribute('normal');
      meshes = [{ name: 'STL', positions, normals: normal ? new Float32Array(normal.array) : undefined, indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) }];
      geometry.dispose();
    }
    const model = normalizeMeshes(meshes, format === 'stl' ? STL_UNIT_SCALE[stlUnit] : 1);
    const transfers: Transferable[] = [];
    for (const mesh of model.meshes) {
      transfers.push(mesh.positions.buffer as ArrayBuffer, mesh.indices.buffer as ArrayBuffer);
      if (mesh.normals) transfers.push(mesh.normals.buffer as ArrayBuffer);
    }
    self.postMessage({ requestId, type: 'result', model } satisfies ParseReply, { transfer: transfers });
  } catch (error) {
    reply({ requestId, type: 'error', message: error instanceof Error ? `模型解析失败：${error.message} 请检查文件或重新加载引擎后重试。` : '模型解析失败，请检查文件后重试。' });
  }
};
