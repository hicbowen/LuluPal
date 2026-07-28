import { useEffect, useRef, useState } from 'react'

const DEFAULT_URL = 'ws://localhost:25885'
const RECONNECT_DELAY_MS = 3000
const LYRIC_TICK_MS = 50
// Compensates for socket delivery and UI rendering latency without visibly
// jumping ahead of the vocal.
const LYRIC_LEAD_MS = 120

type LyricLine = { time: number; text: string }
export type KaraokeWord = { text: string; progress: number }
type TimedWord = { text: string; start: number; end: number }
type KaraokeLine = LyricLine & { words: TimedWord[] }
type SPlayerMessage = { type?: string; data?: Record<string, unknown> }

function asNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function asPlaying(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return undefined
  const status = value.trim().toLowerCase()
  if (['play', 'playing', 'true', '1'].includes(status)) return true
  if (['pause', 'paused', 'false', '0'].includes(status)) return false
  return undefined
}

function lineText(value: Record<string, unknown>) {
  const direct = value.lyric ?? value.text ?? value.content ?? value.words
  if (typeof direct === 'string') return direct.trim()
  if (Array.isArray(direct)) {
    return direct.map(part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const word = part as Record<string, unknown>
      return String(word.word ?? word.text ?? word.content ?? '')
    }).join('').trim()
  }
  return ''
}

export function parseLyrics(value: unknown): LyricLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): LyricLine[] => {
    if (!item || typeof item !== 'object') return []
    const line = item as Record<string, unknown>
    const time = asNumber(line.time ?? line.startTime ?? line.timestamp)
    const text = lineText(line)
    return time === undefined || !text ? [] : [{ time, text }]
  }).sort((a, b) => a.time - b.time)
}

function parseEncodedWords(value: string): TimedWord[] {
  const words: TimedWord[] = []
  const pattern = /\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:,[^)]*)?\)([^()]*)/g
  for (const match of value.matchAll(pattern)) {
    const start = Number(match[1])
    const duration = Number(match[2])
    const text = match[3]
    if (text) words.push({ text, start, end: start + duration })
  }
  return words
}

function parseWordArray(value: unknown, lineStart: number): TimedWord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): TimedWord[] => {
    if (!item || typeof item !== 'object') return []
    const word = item as Record<string, unknown>
    const text = String(word.word ?? word.text ?? word.content ?? '')
    let start = asNumber(word.startTime ?? word.time ?? word.start)
    const duration = asNumber(word.duration)
    let end = asNumber(word.endTime ?? word.end)
    if (!text || start === undefined) return []
    if (lineStart > 0 && start < lineStart - 100) start += lineStart
    if (end !== undefined && end < start) end += lineStart
    end = end ?? start + (duration ?? 0)
    return [{ text, start, end: Math.max(start + 1, end) }]
  })
}

export function parseKaraokeLyrics(value: unknown): KaraokeLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): KaraokeLine[] => {
    if (!item || typeof item !== 'object') return []
    const line = item as Record<string, unknown>
    const lineStart = asNumber(line.startTime ?? line.time ?? line.timestamp) ?? 0
    let words = parseWordArray(line.words ?? line.content ?? line.lyricWords, lineStart)
    if (!words.length) {
      const encoded = line.content ?? line.lyric ?? line.text
      if (typeof encoded === 'string') words = parseEncodedWords(encoded)
    }
    if (!words.length) return []
    const time = lineStart || words[0].start
    return [{ time, text: words.map(word => word.text).join(''), words }]
  }).sort((a, b) => a.time - b.time)
}

function currentLyric(lines: LyricLine[], currentTime: number) {
  let found = ''
  for (const line of lines) {
    if (line.time > currentTime) break
    found = line.text
  }
  return found
}

function currentKaraoke(lines: KaraokeLine[], currentTime: number) {
  let found: KaraokeLine | undefined
  for (const line of lines) {
    if (line.time > currentTime) break
    found = line
  }
  if (!found) return undefined
  return found.words.map((word): KaraokeWord => ({
    text: word.text,
    progress: Math.max(0, Math.min(1, (currentTime - word.start) / (word.end - word.start))),
  }))
}

