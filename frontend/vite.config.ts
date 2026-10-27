import { defineConfig } from 'vite'
import { exampleMiddleware } from '../deploy/railway/example-assets.mjs'
export default defineConfig({
  plugins: [
    {
      name: 'complete-example',
      configureServer(server) {
        server.middlewares.use(exampleMiddleware)
      },
    },
  ],
  build: { rollupOptions: { input: { main: 'index.html', assembly: 'assembly.html' } } },
})
