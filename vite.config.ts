/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vitest 读取本文件的 test 段；此处显式声明，避免 vitest/config 与根 Vite 插件类型相互冲突。
declare module 'vite' {
  interface UserConfig {
    test?: {
      testTimeout?: number
      hookTimeout?: number
    }
  }
}

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
  worker: { format: 'es' },
  plugins: [react(), dropDuplicateLibredwgWasm()],
  // PGlite 隔离数据库用例在并行负载下可能超过 5s 默认超时；统一提高超时而不跳过断言。
  test: {
    testTimeout: 30000,
    hookTimeout: 60000,
  },
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
