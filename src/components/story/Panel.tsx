/**
 * One picture panel cropped out of a story's grid sheet (3×2 or 4×4), trimmed
 * to the frame's shape (`aspect`) like object-fit: cover. The sheet is
 * loaded once, downscaled onto a canvas, and run through `detectPanels`
 * (src/story/panels.ts); results are memoized per sheet, so every page and
 * the bookshelf cover share one detection. The sheet is served from the
 * app's own origin, so the canvas is never tainted.
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { coverBox, cropStyle, detectPanels, evenPanels, type Box, type Grid } from '@/story/panels'

interface Sheet {
  boxes: Box[]
  /** Natural width / height of the sheet. */
  aspect: number
}

const cache = new Map<string, Promise<Sheet>>()
const SAMPLE_WIDTH = 240

function sheetFor(src: string, grid: Grid): Promise<Sheet> {
  const key = `${grid.cols}x${grid.rows}|${src}`
  let p = cache.get(key)
  if (!p) {
    p = new Promise<Sheet>((done) => {
      const img = new Image()
      img.onload = () => {
        const aspect = img.naturalWidth / Math.max(1, img.naturalHeight)
        const resolve = (boxes: Box[]) => done({ boxes, aspect })
        try {
          const scale = SAMPLE_WIDTH / img.naturalWidth
          const canvas = document.createElement('canvas')
          canvas.width = SAMPLE_WIDTH
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) return resolve(evenPanels(grid))
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          resolve(detectPanels({ width: canvas.width, height: canvas.height, data }, grid) ?? evenPanels(grid))
        } catch {
          resolve(evenPanels(grid))
        }
      }
      img.onerror = () => done({ boxes: [], aspect: 1 })
      img.src = src
    })
    cache.set(key, p)
  }
  return p
}

function useSheet(src: string | undefined, { cols, rows }: Grid) {
  const [state, setState] = useState<{ src?: string; sheet: Sheet | null }>({ sheet: null })
  // Depend on the numbers, not the grid object: callers build a fresh object
  // each render, which would re-run this effect (and re-set state) forever.
  useEffect(() => {
    if (!src) return
    let live = true
    sheetFor(src, { cols, rows }).then((sheet) => live && setState({ src, sheet }))
    return () => {
      live = false
    }
  }, [src, cols, rows])
  return state.src === src ? state.sheet : null
}

interface Props {
  /** The grid sheet; undefined while it is still being painted. */
  src?: string
  grid: Grid
  index: number
  /** Frame width / height; the panel is trimmed to fill it. Default square. */
  aspect?: number
  alt: string
  painting?: boolean
  className?: string
}

export function Panel({ src, grid, index, aspect = 1, alt, painting, className }: Props) {
  const sheet = useSheet(src, grid)
  const box = sheet?.boxes[index]
  if (src && box) {
    const framed = coverBox(box, sheet.aspect, aspect)
    return <div role="img" aria-label={alt} className={cn('bg-no-repeat', className)} style={cropStyle(src, framed)} />
  }
  if ((src && !sheet) || painting) {
    return <div aria-hidden className={cn('sprout-shimmer', className)} />
  }
  return null
}
