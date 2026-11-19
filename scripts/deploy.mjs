import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const identity = process.env.DEPLOY_SSH_KEY || join(homedir(), '.ssh', 'designer_deploy')
const host = 'root@8.135.107.54'
const base = '/www/wwwroot/designer.wltlink.com'
const sshOptions = ['-i', identity, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15']
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex')
const isSha256 = (value) => typeof value === 'string' && value.length === 64 && /^[0-9a-f]+$/.test(value)

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function releaseSource() {
  const branch = git(root, 'branch', '--show-current')
  const commit = git(root, 'rev-parse', 'HEAD')
  const tracked = git(root, 'status', '--porcelain', '--untracked-files=no')
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude,glob)docs/**/*.md')
  const generatedAssets = new Set([
    'public/libredwg/libredwg-web.wasm',
    'public/model-engine/LICENSE.occt-import-js.md',
    'public/model-engine/occt-import-js.mjs',
    'public/model-engine/occt-import-js.wasm',
  ])
  const ignoredPublic = git(root, 'ls-files', '--others', '--ignored', '--exclude-standard', '--', 'public')
  if (!branch || tracked || untracked || ignoredPublic.split('\n').some(path => path && !generatedAssets.has(path))) return null
  return { branch, commit }
}

function buildEnvironment() {
  const env = loadEnv('production', root)
  const hash = sha256(JSON.stringify([process.platform, process.arch, process.version,
    process.env.NODE_ENV ?? 'production', Object.entries(env).sort(([first], [second]) => first.localeCompare(second))]))
  return hash
}

function validateId(id) {
  if (typeof id !== 'string' || id.length !== 17 || !/^\d+$/.test(id)) throw new Error('发布 ID 必须为 17 位数字')
}

export function writeRelease(directory, { id, source, environment }) {
  const sha = sha256(readFileSync(join(directory, 'dist.tar.gz')))
  const manifest = { version: 1, id, source, environment, sha256: sha }
  writeFileSync(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}

export function readRelease(directory, id) {
  validateId(id)
  const manifest = JSON.parse(readFileSync(join(directory, 'release.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.id !== id || !isSha256(manifest.sha256) || !isSha256(manifest.environment)) {
    throw new Error('发布清单格式无效')
  }
  const { source } = manifest
  if (!source || typeof source.branch !== 'string' || !source.branch || !/^[0-9a-f]{40}$/.test(source.commit)) {
    throw new Error('发布包必须从干净的 Git 分支构建，请提交变更后重新运行 deploy:check')
  }
  const archive = join(directory, 'dist.tar.gz')
  if (sha256(readFileSync(archive)) !== manifest.sha256) throw new Error('发布包 SHA256 校验失败')
  return { ...manifest, archive }
}

export function verifyPushedRelease(directory, { branch, commit }) {
  const ref = `refs/heads/${branch}`
  let remoteRef
  try {
    git(directory, 'check-ref-format', ref)
    remoteRef = git(directory, 'ls-remote', '--exit-code', 'origin', ref)
  } catch {
    throw new Error(`无法校验 origin/${branch}，请检查 Git 连接并推送目标提交`)
  }
  if (remoteRef !== `${commit}\t${ref}`) throw new Error(`发布包提交与 origin/${branch} 分支尖端不一致`)
}

function run(command, commandArgs, input) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 执行失败（${result.status}），已停止部署`)
}

function npm(...commandArgs) {
  if (!process.env.npm_execpath) throw new Error('请使用 npm run deploy 启动')
  run(process.execPath, [process.env.npm_execpath, ...commandArgs])
}

function timed(label, task) {
  const started = performance.now()
  try {
    return task()
  } finally {
    console.log(`${label}耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒`)
  }
}

function prepareRelease(dryRun) {
  console.log(dryRun ? '本地验证模式，服务器发布由独立命令触发' : `部署目标：${host}:${base}/dist`)
  const source = releaseSource()
  if (!dryRun && !source) throw new Error('请从干净的 Git 分支构建发布包')
  const environment = buildEnvironment()
  timed('ESLint', () => npm('run', 'lint'))
  timed('Vitest', () => npm('test'))
  timed('类型检查', () => npm('run', 'typecheck'))
  timed('前端构建', () => npm('run', 'build:frontend'))
  if (!existsSync(join(root, 'dist/index.html'))) throw new Error('构建产物缺少 index.html')
  return timed('打包和校验', () => {
    const id = new Date().toISOString().replace(/[-:.TZ]/g, '')
    const directory = join(root, '.tmp', 'deploy', id)
    mkdirSync(dirname(directory), { recursive: true })
    mkdirSync(directory)
    const archive = join(directory, 'dist.tar.gz')
    run('tar', ['-czf', archive, '-C', join(root, 'dist'), '.'])
    if (environment !== buildEnvironment()) throw new Error('构建环境在检查期间发生变化，请重新构建')
    const finalSource = JSON.stringify(source) === JSON.stringify(releaseSource()) ? source : null
    const manifest = writeRelease(directory, { id, source: finalSource, environment })
    console.log(`发布 ID：${id}\n构建包：${archive}\nSHA256：${manifest.sha256}`)
    console.log(finalSource ? `构建提交：${finalSource.branch}@${finalSource.commit}` : '当前工作区产物仅供本地验证，发布需从干净分支重新构建')
    return id
  })
}

function publishRelease(id, verifyOnly) {
  validateId(id)
  const release = timed('产物校验', () => readRelease(join(root, '.tmp', 'deploy', id), id))
  if (verifyOnly) {
    console.log(`本地发布包校验通过：${release.id} (${release.source.branch}@${release.source.commit})`)
    return
  }
  timed('Git 远端校验', () => verifyPushedRelease(root, release.source))
  if (!existsSync(identity)) throw new Error(`找不到部署密钥：${identity}`)
  const remoteArchive = `${base}/.deploy-${id}.tar.gz`
  timed('SSH 预检', () => run('ssh', [...sshOptions, '-p', '22', host, `test -d ${base}/dist && test -f ${base}/dist/index.html && command -v flock && command -v sha256sum`]))
  timed('上传', () => run('scp', [...sshOptions, '-P', '22', release.archive, `${host}:${remoteArchive}`]))
  timed('切换与健康检查', () => run('ssh', [...sshOptions, '-p', '22', host, `bash -s -- ${base} ${id} ${release.sha256}`],
    readFileSync(join(root, 'scripts/deploy-remote.sh'), 'utf8').replace(/\r\n/g, '\n')))
  console.log(`部署完成：${id}`)
}

function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    'dry-run': { type: 'boolean' }, publish: { type: 'boolean' }, 'verify-only': { type: 'boolean' },
  } })
  const dryRun = values['dry-run'] || process.env.npm_config_dry_run === 'true'
  if (values.publish) {
    if (positionals.length !== 1) throw new Error('用法：npm run deploy:publish -- <发布ID> [--verify-only]')
    publishRelease(positionals[0], Boolean(dryRun || values['verify-only']))
    return
  }
  if (positionals.length || values['verify-only']) throw new Error('用法：npm run deploy 或 npm run deploy:check')
  const id = prepareRelease(dryRun)
  if (!dryRun) publishRelease(id, false)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    timed('总计', main)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
