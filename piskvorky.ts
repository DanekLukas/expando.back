import WebSocket, { WebSocketServer } from 'ws'
import express from 'express'
import fs from 'fs'

import dotenv from 'dotenv'
import http from 'http'
import https from 'https'

dotenv.config()

type client = { index: string; ws: WebSocket; name: string; with: string }

const staticFldr = 'build'
const protocol = process.env.PROTOCOL === 'https' ? 'https' : 'http'
const host = process.env.HOST || '0.0.0.0'
const port = process.env.PORT || '8080'

const waitingInterval = parseInt(process.env.INTERVAL || '1000')

const clients: { [index: string]: client } = {}

const sendPeers = () => {
  const ready = Object.values(clients).filter(
    client =>
      client.name.trim().length > 0 && client.with.trim() === '' && client.ws.readyState === 1
  )
  ready.forEach(item =>
    item.ws.send(
      JSON.stringify({
        do: 'peers',
        peers: ready.map(client => {
          return { name: client.name, index: client.index }
        }),
        count: Object.values(clients).filter(itm => itm.ws.readyState === 1).length,
      })
    )
  )
  return Array.isArray(ready) && ready.length > 0
}

const isInCli = (index: string | Array<string>) => {
  const arr = Object.keys(clients)
  if (!Array.isArray(index)) return arr.includes(index)
  for (const item of index) {
    if (!arr.includes(item)) return false
  }
  return true
}

const cleanClients = () => {
  const filtered = Object.values(clients).filter(client => client.ws.readyState !== 1)
  const sendNeeded = filtered.length > 0
  filtered.forEach(client => delete clients[client.index])
  if (sendNeeded) return sendPeers()
  else false
}

const piskvorky = () => {
  const app = express()

  const privateKey = process.env.PRIVATE_KEY
    ? fs.readFileSync(process.env.PRIVATE_KEY, 'utf8')
    : undefined
  const certificate = process.env.CERTIFICATE
    ? fs.readFileSync(process.env.CERTIFICATE, 'utf8')
    : undefined
  const credentials =
    privateKey && certificate ? { key: privateKey!, cert: certificate! } : undefined

  const server =
    protocol === 'https' && credentials
      ? https.createServer(credentials!, app)
      : new http.Server(app)

  process.on('uncaughtException', e => {
    wss.close()
    server.close()
  })
  process.on('SIGTERM', () => {
    wss.close()
    server.close()
  })

  app.use(express.static(staticFldr))

  try {
    server.listen(port, () => {
      console.log(`⚡️[server]: Server is running at ${protocol}://${host}:${port}`)
    })
  } catch (error: any) {
    console.log(error.getMessage())
  }

  server.on('close', () => {
    if (intrIntervalRef) {
      clearInterval(intrIntervalRef)
      intrIntervalRef = undefined
    }
  })

  const wss = new WebSocketServer({
    host: '0.0.0.0',
    server: server,
    path: '/websockets',
  })

  let intrIntervalRef: NodeJS.Timer | undefined = undefined

  wss.on('connection', ws => {
    ws.on('message', async data => {
      const parsed = JSON.parse(data.toString())
      const keys = Object.keys(parsed)
      if (!keys.includes('index')) return
      if (!isInCli(parsed.index)) {
        if (['reset', 'ping', 'nick'].includes(parsed.do)) {
          clients[parsed.index] = { index: parsed.index, name: '', ws: ws, with: '' }
          if (parsed.do === 'reset' && parsed.room !== '') {
            const found = Object.values(clients).find(
              clnt => clnt.index && clnt.index !== parsed.index && clnt.ws.readyState === 1
            )
            found?.ws.send(JSON.stringify({ do: 'pong', index: found.index, to: parsed.index }))
          }
        } else {
          cleanClients()
          sendPeers()
          return
        }
      } else {
        if (!clients[parsed.index].ws.readyState || clients[parsed.index].ws.readyState > 1)
          clients[parsed.index].ws = ws
        else {
          if (clients[parsed.index].ws !== ws) {
            clients[parsed.index].ws.close()
            clients[parsed.index].ws = ws
            cleanClients()
            ws.send(JSON.stringify({ do: 'reset' }))
          }
        }
      }
      switch (parsed.do) {
        case 'ping':
          if (!sendPeers())
            clients[parsed.index].ws.send(
              JSON.stringify({
                do: 'pong',
                count: Object.values(clients).filter(
                  client => client.ws.readyState === 1 && client.with.trim() === ''
                ).length,
              })
            )
          break

        case 'nick':
          if (keys.includes('name')) {
            clients[parsed.index].name = parsed.name
          }
          if (!cleanClients() && !sendPeers()) {
            ws.send(JSON.stringify({ peers: { index: parsed.index, name: parsed.name } }))
          }
          break

        case 'start':
          if (keys.includes('with')) {
            clients[parsed.index].with = parsed.with
            clients[parsed.with].with = parsed.index
            clients[parsed.with].ws.send(
              JSON.stringify({ do: 'start', index: parsed.with, to: parsed.index })
            )
          }
          break

        case 'go':
          if (keys.includes('col') && keys.includes('row')) {
            clients[clients[parsed.index].with].ws.send(
              JSON.stringify({ do: 'go', col: parsed.col, row: parsed.row })
            )
          }
      }
    })
  })

  intrIntervalRef = setInterval(() => {
    cleanClients()
  }, waitingInterval)

  return { socket: wss, server: server }
}

export default piskvorky