export function useSPlayerLyrics(enabled = true, url = DEFAULT_URL) {
  const [connected, setConnected] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [text, setText] = useState('')
  const [words, setWords] = useState<KaraokeWord[]>()
  const lyrics = useRef<LyricLine[]>([])
  const karaoke = useRef<KaraokeLine[]>([])
  const progress = useRef(0)
  const progressReceivedAt = useRef(performance.now())
  const playing = useRef(false)
  const hasExplicitStatus = useRef(false)
  const lastServerProgress = useRef<{ milliseconds: number; receivedAt: number }>()

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      setIsPlaying(false)
      setText('')
      setWords(undefined)
      lyrics.current = []
      karaoke.current = []
      progress.current = 0
      playing.current = false
      hasExplicitStatus.current = false
      lastServerProgress.current = undefined
      return
    }
    let socket: WebSocket | undefined
    let reconnectTimer: number | undefined
    let disposed = false
    const updateLyric = (currentTime: number) => {
      const karaokeWords = currentKaraoke(karaoke.current, currentTime)
      if (karaokeWords) {
        setWords(karaokeWords)
        setText(karaokeWords.map(word => word.text).join(''))
      } else {
        setWords(undefined)
        setText(currentLyric(lyrics.current, currentTime))
      }
    }
    const lyricTimer = window.setInterval(() => {
      const elapsed = playing.current ? performance.now() - progressReceivedAt.current : 0
      updateLyric(progress.current + elapsed + LYRIC_LEAD_MS)
    }, LYRIC_TICK_MS)

    const syncProgress = (milliseconds: number) => {
      progress.current = milliseconds
      progressReceivedAt.current = performance.now()
      updateLyric(milliseconds + LYRIC_LEAD_MS)
    }

    const connect = () => {
      if (disposed) return
      socket = new WebSocket(url)
      socket.onopen = () => {
        setConnected(true)
        socket?.send(JSON.stringify({ type: 'get-song-info' }))
      }
      socket.onmessage = event => {
        if (event.data === 'PONG') return
        try {
          const message = JSON.parse(String(event.data)) as SPlayerMessage
          const data = message.data ?? {}
          if (message.type === 'lyric-change' || message.type === 'song-info') {
            lyrics.current = parseLyrics(data.lrcData)
            karaoke.current = parseKaraokeLyrics(data.yrcData)
            if (!lyrics.current.length && !karaoke.current.length) lyrics.current = parseLyrics(data.yrcData)
            if (message.type === 'song-info') {
              const seconds = asNumber(data.currentTime)
              const initialPlaying = asPlaying(data.playStatus)
              if (initialPlaying !== undefined) {
                playing.current = initialPlaying
                setIsPlaying(initialPlaying)
              }
              if (seconds !== undefined) {
                const milliseconds = seconds * 1000
                lastServerProgress.current = { milliseconds, receivedAt: performance.now() }
                syncProgress(milliseconds)
              }
            } else {
              setText('')
              setWords(undefined)
            }
          }
          if (message.type === 'song-change') {
            lyrics.current = []
            karaoke.current = []
            setText('')
            setWords(undefined)
            socket?.send(JSON.stringify({ type: 'get-song-info' }))
          }
          if (message.type === 'progress-change') {
            const milliseconds = asNumber(data.currentTime)
            if (milliseconds !== undefined) {
              const now = performance.now()
              const previous = lastServerProgress.current
              // SPlayer does not always broadcast its current play state to a
              // newly connected client. Before an explicit status event has
              // arrived, a naturally advancing timeline is reliable evidence
              // that playback is already active. Large jumps are seeks and do
              // not qualify.
              if (!playing.current && !hasExplicitStatus.current && previous) {
                const progressDelta = milliseconds - previous.milliseconds
                const wallDelta = now - previous.receivedAt
                if (
                  progressDelta >= 20 &&
                  progressDelta <= Math.max(2000, wallDelta * 2 + 300) &&
                  wallDelta <= 2000
                ) {
                  playing.current = true
                  setIsPlaying(true)
                }
              }
              lastServerProgress.current = { milliseconds, receivedAt: now }
              syncProgress(milliseconds)
            }
          }
          if (message.type === 'status-change') {
            hasExplicitStatus.current = true
            const wasPlaying = playing.current
            if (wasPlaying) progress.current += performance.now() - progressReceivedAt.current
            playing.current = data.status === true
            setIsPlaying(playing.current)
            progressReceivedAt.current = performance.now()
          }
        } catch (error) {
          console.warn('Ignored invalid SPlayer WebSocket message', error)
        }
      }
      socket.onclose = () => {
        setConnected(false)
        setText('')
        setWords(undefined)
        lyrics.current = []
        karaoke.current = []
        playing.current = false
        hasExplicitStatus.current = false
        lastServerProgress.current = undefined
        setIsPlaying(false)
        if (!disposed) reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearInterval(lyricTimer)
      socket?.close()
    }
  }, [enabled, url])

  return { connected, playing: isPlaying, text, words }
}
