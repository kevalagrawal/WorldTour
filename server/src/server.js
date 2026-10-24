// Local development: `npm run dev` (reads server/.env).
import { createApp } from './app.js'
import { config } from './config.js'

createApp().listen(config.port, () => {
  console.log(`WorldTour accounts API on http://localhost:${config.port} (health: /api/health)`)
})
