export type SoundEvent =
  | { type: "place"; streak: number }
  | { type: "perfect" }
  | { type: "cut" }
  | { type: "over" }
  | { type: "win" }

export type Sound = {
  play(event: SoundEvent): void
  setMuted(muted: boolean): void
  readonly muted: boolean
  dispose(): void
}

const MASTER_GAIN = 0.25
const ATTACK = 0.005

type Voice = {
  type: OscillatorType
  from: number
  to?: number
  start?: number
  duration: number
  peak?: number
}

function audioContextClass(): typeof AudioContext | undefined {
  return (
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  )
}

export function createSound(initiallyMuted = false): Sound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  let muted = initiallyMuted
  let broken = false

  function ensure(): { ctx: AudioContext; master: GainNode } | null {
    if (broken) return null
    if (ctx && master) return { ctx, master }
    const Ctor = audioContextClass()
    if (!Ctor) {
      broken = true
      return null
    }
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : MASTER_GAIN
      master.connect(ctx.destination)
      return { ctx, master }
    } catch {
      broken = true
      ctx = null
      master = null
      return null
    }
  }

  function envelope(
    ctx: AudioContext,
    out: AudioNode,
    at: number,
    duration: number,
    peak: number
  ) {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(peak, at + ATTACK)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    gain.connect(out)
    return gain
  }

  function tone(ctx: AudioContext, out: AudioNode, voice: Voice) {
    const at = ctx.currentTime + (voice.start ?? 0)
    const osc = ctx.createOscillator()
    osc.type = voice.type
    osc.frequency.setValueAtTime(voice.from, at)
    if (voice.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(voice.to, at + voice.duration)
    }
    osc.connect(envelope(ctx, out, at, voice.duration, voice.peak ?? 1))
    osc.start(at)
    osc.stop(at + voice.duration + 0.02)
  }

  function crack(ctx: AudioContext, out: AudioNode) {
    if (!noise) {
      noise = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.06),
        ctx.sampleRate
      )
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    const at = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = noise
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = 1800
    filter.Q.value = 0.8
    source.connect(filter)
    filter.connect(envelope(ctx, out, at, 0.06, 0.9))
    source.start(at)
  }

  const C5 = 523.25
  const E5 = 659.25
  const G5 = 783.99
  const C6 = 1046.5

  function voices(event: SoundEvent): Voice[] {
    switch (event.type) {
      case "place": {
        const pitch = 220 * 2 ** (Math.min(event.streak, 12) / 12)
        return [
          { type: "triangle", from: pitch, to: pitch * 0.6, duration: 0.08 },
        ]
      }
      case "perfect":
        return [
          { type: "sine", from: 880, duration: 0.25, peak: 0.6 },
          { type: "sine", from: 1320, duration: 0.25, peak: 0.4 },
        ]
      case "over":
        return [
          { type: "sawtooth", from: 440, to: 110, duration: 0.6, peak: 0.5 },
        ]
      case "win":
        return [
          ...[C5, E5, G5, C6].map((from, i): Voice => ({
            type: "triangle",
            from,
            start: i * 0.12,
            duration: 0.16,
            peak: 0.7,
          })),
          ...[C5, E5, G5, C6].map((from): Voice => ({
            type: "sine",
            from,
            start: 0.48,
            duration: 1.2,
            peak: 0.3,
          })),
        ]
      case "cut":
        return []
    }
  }

  return {
    play(event) {
      const audio = ensure()
      if (!audio || muted) return
      try {
        if (audio.ctx.state === "suspended") void audio.ctx.resume()
        if (event.type === "cut") crack(audio.ctx, audio.master)
        for (const voice of voices(event)) tone(audio.ctx, audio.master, voice)
      } catch {
        // Audio is decoration; a failing node must never break the game.
      }
    },
    setMuted(next) {
      muted = next
      if (master) master.gain.value = muted ? 0 : MASTER_GAIN
    },
    get muted() {
      return muted
    },
    dispose() {
      if (ctx) void ctx.close().catch(() => {})
      ctx = null
      master = null
      noise = null
    },
  }
}
