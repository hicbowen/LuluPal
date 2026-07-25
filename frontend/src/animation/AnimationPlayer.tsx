import { useEffect, useMemo, useState } from 'react'

export type AnimationDefinition = {
  frames: string[]
  durations?: number[]
  fps?: number
  loop: boolean
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
  const current = frames[Math.min(index, frames.length - 1)]
  const duration = useMemo(() => {
    if (definition?.durations?.[index]) return definition.durations[index]
    return definition?.fps ? 1000 / definition.fps : 250
  }, [definition, index])

  useEffect(() => { setIndex(0) }, [animation])
  useEffect(() => {
    if (!frames.length) return
    const timer = window.setTimeout(() => {
      if (index + 1 < frames.length) setIndex(index + 1)
      else if (definition.loop) setIndex(0)
      else onComplete?.()
    }, duration)
    return () => window.clearTimeout(timer)
  }, [definition.loop, duration, frames.length, index, onComplete])

  if (!current) return null
  return <img className="pet-frame" src={`/pets/${manifest.id}/${current}`} style={{ transform: flip ? 'scaleX(-1)' : undefined }} draggable={false}/>
}
