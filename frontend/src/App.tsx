import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { AppService } from '../bindings/luluday'
import { AnimationPlayer, PetManifest } from './animation/AnimationPlayer'
import { usePetBehavior } from './behavior/usePetBehavior'
import { useSPlayerLyrics } from './splayer/useSPlayerLyrics'
import {
  MessageCategory, messageCategoryLabels, selectPetMessage,
} from './messages/petMessages'
import './app.css'
import './pet-window.css'
import './karaoke.css'
import './weekday.css'
import './settings-tabs.css'

type Config = {
  version: number; targetDate: string; countdownMode: string
  restWeekdays: number[]
  includeToday: boolean; includeTargetDate: boolean; petScale: number
  activityArea: string; bottomMargin: number
  sleepDurationSeconds: number
  alwaysOnTop: boolean; launchAtStartup: boolean; bubbleEnabled: boolean
  bubbleIntervalMin: number; bubbleIntervalMax: number; bubbleDisplaySeconds: number
  bubbleCategories: Record<MessageCategory, boolean>
  quietHours: { enabled: boolean; start: string; end: string }
  position: { displayId: string; x: number; y: number }
}
type Countdown = { calendarDays: number; workingDays: number; isTargetDay: boolean; isExpired: boolean; daysAfterTarget: number }
type SettingsSection = 'countdown' | 'pet' | 'bubble' | 'system'
const SINGING_PAUSE_GRACE_MS = 10_000

