import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/generated/**',
    '**/coverage/**',
    '**/.worktrees/**',
    '**/.tmp/**',
    '**/tmp/**',
    '**/output/**',
    '**/outputs/**',
    '**/backups/**',
  ]),
  {
    files: ['scripts/deploy.mjs', 'scripts/create-user.mjs', 'scripts/create-user.test.mjs', 'scripts/typecheck-functions.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      parserOptions: { tsconfigRootDir: rootDir },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
