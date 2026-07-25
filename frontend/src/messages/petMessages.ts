export type MessageCategory =
  | 'countdown' | 'work' | 'morning' | 'lunch' | 'evening'
  | 'petting' | 'click' | 'sleep' | 'special'

export type PetMessage = {
  id: string
  text: string
  category: MessageCategory
  weight: number
  minDays?: number
  maxDays?: number
  weekdays?: number[]
  timeRange?: { start: string; end: string }
  cooldownMinutes?: number
}

export type MessageContext = {
  days: number
  workingDays: number
  targetDate: string
  now: Date
  hasTarget: boolean
  isTargetDay: boolean
  isExpired: boolean
  daysAfterTarget: number
}

export const messageCategoryLabels: Record<MessageCategory, string> = {
  countdown: '倒计时',
  work: '工作',
  morning: '早晨',
  lunch: '午休',
  evening: '晚上',
  petting: '抚摸',
  click: '点击',
  sleep: '睡觉',
  special: '特殊阶段',
}

export const messages: PetMessage[] = [
  { id: 'countdown-days', category: 'countdown', text: '距离解放还有 {days} 天。', weight: 7 },
  { id: 'countdown-workdays', category: 'countdown', text: '还有 {workingDays} 个工作日，坚持住。', weight: 5 },
  { id: 'countdown-little-less', category: 'countdown', text: '今天也成功熬过去一点。', weight: 3 },
  { id: 'countdown-calendar', category: 'countdown', text: '{targetDate}，噜噜帮你记着呢。', weight: 2, cooldownMinutes: 60 },
  { id: 'countdown-progress', category: 'countdown', text: '每过一天，自由就靠近一点。', weight: 3 },

  { id: 'work-fish', category: 'work', text: '认真工作，也要认真摸鱼。', weight: 3 },
  { id: 'work-water', category: 'work', text: '喝口水吧，待办不会趁机逃跑的。', weight: 3, cooldownMinutes: 40 },
  { id: 'work-stretch', category: 'work', text: '肩膀放松一下，噜噜替你盯两秒。', weight: 3, cooldownMinutes: 45 },
  { id: 'work-friday', category: 'work', text: '周五了，空气里已经有周末的味道。', weight: 5, weekdays: [5] },
  { id: 'work-steady', category: 'work', text: '慢慢来，今天完成一点也很厉害。', weight: 2 },

  { id: 'morning-hi', category: 'morning', text: '早呀，今天也一起稳稳度过。', weight: 4, timeRange: { start: '06:00', end: '10:30' } },
  { id: 'morning-breakfast', category: 'morning', text: '早餐吃了吗？空着肚子可熬不动。', weight: 3, timeRange: { start: '06:00', end: '10:30' } },
  { id: 'morning-plan', category: 'morning', text: '先做最重要的一件事，剩下的慢慢来。', weight: 2, timeRange: { start: '08:00', end: '11:00' } },

  { id: 'lunch-eat', category: 'lunch', text: '到饭点啦，先去好好吃饭。', weight: 4, timeRange: { start: '11:30', end: '13:30' } },
  { id: 'lunch-rest', category: 'lunch', text: '午休十分钟，下午会轻松一点。', weight: 3, timeRange: { start: '12:00', end: '14:00' } },
  { id: 'lunch-fruit', category: 'lunch', text: '今天的饭后水果，要不要吃个橘子？', weight: 2, timeRange: { start: '11:30', end: '14:00' } },

  { id: 'evening-off', category: 'evening', text: '到点就下班，工作明天还会在。', weight: 4, timeRange: { start: '17:30', end: '23:30' } },
  { id: 'evening-done', category: 'evening', text: '辛苦啦，今天已经做得够多了。', weight: 3, timeRange: { start: '18:00', end: '23:59' } },
  { id: 'evening-rest', category: 'evening', text: '把工作留在桌面，把晚上还给自己。', weight: 3, timeRange: { start: '19:00', end: '23:59' } },

  { id: 'petting-cannot', category: 'petting', text: '摸我也不能提前离职。', weight: 4 },
  { id: 'petting-trick', category: 'petting', text: '再摸一下少一天。骗你的。', weight: 4 },
  { id: 'petting-fish', category: 'petting', text: '你是在摸鱼，还是在摸我？', weight: 5 },
  { id: 'petting-comfy', category: 'petting', text: '这里可以再多摸两下。', weight: 3 },
  { id: 'petting-friend', category: 'petting', text: '好吧，今天批准你和噜噜贴贴。', weight: 2 },

  { id: 'click-here', category: 'click', text: '我在呢，怎么啦？', weight: 4 },
  { id: 'click-orange', category: 'click', text: '不许按我的小橘子帽！', weight: 3 },
  { id: 'click-count', category: 'click', text: '点我不会少一天，但心情可能会好一点。', weight: 4 },
  { id: 'click-tickle', category: 'click', text: '痒痒痒，再点我要跑啦。', weight: 3 },

  { id: 'sleep-night', category: 'sleep', text: '噜噜先眯一会儿，等下继续陪你。', weight: 4 },
  { id: 'sleep-soft', category: 'sleep', text: '嘘……倒计时也需要午睡。', weight: 3 },
  { id: 'sleep-dream', category: 'sleep', text: '梦里已经放假啦。', weight: 3 },

  { id: 'special-week', category: 'special', text: '最后一周！自由已经在门口等你啦。', weight: 7, minDays: 1, maxDays: 7 },
  { id: 'special-three', category: 'special', text: '只剩 {days} 天，稳住，我们能赢。', weight: 8, minDays: 1, maxDays: 3 },
  { id: 'special-today', category: 'special', text: '今天解放！去迎接你的新生活吧！', weight: 10, minDays: 0, maxDays: 0 },
  { id: 'special-free', category: 'special', text: '已经自由 {days} 天，今天也要开心。', weight: 6 },
]

