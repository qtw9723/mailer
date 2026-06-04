// server/index.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mailerRouter from './routes/mailer.js'
import grafanaRouter from './routes/grafana.js'
import chatbotRouter from './routes/chatbot.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

app.use('/api/mailer', mailerRouter)
app.use('/api/grafana', grafanaRouter)
app.use('/api/chatbot', chatbotRouter)

app.listen(PORT, () => console.log(`CS SmartHub server running on :${PORT}`))

export default app
