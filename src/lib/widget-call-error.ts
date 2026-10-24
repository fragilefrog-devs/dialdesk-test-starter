export function widgetCallErrorMessage(cause: unknown): string {
  const outer = cause && typeof cause === 'object' ? cause : null
  const nested = outer && 'error' in outer ? outer.error : outer
  const inner = nested && typeof nested === 'object' ? nested : null
  const name = inner && 'name' in inner && typeof inner.name === 'string' ? inner.name : ''
  const message = inner && 'message' in inner && typeof inner.message === 'string' ? inner.message : ''
  const details = `${name} ${message}`.toLowerCase()

  if (/notallowed|permission|denied|securityerror/.test(details)) {
    return 'Microphone access is blocked. Allow microphone access for this site, then try again.'
  }
  if (/notfound|devicesnotfound|no audio input/.test(details)) {
    return 'No microphone was found. Connect a microphone and try again.'
  }
  if (/notreadable|trackstart|already in use/.test(details)) {
    return 'The microphone is unavailable or in use by another app. Close other audio apps and try again.'
  }
  return 'The call could not continue. Please try again.'
}
