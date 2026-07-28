import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import {
  CalendarClock, HeartPulse, Home, MapPin, MessageCircle, MessageCircleMore,
  Palette, Scaling, Settings,
  type LucideIcon,
} from 'lucide-react'
import { AppService } from '../bindings/luluday'
import { AnimationPlayer, PetManifest } from './animation/AnimationPlayer'
import { usePetBehavior } from './behavior/usePetBehavior'
import { useSPlayerLyrics } from './splayer/useSPlayerLyrics'
import {
  editableMessages, MessageCategory, messageCategoryLabels, selectPetMessage,
} from './messages/petMessages'
import './app.css'
import './pet-window.css'
import './karaoke.css'

type Config = {
  version: number; targetDate: string; countdownMode: string
  restWeekdays: number[]
  includeToday: boolean; includeTargetDate: boolean; petScale: number
  activityArea: string; bottomMargin: number
  sleepDurationSeconds: number
  alwaysOnTop: boolean; launchAtStartup: boolean; bubbleEnabled: boolean
  splayerEnabled: boolean
  bubbleIntervalMin: number; bubbleIntervalMax: number; bubbleDisplaySeconds: number
  bubbleCategories: Record<MessageCategory, boolean>
  customMessages: Record<string, string>
  quietHours: { enabled: boolean; start: string; end: string }
  healthReminders: {
    enabled: boolean
    waterEnabled: boolean; waterIntervalMinutes: number
    standEnabled: boolean; standIntervalMinutes: number
    snoozeMinutes: number
  }
  position: { displayId: string; x: number; y: number }
}
type Countdown = { calendarDays: number; workingDays: number; isTargetDay: boolean; isExpired: boolean; daysAfterTarget: number }
type SettingsSection = 'home' | 'appearance' | 'interaction' | 'health' | 'countdown' | 'system'
type HealthReminderKind = 'water' | 'stand'
type HealthReminder = { id: string; kind: HealthReminderKind; text: string }
const SINGING_PAUSE_GRACE_MS = 10_000

const fallback: Config = {
  version: 8, targetDate: '', countdownMode: 'calendar', restWeekdays: [0, 6], includeToday: false,
  includeTargetDate: true, petScale: 1, activityArea: 'bottom', bottomMargin: 12,
  sleepDurationSeconds: 30,
  alwaysOnTop: true, launchAtStartup: false,
  bubbleEnabled: true, splayerEnabled: true,
  bubbleIntervalMin: 20, bubbleIntervalMax: 45,
  bubbleDisplaySeconds: 7,
  bubbleCategories: {
    countdown: true, work: true, morning: true, lunch: true, evening: true,
    petting: true, click: true, sleep: true, special: true,
  },
  customMessages: {},
  quietHours: { enabled: true, start: '22:00', end: '08:00' },
  healthReminders: {
    enabled: true,
    waterEnabled: true, waterIntervalMinutes: 60,
    standEnabled: true, standIntervalMinutes: 50,
    snoozeMinutes: 10,
  },
  position: { displayId: '', x: 0, y: 0 },
}

function normaliseConfig(value: unknown): Config {
  const source = (value ?? {}) as Partial<Config>
  return {
    ...fallback,
    ...source,
    restWeekdays: source.restWeekdays ?? fallback.restWeekdays,
    bubbleCategories: {
      ...fallback.bubbleCategories,
      ...(source.bubbleCategories ?? {}),
    },
    customMessages: {...(source.customMessages ?? {})},
    quietHours: {...fallback.quietHours, ...(source.quietHours ?? {})},
    healthReminders: {...fallback.healthReminders, ...(source.healthReminders ?? {})},
    position: {...fallback.position, ...(source.position ?? {})},
  }
}

const api = {
  getConfig: async () => normaliseConfig(await AppService.GetConfig()),
  saveConfig: (value: Config) => AppService.SaveConfig(value),
  countdown: (value: Config) => AppService.Countdown(value.targetDate, value.includeToday, value.includeTargetDate, value.restWeekdays) as Promise<Countdown>,
}

const weekdays = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' },
  { value: 3, label: '周三' }, { value: 4, label: '周四' },
  { value: 5, label: '周五' }, { value: 6, label: '周六' },
  { value: 0, label: '周日' },
]

const messageGroups = (Object.keys(messageCategoryLabels) as MessageCategory[]).map(category => ({
  category,
  messages: editableMessages.filter(message => message.category === category),
}))

function countdownText(result?: Countdown, mode = 'calendar') {
  if (!result) return '先设置一个值得期待的日期吧'
  if (result.isTargetDay) return '期待的日子就是今天！'
  if (result.isExpired) return `目标日已经过去 ${result.daysAfterTarget} 天`
  const days = mode === 'workday' ? result.workingDays : result.calendarDays
  return `距离目标还有 ${days} 天`
}

function isQuietTime(now: Date, quiet: Config['quietHours']) {
  if (!quiet.enabled || !quiet.start || !quiet.end || quiet.start === quiet.end) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (value: string) => {
    const [hours, mins] = value.split(':').map(Number)
    return hours * 60 + mins
  }
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end
}

