import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyMigrations, parseMigration, previewMigrations } from './migrate-sql.mjs'

const target = 'test-db.local/designer'
const migration = (name, statements) => parseMigration(name, `-- header\nbegin;\n${statements}\ncommit;\n`)
let db

beforeAll(() => { db = new PGlite() })
afterAll(async () => { await db.close() })

test('normalizes checkout newlines and validates the selected migration filename', () => {
  const sql = 'begin;\nselect 1;\ncommit;\n'
  expect(parseMigration('20270101_sample.sql', sql).sha256)
    .toBe(parseMigration('20270101_sample.sql', sql.replaceAll('\n', '\r\n')).sha256)
  expect(() => parseMigration('../reset.sql', sql)).toThrow()
  expect(() => parseMigration('20270101_sample.sql', 'select 1;')).toThrow()
})

test('a failed migration rolls back schema changes and leaves no ledger behind', async () => {
  const first = migration('20270101_first.sql', 'create table failed_release(id int);')
  const second = migration('20270102_second.sql', 'select * from missing_release_table;')
  const plan = await previewMigrations(db, target, [first, second])
  await expect(applyMigrations(db, target, [first, second], plan.token)).rejects.toThrow(second.name)
  const { rows } = await db.query("select to_regclass('public.failed_release') as data, to_regclass('wire_release.sql_migrations') as ledger")
  expect(rows).toEqual([{ data: null, ledger: null }])
})

test('rejects stray top-level transaction control without persisting earlier writes', async () => {
  const file = migration('20270103_inner_commit.sql', 'create table unexpected_commit(id int);\ncommit;')
  const plan = await previewMigrations(db, target, [file])
  await expect(applyMigrations(db, target, [file], plan.token)).rejects.toThrow(file.name)
  const { rows } = await db.query("select to_regclass('public.unexpected_commit') as data")
  expect(rows).toEqual([{ data: null }])
})

test('confirmation binds the target and SQL and execution records each file only once', async () => {
  const name = '20270104_once.sql'
  const file = migration(name, 'create table released_once(id int); insert into released_once values (42);')
  const changed = migration(name, 'create table released_once(id int);')
  const plan = await previewMigrations(db, target, [file])
  expect(plan.entries).toMatchObject([{ name, status: 'pending' }])
  const { rows } = await db.query("select to_regnamespace('wire_release') as ledger")
  expect(rows).toEqual([{ ledger: null }])
  await expect(applyMigrations(db, 'different-db', [file], plan.token)).rejects.toThrow('确认码')
  await expect(applyMigrations(db, target, [changed], plan.token)).rejects.toThrow('确认码')
  await expect(applyMigrations(db, target, [file], plan.token)).resolves.toEqual([name])
  const nextPlan = await previewMigrations(db, target, [file])
  expect(nextPlan.entries).toMatchObject([{ name, status: 'applied' }])
  await expect(applyMigrations(db, target, [file], nextPlan.token)).resolves.toEqual([])
  await expect(previewMigrations(db, target, [changed])).rejects.toThrow('哈希')
  expect((await db.query('select id from released_once')).rows).toEqual([{ id: 42 }])
})
