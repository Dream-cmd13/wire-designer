import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { readRelease, verifyPushedRelease, writeRelease } from './deploy.mjs'

const id = '20261119030818008'
const source = { branch: 'dev', commit: 'a'.repeat(40) }
const temporaryRoot = realpathSync(tmpdir())
let directory

beforeEach(() => {
  directory = mkdtempSync(join(temporaryRoot, 'designer-release-'))
  writeFileSync(join(directory, 'dist.tar.gz'), 'verified archive')
})

afterEach(() => {
  const target = realpathSync(directory)
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith('designer-release-')) {
    throw new Error('部署测试临时目录不匹配')
  }
  rmSync(target, { recursive: true, force: true })
})

test('publishes an intact package tied to a named branch and commit', () => {
  writeRelease(directory, { id, source, environment: 'b'.repeat(64) })
  expect(readRelease(directory, id)).toMatchObject({ id, source, archive: join(directory, 'dist.tar.gz') })
})

test('rejects a changed archive before it can be uploaded', () => {
  writeRelease(directory, { id, source, environment: 'b'.repeat(64) })
  writeFileSync(join(directory, 'dist.tar.gz'), 'different archive')
  expect(() => readRelease(directory, id)).toThrow('SHA256')
})

test('a package prepared from a dirty checkout cannot be published', () => {
  writeRelease(directory, { id, source: null, environment: 'b'.repeat(64) })
  expect(() => readRelease(directory, id)).toThrow('干净')
})

test('accepts only the commit at the tip of the pushed branch', () => {
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'dev')
  git('-c', 'user.name=Release Test', '-c', 'user.email=release@example.test', 'commit', '-q', '--allow-empty', '-m', 'first')
  git('remote', 'add', 'origin', '.')
  const commit = git('rev-parse', 'HEAD')
  expect(() => verifyPushedRelease(directory, { branch: 'dev', commit })).not.toThrow()
  expect(() => verifyPushedRelease(directory, source)).toThrow('分支尖端')
})
