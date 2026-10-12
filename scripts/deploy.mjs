import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.slice(2).includes('--dry-run') || process.env.npm_config_dry_run === 'true'
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--dry-run')) throw new Error('仅支持 --dry-run 参数')
const identity = process.env.DEPLOY_SSH_KEY || join(homedir(), '.ssh', 'designer_deploy')
const host = 'root@8.135.107.54'
const base = '/www/wwwroot/designer.wltlink.com'
const sshOptions = ['-i', identity, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15']

function run(command, commandArgs, input) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 执行失败（${result.status}），已停止部署`)
}

function npm(...commandArgs) {
  // 通过 npm 的 JS 入口调用，避免 Windows .cmd 和 shell 参数转义问题。
  if (!process.env.npm_execpath) throw new Error('请使用 npm run deploy 启动')
  run(process.execPath, [process.env.npm_execpath, ...commandArgs])
}

try {
  console.log(dryRun ? '本地验证模式：不会连接服务器或上传文件' : `部署目标：${host}:${base}/dist`)
  run(process.execPath, [join(root, 'node_modules/eslint/bin/eslint.js'), 'src', 'server', 'tests', 'scripts/deploy.mjs', 'vite.config.ts', '--max-warnings=0'])
  npm('test', '--', '--exclude', '.tmp/**', '--exclude', 'tmp/**')
  npm('run', 'build')
  if (!existsSync(join(root, 'dist/index.html'))) throw new Error('构建产物缺少 index.html')
  const id = new Date().toISOString().replace(/[-:.TZ]/g, '')
  const out = join(root, '.tmp', 'deploy', id)
  mkdirSync(out, { recursive: true })
  const archive = join(out, 'dist.tar.gz')
  run('tar', ['-czf', archive, '-C', join(root, 'dist'), '.'])
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex')
  console.log(`构建包：${archive}\nSHA256：${hash}`)
  if (!dryRun) {
    if (!existsSync(identity)) throw new Error(`找不到部署密钥：${identity}`)
    const remoteArchive = `${base}/.deploy-${id}.tar.gz`
    run('ssh', [...sshOptions, '-p', '22', host, `test -d ${base}/dist && test -f ${base}/dist/index.html && command -v flock && command -v sha256sum`])
    run('scp', [...sshOptions, '-P', '22', archive, `${host}:${remoteArchive}`])
    run('ssh', [...sshOptions, '-p', '22', host, `bash -s -- ${base} ${id} ${hash}`],
      readFileSync(join(root, 'scripts/deploy-remote.sh'), 'utf8').replace(/\r\n/g, '\n'))
  }
  console.log(dryRun ? '本地检查、测试、构建及打包全部通过；未发布。' : '部署完成。')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
