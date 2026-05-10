import JSCPPModule from './vendor/jscpp.js'

const ctx = self

const resolveJscpp = (module) => {
  if (!module) return null
  if (typeof module.run === 'function') return module
  if (typeof module.default?.run === 'function') return module.default
  if (typeof module.default?.default?.run === 'function') return module.default.default
  return module
}

const JSCPP = resolveJscpp(JSCPPModule)

ctx.onmessage = (event) => {
  const payload = event.data
  if (!payload || payload.type !== 'run') return

  const { id, code, input } = payload

  try {
    if (!JSCPP || typeof JSCPP.run !== 'function') {
      throw new Error('JSCPP.run is not a function')
    }

    const exitCode = JSCPP.run(code, input ?? '', {
      stdio: {
        write: (chunk) => {
          ctx.postMessage({ type: 'stdout', id, chunk: String(chunk) })
        },
      },
      unsigned_overflow: 'warn',
    })

    ctx.postMessage({ type: 'done', id, exitCode })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.postMessage({ type: 'error', id, error: message })
  }
}
