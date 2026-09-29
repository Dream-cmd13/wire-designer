import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * 运行时的 wasm 由 public/libredwg/ 提供（prebuild 拷贝），应用始终通过
 * LibreDwg.create(wasmBase) 指定 locateFile。但 @mlightcad/libredwg-web 的
 * Emscripten glue 里还有一个 `new URL('libredwg-web.wasm', import.meta.url)`
 * 兜底分支，会让 Vite 把同一份 9.5MB wasm 再 emit 到 dist/assets/。
 * 该分支只在未传 wasmBase 时才会执行，构建时直接移除这份重复资产。
 */
function dropDuplicateLibredwgWasm(): Plugin {
  return {
    name: 'drop-duplicate-libredwg-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const output = bundle[fileName]
        if (output.type === 'asset' && fileName.endsWith('.wasm') && fileName.includes('libredwg-web')) {
          delete bundle[fileName]
        }
      }
    },
  }
}

// https://vite.dev/config/
// Vitest 3 reads this file automatically for aliases and plugins.
// Test-specific config (environment, globals) uses vitest defaults.
export default defineConfig({
  plugins: [react(), dropDuplicateLibredwgWasm()],
  optimizeDeps: {
    include: [
      '@xyflow/react',
      'lucide-react',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'zustand',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
