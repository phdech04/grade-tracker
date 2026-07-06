import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import extractHandler from './api/extract'

// Serve /api/extract during `npm run dev` by adapting the Vercel serverless
// handler to Vite's connect middleware, so local dev doesn't need `vercel dev`.
// Reads GEMINI_API_KEY from .env.local (see .env.example).
function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
      }
      server.middlewares.use('/api/extract', (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const shim = {
            status(code: number) {
              res.statusCode = code
              return shim
            },
            json(body: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            },
          }
          void extractHandler(
            { method: req.method, body: Buffer.concat(chunks).toString('utf8') },
            shim,
          )
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevServer()],
})
