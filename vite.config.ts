import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const bridgeNodeModules = path.resolve(path.dirname(require.resolve('@via-labs-tech/usdm-bridge')), '../node_modules')

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
  ],
  resolve: {
    alias: {
      '@midnight-ntwrk/ledger': '@midnight-ntwrk/ledger-v8',
      'libsodium-wrappers-sumo': path.join(bridgeNodeModules, 'libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    esbuildOptions: { define: { global: 'globalThis', 'process.version': '"v22.0.0"' } },
    exclude: [
      '@via-labs-tech/usdm-bridge', '@midnight-ntwrk/onchain-runtime-v2',
      '@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/midnight-js-network-id',
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
  build: { target: 'esnext', commonjsOptions: { transformMixedEsModules: true } },
}))
