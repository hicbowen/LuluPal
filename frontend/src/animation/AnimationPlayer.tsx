import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export type AnimationDefinition = {
  frames: string[]
  durations?: number[]
  fps?: number
  loop: boolean
  loopFrom?: number
  repeat?: number
  displayScale?: number
  displayOffsetY?: number
}

export type PetManifest = {
  id: string
  anchor: { x: number; y: number }
  animations: Record<string, AnimationDefinition>
}

type Props = {
  manifest: PetManifest
  animation: string
  flip?: boolean
  onComplete?: () => void
}

export function AnimationPlayer({ manifest, animation, flip, onComplete }: Props) {
  const definition = manifest.animations[animation] ?? manifest.animations.idle
  const frames = definition?.frames ?? []
  const [index, setIndex] = useState(0)
  const [iteration, setIteration] = useState(0)
  const preloadRef = useRef<HTMLImageElement[]>([])
  const current = frames[Math.min(index, frames.length - 1)]
  const duration = useMemo(() => {
    if (definition?.durations?.[index]) return definition.durations[index]
    return definition?.fps ? 1000 / definition.fps : 250
  }, [definition, index])

  useEffect(() => {
    const paths = [...new Set(
      Object.values(manifest.animations).flatMap(value => value.frames),
    )]
    preloadRef.current = paths.map(path => {
      const image = new Image()
      image.src = `/pets/${manifest.id}/${path}`
      const decode = image.decode?.()
      if (decode) void decode.catch(() => undefined)
      return image
    })
    return () => { preloadRef.current = [] }
  }, [manifest])

  // Reset before paint. A normal effect can briefly apply the previous
  // animation's high frame index to the new animation and flash its last frame.
  useLayoutEffect(() => {
    setIndex(0)
    setIteration(0)
  }, [animation])
  useEffect(() => {
    if (!frames.length) return
    const timer = window.setTimeout(() => {
      if (index + 1 < frames.length) setIndex(index + 1)
      else if (definition.loop) {
        const loopFrom = Math.min(
          Math.max(definition.loopFrom ?? 0, 0),
          Math.max(frames.length - 1, 0),
        )
        setIndex(loopFrom)
      }
      else if (iteration + 1 < Math.max(1, definition.repeat ?? 1)) {
        setIteration(value => value + 1)
        setIndex(0)
      } else onComplete?.()
    }, duration)
    return () => window.clearTimeout(timer)
  }, [definition.loop, definition.loopFrom, definition.repeat, duration, frames.length, index, iteration, onComplete])

  if (!current) return null
  const transforms = [
    definition.displayOffsetY ? `translateY(${definition.displayOffsetY}px)` : '',
    flip ? 'scaleX(-1)' : '',
    definition.displayScale ? `scale(${definition.displayScale})` : '',
  ].filter(Boolean)
  return <img
    className="pet-frame"
    src={`/pets/${manifest.id}/${current}`}
    style={{
      transform: transforms.length ? transforms.join(' ') : undefined,
      transformOrigin: definition.displayScale ? '50% 100%' : undefined,
    }}
    draggable={false}
  />
}
