export interface VoiceSynthesisCallbacks {
  onEnd?: () => void
  onError?: (message: string) => void
}

export class VoiceSynthesizer {
  speak(text: string, callbacks: VoiceSynthesisCallbacks = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      callbacks.onError?.('Voice previews are not supported in this browser.')
      return
    }

    const synthesis = window.speechSynthesis
    const voices = synthesis.getVoices()
    const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
    const selectedVoice = englishVoices.find((voice) =>
      /natural|google|samantha|daniel|aaron/i.test(voice.name),
    ) ?? englishVoices[0] ?? voices[0]

    synthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.rate = 1.05
    utterance.pitch = 0.98
    utterance.onend = callbacks.onEnd ?? null
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') {
        callbacks.onEnd?.()
        return
      }
      callbacks.onError?.(`The voice sample could not be played (${event.error}).`)
    }
    synthesis.speak(utterance)
  }

  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }
}
