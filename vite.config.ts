import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const bridgeEntry = require.resolve('@via-labs-tech/usdm-bridge')
const bridgeNodeModules = path.resolve(path.dirname(bridgeEntry), '../node_modules')

function findPackageRoot(entry: string): string {
  let current = path.dirname(entry)
  while (true) {
    const candidate = path.join(current, 'package.json')
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: string }
        if (pkg.name === '@via-labs-tech/usdm-bridge') return current
      } catch {
        // Continue walking upward until the bridge package root is found.
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  throw new Error('Unable to locate @via-labs-tech/usdm-bridge package root')
}

function listFilesRecursive(root: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursive(absolute))
    else files.push(absolute)
  }
  return files
}

const bridgePackageRoot = findPackageRoot(bridgeEntry)
const bridgePackageJson = JSON.parse(fs.readFileSync(path.join(bridgePackageRoot, 'package.json'), 'utf8')) as { version?: string }

function prepareMidnightZkAssets() {
  const source = path.join(bridgePackageRoot, 'artifacts', 'midnight')
  const destination = path.resolve(process.cwd(), 'public', 'artifacts', 'midnight')

  if (!fs.existsSync(source)) {
    throw new Error(
      'VIA Midnight ZK assets are missing from @via-labs-tech/usdm-bridge. Browser Midnight → Cardano proving cannot run.',
    )
  }

  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  fs.cpSync(source, destination, { recursive: true })

  const copiedFiles = listFilesRecursive(destination)
    .map((file) => path.relative(destination, file).replaceAll('\\', '/'))
    .filter((file) => !file.endsWith('.via-assets-ready.json'))

  if (copiedFiles.length === 0) {
    throw new Error('VIA Midnight ZK artifact directory is empty; refusing to build a reverse-leg browser flow.')
  }

  fs.writeFileSync(
    path.join(destination, '.via-assets-ready.json'),
    JSON.stringify({
      package: '@via-labs-tech/usdm-bridge',
      version: bridgePackageJson.version ?? 'unknown',
      route: '/artifacts/midnight',
      fileCount: copiedFiles.length,
      files: copiedFiles,
    }, null, 2),
  )
}

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env': JSON.stringify({
      NETWORK: 'testnet',
      BLOCKFROST_PROJECT_ID: loadEnv(mode, process.cwd(), 'VITE_').VITE_BLOCKFROST_PREPROD ?? '',
    }),
    'process.version': JSON.stringify('v22.0.0'),
    global: 'globalThis',
  },
  plugins: [
    {
      name: 'via-midnight-zk-assets',
      configResolved() {
        prepareMidnightZkAssets()
      },
    },
    {
      name: 'shim-resolver',
      enforce: 'pre',
      resolveId(id: string) {
        if (id.startsWith('vite-plugin-node-polyfills/shims/')) return require.resolve(id).replace(/\.cjs$/, '.js')
      },
    },
    react(),
    basicSsl(),
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'util', 'stream', 'string_decoder'],
      globals: { Buffer: true, process: true },
      protocolImports: false,
    }),
    wasm(),
    topLevelAwait({
      promiseExportName: '__tla',
      promiseImportName: (index) => `__tla_${index}`,
    }),
    {
      name: 'midnight-v3-wasm-module-resolver',
      resolveId(source, importer) {
        if (
          source === '@midnight-ntwrk/onchain-runtime-v3' &&
          importer &&
          importer.includes('@midnight-ntwrk/compact-runtime')
        ) {
          return { id: source, external: false, moduleSideEffects: true }
        }
        return null
      },
    },
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
    alias: {
      '@midnight-ntwrk/ledger': '@midnight-ntwrk/ledger-v8',
      'libsodium-wrappers-sumo': path.join(bridgeNodeModules, 'libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    esbuildOptions: {
      target: 'esnext',
      supported: { 'top-level-await': true },
      platform: 'browser',
      format: 'esm',
      loader: { '.wasm': 'binary' },
      define: { global: 'globalThis', 'process.version': '"v22.0.0"' },
    },
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: [
      '@via-labs-tech/usdm-bridge',
      '@midnight-ntwrk/onchain-runtime-v2',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/midnight-js-network-id',
      '@midnight-ntwrk/dapp-connector-api',
    ],
  },
  server: {
    host: true,
    fs: { allow: ['.', '../..'] },
    proxy: {
      '/koios': {
        target: 'https://preprod.koios.rest/api/v1',
        changeOrigin: true,
        rewrite: (value: string) => value.replace(/^\/koios/, ''),
      },
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          midnightV3Wasm: ['@midnight-ntwrk/onchain-runtime-v3'],
        },
      },
    },
  },
}))