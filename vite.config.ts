import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // 相对路径，方便单文件 HTML 直接双击打开
  plugins: [react(), viteSingleFile()],
})
