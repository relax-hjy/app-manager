import express from 'express'
import path from 'node:path'
import cors from 'cors'
import appsRouter from './routes/apps'
import docsRouter from './routes/docs'
import nativeRouter from './routes/native'
import agentRouter from './routes/agent'

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
  app.use('/api/agent', agentRouter)

  // Production: serve frontend static files, then SPA fallback
  if (isProduction) {
    const frontendDist = path.resolve(__dirname, '../../frontend/dist')
    app.use(express.static(frontendDist))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'))
    })
  }

  const PORT = process.env.PORT || 3001
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })

  // 端口被占时给出可操作的提示，而不是裸抛 EADDRINUSE 堆栈
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[后端] 端口 ${PORT} 已被占用。请先停止占用进程（netstat -ano | findstr :${PORT} 查 PID，taskkill /PID <pid> /F）后重试`)
      process.exit(1)
    }
    throw err
  })

  return app
}
