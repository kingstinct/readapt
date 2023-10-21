import { serve as nodeServer } from '@hono/node-server'
import { createApp } from '@zemble/core'

import type { Configure } from '@zemble/core'

export const serve = async (config: Configure | Promise<Zemble.App> | Zemble.App) => {
  const app = await ('plugins' in config ? createApp(config) : config)
  const server = nodeServer({ fetch: app.fetch })

  server.addListener('listening', () => {
    console.log(`[@zemble/node] Serving on ${JSON.stringify(server.address())}`)
  })

  return app
}

export default serve