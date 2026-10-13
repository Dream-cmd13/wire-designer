import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))
const shellPath = (path: string) => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)

function fixture(mode: 'success' | 'health-failure' | 'bad-hash' | 'well-known') {
  const base = mkdtempSync(join(tmpdir(), 'designer-deploy-test-'))
  dirs.push(base)
  const id = '20261012000000000'
  for (const directory of ['dist/.well-known', 'dist/assets', 'payload', 'bin']) mkdirSync(join(base, directory), { recursive: true })
  writeFileSync(join(base, 'dist/index.html'), 'old page')
  writeFileSync(join(base, 'dist/.well-known/token'), 'keep token')
  writeFileSync(join(base, 'dist/assets/old.js'), 'old chunk')
  writeFileSync(join(base, 'payload/index.html'), 'new page')
  if (mode === 'well-known') {
    mkdirSync(join(base, 'payload/.well-known'))
    writeFileSync(join(base, 'payload/.well-known/token'), 'overwrite')
  }
  // Windows 本地模拟不修改所有者；curl 模拟健康检查，文件切换使用真实 Bash/tar/mv。
  for (const name of ['chown', 'flock']) writeFileSync(join(base, 'bin', name), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  writeFileSync(join(base, 'bin/curl'), mode === 'health-failure' ? '#!/bin/bash\nexit 22\n' :
    '#!/bin/bash\nwhile [[ "$1" != "-o" ]]; do shift; done\nprintf "new page" > "$2"\n', { mode: 0o755 })
  const archive = join(base, `.deploy-${id}.tar.gz`)
  const packed = spawnSync('tar', ['-czf', archive, '-C', join(base, 'payload'), '.'])
  expect(packed.status).toBe(0)
  const hash = mode === 'bad-hash' ? '0'.repeat(64) : createHash('sha256').update(readFileSync(archive)).digest('hex')
  const result = spawnSync(bash, ['-c', 'export PATH="$1/bin:$PATH"; bash "$2" "$1" "$3" "$4"', '--',
    shellPath(base), shellPath(resolve('scripts/deploy-remote.sh')), id, hash], { encoding: 'utf8' })
  return { base, id, result }
}

// 真实 Bash/tar/mv 子进程在 Windows 全量并行测试下可能超过默认 5 秒。
describe('部署文件切换与恢复', { timeout: 20000 }, () => {
  it('发布新首页并保留验证文件、旧资源和旧版本备份', () => {
    const { base, id, result } = fixture('success')
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(readFileSync(join(base, 'dist/index.html'), 'utf8')).toBe('new page')
    expect(readFileSync(join(base, 'dist/.well-known/token'), 'utf8')).toBe('keep token')
    expect(existsSync(join(base, 'dist/assets/old.js'))).toBe(true)
    expect(readFileSync(join(base, `.deploy-backup-${id}/index.html`), 'utf8')).toBe('old page')
  })
  it('健康检查失败时自动恢复旧首页', () => {
    const { base, id, result } = fixture('health-failure')
    expect(result.status).not.toBe(0)
    expect(readFileSync(join(base, 'dist/index.html'), 'utf8')).toBe('old page')
    expect(readFileSync(join(base, `.deploy-failed-${id}/index.html`), 'utf8')).toBe('new page')
  })
  it.each(['bad-hash', 'well-known'] as const)('%s 时拒绝发布且保留现站', mode => {
    const { base, id, result } = fixture(mode)
    expect(result.status).not.toBe(0)
    expect(readFileSync(join(base, 'dist/index.html'), 'utf8')).toBe('old page')
    expect(existsSync(join(base, `.deploy-backup-${id}`))).toBe(false)
  })
})
