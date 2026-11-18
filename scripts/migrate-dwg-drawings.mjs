import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function migrationId(ownerId, key) {
  // Stable identity per source object; a changed source never overwrites a prior copy.
  const hash = sha256(`dwg-drawings:${ownerId}:${key}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function readBytes(bucket, key) {
  const { data, error } = await bucket.download(key);
  if (error || !data) throw new Error(`无法读取 DWG 存储对象：${key}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function migrateDwgDrawings(client, ownerId, apply) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ownerId)) throw new Error('目标账号 ID 格式无效。');
  const source = client.storage.from('dwg-drawings');
  const target = client.storage.from('dwg-files');
  const manifest = JSON.parse((await readBytes(source, 'dwg/manifest.json')).toString('utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('DWG 源清单为空或格式无效。');
  const keys = new Set();
  const planned = [];

  for (const entry of manifest) {
    if (typeof entry?.name !== 'string' || !/\.dwg$/i.test(entry.name) || entry.name.length > 1024
      || typeof entry.key !== 'string' || !/^dwg\/[a-z0-9._-]+\.dwg$/i.test(entry.key) || keys.has(entry.key)) {
      throw new Error('DWG 源清单存在无效或重复条目。');
    }
    keys.add(entry.key);
    const bytes = await readBytes(source, entry.key);
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`源文件大小无效：${entry.name}`);
    const id = migrationId(ownerId, entry.key);
    const directory = `${ownerId}/${id}`;
    const row = { id, owner_id: ownerId, original_name: entry.name, object_key: `${directory}/source.dwg`,
      file_size: bytes.length, sha256: sha256(bytes), status: 'ready' };
    const { data: existing, error } = await client.from('dwg_assets').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`无法核对目标记录：${entry.name}，请确认 DWG 初始迁移已安装。`);
    if (existing && Object.entries(row).some(([key, value]) => existing[key] !== value)) {
      throw new Error(`目标记录与源图纸不匹配：${entry.name}`);
    }
    const { data: objects, error: listError } = await target.list(directory, { search: 'source.dwg' });
    if (listError) throw new Error(`无法读取目标目录：${entry.name}`);
    const objectExists = objects.some(({ name }) => name === 'source.dwg');
    if (existing && !objectExists) throw new Error(`已登记的目标文件不存在：${entry.name}`);
    if (objectExists && sha256(await readBytes(target, row.object_key)) !== row.sha256) {
      throw new Error(`目标文件与源图纸不匹配：${entry.name}`);
    }
    planned.push({ row, bytes, existing, objectExists });
  }

  const result = [];
  for (const { row, bytes, existing, objectExists } of planned) {
    if (apply && !existing) {
      if (!objectExists) {
        const { error } = await target.upload(row.object_key, bytes, { contentType: 'application/octet-stream', upsert: false });
        if (error) throw new Error(`复制 DWG 失败：${row.original_name}`);
        if (sha256(await readBytes(target, row.object_key)) !== row.sha256) throw new Error(`复制的 DWG 校验失败：${row.original_name}`);
      }
      const { error } = await client.from('dwg_assets').insert(row);
      if (error) throw new Error(`登记 DWG 失败：${row.original_name}，可使用同一命令继续迁移。`);
    }
    result.push({ name: row.original_name, status: existing ? 'verified' : apply ? 'copied' : 'copy' });
  }
  return result;
}

async function main() {
  const { values } = parseArgs({ options: {
    'project-ref': { type: 'string' }, 'owner-id': { type: 'string' }, apply: { type: 'boolean', default: false },
  } });
  const project = values['project-ref'];
  const owner = values['owner-id'];
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!project || !/^[a-z0-9]{20}$/.test(project) || !url || new URL(url).origin !== `https://${project}.supabase.co` || !key || !owner) {
    throw new Error('请核对 .env 中的 Supabase 项目和服务凭据，并提供 --project-ref 与 --owner-id。');
  }
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await client.auth.admin.getUserById(owner);
  const { data: role, error: roleError } = await client.from('user_roles').select('role').eq('user_id', owner).single();
  if (authError || auth?.user?.id !== owner || auth.user.email?.toLowerCase() !== 'admin@local.app' || roleError || role?.role !== 'admin') {
    throw new Error('目标账号须为该项目的 admin@local.app，且有 admin 角色。');
  }
  const result = await migrateDwgDrawings(client, owner, values.apply);
  console.table(result);
  if (!values.apply) console.log('只读预览，未写入目标。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