function createHealthReminder(kind: HealthReminderKind): HealthReminder {
  return {
    id: `${kind}-${Date.now()}`,
    kind,
    text: kind === 'water'
      ? '到喝水时间啦，要和噜噜一起喝一杯吗？'
      : '已经坐了一阵子，要和噜噜一起站起来活动一下吗？',
  }
}

function recordHealthAction(kind: HealthReminderKind) {
  const day = new Date().toLocaleDateString('sv-SE')
  const key = `luluday:health:${day}`
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>
    current[kind] = (current[kind] ?? 0) + 1
    localStorage.setItem(key, JSON.stringify(current))
    return current[kind]
  } catch {
    return 1
  }
}

function PetWindow() {
  const [config, setConfig] = useState(fallback)
  const [result, setResult] = useState<Countdown>()
  const [bubble, setBubble] = useState(false)
  const [bubbleText, setBubbleText] = useState('')
  const [healthReminder, setHealthReminder] = useState<HealthReminder>()
  const [healthFeedback, setHealthFeedback] = useState('')
  const [manifest, setManifest] = useState<PetManifest>()
  const [direction, setDirection] = useState<'left'|'right'>('right')
  const { state, dispatch } = usePetBehavior(config.sleepDurationSeconds * 1000)
  const splayer = useSPlayerLyrics(config.splayerEnabled)
  const dragged = useRef(false)
  const programmaticResize = useRef(false)
  const bubbleTimer = useRef<number>()
  const healthFeedbackTimer = useRef<number>()
  const healthDue = useRef<Record<HealthReminderKind, number>>({water: 0, stand: 0})
  const healthLatest = useRef({ config, state, reminder: healthReminder })
  const motionLatest = useRef({ state, direction })
  healthLatest.current = { config, state, reminder: healthReminder }
  motionLatest.current = { state, direction }
  const showBubble = useCallback((category?: MessageCategory) => {
    if (!config.bubbleEnabled) return
    window.clearTimeout(bubbleTimer.current)
    const days = config.countdownMode === 'workday'
      ? result?.workingDays ?? 0
      : result?.calendarDays ?? 0
    const text = selectPetMessage({
      days,
      workingDays: result?.workingDays ?? 0,
      targetDate: config.targetDate,
      now: new Date(),
      hasTarget: Boolean(config.targetDate && result),
      isTargetDay: result?.isTargetDay ?? false,
      isExpired: result?.isExpired ?? false,
      daysAfterTarget: result?.daysAfterTarget ?? 0,
    }, config.bubbleCategories, category, config.customMessages)
    if (!text) return
    setBubbleText(text)
    setBubble(true)
    bubbleTimer.current = window.setTimeout(
      () => setBubble(false),
      Math.max(3, config.bubbleDisplaySeconds || 7) * 1000,
    )
  }, [config.bubbleCategories, config.bubbleDisplaySeconds, config.bubbleEnabled, config.countdownMode, config.customMessages, config.targetDate, result])
  const hideBubble = useCallback(() => {
    window.clearTimeout(bubbleTimer.current)
    window.clearTimeout(healthFeedbackTimer.current)
    setBubble(false)
    setHealthFeedback('')
  }, [])
  const refresh = (next: Config) => { setConfig(next); if (next.targetDate) api.countdown(next).then(setResult).catch(console.error) }
  useEffect(() => {
    api.getConfig().then(refresh).catch(console.error)
    fetch('/pets/lulu/manifest.json').then(value => value.json()).then(setManifest).catch(console.error)
    const off = Events.On('config:changed', event => refresh(normaliseConfig(event.data)))
    let dragRecoveryTimer: number | undefined
    const finishDrag = () => {
      if (programmaticResize.current) return
      window.clearTimeout(dragRecoveryTimer)
      window.clearTimeout(bubbleTimer.current)
      dispatch({ type: 'DRAG_END' })
      AppService.KeepInActivityArea().catch(console.error)
      window.setTimeout(() => { dragged.current = false }, 80)
    }
    const dragStart = Events.On('windows:WindowStartMove', () => {
      dragged.current = true
      dispatch({ type: 'DRAG_START' })
    })
    const dragEnd = Events.On('windows:WindowEndMove', finishDrag)
    // Wails alpha2.117 can classify WM_EXITSIZEMOVE as EndResize after the
    // mouse button has already been released. This window cannot resize, so
    // EndResize is unambiguously the end of a drag operation.
    const misclassifiedDragEnd = Events.On('windows:WindowEndResize', finishDrag)
    const moved = Events.On('windows:WindowDidMove', () => {
      if (!dragged.current) return
      window.clearTimeout(dragRecoveryTimer)
      dragRecoveryTimer = window.setTimeout(finishDrag, 220)
    })
    const motionDirection = Events.On('motion:direction', event => {
      setDirection(event.data === 'left' ? 'left' : 'right')
    })
    const sleep = Events.On('pet:sleep', () => {
      hideBubble()
      dispatch({ type: 'SLEEP' })
    })
    const exercise = Events.On('pet:exercise', () => {
      hideBubble()
      dispatch({ type: 'EXERCISE' })
    })
    const healthPreview = Events.On('health:preview', event => {
      const kind = event.data === 'stand' ? 'stand' : 'water'
      hideBubble()
      setHealthFeedback('')
      setHealthReminder(createHealthReminder(kind))
      dispatch({ type: 'REMINDER_START' })
    })
    return () => {
      window.clearTimeout(dragRecoveryTimer)
      window.clearTimeout(bubbleTimer.current)
      window.clearTimeout(healthFeedbackTimer.current)
      off(); dragStart(); dragEnd(); misclassifiedDragEnd(); moved(); motionDirection(); sleep(); exercise(); healthPreview()
    }
  }, [])
  useEffect(() => {
    if (result?.isTargetDay) dispatch({ type: 'CELEBRATE' })
  }, [result?.isTargetDay])
  useEffect(() => {
    if (!splayer.connected) {
      dispatch({ type: 'SINGING_STOP' })
      return
    }
    if (splayer.playing) {
      dispatch({ type: 'SINGING_START' })
      hideBubble()
      return
    }
    const timer = window.setTimeout(
      () => dispatch({ type: 'SINGING_STOP' }),
      SINGING_PAUSE_GRACE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [dispatch, hideBubble, splayer.connected, splayer.playing])
  useEffect(() => {
    if (state === 'speaking') showBubble()
    if (state === 'sleepEnter') showBubble('sleep')
  }, [showBubble, state])
  useEffect(() => {
    if (!config.bubbleEnabled) hideBubble()
  }, [config.bubbleEnabled, hideBubble])
  useEffect(() => {
    const health = config.healthReminders
    const now = Date.now()
    healthDue.current.water = now + health.waterIntervalMinutes * 60_000
    healthDue.current.stand = now + health.standIntervalMinutes * 60_000
    if (!health.enabled) {
      setHealthReminder(undefined)
      return
    }
    const timer = window.setInterval(() => {
      const latest = healthLatest.current
      if (
        latest.reminder
        || latest.state !== 'idle'
        || isQuietTime(new Date(), latest.config.quietHours)
      ) return
      const currentTime = Date.now()
      const settings = latest.config.healthReminders
      const kind = settings.waterEnabled && currentTime >= healthDue.current.water
        ? 'water'
        : settings.standEnabled && currentTime >= healthDue.current.stand
          ? 'stand'
          : undefined
      if (!kind) return
      const interval = kind === 'water'
        ? settings.waterIntervalMinutes
        : settings.standIntervalMinutes
      healthDue.current[kind] = currentTime + interval * 60_000
      hideBubble()
      setHealthFeedback('')
      setHealthReminder(createHealthReminder(kind))
      dispatch({ type: 'REMINDER_START' })
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [
    config.healthReminders.enabled,
    config.healthReminders.standEnabled,
    config.healthReminders.standIntervalMinutes,
    config.healthReminders.waterEnabled,
    config.healthReminders.waterIntervalMinutes,
    dispatch,
    hideBubble,
  ])
  useEffect(() => {
    if (!config.bubbleEnabled) return
    let timer: number
    let cancelled = false
    const schedule = () => {
      const min = Math.max(1, config.bubbleIntervalMin)
      const max = Math.max(min, config.bubbleIntervalMax)
      const delay = (min + Math.random() * (max - min)) * 60_000
      timer = window.setTimeout(() => {
        if (cancelled) return
        if (!isQuietTime(new Date(), config.quietHours)) {
          dispatch({ type: 'SPEAK' })
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [config.bubbleEnabled, config.bubbleIntervalMax, config.bubbleIntervalMin, config.quietHours, dispatch])
  useEffect(() => {
    if (state === 'walk') {
      const nextDirection = Math.random() < 0.5 ? 'left' : 'right'
      setDirection(nextDirection)
      AppService.StartMotion(nextDirection, 72, 4200).catch(console.error)
    } else if (state === 'jump') {
      AppService.StartJump(56 * config.petScale, 880).catch(console.error)
    } else {
      AppService.StopMotion().catch(console.error)
    }
  }, [config.petScale, state])
  useEffect(() => () => {
    AppService.StopMotion().catch(console.error)
  }, [])
  const click = () => {
    if (dragged.current) return
    dispatch({ type: 'CLICK' })
    showBubble('click')
  }
  const pet = () => {
    if (dragged.current) return
    dispatch({ type: 'PET' })
    showBubble('petting')
  }
  const animationComplete = useCallback(() => dispatch({ type: 'COMPLETE' }), [dispatch])
  const resolveHealthReminder = (action: 'complete' | 'snooze' | 'skip') => {
    if (!healthReminder) return
    const { kind } = healthReminder
    setHealthReminder(undefined)
    window.clearTimeout(bubbleTimer.current)
    window.clearTimeout(healthFeedbackTimer.current)
    if (action === 'complete') {
      const count = recordHealthAction(kind)
      setHealthFeedback(kind === 'water'
        ? `干杯！今天已经和噜噜喝了 ${count} 杯水。`
        : `活动完成！今天已经起来舒展 ${count} 次啦。`)
      dispatch({ type: kind === 'water' ? 'DRINK' : 'STRETCH' })
    } else if (action === 'snooze') {
      healthDue.current[kind] = Date.now() + config.healthReminders.snoozeMinutes * 60_000
      setHealthFeedback(`${config.healthReminders.snoozeMinutes} 分钟后，噜噜再来叫你。`)
      dispatch({ type: 'REMINDER_END' })
    } else {
      setHealthFeedback('好呀，这次先跳过，舒服最重要。')
      dispatch({ type: 'REMINDER_END' })
    }
    healthFeedbackTimer.current = window.setTimeout(() => setHealthFeedback(''), 4_500)
  }
  const bubbleBottom = 12 + 245 * config.petScale + 8
  const showingSPlayer = splayer.connected && state === 'singing'
  const visibleBubble = Boolean(healthReminder || healthFeedback)
    || (showingSPlayer ? Boolean(splayer.text) : config.bubbleEnabled && bubble)
  const visibleBubbleText = healthFeedback || (showingSPlayer ? splayer.text : bubbleText)
  const bubbleWindowMode = healthReminder
    ? 'action'
    : showingSPlayer || healthFeedback || (config.bubbleEnabled && bubble)
      ? 'normal'
      : 'none'
  useEffect(() => {
    let cancelled = false
    programmaticResize.current = true
    AppService.SetPetBubbleMode(bubbleWindowMode)
      .then(() => {
        const latest = motionLatest.current
        if (!cancelled && latest.state === 'walk') {
          return AppService.StartMotion(latest.direction, 72, 4200)
        }
      })
      .catch(console.error)
      .finally(() => window.setTimeout(() => { programmaticResize.current = false }, 250))
    return () => { cancelled = true }
  }, [bubbleWindowMode])
  useEffect(() => () => {
    AppService.SetPetBubbleMode('none').catch(console.error)
  }, [])
  const animation = state === 'singing' && (!splayer.playing || !splayer.text) ? 'singingIdle' : state
  return <main className="pet-stage" onDoubleClick={pet}>
    {visibleBubble && <div
      className={`speech${healthReminder ? ' speech-action' : ''}`}
      style={{ bottom: bubbleBottom, top: 'auto' }}
      onClick={showingSPlayer || healthReminder ? undefined : hideBubble}
    >
      {healthReminder
        ? <>
          <div className="health-copy">{healthReminder.text}</div>
          <div className="health-actions">
            <button onClick={event => { event.stopPropagation(); resolveHealthReminder('complete') }}>
              {healthReminder.kind === 'water' ? '喝一杯' : '起来活动'}
            </button>
            <button className="secondary" onClick={event => { event.stopPropagation(); resolveHealthReminder('snooze') }}>
              {config.healthReminders.snoozeMinutes} 分钟后
            </button>
            <button className="quiet" onClick={event => { event.stopPropagation(); resolveHealthReminder('skip') }}>
              这次跳过
            </button>
          </div>
        </>
        : showingSPlayer && splayer.words
          ? <span className="karaoke-line">{splayer.words.map((word, index) =>
            <span
              className="karaoke-word"
              key={`${index}-${word.text}`}
              style={{ '--karaoke-progress': `${word.progress * 100}%` } as CSSProperties}
            >{word.text}</span>,
          )}</span>
          : visibleBubbleText}
      {!showingSPlayer && !healthReminder && <span>×</span>}
    </div>}
    <div className="pet" style={{ transform: `translateX(-50%) scale(${config.petScale})` }} onClick={click}>
      {manifest && <AnimationPlayer manifest={manifest} animation={animation} flip={state === 'walk' && direction === 'right'} onComplete={animationComplete}/>}
    </div>
  </main>
}

function SettingsWindow() {
  const [section, setSection] = useState<SettingsSection>('home')
  const [autostartAvailable, setAutostartAvailable] = useState(false)
  const [config, setConfig] = useState(fallback)
  const [result, setResult] = useState<Countdown>()
  const [status, setStatus] = useState('')
  const hydrated = useRef(false)
  const lastSaved = useRef('')
  const statusTimer = useRef<number>()
  useEffect(() => {
    AppService.AutostartAvailable().then(setAutostartAvailable).catch(console.error)
    api.getConfig().then(value => {
      lastSaved.current = JSON.stringify(value)
      setConfig(value)
      hydrated.current = true
    }).catch(error => {
      console.error(error)
      setStatus(`读取配置失败：${String(error)}`)
    })
    return () => window.clearTimeout(statusTimer.current)
  }, [])
  useEffect(() => {
    if (!config.targetDate) { setResult(undefined); return }
    const timer = window.setTimeout(() => api.countdown(config).then(setResult).catch(console.error), 100)
    return () => window.clearTimeout(timer)
  }, [config.targetDate, config.includeToday, config.includeTargetDate, config.restWeekdays])
  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig(v => ({...v, [key]: value}))
  const toggleRestWeekday = (day: number) => update(
    'restWeekdays',
    config.restWeekdays.includes(day)
      ? config.restWeekdays.filter(value => value !== day)
      : [...config.restWeekdays, day],
  )
  const updateCustomMessage = (id: string, text: string) => setConfig(value => {
    const customMessages = {...value.customMessages}
    if (text) customMessages[id] = text
    else delete customMessages[id]
    return {...value, customMessages}
  })
  const resetCustomMessages = (ids?: string[]) => setConfig(value => {
    if (!ids) return {...value, customMessages: {}}
    const customMessages = {...value.customMessages}
    ids.forEach(id => delete customMessages[id])
    return {...value, customMessages}
  })
  const customMessageCount = Object.values(config.customMessages)
    .filter(text => text.trim()).length
  const save = useCallback(async (value: Config) => {
    window.clearTimeout(statusTimer.current)
    setStatus('正在自动保存…')
    try {
      await api.saveConfig(value)
      lastSaved.current = JSON.stringify(value)
      setStatus('已保存，桌宠已同步')
      statusTimer.current = window.setTimeout(() => setStatus(''), 2200)
    } catch (error) {
      console.error(error)
      setStatus(`保存失败：${String(error)}`)
    }
  }, [])
  const setCurrentAsHome = async () => {
    try {
      await AppService.SetCurrentPositionAsHome()
      setStatus('已将噜噜当前位置设为初始位置')
    } catch (error) {
      console.error(error)
      setStatus(`设置初始位置失败：${String(error)}`)
    }
  }
  const restoreHome = async () => {
    await AppService.RestoreHomePosition()
    setStatus('噜噜已回到初始位置')
  }
  useEffect(() => {
    if (!hydrated.current) return
    const serialised = JSON.stringify(config)
    if (serialised === lastSaved.current) return
    const timer = window.setTimeout(() => { void save(config) }, 250)
    return () => window.clearTimeout(timer)
  }, [config, save])
  const preview = useMemo(() => countdownText(result, config.countdownMode), [config.countdownMode, result])
  const sectionCopy: Record<SettingsSection, { title: string; description: string }> = {
    home: { title: '桌面陪伴', description: '看看噜噜今天的状态，快速调整常用设置。' },
    appearance: { title: '外观与位置', description: '调整噜噜的大小、活动范围和桌面位置。' },
    interaction: { title: '互动气泡', description: '决定噜噜什么时候和你说话，以及聊些什么。' },
    health: { title: '健康陪伴', description: '让噜噜温柔地提醒你喝水和起来活动。' },
    countdown: { title: '倒计时', description: '可选的小工具，需要时再让噜噜帮你记住目标日期。' },
    system: { title: '通用设置', description: '管理启动、勿扰时间和应用运行方式。' },
  }
  const activityAreaLabel = config.activityArea === 'bottom-left'
    ? '桌面左下'
    : config.activityArea === 'bottom-right'
      ? '桌面右下'
      : '整条桌面底边'
  return <main className="settings-shell">
    <aside className="settings-sidebar">
      <div className="brand">
        <div className="mini-pet"><img src="/pets/lulu/animations/idle/001.png" alt="噜噜"/></div>
        <div><h1>噜噜</h1><p>你的桌面小伙伴</p></div>
      </div>
      <nav>
        {([
          ['home', Home, '首页'],
          ['appearance', Palette, '外观与位置'],
          ['interaction', MessageCircle, '互动气泡'],
          ['health', HeartPulse, '健康陪伴'],
          ['countdown', CalendarClock, '倒计时'],
          ['system', Settings, '通用设置'],
        ] as [SettingsSection, LucideIcon, string][]).map(([value, Icon, label]) =>
          <button key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value)}>
            <span className="nav-icon"><Icon aria-hidden="true"/></span>{label}
          </button>
        )}
      </nav>
      <div className="sidebar-tip"><span className="online-dot"/><span>噜噜正在桌面陪你</span></div>
      <small>v0.1.0 · LuluDay</small>
    </aside>
    <section className="settings-content">
      <header><div><h2>{sectionCopy[section].title}</h2><p>{sectionCopy[section].description} 设置会自动保存。</p></div></header>
      {section === 'home' && <>
        <div className="companion-hero">
          <div className="hero-copy">
            <span className="eyebrow">桌面陪伴中</span>
            <h3>嗨，我是噜噜。</h3>
            <p>我会在桌面散步、和你聊天，也可以提醒你喝水和活动。右键点我，随时可以隐藏、设置、睡觉或退出。</p>
            <div className="hero-actions">
              <button type="button" onClick={() => setSection('appearance')}>调整噜噜</button>
              <button type="button" className="secondary" onClick={() => setSection('interaction')}>互动设置</button>
            </div>
          </div>
          <div className="hero-pet" aria-hidden="true"><img src="/pets/lulu/animations/idle/001.png" alt=""/></div>
        </div>
        <div className="overview-grid">
          <button type="button" onClick={() => setSection('appearance')}>
            <span className="overview-icon orange"><Scaling aria-hidden="true"/></span>
            <span><small>显示大小</small><strong>{Math.round(config.petScale * 100)}%</strong></span>
          </button>
          <button type="button" onClick={() => setSection('appearance')}>
            <span className="overview-icon yellow"><MapPin aria-hidden="true"/></span>
            <span><small>活动范围</small><strong>{activityAreaLabel}</strong></span>
          </button>
          <button type="button" onClick={() => setSection('interaction')}>
            <span className="overview-icon green"><MessageCircleMore aria-hidden="true"/></span>
            <span><small>主动聊天</small><strong>{config.bubbleEnabled ? '已开启' : '已关闭'}</strong></span>
          </button>
          <button type="button" onClick={() => setSection('health')}>
            <span className="overview-icon rose"><HeartPulse aria-hidden="true"/></span>
            <span><small>健康陪伴</small><strong>{config.healthReminders.enabled ? '已开启' : '已关闭'}</strong></span>
          </button>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>常用开关</h3><p>这些设置可以随时修改</p></div></div>
          <label><span>始终置顶<small>让噜噜保持在其他窗口上方</small></span><input type="checkbox" checked={config.alwaysOnTop} onChange={e => update('alwaysOnTop', e.target.checked)}/></label>
          <label><span>主动聊天<small>让噜噜偶尔弹出一句话陪陪你</small></span><input type="checkbox" checked={config.bubbleEnabled} onChange={e => update('bubbleEnabled', e.target.checked)}/></label>
          <label><span>健康提醒<small>按设定间隔提醒喝水和活动</small></span><input type="checkbox" checked={config.healthReminders.enabled} onChange={e => update('healthReminders', {...config.healthReminders, enabled: e.target.checked})}/></label>
        </div>
      </>}
      {section === 'appearance' && <>
        <div className="section-intro-card">
          <div className="section-intro-pet"><img src="/pets/lulu/animations/walk-v4/001.png" alt="噜噜"/></div>
          <div><span>当前显示比例</span><strong>{Math.round(config.petScale * 100)}%</strong><small>{activityAreaLabel} · 底部间距 {config.bottomMargin}px</small></div>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>外观</h3><p>找到最适合你桌面的尺寸</p></div></div>
          <label><span>桌宠大小<small>{Math.round(config.petScale * 100)}%</small></span><input type="range" min=".3" max="1.3" step=".1" value={config.petScale} onChange={e => update('petScale', Number(e.target.value))}/></label>
          <label><span>始终置顶<small>让噜噜保持在其他窗口上方</small></span><input type="checkbox" checked={config.alwaysOnTop} onChange={e => update('alwaysOnTop', e.target.checked)}/></label>
          <label><span>睡眠时长<small>完全睡着后持续 {config.sleepDurationSeconds} 秒</small></span><input type="range" min="5" max="120" step="5" value={config.sleepDurationSeconds} onChange={e => update('sleepDurationSeconds', Number(e.target.value))}/></label>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>位置与活动</h3><p>限制噜噜自动散步的区域</p></div></div>
          <label><span>活动范围<small>噜噜会在选定的屏幕底部区域散步</small></span><select value={config.activityArea} onChange={e => update('activityArea', e.target.value)}><option value="bottom">整条底边</option><option value="bottom-left">左下区域</option><option value="bottom-right">右下区域</option></select></label>
          <label><span>底部间距<small>距离任务栏上方 {config.bottomMargin} 像素</small></span><input type="range" min="0" max="80" step="4" value={config.bottomMargin} onChange={e => update('bottomMargin', Number(e.target.value))}/></label>
          <div className="position-actions">
            <button type="button" onClick={() => void setCurrentAsHome()}>将当前位置设为初始位置</button>
            <button type="button" className="secondary" onClick={() => void restoreHome()}>回到初始位置</button>
          </div>
        </div>
      </>}
      {section === 'interaction' && <>
        <div className="panel"><div className="panel-heading"><div><h3>主动聊天</h3><p>双击噜噜也会触发一次互动</p></div></div>
          <label><span>显示气泡<small>关闭后仍可使用健康提醒和歌词气泡</small></span><input type="checkbox" checked={config.bubbleEnabled} onChange={e => update('bubbleEnabled', e.target.checked)}/></label>
          <label><span>最短出现间隔<small>{config.bubbleIntervalMin} 分钟</small></span><input type="range" min="1" max="120" step="1" disabled={!config.bubbleEnabled} value={config.bubbleIntervalMin} onChange={e => update('bubbleIntervalMin', Math.min(Number(e.target.value), config.bubbleIntervalMax))}/></label>
          <label><span>最长出现间隔<small>{config.bubbleIntervalMax} 分钟</small></span><input type="range" min="1" max="120" step="1" disabled={!config.bubbleEnabled} value={config.bubbleIntervalMax} onChange={e => update('bubbleIntervalMax', Math.max(Number(e.target.value), config.bubbleIntervalMin))}/></label>
          <label><span>显示时长<small>{config.bubbleDisplaySeconds} 秒</small></span><input type="range" min="3" max="15" step="1" disabled={!config.bubbleEnabled} value={config.bubbleDisplaySeconds} onChange={e => update('bubbleDisplaySeconds', Number(e.target.value))}/></label>
          <div className="message-categories">
            <span><strong>聊天内容</strong><small>选择你想让噜噜聊起的话题</small></span>
            <div>{(Object.keys(messageCategoryLabels) as MessageCategory[]).map(category =>
              <button
                key={category}
                type="button"
                disabled={!config.bubbleEnabled}
                className={config.bubbleCategories[category] ? 'selected' : ''}
                onClick={() => update('bubbleCategories', {...config.bubbleCategories, [category]: !config.bubbleCategories[category]})}
              >{messageCategoryLabels[category]}</button>
            )}</div>
          </div>
        </div>
        <div className="panel custom-message-panel">
          <div className="panel-heading">
            <div>
              <h3>自定义噜噜的话术</h3>
              <p>输入你想替换的内容；留空时继续使用输入框里的默认文案</p>
            </div>
            {customMessageCount > 0 && <button
              type="button"
              className="text-button"
              onClick={() => resetCustomMessages()}
            >恢复全部默认</button>}
          </div>
          <div className="setting-note message-template-note">
            <strong>支持动态占位符</strong>
            <small><code>{'{days}'}</code> 天数 · <code>{'{workingDays}'}</code> 工作日 · <code>{'{targetDate}'}</code> 日期 · <code>{'{weekday}'}</code> 星期 · <code>{'{time}'}</code> 时间</small>
          </div>
          <div className="message-editor">
            {messageGroups.map(group => {
              const customCount = group.messages.filter(message => config.customMessages[message.id]?.trim()).length
              return <details className="message-editor-group" key={group.category}>
                <summary>
                  <span>{messageCategoryLabels[group.category]}</span>
                  <small>{customCount ? `已自定义 ${customCount} 条` : `${group.messages.length} 条默认文案`}</small>
                </summary>
                <div className="message-editor-fields">
                  {group.messages.map((message, index) => <label className="message-copy-field" key={message.id}>
                    <span>
                      {message.id === 'system-no-target' ? '未设置日期提示' : `文案 ${String(index + 1).padStart(2, '0')}`}
                      <small>{config.customMessages[message.id]?.trim() ? '正在使用自定义文案' : '留空使用默认文案'}</small>
                    </span>
                    <textarea
                      rows={2}
                      maxLength={180}
                      value={config.customMessages[message.id] ?? ''}
                      placeholder={message.text}
                      aria-label={`${messageCategoryLabels[group.category]}${index + 1}自定义文案`}
                      onChange={event => updateCustomMessage(message.id, event.target.value)}
                    />
                  </label>)}
                  {customCount > 0 && <button
                    type="button"
                    className="message-reset-button"
                    onClick={() => resetCustomMessages(group.messages.map(message => message.id))}
                  >恢复本组默认文案</button>}
                </div>
              </details>
            })}
          </div>
        </div>
        <div className="panel splayer-panel">
          <div className="panel-heading">
            <div><h3>SPlayer 唱歌联动</h3><p>播放音乐时，让噜噜跟着唱歌并显示逐字歌词</p></div>
            <span className="integration-badge">本机连接</span>
          </div>
          <label><span>启用唱歌功能<small>自动连接本机 SPlayer（localhost:25885）</small></span><input type="checkbox" checked={config.splayerEnabled} onChange={e => update('splayerEnabled', e.target.checked)}/></label>
          <div className={`setting-note integration-note${config.splayerEnabled ? '' : ' disabled'}`}>
            <strong>{config.splayerEnabled ? '等待 SPlayer 播放音乐' : '唱歌功能已关闭'}</strong>
            <small>{config.splayerEnabled
              ? '连接仅发生在你的电脑上。检测到歌曲播放后，噜噜会自动切换唱歌动画；暂停或退出 SPlayer 后会恢复普通状态。'
              : '噜噜不会连接 SPlayer、进入唱歌模式或显示歌词，其他互动功能不受影响。'}</small>
          </div>
        </div>
      </>}
      {section === 'health' && <>
        <div className="panel"><div className="panel-heading"><div><h3>健康提醒</h3><p>提醒会避开勿扰时间、唱歌、睡觉和拖动</p></div></div>
          <label><span>启用健康陪伴<small>让噜噜陪你养成轻松的小习惯</small></span><input type="checkbox" checked={config.healthReminders.enabled} onChange={e => update('healthReminders', {...config.healthReminders, enabled: e.target.checked})}/></label>
          <label><span>喝水提醒<small>完成后噜噜会陪你一起喝水</small></span><input type="checkbox" disabled={!config.healthReminders.enabled} checked={config.healthReminders.waterEnabled} onChange={e => update('healthReminders', {...config.healthReminders, waterEnabled: e.target.checked})}/></label>
          <label><span>喝水间隔<small>{config.healthReminders.waterIntervalMinutes} 分钟</small></span><input type="range" min="15" max="240" step="5" disabled={!config.healthReminders.enabled || !config.healthReminders.waterEnabled} value={config.healthReminders.waterIntervalMinutes} onChange={e => update('healthReminders', {...config.healthReminders, waterIntervalMinutes: Number(e.target.value)})}/></label>
          <label><span>久坐活动提醒<small>完成后噜噜会伸懒腰陪你活动</small></span><input type="checkbox" disabled={!config.healthReminders.enabled} checked={config.healthReminders.standEnabled} onChange={e => update('healthReminders', {...config.healthReminders, standEnabled: e.target.checked})}/></label>
          <label><span>活动间隔<small>{config.healthReminders.standIntervalMinutes} 分钟</small></span><input type="range" min="15" max="180" step="5" disabled={!config.healthReminders.enabled || !config.healthReminders.standEnabled} value={config.healthReminders.standIntervalMinutes} onChange={e => update('healthReminders', {...config.healthReminders, standIntervalMinutes: Number(e.target.value)})}/></label>
          <label><span>稍后提醒<small>选择“稍后”时延迟 {config.healthReminders.snoozeMinutes} 分钟</small></span><input type="range" min="5" max="60" step="5" disabled={!config.healthReminders.enabled} value={config.healthReminders.snoozeMinutes} onChange={e => update('healthReminders', {...config.healthReminders, snoozeMinutes: Number(e.target.value)})}/></label>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>立即预览</h3><p>在桌面上看看提醒的实际效果</p></div></div>
          <div className="position-actions">
            <button type="button" onClick={() => void Events.Emit('health:preview', 'water')}>预览喝水互动</button>
            <button type="button" className="secondary" onClick={() => void Events.Emit('health:preview', 'stand')}>预览活动互动</button>
          </div>
        </div>
      </>}
      {section === 'countdown' && <>
        <div className={`preview-card${config.targetDate ? '' : ' inactive'}`}><span>{config.targetDate ? '今日预览' : '可选小工具'}</span><strong>{config.targetDate ? preview : '暂未设置倒计时'}</strong><small>{config.targetDate ? (config.countdownMode === 'workday' && result ? `其中约 ${result.workingDays} 个工作日` : '按本地日期计算，不受当前时分秒影响') : '设置目标日期后，噜噜会在聊天气泡里偶尔提醒你'}</small></div>
        <div className="panel"><div className="panel-heading"><div><h3>日期规则</h3><p>留空目标日期即可关闭这项功能</p></div>{config.targetDate && <button type="button" className="text-button" onClick={() => update('targetDate', '')}>关闭倒计时</button>}</div>
          <label><span>目标日期<small>旅行、考试、纪念日或任何值得期待的日子</small></span><input type="date" value={config.targetDate} onChange={e => update('targetDate', e.target.value)}/></label>
          <label><span>倒计时方式<small>工作日会排除你设定的每周休息日</small></span><select value={config.countdownMode} onChange={e => update('countdownMode', e.target.value)}><option value="calendar">自然日</option><option value="workday">工作日</option></select></label>
          {config.countdownMode === 'workday' && <div className="weekday-setting">
            <span><strong>每周休息日</strong><small>勾选不上班的星期；默认周六、周日</small></span>
            <div className="weekday-picker">{weekdays.map(day => <button key={day.value} type="button" className={config.restWeekdays.includes(day.value) ? 'selected' : ''} onClick={() => toggleRestWeekday(day.value)}>{day.label}</button>)}</div>
          </div>}
          <label><span>包含今天</span><input type="checkbox" checked={config.includeToday} onChange={e => update('includeToday', e.target.checked)}/></label>
          <label><span>包含目标日期</span><input type="checkbox" checked={config.includeTargetDate} onChange={e => update('includeTargetDate', e.target.checked)}/></label>
        </div>
      </>}
      {section === 'system' && <>
        <div className="panel"><div className="panel-heading"><div><h3>启动与运行</h3><p>让噜噜按照你喜欢的方式出现</p></div></div>
          <label><span>开机自动启动<small>{autostartAvailable ? '登录系统后自动启动噜噜' : '正式构建版本中可用，dev 模式不会写入启动项'}</small></span><input type="checkbox" disabled={!autostartAvailable} checked={config.launchAtStartup} onChange={e => update('launchAtStartup', e.target.checked)}/></label>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>勿扰时间</h3><p>安静时段内不主动打扰你</p></div></div>
          <label><span>启用勿扰<small>勿扰时段内不主动弹出气泡</small></span><input type="checkbox" checked={config.quietHours.enabled} onChange={e => update('quietHours', {...config.quietHours, enabled: e.target.checked})}/></label>
          <label><span>开始时间</span><input type="time" disabled={!config.quietHours.enabled} value={config.quietHours.start} onChange={e => update('quietHours', {...config.quietHours, start: e.target.value})}/></label>
          <label><span>结束时间</span><input type="time" disabled={!config.quietHours.enabled} value={config.quietHours.end} onChange={e => update('quietHours', {...config.quietHours, end: e.target.value})}/></label>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>使用提示</h3><p>右键菜单与系统托盘都能控制噜噜</p></div></div>
          <div className="setting-note"><strong>关闭设置不会退出</strong><small>噜噜会继续驻留在桌面和系统托盘；需要彻底退出时，请右键噜噜或使用托盘菜单中的“退出”。</small></div>
        </div>
      </>}
      <footer>{status || '配置保存在系统用户数据目录'}</footer>
    </section>
  </main>
}

export default function App() {
  return new URLSearchParams(location.search).get('window') === 'pet' ? <PetWindow/> : <SettingsWindow/>
}
