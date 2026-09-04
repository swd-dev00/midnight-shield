import { access, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedPackage = '@via-labs-tech/usdm-bridge'
const expectedVersion = '1.2.0'
const expectedRoute = '/artifacts/midnight'

const bridgePackageJson = require('@via-labs-tech/usdm-bridge/package.json')
if (bridgePackageJson.version !== expectedVersion) {
  throw new Error(`Expected ${expectedPackage}@${expectedVersion}, found ${bridgePackageJson.version}`)
}

async function countFiles(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.via-assets-ready.json') continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await countFiles(absolute)
    else total += 1
  }
  return total
}

async function verifyTree(label, base) {
  const manifestPath = path.join(base, '.via-assets-ready.json')
  await access(manifestPath)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (manifest.package !== expectedPackage) throw new Error(`${label}: unexpected package ${manifest.package}`)
  if (manifest.version !== expectedVersion) throw new Error(`${label}: unexpected VIA version ${manifest.version}`)
  if (manifest.route !== expectedRoute) throw new Error(`${label}: unexpected runtime route ${manifest.route}`)
  if (!Number.isFinite(manifest.fileCount) || manifest.fileCount <= 0) throw new Error(`${label}: manifest reports no proving assets`)

  const actualCount = await countFiles(base)
  if (actualCount <= 0) throw new Error(`${label}: proving asset tree is empty`)
  if (actualCount !== manifest.fileCount) {
    throw new Error(`${label}: manifest/file mismatch (${manifest.fileCount} declared, ${actualCount} present)`)
  }

  const size = (await stat(manifestPath)).size
  if (size <= 2) throw new Error(`${label}: manifest is empty`)

  console.log(`✓ ${label}: ${actualCount} VIA Midnight proving assets for ${expectedPackage}@${expectedVersion}`)
}

await verifyTree('public runtime tree', path.join(root, 'public', 'artifacts', 'midnight'))
await verifyTree('production dist tree', path.join(root, 'dist', 'artifacts', 'midnight'))

console.log(`✓ browser runtime route ready: ${expectedRoute}`)
console.log('NOTE: this proves asset availability only. Competition readiness still requires a real Connector-v4 Midnight → Cardano proof in-browser.')