import path from 'path'
import fs from 'fs'
import { spawn, execFile } from 'node:child_process'

/**
 * Extract 50th frame (select=eq(n\,49)) from a local video file using FFmpeg.
 * Falls back to grabbing the frame at 1s if the 50th-frame filter fails.
 * @param {string} videoPath absolute path to source video
 * @param {string} postersDir directory to write posters into
 * @returns {Promise<string>} public poster URL path ('' on total failure)
 */
export const generateFrame50Poster = (videoPath, postersDir) => {
  return new Promise((resolve) => {
    const filename = path.basename(videoPath, path.extname(videoPath))
    const posterFilename = `poster_frame50_${filename}.jpg`
    const posterPath = path.join(postersDir, posterFilename)
    const publicPosterPath = `/uploads/posters/${posterFilename}`

    const ffmpegArgs = ['-i', videoPath, '-vf', 'select=eq(n\\,49)', '-vframes', '1', '-y', posterPath]

    console.log(`[Storage Node 📦] Extracting 50th frame from: ${videoPath}`)
    const ff = spawn('ffmpeg', ffmpegArgs)

    const acceptPoster = () => {
      if (fs.existsSync(posterPath) && fs.statSync(posterPath).size > 0) {
        console.log(`[Storage Node 📦] Poster generated successfully: ${publicPosterPath}`)
        return publicPosterPath
      }
      return ''
    }

    ff.on('close', (code) => {
      if (code === 0) {
        const ok = acceptPoster()
        if (ok) return resolve(ok)
      }
      console.warn(`[Storage Node 📦] Frame 50 extraction exit code ${code}, fallback to 1s frame...`)
      const fallbackArgs = ['-ss', '00:00:01', '-i', videoPath, '-vframes', '1', '-y', posterPath]
      const ffFb = spawn('ffmpeg', fallbackArgs)
      ffFb.on('close', (fbCode) => {
        const ok = acceptPoster()
        if (ok) return resolve(ok)
        console.error(`[Storage Node 📦] Poster extraction fallback failed for ${videoPath}`)
        resolve('')
      })
      ffFb.on('error', (err) => {
        console.error(`[Storage Node 📦] FFmpeg fallback process error:`, err.message)
        resolve('')
      })
    })

    ff.on('error', (err) => {
      console.error(`[Storage Node 📦] FFmpeg process error:`, err.message)
      resolve('')
    })
  })
}

/**
 * Probe that ffmpeg is actually available. If it isn't (e.g. running `npm run dev`
 * on a host without ffmpeg), warn loudly so poster generation isn't silently broken.
 * @returns {Promise<boolean>}
 */
export const probeFfmpeg = async () => {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 8000 }, (err) => {
      if (err) {
        resolve(false)
        return
      }
      resolve(true)
    })
  })
}
