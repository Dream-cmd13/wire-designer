import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { buildPgSslConfig } from './lib/costAnalysisSync.mjs'

const ledger = 'wire_release.sql_migrations'
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex')
const validName = (name) => /^\d{8,14}_[a-z0-9_]+\.sql$/.test(name) && name.endsWith('.sql')
const formatCode = (error) => /^[A-Z0-9_]+$/.test(error.code ?? '') ? ` (${error.code})` : ''

export function parseMigration(name, contents) {
  if (!validName(name)) throw new Error('迁移文件必须是 supabase/updates 中的版本化 SQL 文件名')
  const sql = contents.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const transaction = /^(?:[\t \n]|--[^\n]*\n)*begin[\t ]*;([\s\S]+)\bcommit[\t ]*;\s*$/i.exec(sql)
  if (!transaction || !transaction[1].trim()) throw new Error(`迁移必须由 BEGIN 和 COMMIT 包裹：${name}`)
  return { name, sha256: sha256(sql), body: transaction[1] }
}

async function getPlan(db, target, migrations) {
  const { rows: [relation] } = await db.query(`select to_regclass('${ledger}') as ledger`)
  const recorded = relation.ledger ? (await db.query(`select filename, sha256 from ${ledger} where filename = any($1::text[])`,
    [migrations.map(migration => migration.name)])).rows : []
  const hashes = new Map(recorded.map(row => [row.filename, row.sha256]))
  const entries = migrations.map(({ name, sha256 }) => {
    if (hashes.has(name) && hashes.get(name) !== sha256) throw new Error(`已执行迁移的文件哈希发生变化：${name}`)
    return { name, sha256, status: hashes.has(name) ? 'applied' : 'pending' }
  })
  return { entries, token: sha256(JSON.stringify([target, entries])) }
}

async function transaction(db, mode, work) {
  await db.query(`begin ${mode}`)
  try {
    const result = await work()
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  }
}

export function previewMigrations(db, target, migrations) {
  return transaction(db, 'isolation level repeatable read read only', () => getPlan(db, target, migrations))
}

export function applyMigrations(db, target, migrations, token) {
  return transaction(db, 'isolation level read committed read write', async () => {
    await db.query("set local lock_timeout = '5s'")
    await db.query("set local statement_timeout = '60s'")
    await db.query('select pg_advisory_xact_lock(785619024, 209013557)')
    const plan = await getPlan(db, target, migrations)
    if (token !== plan.token) throw new Error('确认码与当前目标、文件或迁移状态不一致，请重新预览')
    const pending = new Set(plan.entries.filter(entry => entry.status === 'pending').map(entry => entry.name))
    if (!pending.size) return []

    await db.query('create schema if not exists wire_release')
    await db.query(`create table if not exists ${ledger} (
      filename text primary key,
      sha256 text not null,
      applied_at timestamptz not null default now()
    )`)
    for (const { name, body, sha256 } of migrations.filter(entry => pending.has(entry.name))) {
      try {
        const sqlHex = Buffer.from(body).toString('hex')
        await db.query(`do $wire_release$ begin
          execute convert_from(decode('${sqlHex}', 'hex'), 'UTF8');
        end $wire_release$`)
      } catch (error) {
        throw new Error(`执行迁移失败：${name}${formatCode(error)}`, { cause: error })
      }
      await db.query(`insert into ${ledger} (filename, sha256) values ($1, $2)`, [name, sha256])
    }
    return [...pending]
  })
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { apply: { type: 'string' } } })
  if (!positionals.length) {
    if (values.apply !== undefined) throw new Error('执行前请显式指定已预览的 SQL 文件名')
    console.log('未指定迁移文件，跳过数据库步骤')
    return
  }
  if (new Set(positionals).size !== positionals.length) throw new Error('迁移文件不能重复指定')
  const migrations = positionals.map(name => {
    if (!validName(name)) throw new Error('请指定 supabase/updates 中的版本化 SQL 文件名')
    const path = fileURLToPath(new URL(`../supabase/updates/${name}`, import.meta.url))
    return parseMigration(name, readFileSync(path, 'utf8'))
  }).sort((first, second) => {
    const version = (migration) => migration.name.split('_', 1)[0].padEnd(14, '0')
    return version(first).localeCompare(version(second)) || first.name.localeCompare(second.name)
  })
  const env = process.env
  const host = env.SUPABASE_DB_HOST
  const user = env.SUPABASE_DB_USER
  const database = env.SUPABASE_DB_NAME
  const port = Number(env.SUPABASE_DB_PORT || 5432)
  if (!host || !user || !database || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('请设置 SUPABASE_DB_HOST、SUPABASE_DB_USER、SUPABASE_DB_NAME 和有效的 SUPABASE_DB_PORT')
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(host)
  const client = new pg.Client({ host, user, database, port, password: env.SUPABASE_DB_PASSWORD,
    ssl: local ? false : buildPgSslConfig(env), connectionTimeoutMillis: 10000 })
  const target = { host, port, database, user }
  const project = /^postgres\.([a-z0-9]{20})$/.exec(user)?.[1]
  console.log(`迁移目标：${host}:${port}/${database}${project ? `，项目 ${project}` : ''}`)
  try {
    await client.connect()
    if (values.apply === undefined) {
      const plan = await previewMigrations(client, target, migrations)
      console.table(plan.entries)
      if (plan.entries.some(entry => entry.status === 'pending')) console.log(`迁移确认码：${plan.token}`)
      else console.log('选定迁移均已登记，无需执行')
    } else {
      const applied = await applyMigrations(client, target, migrations, values.apply)
      console.log(applied.length ? `已执行并登记：${applied.join('、')}` : '选定迁移均已登记，无需执行')
    }
  } finally {
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.code ? `迁移命令失败${formatCode(error)}` : error.message)
    process.exitCode = 1
  })
}
