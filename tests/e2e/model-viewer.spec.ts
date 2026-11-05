import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { dirname, join, basename } from 'node:path';
import { twoTetrahedraStep, roundedCylinderStep } from './model-fixtures';

// Auth/API fixtures are intercepted locally. The actual Worker, OCCT WASM,
// STLLoader and WebGL run unmocked. Never sends credentials/files to an external host.
const uid = '00000000-0000-4000-8000-000000000001';
const stepPath = process.env.MODEL_PREVIEW_STEP_PATH;
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'local-fixture@example.test', created_at: '2026-01-01T00:00:00Z', user_metadata: {}, app_metadata: { provider: 'email' } };
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.local-fixture`;

interface LocalCloud { records: Record<string, unknown>[]; original: Buffer; object: Buffer | null; uploads: number; finalizeFailures: number }
async function localLogin(page: Page, role = 'engineer', cloud?: LocalCloud) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['localhost','127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/storage/v1/')) return route.continue();
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: jwt, refresh_token: 'local-fixture', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user } });
    if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/rpc/current_app_role')) return route.fulfill({ json: role });
    if (url.pathname.endsWith('/rpc/get_storage_bootstrap_status')) return route.fulfill({ json: ['catalog-assets','dwg-drawings','model-files'].map((bucket_id) => ({ bucket_id, is_present: true, is_public: false })) });
    if (cloud && url.pathname.endsWith('/rest/v1/model_assets')) {
      const method = route.request().method();
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const record = cloud.records.find((row) => row.id === id);
      if (method === 'POST') {
        const value = route.request().postDataJSON() as Record<string, unknown>;
        cloud.records.push(value); return route.fulfill({ json: value });
      }
      if (method === 'PATCH') {
        if (cloud.finalizeFailures-- > 0) return route.fulfill({ status: 503, json: { message: 'local finalize failure' } });
        if (record) Object.assign(record, { status: 'ready' });
        return route.fulfill({ json: record ?? null });
      }
      return route.fulfill({ json: id ? record ?? null : cloud.records });
    }
    if (cloud && url.pathname.includes('/storage/v1/object/sign/model-files/')) {
      if (route.request().method() === 'POST') return cloud.object
        ? route.fulfill({ json: { signedURL: `${url.pathname.replace('/storage/v1','')}?token=local-only` } })
        : route.fulfill({ status: 400, json: { statusCode: '404', error: 'not_found', message: 'Object not found' } });
      return cloud.object ? route.fulfill({ body: cloud.object, contentType: 'application/octet-stream' }) : route.fulfill({ status: 404 });
    }
    if (cloud && url.pathname.includes('/storage/v1/object/model-files/')) {
      expect(route.request().headers()['x-upsert']).toBe('false');
      expect(route.request().postDataBuffer()?.includes(cloud.original)).toBe(true);
      cloud.object = cloud.original; cloud.uploads++;
      return route.fulfill({ json: { Id: 'object-local', Key: url.pathname.replace('/storage/v1/object/', '') } });
    }
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    return route.abort('blockedbyclient');
  });
  await page.goto('/model-viewer');
  await page.getByRole('button', { name: '登录', exact: true }).first().click();
  await page.getByPlaceholder('用户名或 name@example.com').fill('local-fixture@example.test');
  await page.locator('input[type="password"]').fill('local-fixture-only');
  await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click();
  if (role !== 'sales') await expect(page.getByRole('heading', { name: '3D 模型', exact: true })).toBeVisible();
}
function asciiStl() {
  const faces = [[[0,0,0],[0,3,0],[2,0,0]], [[0,0,0],[2,0,0],[0,0,4]], [[0,0,0],[0,0,4],[0,3,0]], [[2,0,0],[0,3,0],[0,0,4]]];
  return Buffer.from(`solid tetra\n${faces.map((v) => `facet normal 0 0 0\nouter loop\n${v.map((p) => `vertex ${p.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid tetra`);
}
function binaryStl() {
  const buffer = Buffer.alloc(84 + 50); buffer.writeUInt32LE(1,80);
  [0,0,0,2,0,0,0,3,4].forEach((v,i) => buffer.writeFloatLE(v, 96+i*4));
  return buffer;
}
async function uploadLocal(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel('选择模型文件').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.getByTestId('model-bounds')).toBeVisible();
  await expect(page.locator('[aria-label="三维模型画布"] canvas')).toBeVisible();
}

async function trackViewerResources(page: Page) {
  await page.addInitScript(() => {
    const liveBuffers = new Set<WebGLBuffer>(); const activeWorkers = new Set<Worker>();
    const pendingFrames = new Set<number>();
    const raf = window.requestAnimationFrame.bind(window); const cancelRaf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => { const id = raf((time) => { pendingFrames.delete(id); callback(time); }); pendingFrames.add(id); return id; };
    window.cancelAnimationFrame = (id) => { pendingFrames.delete(id); cancelRaf(id); };
    const stats = { created: 0, deleted: 0, workersCreated: 0, drawCalls:0, triangles:0, parse:[] as {triangles:number; faces:number; meshes:number}[], get live() { return liveBuffers.size; }, get workers() { return activeWorkers.size; }, get raf() { return pendingFrames.size; } };
    Reflect.set(window, '__modelResources', stats);
    let pickStarted = 0;
    const pickDurations: number[] = []; Reflect.set(window,'__modelPickDurations',pickDurations);
    document.addEventListener('pointerup',() => {pickStarted=performance.now();},true);
    document.addEventListener('pointerup',() => {pickDurations.push(performance.now()-pickStarted);});
    Reflect.set(window, '__modelMatrices', {});
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); activeWorkers.add(this); stats.workersCreated++;
        this.addEventListener('message',({data}) => {
          if (data.type === 'result') {
            Reflect.set(window,'__modelParsedModel',data.model);
            stats.parse.push({triangles:data.model.triangleCount,meshes:data.model.meshes.length,
              faces:data.model.meshes.reduce((count: number,mesh: {faceRanges?:unknown[]}) => count+(mesh.faceRanges?.length ?? 0),0)});
          }
        });
      }
      terminate() { activeWorkers.delete(this); super.terminate(); }
    };
    for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!constructor) continue;
      const prototype = constructor.prototype; const names = new Map<WebGLUniformLocation, string>();
      const create = prototype.createBuffer; const remove = prototype.deleteBuffer;
      const location = prototype.getUniformLocation; const matrix = prototype.uniformMatrix4fv;
      const clear = prototype.clear; const drawElements = prototype.drawElements; const drawArrays = prototype.drawArrays;
      Object.defineProperty(prototype,'clear',{value:function(this:WebGLRenderingContext,mask:number) {
        stats.drawCalls = 0; stats.triangles = 0; return clear.call(this,mask);
      }});
      Object.defineProperty(prototype,'drawElements',{value:function(this:WebGLRenderingContext,mode:number,count:number,type:number,offset:number) {
        stats.drawCalls++; if(mode===this.TRIANGLES) stats.triangles += count/3;
        return drawElements.call(this,mode,count,type,offset);
      }});
      Object.defineProperty(prototype,'drawArrays',{value:function(this:WebGLRenderingContext,mode:number,first:number,count:number) {
        stats.drawCalls++; if(mode===this.TRIANGLES) stats.triangles += count/3;
        return drawArrays.call(this,mode,first,count);
      }});
      Object.defineProperty(prototype, 'createBuffer', { value: function(this: WebGLRenderingContext) {
        const buffer = create.call(this); if (buffer) { liveBuffers.add(buffer); stats.created++; } return buffer;
      } });
      Object.defineProperty(prototype, 'deleteBuffer', { value: function(this: WebGLRenderingContext, buffer: WebGLBuffer | null) {
        if (buffer && liveBuffers.delete(buffer)) stats.deleted++; return remove.call(this, buffer);
      } });
      Object.defineProperty(prototype, 'getUniformLocation', { value: function(this: WebGLRenderingContext, program: WebGLProgram, name: string) {
        const value = location.call(this, program, name); if (value) names.set(value, name); return value;
      } });
      Object.defineProperty(prototype, 'uniformMatrix4fv', { value: function(this: WebGLRenderingContext, uniform: WebGLUniformLocation | null, transpose: boolean, values: Float32List) {
        if (uniform && names.has(uniform)) Reflect.get(window, '__modelMatrices')[names.get(uniform)!] = Array.from(values);
        return matrix.call(this, uniform, transpose, values);
      } });
    }
  });
}

async function cameraMatrix(page: Page): Promise<number[]> {
  // Without environment mapping WebGL can optimize viewMatrix out; modelViewMatrix
  // remains active. Quality may shift the Float32-derived center by a few ulps.
  const matrix = await page.evaluate(() => Reflect.get(window, '__modelMatrices').modelViewMatrix);
  expect(matrix).toHaveLength(16);
  return matrix;
}

function rotationPart(matrix: number[]) { return [0,1,2,4,5,6,8,9,10].map((i) => matrix[i]); }
function rotationChange(before: number[], after: number[]) { return Math.hypot(...rotationPart(after).map((value, i) => value - rotationPart(before)[i])); }
function directionChange(before: number[], after: number[]) {
  const a = [before[2],before[6],before[10]]; const b = [after[2],after[6],after[10]];
  return Math.acos(Math.min(1,Math.max(-1,a.reduce((sum,value,i) => sum+value*b[i],0)/(Math.hypot(...a)*Math.hypot(...b)))));
}
async function settleViewer(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function dragCanvas(page: Page, dx: number, dy: number, button: 'left' | 'right' | 'middle' = 'left') {
  const rect = (await page.locator('[aria-label="三维模型画布"] canvas').boundingBox())!;
  const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
  await page.mouse.move(x,y); await page.mouse.down({ button });
  // Sample at animation-frame boundaries: Trackball consumes deltas during update().
  for (let i=1;i<=10;i++) { await page.mouse.move(x+dx*i/10,y+dy*i/10); await settleViewer(page); }
  await page.mouse.up({ button }); await settleViewer(page);
}

async function yellowPixels(page: Page) {
  const screenshot = await page.locator('[aria-label="三维模型画布"] canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image,0,0);
    const data = context.getImageData(0,0,canvas.width,canvas.height).data; let yellow=0;
    for(let i=0;i<data.length;i+=4) if(data[i]>data[i+2]+35 && data[i+1]>data[i+2]+25 && data[i]>=data[i+1]) yellow++;
    return yellow;
  },screenshot.toString('base64'));
}

test('calibrated 100px rotation is stable across sidebar and fullscreen',async ({page},testInfo) => {
  await trackViewerResources(page); await localLogin(page); await uploadLocal(page,'calibration.stl',asciiStl());
  const measurements = [];
  for(const layout of ['sidebar','collapsed','fullscreen']) {
    if(layout==='collapsed') await page.getByRole('button',{name:'收起云端模型',exact:true}).click();
    if(layout==='fullscreen') await page.getByRole('button',{name:'全屏查看',exact:true}).click();
    await settleViewer(page);
    for(const [dx,dy] of [[100,0],[0,100]]) {
      await page.getByRole('button',{name:'前视',exact:true}).click(); await settleViewer(page);
      const rect = (await page.locator('[aria-label="三维模型画布"] canvas').boundingBox())!;
      const before = await cameraMatrix(page); await dragCanvas(page,dx,dy);
      const actual = directionChange(before,await cameraMatrix(page))*180/Math.PI;
      const expected = 360*100/Math.min(rect.width,rect.height);
      expect(await page.locator('[aria-label="三维模型画布"] canvas').boundingBox()).toEqual(rect);
      expect(Math.abs(actual-expected)).toBeLessThan(1);
      measurements.push({layout,width:rect.width,height:rect.height,dx,dy,actual,expected});
    }
  }
  await testInfo.attach('calibrated-angles',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
  console.log(JSON.stringify({calibratedAngles:measurements}));
});

test('real CAD face picking, visible yellow fill, occlusion, gestures and bounded resources',async ({page},testInfo) => {
  test.setTimeout(120_000);
  await trackViewerResources(page); await localLogin(page); await uploadLocal(page,'face-fixture.step',roundedCylinderStep());
  await page.getByRole('button',{name:'前视',exact:true}).click(); await settleViewer(page);
  const canvas = page.locator('[aria-label="三维模型画布"] canvas'); const rect = (await canvas.boundingBox())!;
  const center = {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  const initial = await page.evaluate(() => ({...Reflect.get(window,'__modelResources')}));
  expect(initial.parse.at(-1)).toMatchObject({meshes:1,faces:4});
  expect(await yellowPixels(page)).toBe(0);
  await page.mouse.click(center.x,center.y); await settleViewer(page);
  const selected = await page.getByTestId('model-selection').innerText(); expect(selected).toMatch(/^曲面 /);
  const yellow = await yellowPixels(page); expect(yellow).toBeGreaterThan(1000);
  const selectedResources = await page.evaluate(() => ({...Reflect.get(window,'__modelResources')}));
  expect(selectedResources.drawCalls-initial.drawCalls).toBeLessThanOrEqual(2);
  expect(selectedResources.triangles).toBeGreaterThan(initial.triangles);
  // The same curved face contains many triangles: a different point keeps the same layer.
  await page.mouse.click(center.x+20,center.y+20); await settleViewer(page);
  expect(await page.getByTestId('model-selection').innerText()).toBe(selected);
  expect(await yellowPixels(page)).toBe(yellow);
  expect(await page.evaluate(() => Reflect.get(window,'__modelResources').created)).toBe(selectedResources.created);
  await page.screenshot({path:testInfo.outputPath('cad-side-selected.png')});
  await page.mouse.move(center.x,center.y); await page.mouse.down(); await page.mouse.move(center.x+2,center.y); await page.mouse.up();
  expect(await page.getByTestId('model-selection').innerText()).toBe(selected);
  await page.mouse.down(); await page.mouse.move(center.x+50,center.y); await page.mouse.move(center.x,center.y); await page.mouse.up();
  expect(await page.getByTestId('model-selection').innerText()).toBe(selected);
  await dragCanvas(page,10,5,'right'); expect(await page.getByTestId('model-selection').innerText()).toBe(selected);
  await page.getByRole('button',{name:'顶视',exact:true}).click(); await settleViewer(page);
  // Selected cylinder side is hidden by the top, so yellow must not shine through it.
  expect(await yellowPixels(page)).toBeLessThan(yellow*0.1);
  await page.mouse.click(center.x,center.y); const topSelection = await page.getByTestId('model-selection').innerText();
  expect(topSelection).toMatch(/^曲面 /); expect(topSelection).not.toBe(selected);
  await page.screenshot({path:testInfo.outputPath('cad-top-selected.png')});
  await page.mouse.click(rect.x+5,rect.y+5); await expect(page.getByTestId('model-selection')).toHaveText('');
  await page.getByRole('button',{name:'前视',exact:true}).click();
  await page.mouse.click(center.x,center.y); await settleViewer(page);
  const baseline = await page.evaluate(() => ({...Reflect.get(window,'__modelResources')}));
  const live = [];
  for(let i=0;i<50;i++) {
    await page.getByRole('button',{name:'清除选择',exact:true}).click(); await page.mouse.click(center.x,center.y);
    await settleViewer(page); live.push(await page.evaluate(() => Reflect.get(window,'__modelResources').live));
  }
  expect(Math.max(...live)).toBeLessThanOrEqual(baseline.live);
  await page.getByLabel('显示质量').selectOption('fine'); await expect(page.getByText('精细已生效',{exact:true})).toBeVisible();
  await expect(page.getByTestId('model-selection')).toHaveText('');
  await page.mouse.click(center.x,center.y); await expect(page.getByTestId('model-selection')).toHaveText(/^曲面 /);
  await uploadLocal(page,'fallback.stl',asciiStl()); await expect(page.getByTestId('model-selection')).toHaveText('');
  await page.getByRole('button',{name:'前视',exact:true}).click();
  await page.mouse.click(center.x,center.y); await expect(page.getByTestId('model-selection')).toHaveText('网格：STL');
  const stats = await page.evaluate(() => ({...Reflect.get(window,'__modelResources')}));
  console.log(JSON.stringify({selectionResourceBaseline:baseline,selectionResourceLive50:live,after:stats}));
  await page.getByRole('button',{name:'首页',exact:true}).click();
  expect(await page.evaluate(() => ({live:Reflect.get(window,'__modelResources').live,raf:Reflect.get(window,'__modelResources').raf,workers:Reflect.get(window,'__modelResources').workers}))).toEqual({live:0,raf:0,workers:0});
});

async function dragPerformance(page: Page) {
  const rect = (await page.locator('[aria-label="三维模型画布"] canvas').boundingBox())!;
  const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.evaluate(() => {
    Reflect.set(window,'__modelFrameSample',new Promise<number[]>((resolve) => {
      const frames:number[]=[]; let previous=performance.now(); const start=previous;
      const sample=(time:number) => {
        frames.push(time-previous); previous=time;
        if(time-start<5000) requestAnimationFrame(sample); else resolve(frames.slice(1));
      };
      requestAnimationFrame(sample);
    }));
  });
  const start=Date.now(); let step=0;
  while(Date.now()-start<5000) {
    await page.mouse.move(x+80*Math.sin(step/12),y+60*Math.sin(step/19)); step++;
    await settleViewer(page);
  }
  await page.mouse.up(); await settleViewer(page);
  return page.evaluate(async () => {
    const frames:number[]=await Reflect.get(window,'__modelFrameSample'); frames.sort((a,b)=>a-b);
    const {drawCalls,triangles,created,live,workersCreated}=Reflect.get(window,'__modelResources');
    return {p50:frames[Math.floor(frames.length*0.5)],p95:frames[Math.floor(frames.length*0.95)],longFrames:frames.filter((value)=>value>50).length,
      frameCount:frames.length,drawCalls,triangles,created,live,workersCreated};
  });
}

async function profileRaycast(page: Page, ndc: [number,number]) {
  // Test-only replay of the real Worker geometry and current WebGL camera matrices.
  // Serve the pinned library to the browser without adding a production profiling API.
  await page.route('**/__model-test/three.core.js',route=>route.fulfill({contentType:'text/javascript',path:join(process.cwd(),'node_modules/three/build/three.core.js')}));
  return page.evaluate(async (ndc) => {
    const moduleUrl='/__model-test/three.core.js'; const THREE=await import(moduleUrl) as typeof import('three');
    const parsed=Reflect.get(window,'__modelParsedModel') as import('../../src/lib/models/modelTypes').ParsedModel;
    const matrices=Reflect.get(window,'__modelMatrices'); const camera=new THREE.PerspectiveCamera();
    camera.projectionMatrix.fromArray(matrices.projectionMatrix); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.matrixWorld.fromArray(matrices.modelViewMatrix).invert();
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const solids=parsed.meshes.map((mesh)=>{
      const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(mesh.positions,3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices,1)); return new THREE.Mesh(geometry,material);
    });
    const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(...ndc),camera);
    for(let i=0;i<10;i++) ray.intersectObjects(solids,false);
    const samples=[]; let hits=0;
    for(let i=0;i<30;i++) {const start=performance.now(); hits=ray.intersectObjects(solids,false).length; samples.push(performance.now()-start);}
    solids.forEach((solid)=>solid.geometry.dispose()); material.dispose(); samples.sort((a,b)=>a-b);
    return {p50:samples[15],p95:samples[28],hits,samples:30};
  },ndc);
}

test('private male_5 picking and three 5-second performance runs per quality and highlight state',async ({page},testInfo) => {
  test.skip(!stepPath || !existsSync(stepPath),'未提供外部 STEP，性能和私有孔洞样件未验证');
  test.setTimeout(300_000);
  await trackViewerResources(page); await localLogin(page);
  await page.getByLabel('选择模型文件').setInputFiles(stepPath!);
  await expect(page.getByTestId('model-bounds')).toBeVisible({timeout:65000});
  const canvas=page.locator('[aria-label="三维模型画布"] canvas');
  const environment=await canvas.evaluate((element) => {
    const gl=(element as HTMLCanvasElement).getContext('webgl2')!; const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const rect=element.getBoundingClientRect();
    return {width:rect.width,height:rect.height,dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent};
  });
  const records=[];
  for(const quality of ['standard','fine']) {
    await page.getByLabel('显示质量').selectOption(quality);
    await expect(page.getByText(quality==='fine'?'精细已生效':'标准已生效',{exact:true})).toBeVisible();
    await expect(page.getByTestId('model-selection')).toHaveText('');
    const qualityRecords=[];
    for(const highlighted of [false,true]) {
      await page.getByRole('button',{name:'前视',exact:true}).click();
      const rect=(await canvas.boundingBox())!;
      let pickMs: number | null = null;
      let raycast: Awaited<ReturnType<typeof profileRaycast>> | null = null;
      let pickedNdc: [number,number] = [0,0];
      if(highlighted) {
        // Sample only inside the fixed front-view model footprint; holes may be blank.
        for(const [fx,fy] of [[0,0],[-0.08,0],[0.08,0],[0,-0.1],[0,0.1]]) {
          await page.mouse.click(rect.x+rect.width/2+rect.height*fx,rect.y+rect.height/2+rect.height*fy);
          if(await page.getByTestId('model-selection').innerText()) {pickedNdc=[2*rect.height*fx/rect.width,-2*fy]; break;}
        }
        await expect(page.getByTestId('model-selection')).toHaveText(/^曲面 /);
        pickMs=await page.evaluate(()=>Reflect.get(window,'__modelPickDurations').at(-1));
        expect(await yellowPixels(page)).toBeGreaterThan(20);
        await page.screenshot({path:testInfo.outputPath(`male-5-${quality}-selected.png`)});
        raycast=await profileRaycast(page,pickedNdc); expect(raycast.hits).toBeGreaterThan(0);
      }
      // Warm up the shaders and pointer path before measuring.
      await dragCanvas(page,40,30); await page.getByRole('button',{name:'前视',exact:true}).click();
      const before=await page.evaluate(()=>({...Reflect.get(window,'__modelResources')}));
      const samples=[];
      for(let i=0;i<3;i++) {
        await page.getByRole('button',{name:'前视',exact:true}).click();
        samples.push(await dragPerformance(page));
      }
      for(const sample of samples) {
        expect(sample.workersCreated).toBe(before.workersCreated); expect(sample.created).toBe(before.created);
        expect(sample.drawCalls-before.drawCalls).toBeLessThanOrEqual(2);
      }
      qualityRecords.push({highlighted,parse:before.parse.at(-1),samples,pointerupMs:pickMs,isolatedRaycastMs:raycast});
      if(highlighted) {
        await page.getByRole('button',{name:'等轴测',exact:true}).click();
        await page.screenshot({path:testInfo.outputPath(`male-5-${quality}-selected-iso-holes.png`)});
      }
    }
    const plain=qualityRecords[0].samples.map((sample)=>sample.p95).sort((a,b)=>a-b)[1];
    const selected=qualityRecords[1].samples.map((sample)=>sample.p95).sort((a,b)=>a-b)[1];
    expect(selected/plain).toBeLessThanOrEqual(1.2);
    records.push({quality,highlightP95Ratio:selected/plain,runs:qualityRecords});
    await page.getByRole('button',{name:'清除选择',exact:true}).click();
  }
  const report={sample:basename(stepPath!),environment,browser:page.context().browser()?.version(),records};
  console.log(JSON.stringify({pickingPerformance:report}));
  await testInfo.attach('picking-performance',{body:JSON.stringify(report,null,2),contentType:'application/json'});
});

test('free rotation remains effective after crossing poles', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await trackViewerResources(page); await localLogin(page); await uploadLocal(page,'asymmetric.stl',asciiStl());
  const errors: string[] = []; page.on('pageerror',(error) => errors.push(error.message));
  await page.screenshot({ path:testInfo.outputPath('rotation-initial.png') });
  let previous = await cameraMatrix(page); let accumulated = 0; const z: number[] = [];
  for(let i=0;i<16;i++) {
    await dragCanvas(page,0,120);
    const vertical = await cameraMatrix(page); accumulated += rotationChange(previous,vertical); z.push(vertical[10]);
    const before = vertical;
    await dragCanvas(page,120,0); const horizontal = await cameraMatrix(page);
    const change = rotationChange(before,horizontal);
    if(i===0) {
      console.log(JSON.stringify({ firstPoleHorizontalMatrixChange:change, directionAngle:directionChange(before,horizontal) }));
      await page.screenshot({ path:testInfo.outputPath('rotation-after-identical-pole-sequence.png') });
    }
    expect(change).toBeGreaterThan(0.01); expect(directionChange(before,horizontal)).toBeGreaterThan(0.01); previous = horizontal;
  }
  expect(accumulated).toBeGreaterThan(6); expect(Math.min(...z)).toBeLessThan(-0.2); expect(Math.max(...z)).toBeGreaterThan(0.2);
  expect(await page.evaluate(() => Reflect.get(window,'__modelResources').raf)).toBe(1);
  await page.getByRole('button',{ name:'首页',exact:true }).click();
  expect(await page.evaluate(() => Reflect.get(window,'__modelResources').raf)).toBe(0);
  expect(errors).toEqual([]);
});

test('pan and zoom preserve orientation', async ({ page }) => {
  await trackViewerResources(page); await localLogin(page); await uploadLocal(page,'asymmetric.stl',asciiStl());
  await dragCanvas(page,90,70);
  const before = await cameraMatrix(page);
  await dragCanvas(page,100,50,'right'); const panned = await cameraMatrix(page);
  rotationPart(panned).forEach((value,i) => expect(value).toBeCloseTo(rotationPart(before)[i],5));
  expect(Math.hypot(...[12,13,14].map((i) => panned[i]-before[i]))).toBeGreaterThan(0.1);
  const rect = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.wheel(0,-300); await settleViewer(page);
  const zoomed = await cameraMatrix(page);
  rotationPart(zoomed).forEach((value,i) => expect(value).toBeCloseTo(rotationPart(before)[i],5));
  expect(Math.abs(zoomed[14]-panned[14])).toBeGreaterThan(0.1);
});

test('scrolled and fullscreen canvas remains interactive', async ({ page },testInfo) => {
  await trackViewerResources(page); await localLogin(page); await uploadLocal(page,'asymmetric.stl',asciiStl());
  const errors: string[]=[]; page.on('pageerror',(error) => errors.push(error.message));
  const canvas = page.locator('[aria-label="三维模型画布"] canvas');
  await dragCanvas(page,100,80); const rolled = await cameraMatrix(page);
  // A real DOM scroll changes the canvas origin, with no resize of its drawing surface.
  const originalBox = (await canvas.boundingBox())!;
  await canvas.evaluate((element) => {
    const scroller = element.closest('[data-testid="model-drop-zone"]')!.parentElement!.parentElement!;
    const section=element.closest('[data-testid="model-drop-zone"]')! as HTMLElement;
    section.style.height=`${section.getBoundingClientRect().height}px`; section.style.flexShrink='0';
    (section.parentElement as HTMLElement).style.flexShrink='0';
    const spacer=document.createElement('div'); spacer.style.height='160px'; spacer.style.flexShrink='0'; scroller.prepend(spacer);
    scroller.scrollTo({top:100});
  });
  const movedBox = (await canvas.boundingBox())!;
  expect(movedBox.width).toBeCloseTo(originalBox.width); expect(movedBox.height).toBeCloseTo(originalBox.height);
  expect(Math.abs(movedBox.y-originalBox.y)).toBeGreaterThan(10);
  await dragCanvas(page,120,0); expect(rotationChange(rolled,await cameraMatrix(page))).toBeGreaterThan(0.01);
  for(let i=0;i<3;i++) {
    const before = await cameraMatrix(page);
    await page.getByRole('button',{name:'全屏查看',exact:true}).click(); await settleViewer(page);
    (await cameraMatrix(page)).forEach((value,j) => expect(value).toBeCloseTo(before[j],4));
    await dragCanvas(page,0,120); const after = await cameraMatrix(page); expect(rotationChange(before,after)).toBeGreaterThan(0.01);
    await page.getByRole('button',{name:'退出全屏',exact:true}).click(); await settleViewer(page);
    (await cameraMatrix(page)).forEach((value,j) => expect(value).toBeCloseTo(after[j],4));
    await dragCanvas(page,120,0); expect(rotationChange(after,await cameraMatrix(page))).toBeGreaterThan(0.01);
  }
  await page.screenshot({path:testInfo.outputPath('rolled-scrolled-after-fullscreen.png')});
  await canvas.evaluate((element) => (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await page.getByRole('button',{name:'重建画布'}).click(); await settleViewer(page);
  const recreated=await cameraMatrix(page); await dragCanvas(page,120,0); expect(rotationChange(recreated,await cameraMatrix(page))).toBeGreaterThan(0.01);
  for(let i=0;i<5;i++) { await uploadLocal(page,`replacement-${i}.stl`,asciiStl()); await dragCanvas(page,60,0); }
  expect(await page.evaluate(() => Reflect.get(window,'__modelResources').raf)).toBe(1);
  await page.getByRole('button',{name:'首页',exact:true}).click();
  const stats=await page.evaluate(() => ({...Reflect.get(window,'__modelResources')}));
  expect(stats.raf).toBe(0); expect(stats.live).toBe(0); expect(stats.workers).toBe(0); expect(errors).toEqual([]);
});

for (const filename of ['female_5.stp','male_4.stp']) test(`private sample free rotation: ${filename}`,async ({page},testInfo) => {
  const path = stepPath ? join(dirname(stepPath),filename) : null;
  test.skip(!path || !existsSync(path),`未提供 ${filename} 外部样件，未验证`);
  await trackViewerResources(page); await localLogin(page);
  await page.getByLabel('选择模型文件').setInputFiles(path!);
  await expect(page.getByTestId('model-bounds')).toBeVisible({timeout:65000});
  await page.screenshot({path:testInfo.outputPath(`${filename}-initial.png`)});
  const before = await cameraMatrix(page); await dragCanvas(page,0,120); await dragCanvas(page,120,0);
  expect(rotationChange(before,await cameraMatrix(page))).toBeGreaterThan(0.01);
  await page.screenshot({path:testInfo.outputPath(`${filename}-after-identical-sequence.png`)});
  for(let i=0;i<5;i++) await dragCanvas(page,0,120);
  await page.screenshot({path:testInfo.outputPath(`${filename}-inverted-top.png`)});
  for(let i=0;i<7;i++) await dragCanvas(page,0,120);
  await page.screenshot({path:testInfo.outputPath(`${filename}-underside.png`)});
});

test('anonymous access requires login and sales cannot open the model page', async ({ page }) => {
  await page.goto('/model-viewer'); await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible();
  await localLogin(page, 'sales');
  await expect(page).toHaveURL(/auto-quote/);
  await expect(page.getByRole('button', { name: '3D 模型', exact: true })).toHaveCount(0);
});

test('real STL, units, controls, resize, malformed input and replacement cleanup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const live = new Set<WebGLBuffer>();
    const stats = { created: 0, deleted: 0, get live() { return live.size; } };
    Reflect.set(window, '__modelGpu', stats);
    for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!constructor) continue;
      const prototype = constructor.prototype;
      const create = prototype.createBuffer; const remove = prototype.deleteBuffer;
      Object.defineProperty(prototype, 'createBuffer', { value: function(this: WebGLRenderingContext) {
        const buffer = create.call(this); if (buffer) { live.add(buffer); stats.created++; } return buffer;
      } });
      Object.defineProperty(prototype, 'deleteBuffer', { value: function(this: WebGLRenderingContext, buffer: WebGLBuffer | null) {
        if (buffer && live.delete(buffer)) stats.deleted++; return remove.call(this, buffer);
      } });
    }
  });
  await localLogin(page);
  await uploadLocal(page, 'tetra.STL', asciiStl());
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  await page.getByLabel('STL 用户指定单位').selectOption('inch');
  await expect(page.getByTestId('model-bounds')).toHaveText('50.80 × 76.20 × 101.60 mm');
  for (const view of ['等轴测','前视','顶视','右视','重置视角','适配窗口']) await page.getByRole('button', { name: view, exact: true }).click();
  const canvas = page.locator('[aria-label="三维模型画布"] canvas'); const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+30, { steps: 5 }); await page.mouse.up();
  await page.mouse.wheel(0,-200); await page.mouse.down({ button: 'right' }); await page.mouse.move(rect.x+rect.width/2+80,rect.y+rect.height/2+40); await page.mouse.up({ button: 'right' });
  await page.setViewportSize({ width: 1024, height: 768 });
  const before = await page.evaluate(() => ({ ...Reflect.get(window, '__modelGpu') }));
  for (let i=0; i<20; i++) await uploadLocal(page, `replacement-${i}.stl`, i%2 ? binaryStl() : asciiStl());
  await expect(canvas).toHaveCount(1);
  const after = await page.evaluate(() => ({ ...Reflect.get(window, '__modelGpu') }));
  expect(after.created).toBeGreaterThan(before.created);
  expect(after.live).toBeLessThanOrEqual(before.live + 2);
  console.log(JSON.stringify({ gpuBuffersBefore: before, gpuBuffersAfter20Replacements: after }));
  await canvas.evaluate((element) => (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('alert')).toContainText('WebGL');
  await page.getByRole('button', { name: '重建画布' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('选择模型文件').setInputFiles({ name: 'broken.stl', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('解析失败');
  await uploadLocal(page,'recovered.stl',asciiStl());
  await expect(page.getByText('仅本地预览', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(page.locator('[aria-label="三维模型画布"] canvas')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__modelGpu').live)).toBe(0);
  expect(errors).toEqual([]);
});

test('self-authored multiple STEP solids keep relative positions', async ({ page }) => {
  await localLogin(page);
  await uploadLocal(page, 'two-tetrahedra.step', twoTetrahedraStep());
  await expect(page.getByTestId('model-bounds')).toHaveText('12.00 × 3.00 × 4.00 mm');
  await page.getByText('模型详情', { exact: true }).click();
  await expect(page.getByText('8 个三角形 · 2 个网格', { exact: true })).toBeVisible();
});

test('self-authored curved STEP: surface boundaries, quality, saved identity and immutable stored bounds', async ({ page }, testInfo) => {
  const original = roundedCylinderStep();
  const cloud: LocalCloud = { records: [], original, object: null, uploads: 0, finalizeFailures: 0 };
  await trackViewerResources(page); await localLogin(page, 'engineer', cloud);
  await uploadLocal(page, 'rounded-cylinder.step', original);
  await expect(page.getByLabel('边线', { exact: true })).toHaveValue('surface');
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存到云端', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '打开预览', exact: true })).toBeVisible();
  const url = page.url(); const stored = JSON.stringify(cloud.records[0]);
  await page.screenshot({ path: testInfo.outputPath('rounded-cylinder-standard.png') });
  await page.getByLabel('显示质量').selectOption('fine');
  await expect(page.getByText('精细已生效', { exact: true })).toBeVisible();
  expect(page.url()).toBe(url); expect(JSON.stringify(cloud.records[0])).toBe(stored);
  expect(cloud.uploads).toBe(1); expect(cloud.records).toHaveLength(1);
  await expect(page.getByRole('button', { name: '保存到云端', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('rounded-cylinder-fine.png') });
  await expect(page.getByLabel('边线', { exact: true })).toHaveValue('surface');
  expect(await page.evaluate(() => Reflect.get(window, '__modelResources').workers)).toBe(0);
});

test('local HTTP fixture: upload succeeds, finalize fails, reload resumes without reupload and reopens', async ({ page }) => {
  const cloud: LocalCloud = { records: [], original: asciiStl(), object: null, uploads: 0, finalizeFailures: 1 };
  await localLogin(page, 'engineer', cloud);
  await uploadLocal(page, 'saved.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('原文件已上传，但数据库确认失败');
  expect(cloud.uploads).toBe(1); expect(cloud.records).toHaveLength(1);
  expect(cloud.records[0].status).toBe('uploading');
  await expect(page.getByText('保存失败，可重试', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复保存', exact: true }).click();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  expect(cloud.uploads).toBe(1); expect(cloud.records[0].status).toBe('ready');
  await expect(page).toHaveURL(new RegExp(`modelId=${cloud.records[0].id}`));
  await page.reload();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  await page.getByRole('button', { name: '打开预览', exact: true }).click();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
});

test('local HTTP fixture: wrong recovery source is never marked saved', async ({ page }) => {
  const cloud: LocalCloud = { records: [], original: asciiStl(), object: null, uploads: 0, finalizeFailures: 1 };
  await localLogin(page, 'engineer', cloud); await uploadLocal(page, 'original.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('数据库确认失败');
  await page.goto(`/model-viewer?modelId=${cloud.records[0].id}`);
  await expect(page.getByText(/正在恢复：original.stl/)).toBeVisible();
  await uploadLocal(page, 'different.stl', binaryStl());
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不匹配');
  expect(cloud.records[0].status).toBe('uploading'); expect(cloud.uploads).toBe(1);
  await expect(page.getByText('保存失败，可重试', { exact: true })).toBeVisible();
  await uploadLocal(page, 'original.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开预览', exact: true })).toBeVisible();
  expect(cloud.records[0].status).toBe('ready'); expect(cloud.uploads).toBe(1);
});

test('private real STEP fixture parses in Worker with approximate dimensions and actual WASM', async ({ page }, testInfo) => {
  test.skip(!stepPath || !existsSync(stepPath), '未提供存在的 MODEL_PREVIEW_STEP_PATH；真实 STEP 验收未执行，不代表通过');
  test.setTimeout(240_000);
  const errors: string[] = []; const consoleErrors: string[] = []; const wasm: { status: number; mime: string }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('occt-import-js.wasm')) wasm.push({ status: response.status(), mime: response.headers()['content-type'] ?? '' }); });
  await trackViewerResources(page); await localLogin(page);
  const start = Date.now();
  await page.getByLabel('选择模型文件').setInputFiles(stepPath!);
  await expect(page.getByTestId('model-bounds')).toBeVisible({ timeout: 65_000 });
  const text = await page.getByTestId('model-bounds').innerText();
  const sizes = text.match(/[\d.]+/g)!.map(Number);
  for (const [i, expected] of [19.6,19.6,24].entries()) expect(Math.abs(sizes[i]-expected)).toBeLessThanOrEqual(0.1);
  const metadata = await page.locator('details').textContent() ?? '';
  console.log(JSON.stringify({ sample:basename(stepPath!), stepElapsedMs: Date.now()-start, meshBounds: text, meshMetadata: metadata.match(/[\d,]+ 个三角形 · \d+ 个网格/)?.[0], wasm }));
  expect(wasm.some((r) => r.status === 200 && r.mime.includes('application/wasm'))).toBe(true);
  await expect(page.getByLabel('边线', { exact: true })).toHaveValue('surface');
  const canvas = page.locator('[aria-label="三维模型画布"] canvas');
  const initialCanvas = await canvas.elementHandle();
  // Fixed source, viewport, angle and framing for every display comparison.
  for (const view of ['等轴测','前视']) {
    await page.getByLabel('显示质量').selectOption('standard');
    await expect(page.getByText('标准已生效', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: view, exact: true }).click();
    const fixedPose = await cameraMatrix(page);
    for (const quality of ['standard','fine']) {
      await page.getByLabel('显示质量').selectOption(quality);
      await expect(page.getByText(`${quality === 'fine' ? '精细' : '标准'}已生效`, { exact: true })).toBeVisible();
      (await cameraMatrix(page)).forEach((value, i) => expect(value).toBeCloseTo(fixedPose[i], 4));
      const bounds = (await page.getByTestId('model-bounds').innerText()).match(/[\d.]+/g)!.map(Number);
      for (const [i, expected] of [19.6,19.6,24].entries()) expect(Math.abs(bounds[i]-expected)).toBeLessThanOrEqual(0.1);
      for (const theme of ['light','dark']) for (const mode of ['none','feature','surface']) {
        await page.getByLabel('背景', { exact: true }).selectOption(theme);
        await page.getByLabel('边线', { exact: true }).selectOption(mode);
        await page.screenshot({ path: testInfo.outputPath(`male-5-${quality}-${view}-${theme}-${mode}.png`) });
      }
    }
  }
  await page.getByRole('button', { name: '等轴测', exact: true }).click();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width/2, rect.y + rect.height/2);
  await page.mouse.wheel(0,-300);
  await expect(page.getByRole('button', { name: '等轴测', exact: true })).toHaveAttribute('aria-pressed','true');
  await dragCanvas(page,110,90); await dragCanvas(page,-60,80);
  await expect(page.getByText(/自由视角/)).toBeVisible();
  const pose = await cameraMatrix(page);
  const before = await page.evaluate(() => ({ ...Reflect.get(window, '__modelResources') }));
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: '收起云端模型', exact: true }).click();
    await page.getByRole('button', { name: '全屏查看', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
    (await cameraMatrix(page)).forEach((value, i) => expect(value).toBeCloseTo(pose[i], 4));
    await page.keyboard.press('Escape');
    // Chromium headless may not deliver the native Esc fullscreen exit.
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect(page.getByRole('button', { name: '全屏查看', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开云端模型', exact: true }).click();
    (await cameraMatrix(page)).forEach((value, i) => expect(value).toBeCloseTo(pose[i], 4));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = (await canvas.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(256); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`layout-${viewport.width}.png`) });
  }
  const displayOnly = await page.evaluate(() => ({ ...Reflect.get(window, '__modelResources') }));
  expect(displayOnly.workersCreated).toBe(before.workersCreated);
  for (let i=0; i<20; i++) {
    const quality = i % 2 ? 'fine' : 'standard';
    await page.getByLabel('显示质量').selectOption(quality);
    await expect(page.getByText(`${quality === 'fine' ? '精细' : '标准'}已生效`, { exact: true })).toBeVisible();
    await page.getByLabel('背景', { exact: true }).selectOption(i % 2 ? 'dark' : 'light');
    await page.getByLabel('边线', { exact: true }).selectOption(i % 2 ? 'surface' : 'none');
    (await cameraMatrix(page)).forEach((value, i) => expect(value).toBeCloseTo(pose[i], 4));
    if (i % 5 === 0) {
      await page.getByRole('button', { name: '全屏查看', exact: true }).click();
      await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    }
    const resources = await page.evaluate(() => ({ ...Reflect.get(window, '__modelResources') }));
    expect(resources.workers).toBe(0); expect(resources.live).toBeLessThanOrEqual(before.live); expect(resources.raf).toBe(1);
  }
  expect(await initialCanvas!.evaluate((element) => element.isConnected)).toBe(true);
  const after = await page.evaluate(() => ({ ...Reflect.get(window, '__modelResources') }));
  console.log(JSON.stringify({ beforeDisplayCycles: before, after20DisplayCycles: after, browser: page.context().browser()?.version() }));
  for (const view of ['等轴测','前视','顶视','右视']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`male-5-${view}.png`) });
  }
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(canvas).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__modelResources').live)).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, '__modelResources').workers)).toBe(0);
  expect(await page.evaluate(() => Reflect.get(window, '__modelResources').raf)).toBe(0);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
