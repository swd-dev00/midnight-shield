import { access, cp, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managed = path.join(root, 'contracts', 'managed', 'usdm-settlement')
const generatedContract = path.join(managed, 'contract', 'index.js')
const publicManaged = path.join(root, 'public', 'managed', 'usdm-settlement')

try {
  await access(generatedContract)
  for (const file of ['zkir/settle.zkir', 'keys/settle.prover', 'keys/settle.verifier']) {
    if ((await stat(path.join(managed, file))).size === 0) throw new Error(`Empty artifact: ${file}`)
  }
} catch (error) {
  throw new Error(
    `Incomplete Compact output in ${managed}: ${error.message}. Run npm run contract:compile with Compact 0.31.x first.`,
  )
}

await mkdir(path.dirname(publicManaged), { recursive: true })
if (!publicManaged.startsWith(path.join(root, 'public') + path.sep)) throw new Error('Unsafe asset destination')
await rm(publicManaged, { recursive: true, force: true })
await cp(managed, publicManaged, { recursive: true })

console.log(`Prepared complete browser Compact assets at ${publicManaged}`)
