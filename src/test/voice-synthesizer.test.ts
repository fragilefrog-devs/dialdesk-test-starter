import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceSynthesizer } from '@/lib/voice-synthesizer'

class UtteranceStub {
  voice: SpeechSynthesisVoice | null = null
  rate = 1
  pitch = 1
  onend: ((event: SpeechSynthesisEvent) => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null
  constructor(readonly text: string) {}
}

describe('VoiceSynthesizer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('speaks a sample with a preferred English voice and supports stopping', () => {
    const preferredVoice: SpeechSynthesisVoice = {
      default: false,
      lang: 'en-US',
      localService: true,
      name: 'Google US English',
      voiceURI: 'google-us-english',
    }
    const speechSynthesis = {
      getVoices: vi.fn(() => [preferredVoice]),
      cancel: vi.fn(),
      speak: vi.fn(),
    }
    vi.stubGlobal('window', { speechSynthesis })
    vi.stubGlobal('SpeechSynthesisUtterance', UtteranceStub)
    const onEnd = vi.fn()
    const synthesizer = new VoiceSynthesizer()

    synthesizer.speak('Hello there.', { onEnd })

    const utterance = speechSynthesis.speak.mock.calls[0][0] as UtteranceStub
    expect(utterance.text).toBe('Hello there.')
    expect(utterance.voice).toBe(preferredVoice)
    expect(utterance.rate).toBe(1.05)
    expect(utterance.pitch).toBe(0.98)
    expect(speechSynthesis.cancel).toHaveBeenCalledOnce()

    synthesizer.stop()
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2)
  })

  it('reports when browser speech synthesis is unavailable', () => {
    vi.stubGlobal('window', {})
    const onError = vi.fn()

    new VoiceSynthesizer().speak('Hello there.', { onError })

    expect(onError).toHaveBeenCalledWith('Voice previews are not supported in this browser.')
  })
})
