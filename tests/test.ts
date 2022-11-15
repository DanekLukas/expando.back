import WebSocket from 'ws'
import dotenv from 'dotenv'
import expando from '../expando'

import test, { Test } from 'tape'

dotenv.config()

const sleep = (ms: number) => new Promise(f => setTimeout(f, ms))

const index = 'U2FsdGVkX1/p+1ZXqGIu95sTz5bUOENzOpoHKcJoYkY='
const testName = 'test'

type TPeers = {
  name: string
  index: string
}
let socket: { socket: WebSocket.Server<WebSocket.WebSocket>; server: any } | undefined = undefined
let wss: WebSocket | undefined = undefined
let showPeers: TPeers[] = []

dotenv.config()

test('expando', (t: Test) => {
  socket = expando()
  t.assert(socket)
  t.end()
})

test('wss', async (t: Test) => {
  const port = process.env.PORT || '8080'
  const protocol = process.env.PROTOCOL === 'https' ? 'wss' : 'ws'
  wss = new WebSocket(`${protocol}://localhost:${port}/websockets`)
  wss.addEventListener('message', (event: WebSocket.MessageEvent) => {
    if (event) {
      const passed = JSON.parse(event.data.toString())
      const value: Record<string, string> = passed
      const keys = Object.keys(value)
      if (!keys.includes('do')) {
        return
      }
      switch (value.do) {
        case 'peers':
          const found = passed.peers as TPeers[]
          showPeers = found
          break
        case 'pong':
          break
      }
    }
  })
  t.equals(wss?.readyState, 0)
  while (wss && wss?.readyState < 1) await sleep(100)
  t.equals(wss?.readyState, 1)
})

test('nick name', async (t: Test) => {
  wss!.send(
    JSON.stringify({
      do: 'nick',
      index,
      name: testName,
    })
  )
  t.equals(wss?.readyState, 1)
  t.end()
})

test('checkPeers', async (t: Test) => {
  await sleep(100)
  t.deepEquals(showPeers, [{ name: testName, index }])
  t.end()
})

test('close expando', (t: Test) => {
  t.equals(wss?.readyState, 1)
  wss!.close()
  socket?.server!.close()
  socket?.socket.close()
  t.end()
})
