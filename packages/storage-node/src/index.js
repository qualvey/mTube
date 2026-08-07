import { config, dirs } from './config.js'
import { createApp } from './app.js'
import { probeFfmpeg } from './ffmpeg.js'
import { registerWithMainServer, sendHeartbeat } from './cluster.js'

const app = createApp()

app.listen(config.port, async () => {
  console.log(`[Storage Node 📦] ${config.nodeName} (${config.nodeId}) running on port ${config.port}`)

  // Verify ffmpeg is available so poster generation isn't silently broken in dev.
  const hasFfmpeg = await probeFfmpeg()
  if (!hasFfmpeg) {
    console.warn('[Storage Node ⚠️] ffmpeg not found on PATH — poster (frame extraction) generation will fail. Install ffmpeg first.')
  }

  await registerWithMainServer({
    mainServerUrl: config.mainServerUrl,
    nodeId: config.nodeId,
    nodeName: config.nodeName,
    publicUrl: config.publicUrl || `http://localhost:${config.port}`,
    isDefault: config.isDefaultNode,
    secret: config.clusterSecret,
  })

  setInterval(
    () =>
      sendHeartbeat({
        mainServerUrl: config.mainServerUrl,
        nodeId: config.nodeId,
        secret: config.clusterSecret,
        videosDir: dirs.videosDir,
      }),
    config.heartbeatIntervalSec * 1000
  )
})
