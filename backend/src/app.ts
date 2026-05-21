import express from 'express'
import path from 'node:path'
import cors from 'cors'
import appsRouter from './routes/apps'
import docsRouter from './routes/docs'
import nativeRouter from './routes/native'

const isProduction = process.env.NODE_ENV === 'production'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // API routes first
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'server is running' })
  })

  app.use('/api/apps', appsRouter)
  app.use('/api/docs', docsRouter)
  app.use('/api/native', nativeRouter)

  // Production: serve frontend static files, then SPA fallback
  if (isProduction) {
    const frontendDist = path.resolve(__dirname, '../../frontend/dist')
    app.use(express.static(frontendDist))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'))
    })
  }

  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })

  return app
}
