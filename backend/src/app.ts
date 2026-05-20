import express from 'express'
import cors from 'cors'
import appsRouter from './routes/apps'
import docsRouter from './routes/docs'
import nativeRouter from './routes/native'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'server is running' })
  })

  app.use('/api/apps', appsRouter)
  app.use('/api/docs', docsRouter)
  app.use('/api/native', nativeRouter)

  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`)
  })

  return app
}
