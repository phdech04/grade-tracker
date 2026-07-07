import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import extractHandler from './api/extract'
import extractTranscriptHandler from './api/extract-transcript'

interface ApiRes {
  status: (code: number) => ApiRes
  json: (body: unknown) => void
}
type ApiHandler = (req: { method?: string; body?: string }, res: ApiRes) => unknown

// Serve the Vercel serverless handlers during `npm run dev` by adapting them to
// Vite's connect middleware, so local dev doesn't need `vercel dev`. Reads
// GEMINI_API_KEY from .env.local (see .env.example).
function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
      }

      const mount = (path: string, handler: ApiHandler) => {
        const fn: Connect.NextHandleFunction = (req, res) => {
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', () => {
            const shim: ApiRes = {
              status(code: number) {
                res.statusCode = code
                return shim
              },
              json(body: unknown) {
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(body))
              },
            }
            void handler({ method: req.method, body: Buffer.concat(chunks).toString('utf8') }, shim)
          })
        }
        server.middlewares.use(path, fn)
      }

      mount('/api/extract', extractHandler)
      mount('/api/extract-transcript', extractTranscriptHandler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevServer()],
})
