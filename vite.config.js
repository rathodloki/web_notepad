import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    minify: 'terser',
    target: 'esnext',
    cssMinify: true,
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: ['@codemirror/state', '@codemirror/view', '@codemirror/commands'],
          quill: ['quill', 'quill-blot-formatter', 'quill-image-drop-and-paste']
        }
      }
    }
  },
  server: {
    strictPort: true,
    port: 5173,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  }
});
