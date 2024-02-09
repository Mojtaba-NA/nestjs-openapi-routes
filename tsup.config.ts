import { defineConfig } from 'tsup'

const config = defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  minify: true
})

export default config
