import { useEffect, useRef, useState } from 'react'
import type { Dir } from '../input/boardNav'

export interface GamepadHandlers {
  /** D-pad or left stick. */
  onMove?: (dir: Dir) => void
  /** A / Cross — select the square / make the move. */
  onConfirm?: () => void
  /** B / Circle — cancel the current selection. */
  onCancel?: () => void
  /** Y / Triangle — toggle the Coach. */
  onCoach?: () => void
  /** Start / Menu — new game. */
  onNewGame?: () => void
  /** LB — easier. */
  onDifficultyDown?: () => void
  /** RB — harder. */
  onDifficultyUp?: () => void
}

// Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping).
const BUTTON = {
  A: 0,
  B: 1,
  Y: 3,
  LB: 4,
  RB: 5,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const

const STICK_DEADZONE = 0.5

/**
 * Reads a connected game controller via the browser Gamepad API and fires the given handlers
 * on button *presses* (rising edges), not holds. Works on desktop Chrome/Edge/Firefox, Android
 * Chrome, and iOS/iPadOS Safari 16+. Polls with requestAnimationFrame only while mounted.
 *
 * Handlers may be inline closures recreated each render — the latest set is always used.
 */
export function useGamepad(handlers: GamepadHandlers): { connected: boolean } {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let raf = 0
    let prevButtons: boolean[] = []
    let prevStickDir: Dir | null = null
    let wasConnected = false

    const firstPad = (): Gamepad | null => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      for (const p of pads) if (p && p.connected) return p
      return null
    }

    const poll = () => {
      const pad = firstPad()
      const isOn = !!pad
      if (isOn !== wasConnected) {
        wasConnected = isOn
        setConnected(isOn)
      }

      if (pad) {
        const h = handlersRef.current
        const pressed = pad.buttons.map((b) => b.pressed || b.value > 0.5)
        const rising = (i: number) => !!pressed[i] && !prevButtons[i]

        if (rising(BUTTON.A)) h.onConfirm?.()
        if (rising(BUTTON.B)) h.onCancel?.()
        if (rising(BUTTON.Y)) h.onCoach?.()
        if (rising(BUTTON.START)) h.onNewGame?.()
        if (rising(BUTTON.LB)) h.onDifficultyDown?.()
        if (rising(BUTTON.RB)) h.onDifficultyUp?.()
        if (rising(BUTTON.DPAD_UP)) h.onMove?.('up')
        if (rising(BUTTON.DPAD_DOWN)) h.onMove?.('down')
        if (rising(BUTTON.DPAD_LEFT)) h.onMove?.('left')
        if (rising(BUTTON.DPAD_RIGHT)) h.onMove?.('right')

        // Left stick: one step per push; must return near centre before it fires again.
        const ax = pad.axes[0] ?? 0
        const ay = pad.axes[1] ?? 0
        let stickDir: Dir | null = null
        if (ay <= -STICK_DEADZONE) stickDir = 'up'
        else if (ay >= STICK_DEADZONE) stickDir = 'down'
        else if (ax <= -STICK_DEADZONE) stickDir = 'left'
        else if (ax >= STICK_DEADZONE) stickDir = 'right'
        if (stickDir && stickDir !== prevStickDir) h.onMove?.(stickDir)
        prevStickDir = stickDir

        prevButtons = pressed
      }

      raf = requestAnimationFrame(poll)
    }

    // The connected/disconnected events also wake the page so the poll picks the pad up.
    const noop = () => {}
    window.addEventListener('gamepadconnected', noop)
    window.addEventListener('gamepaddisconnected', noop)
    raf = requestAnimationFrame(poll)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', noop)
      window.removeEventListener('gamepaddisconnected', noop)
    }
  }, [])

  return { connected }
}
