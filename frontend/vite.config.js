import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /ask and /docs go to the FastAPI backend (uvicorn on :8000), the same paths nginx
// proxies on the server, so the app always calls relative URLs.
const API = process.env.API_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/ask': API, '/docs': API, '/openapi.json': API },
  },
})