const fallback: Config = {
  version: 2, targetDate: '', countdownMode: 'calendar', restWeekdays: [0, 6], includeToday: false,
  includeTargetDate: true, petScale: 1, activityArea: 'bottom', bottomMargin: 12,
  sleepDurationSeconds: 30,
  alwaysOnTop: true, launchAtStartup: false,
  bubbleEnabled: true, bubbleIntervalMin: 20, bubbleIntervalMax: 45,
  bubbleDisplaySeconds: 7,
  bubbleCategories: {
    countdown: true, work: true, morning: true, lunch: true, evening: true,
    petting: true, click: true, sleep: true, special: true,
  },
  quietHours: { enabled: true, start: '22:00', end: '08:00' },
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
    quietHours: {...fallback.quietHours, ...(source.quietHours ?? {})},
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

function countdownText(result?: Countdown, mode = 'calendar') {
  if (!result) return '先在设置里告诉我离职日期吧'
  if (result.isTargetDay) return '今天解放！'
  if (result.isExpired) return `已经自由 ${result.daysAfterTarget} 天`
  const days = mode === 'workday' ? result.workingDays : result.calendarDays
  return `距离解放还有 ${days} 天`
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

function PetWindow() {
  const [config, setConfig] = useState(fallback)
  const [result, setResult] = useState<Countdown>()
  const [bubble, setBubble] = useState(false)
  const [bubbleText, setBubbleText] = useState('')
  const [manifest, setManifest] = useState<PetManifest>()
  const [direction, setDirection] = useState<'left'|'right'>('right')
  const { state, dispatch } = usePetBehavior(config.sleepDurationSeconds * 1000)
  const splayer = useSPlayerLyrics()
  const dragged = useRef(false)
  const bubbleTimer = useRef<number>()
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
    }, config.bubbleCategories, category)
    if (!text) return
    setBubbleText(text)
    setBubble(true)
    bubbleTimer.current = window.setTimeout(
      () => setBubble(false),
      Math.max(3, config.bubbleDisplaySeconds || 7) * 1000,
    )
  }, [config.bubbleCategories, config.bubbleDisplaySeconds, config.bubbleEnabled, config.countdownMode, config.targetDate, result])
  const hideBubble = useCallback(() => {
    window.clearTimeout(bubbleTimer.current)
    setBubble(false)
  }, [])
  const refresh = (next: Config) => { setConfig(next); if (next.targetDate) api.countdown(next).then(setResult).catch(console.error) }
  useEffect(() => {
    api.getConfig().then(refresh).catch(console.error)
    fetch('/pets/lulu/manifest.json').then(value => value.json()).then(setManifest).catch(console.error)
    const off = Events.On('config:changed', event => refresh(normaliseConfig(event.data)))
    let dragRecoveryTimer: number | undefined
    const finishDrag = () => {
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
    return () => {
      window.clearTimeout(dragRecoveryTimer)
      off(); dragStart(); dragEnd(); misclassifiedDragEnd(); moved(); motionDirection(); sleep()
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
    return () => { AppService.StopMotion().catch(console.error) }
  }, [config.petScale, state])
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
  const bubbleBottom = 12 + 245 * config.petScale + 8
  const showingSPlayer = splayer.connected && state === 'singing'
  const visibleBubble = showingSPlayer ? Boolean(splayer.text) : config.bubbleEnabled && bubble
  const visibleBubbleText = showingSPlayer ? splayer.text : bubbleText
  const animation = state === 'singing' && (!splayer.playing || !splayer.text) ? 'singingIdle' : state
  return <main className="pet-stage" onDoubleClick={pet}>
    {visibleBubble && <button className="speech" style={{ bottom: bubbleBottom, top: 'auto' }} onClick={showingSPlayer ? undefined : hideBubble}>
      {showingSPlayer && splayer.words
        ? <span className="karaoke-line">{splayer.words.map((word, index) =>
          <span
            className="karaoke-word"
            key={`${index}-${word.text}`}
            style={{ '--karaoke-progress': `${word.progress * 100}%` } as CSSProperties}
          >{word.text}</span>,
        )}</span>
        : visibleBubbleText}
      {!showingSPlayer && <span>×</span>}
    </button>}
    <div className="pet" style={{ transform: `translateX(-50%) scale(${config.petScale})` }} onClick={click}>
      {manifest && <AnimationPlayer manifest={manifest} animation={animation} flip={state === 'walk' && direction === 'right'} onComplete={animationComplete}/>}
    </div>
  </main>
}

function SettingsWindow() {
  const [section, setSection] = useState<SettingsSection>('countdown')
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
    countdown: { title: '离职倒计时', description: '设置日期和工作日计算规则。' },
    pet: { title: '桌宠', description: '调整噜噜在桌面上的显示方式。' },
    bubble: { title: '气泡', description: '控制倒计时提醒出现的频率和时长。' },
    system: { title: '系统', description: '设置勿扰时间并查看运行方式。' },
  }
  return <main className="settings-shell">
    <aside><div className="mini-pet">🍊</div><h1>噜噜日</h1><p>离职倒计时桌宠</p>
      <nav>
        {([
          ['countdown', '倒计时'],
          ['pet', '桌宠'],
          ['bubble', '气泡'],
          ['system', '系统'],
        ] as [SettingsSection, string][]).map(([value, label]) =>
          <button key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value)}>{label}</button>
        )}
      </nav>
      <small>v0.1.0 · Wails 3</small>
    </aside>
    <section className="settings-content">
      <header><div><h2>{sectionCopy[section].title}</h2><p>{sectionCopy[section].description} 设置会自动保存。</p></div></header>
      {section === 'countdown' && <>
        <div className="preview-card"><span>今日预览</span><strong>{preview}</strong><small>{config.countdownMode === 'workday' && result ? `其中约 ${result.workingDays} 个工作日` : '按本地日期计算，不受当前时分秒影响'}</small></div>
        <div className="panel"><h3>日期规则</h3>
          <label><span>目标日期<small>你的最后工作日或正式离职日</small></span><input type="date" value={config.targetDate} onChange={e => update('targetDate', e.target.value)}/></label>
          <label><span>倒计时方式<small>工作日会排除你设定的每周休息日</small></span><select value={config.countdownMode} onChange={e => update('countdownMode', e.target.value)}><option value="calendar">自然日</option><option value="workday">工作日</option></select></label>
          {config.countdownMode === 'workday' && <div className="weekday-setting">
            <span><strong>每周休息日</strong><small>勾选不上班的星期；默认周六、周日</small></span>
            <div className="weekday-picker">{weekdays.map(day => <button key={day.value} type="button" className={config.restWeekdays.includes(day.value) ? 'selected' : ''} onClick={() => toggleRestWeekday(day.value)}>{day.label}</button>)}</div>
          </div>}
          <label><span>包含今天</span><input type="checkbox" checked={config.includeToday} onChange={e => update('includeToday', e.target.checked)}/></label>
          <label><span>包含目标日期</span><input type="checkbox" checked={config.includeTargetDate} onChange={e => update('includeTargetDate', e.target.checked)}/></label>
        </div>
      </>}
      {section === 'pet' && <div className="panel"><h3>显示与窗口</h3>
        <label><span>桌宠大小<small>{Math.round(config.petScale * 100)}%</small></span><input type="range" min=".3" max="1.3" step=".1" value={config.petScale} onChange={e => update('petScale', Number(e.target.value))}/></label>
        <label><span>始终置顶<small>让噜噜保持在其他窗口上方</small></span><input type="checkbox" checked={config.alwaysOnTop} onChange={e => update('alwaysOnTop', e.target.checked)}/></label>
        <label><span>睡眠时长<small>完全睡着后持续 {config.sleepDurationSeconds} 秒</small></span><input type="range" min="5" max="120" step="5" value={config.sleepDurationSeconds} onChange={e => update('sleepDurationSeconds', Number(e.target.value))}/></label>
        <label><span>活动范围<small>限制自动走动所在的屏幕底部区域</small></span><select value={config.activityArea} onChange={e => update('activityArea', e.target.value)}><option value="bottom">整条底边</option><option value="bottom-left">左下区域</option><option value="bottom-right">右下区域</option></select></label>
        <label><span>底部间距<small>距离任务栏上方 {config.bottomMargin} 像素</small></span><input type="range" min="0" max="80" step="4" value={config.bottomMargin} onChange={e => update('bottomMargin', Number(e.target.value))}/></label>
        <div className="position-actions">
          <button type="button" onClick={() => void setCurrentAsHome()}>将当前位置设为初始位置</button>
          <button type="button" className="secondary" onClick={() => void restoreHome()}>回到初始位置</button>
        </div>
      </div>}
      {section === 'bubble' && <div className="panel"><h3>提醒气泡</h3>
        <label><span>显示气泡</span><input type="checkbox" checked={config.bubbleEnabled} onChange={e => update('bubbleEnabled', e.target.checked)}/></label>
        <label><span>最短出现间隔<small>{config.bubbleIntervalMin} 分钟</small></span><input type="range" min="1" max="120" step="1" disabled={!config.bubbleEnabled} value={config.bubbleIntervalMin} onChange={e => update('bubbleIntervalMin', Math.min(Number(e.target.value), config.bubbleIntervalMax))}/></label>
        <label><span>最长出现间隔<small>{config.bubbleIntervalMax} 分钟</small></span><input type="range" min="1" max="120" step="1" disabled={!config.bubbleEnabled} value={config.bubbleIntervalMax} onChange={e => update('bubbleIntervalMax', Math.max(Number(e.target.value), config.bubbleIntervalMin))}/></label>
        <label><span>显示时长<small>{config.bubbleDisplaySeconds} 秒</small></span><input type="range" min="3" max="15" step="1" disabled={!config.bubbleEnabled} value={config.bubbleDisplaySeconds} onChange={e => update('bubbleDisplaySeconds', Number(e.target.value))}/></label>
        <div className="message-categories">
          <span><strong>文案分类</strong><small>关闭不想看到的文案类型</small></span>
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
      </div>}
      {section === 'system' && <>
        <div className="panel"><h3>启动</h3>
          <label><span>开机自动启动<small>{autostartAvailable ? '登录 Windows 后自动启动噜噜日' : '正式构建版本中可用，dev 模式不会写入启动项'}</small></span><input type="checkbox" disabled={!autostartAvailable} checked={config.launchAtStartup} onChange={e => update('launchAtStartup', e.target.checked)}/></label>
        </div>
        <div className="panel"><h3>勿扰时间</h3>
          <label><span>启用勿扰<small>勿扰时段内不主动弹出气泡</small></span><input type="checkbox" checked={config.quietHours.enabled} onChange={e => update('quietHours', {...config.quietHours, enabled: e.target.checked})}/></label>
          <label><span>开始时间</span><input type="time" disabled={!config.quietHours.enabled} value={config.quietHours.start} onChange={e => update('quietHours', {...config.quietHours, start: e.target.value})}/></label>
          <label><span>结束时间</span><input type="time" disabled={!config.quietHours.enabled} value={config.quietHours.end} onChange={e => update('quietHours', {...config.quietHours, end: e.target.value})}/></label>
        </div>
        <div className="panel"><h3>运行方式</h3>
          <div className="setting-note"><strong>系统托盘常驻</strong><small>关闭设置窗口不会退出桌宠；需要彻底退出时，请使用托盘菜单“退出噜噜日”。</small></div>
        </div>
      </>}
      <footer>{status || '配置保存在系统用户数据目录'}</footer>
    </section>
  </main>
}

export default function App() {
  return new URLSearchParams(location.search).get('window') === 'pet' ? <PetWindow/> : <SettingsWindow/>
}
