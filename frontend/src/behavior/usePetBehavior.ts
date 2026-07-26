import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  behaviorDuration, BehaviorEvent, chooseWeighted, defaultBehaviors,
  PetState, transition,
} from './behaviorMachine'

const STARTUP_GRACE_MS = 5000
const MIN_INTERVAL_MS = 7000
const MAX_INTERVAL_MS = 14000

export function usePetBehavior(sleepDurationMS = 30_000) {
  const [state, dispatchBase] = useReducer(transition, 'idle' as PetState)
  const lastRandom = useRef<PetState>('idle')
  const firstIdle = useRef(true)
  const dispatch = useCallback((event: BehaviorEvent) => dispatchBase(event), [])

  useEffect(() => {
    if (state === 'dragged' || state === 'paused' || state === 'hidden' || state === 'singing') return
    let timer: number
    let cancelled = false

    if (state === 'idle') {
      const scheduleRandom = (delay: number) => {
        timer = window.setTimeout(() => {
          if (cancelled) return
          const next = chooseWeighted(defaultBehaviors, Math.random(), lastRandom.current)
          lastRandom.current = next
          if (next === 'idle') {
            scheduleRandom(MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS))
          } else {
            dispatchBase({ type: 'RANDOM', state: next })
          }
        }, delay)
      }
      scheduleRandom(firstIdle.current
        ? STARTUP_GRACE_MS
        : MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS))
      firstIdle.current = false
    } else {
      // One state-owned timer is the fallback/maximum dwell timer. Non-looping
      // animations normally complete first; looping states such as walk,
      // speaking and sleep are advanced by this timer.
      timer = window.setTimeout(
        () => dispatchBase({ type: 'COMPLETE' }),
        state === 'sleep' ? sleepDurationMS : behaviorDuration[state] ?? 2000,
      )
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sleepDurationMS, state])

  return { state, dispatch }
}
