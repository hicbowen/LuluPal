export type PetState =
  | 'idle' | 'walk' | 'jump' | 'sleepEnter' | 'sleep' | 'wake' | 'speaking'
  | 'petting' | 'clicked' | 'dragged' | 'celebrate' | 'sad'
  | 'paused' | 'hidden'

export type BehaviorEvent =
  | { type: 'RANDOM'; state: PetState }
  | { type: 'CLICK' }
  | { type: 'PET' }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_END' }
  | { type: 'SPEAK' }
  | { type: 'CELEBRATE' }
  | { type: 'COMPLETE' }
  | { type: 'PAUSE'; enabled: boolean }

const priority: Record<PetState, number> = {
  hidden: 100, paused: 90, celebrate: 80, dragged: 70,
  wake: 65, petting: 60, clicked: 60, speaking: 50,
  jump: 40, walk: 30, sleepEnter: 20, sleep: 20, sad: 15, idle: 10,
}

export function transition(current: PetState, event: BehaviorEvent): PetState {
  if (event.type === 'PAUSE') return event.enabled ? 'paused' : 'idle'
  if (current === 'paused' || current === 'hidden') return current
  if (event.type === 'DRAG_START') return 'dragged'
  if (event.type === 'DRAG_END') return 'idle'
  if (event.type === 'CELEBRATE') return 'celebrate'
  if (event.type === 'PET') return priority.petting >= priority[current] ? 'petting' : current
  if (event.type === 'CLICK') {
    if (current === 'sleep' || current === 'sleepEnter') return 'wake'
    return priority.clicked >= priority[current] ? 'clicked' : current
  }
  if (event.type === 'SPEAK') return priority.speaking >= priority[current] ? 'speaking' : current
  if (event.type === 'RANDOM') return priority[event.state] >= priority[current] ? event.state : current
  if (event.type === 'COMPLETE') {
    if (current === 'sleepEnter') return 'sleep'
    if (current === 'sleep') return 'wake'
    return 'idle'
  }
  return current
}

export type WeightedBehavior = { state: PetState; weight: number }

export function chooseWeighted(
  behaviors: WeightedBehavior[],
  random: number,
  previous?: PetState,
): PetState {
  const eligible = behaviors.filter(item => item.weight > 0 && (behaviors.length === 1 || item.state !== previous))
  const total = eligible.reduce((sum, item) => sum + item.weight, 0)
  let point = Math.max(0, Math.min(0.999999, random)) * total
  for (const item of eligible) {
    point -= item.weight
    if (point < 0) return item.state
  }
  return eligible[eligible.length - 1]?.state ?? 'idle'
}

export const defaultBehaviors: WeightedBehavior[] = [
  { state: 'idle', weight: 45 },
  { state: 'walk', weight: 25 },
  { state: 'jump', weight: 10 },
  { state: 'sleepEnter', weight: 7 },
  { state: 'celebrate', weight: 3 },
]

export const behaviorDuration: Partial<Record<PetState, number>> = {
  walk: 4200,
  jump: 1600,
  speaking: 2600,
  sleepEnter: 2000,
  sleep: 6500,
  wake: 1400,
  petting: 1300,
  clicked: 1200,
  celebrate: 1800,
  sad: 2400,
}