const lastShown = new Map<string, number>()
const recentIds: string[] = []

function minutes(value: string) {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}

function inTimeRange(now: Date, range?: PetMessage['timeRange']) {
  if (!range) return true
  const current = now.getHours() * 60 + now.getMinutes()
  const start = minutes(range.start)
  const end = minutes(range.end)
  return start <= end ? current >= start && current <= end : current >= start || current <= end
}

function formatMessage(text: string, context: MessageContext) {
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][context.now.getDay()]
  const time = context.now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const replacements: Record<string, string> = {
    '{days}': String(context.isExpired ? context.daysAfterTarget : context.days),
    '{workingDays}': String(context.workingDays),
    '{targetDate}': context.targetDate,
    '{weekday}': weekday,
    '{time}': time,
  }
  return Object.entries(replacements).reduce(
    (value, [placeholder, replacement]) => value.split(placeholder).join(replacement),
    text,
  )
}

export function selectPetMessage(
  context: MessageContext,
  enabled: Record<MessageCategory, boolean>,
  requested?: MessageCategory,
) {
  if (!context.hasTarget && (requested === 'countdown' || requested === 'special')) {
    return '先在设置里告诉我离职日期吧'
  }
  const now = context.now.getTime()
  const eligible = messages.filter(message => {
    if (!enabled[message.category] || (requested && message.category !== requested)) return false
    if (!requested && ['petting', 'click', 'sleep'].includes(message.category)) return false
    if ((message.category === 'countdown' || message.category === 'special') && !context.hasTarget) return false
    if (message.id === 'special-today' && !context.isTargetDay) return false
    if (message.id === 'special-free' && !context.isExpired) return false
    if (message.category === 'special' && !context.isExpired && !context.isTargetDay && context.days > 7) return false
    if (message.minDays !== undefined && context.days < message.minDays) return false
    if (message.maxDays !== undefined && context.days > message.maxDays) return false
    if (message.weekdays && !message.weekdays.includes(context.now.getDay())) return false
    if (!inTimeRange(context.now, message.timeRange)) return false
    const last = lastShown.get(message.id)
    return !last || now-last >= (message.cooldownMinutes ?? 0)*60_000
  })
  const fresh = eligible.filter(message => !recentIds.includes(message.id))
  const candidates = fresh.length ? fresh : eligible
  if (!candidates.length) {
    return undefined
  }
  const total = candidates.reduce((sum, message) => sum + message.weight, 0)
  let point = Math.random() * total
  const selected = candidates.find(message => (point -= message.weight) <= 0) ?? candidates[0]
  lastShown.set(selected.id, now)
  recentIds.push(selected.id)
  if (recentIds.length > 3) recentIds.shift()
  return formatMessage(selected.text, context)
}
