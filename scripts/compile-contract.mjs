import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform === 'win32') {
  console.error('Compile with Midnight Compact 0.31.1 on compatible Linux hardware, then import the real artifacts and run npm run contract:prepare-browser. See docs/1AM_BUILD_HANDOFF.md. Native ZKIR on this N4500 is not the selected route; Windows compact.exe is unrelated.')
  process.exit(1)
}
const version = spawnSync('compact', ['compile', '--version'], { encoding: 'utf8', cwd: root })
if (version.status !== 0 || !/\b0\.31\.\d+\b/.test(`${version.stdout} ${version.stderr}`)) {
  console.error('Install/select Midnight Compact 0.31.x with compact update 0.31 before compiling.')
  process.exit(1)
}
const result = spawnSync('compact', ['compile', 'contracts/usdm-settlement.compact', 'contracts/managed/usdm-settlement'], { stdio: 'inherit', cwd: root })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
