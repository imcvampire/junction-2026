import { afterEach, describe, expect, it, vi } from "vitest"

import { createSound } from "@/features/to-the-moon/sound"

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn<(value: number, time: number) => void>(),
  linearRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
  exponentialRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
})
const node = () => ({ connect: vi.fn<(target: unknown) => void>() })

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  currentTime = 0
  sampleRate = 8000
  state = "running"
  destination = {}
  gains: { gain: ReturnType<typeof param> }[] = []
  close = vi.fn<() => Promise<void>>(() => Promise.resolve())
  resume = vi.fn<() => Promise<void>>(() => Promise.resolve())

  constructor() {
    FakeAudioContext.instances.push(this)
  }
  createGain() {
    const gain = { ...node(), gain: param() }
    this.gains.push(gain)
    return gain
  }
  createOscillator() {
    return {
      ...node(),
      type: "sine",
      frequency: param(),
      start: vi.fn<(at?: number) => void>(),
      stop: vi.fn<(at?: number) => void>(),
    }
  }
  createBiquadFilter() {
    return { ...node(), type: "lowpass", frequency: param(), Q: param() }
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  createBufferSource() {
    return { ...node(), buffer: null, start: vi.fn<(at?: number) => void>() }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeAudioContext.instances = []
})

describe("createSound", () => {
  it("is a silent no-op when Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined)
    const sound = createSound()
    expect(() => {
      sound.play({ type: "win" })
      sound.setMuted(true)
      sound.dispose()
    }).not.toThrow()
  })

  it("creates the audio context only on the first play", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const sound = createSound()
    expect(FakeAudioContext.instances).toHaveLength(0)

    sound.play({ type: "place", streak: 0 })
    sound.play({ type: "cut" })
    sound.play({ type: "win" })
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it("mutes through the master gain and closes the context on dispose", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const sound = createSound()
    sound.play({ type: "perfect" })
    const [ctx] = FakeAudioContext.instances
    const master = ctx.gains[0]
    expect(master.gain.value).toBeGreaterThan(0)

    sound.setMuted(true)
    expect(sound.muted).toBe(true)
    expect(master.gain.value).toBe(0)

    sound.dispose()
    expect(ctx.close).toHaveBeenCalledOnce()
  })
})
