const DEFAULT_TIMEOUT_MS = 3000
const MAX_OUTPUT_CHARS = 20000
const TRUNCATE_SUFFIX = '\n[输出已截断]'

let jscppPromise = null

const loadJscpp = () => {
  if (!jscppPromise) {
    jscppPromise = import('./vendor/jscpp.js')
  }
  return jscppPromise
}

const resolveJscpp = (module) => {
  if (!module) return null
  if (typeof module.run === 'function') return module
  if (typeof module.default?.run === 'function') return module.default
  if (typeof module.default?.default?.run === 'function') return module.default.default
  return module
}

export const parseErrorMessage = (raw) => {
  const message = String(raw).trim()
  const lineMatch = message.match(/line\s+(\d+)\s+\(column\s+(\d+)\)/i)
  const line = lineMatch ? Number(lineMatch[1]) : null
  const column = lineMatch ? Number(lineMatch[2]) : null
  const location = line ? `（第 ${line} 行${column ? `，第 ${column} 列` : ''}）` : ''
  const lower = message.toLowerCase()
  const summaries = [
    { keyword: 'parsing failure', summary: '语法解析失败' },
    { keyword: 'expected', summary: '语法不符合预期' },
    { keyword: 'undeclared', summary: '未声明的标识符' },
    { keyword: 'undefined', summary: '未定义的标识符' },
    { keyword: 'type mismatch', summary: '类型不匹配' },
    { keyword: 'division by zero', summary: '除零错误' },
    { keyword: 'out of range', summary: '数组越界' },
    { keyword: 'no matching function', summary: '函数重载匹配失败' },
  ]
  const hit = summaries.find((item) => lower.includes(item.keyword))
  const summary = hit ? hit.summary : message
  return {
    summary: `${summary}${location}`,
    detail: message,
  }
}

export const createRunner = (options = {}) => {
  const {
    onOutput,
    onStatusChange,
    onRunningChange,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputChars = MAX_OUTPUT_CHARS,
    useWorker = true,
    workerFactory,
    runInline,
  } = options

  let output = ''
  let status = 'Ready'
  let isRunning = false
  let currentWorker = null
  let timeoutId = null
  let runId = 0

  const emitOutput = () => {
    if (onOutput) {
      onOutput(output)
    }
  }

  const setStatus = (next) => {
    status = next
    if (onStatusChange) {
      onStatusChange(next)
    }
  }

  const setRunning = (next) => {
    isRunning = next
    if (onRunningChange) {
      onRunningChange(next)
    }
  }

  const appendOutput = (chunk) => {
    output += chunk
    if (output.length > maxOutputChars) {
      output = output.slice(-maxOutputChars)
      if (!output.endsWith(TRUNCATE_SUFFIX)) {
        output += TRUNCATE_SUFFIX
      }
    }
    emitOutput()
  }

  const stopWorker = () => {
    if (currentWorker) {
      currentWorker.terminate()
      currentWorker = null
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const resetOutput = () => {
    output = ''
    emitOutput()
    setStatus('Ready')
  }

  const runInlineCode = async (code, input) => {
    if (runInline) {
      return await runInline(code, input, appendOutput)
    }
    const module = await loadJscpp()
    const JSCPP = resolveJscpp(module.default)
    if (!JSCPP || typeof JSCPP.run !== 'function') {
      throw new Error('JSCPP.run is not a function')
    }
    return JSCPP.run(code, input, {
      stdio: {
        write: (chunk) => appendOutput(String(chunk)),
      },
      unsigned_overflow: 'warn',
    })
  }

  const runWithWorker = (code, input) => {
    return new Promise((resolve, reject) => {
      const activeId = ++runId
      const createWorker =
        workerFactory ||
        (() => new Worker('./worker.js', { type: 'module' }))

      currentWorker = createWorker()

      const cleanup = () => {
        if (!currentWorker) return
        currentWorker.removeEventListener('message', onMessage)
        currentWorker.removeEventListener('error', onError)
        stopWorker()
      }

      const onMessage = (event) => {
        const message = event.data
        if (!message || message.id !== activeId) return

        if (message.type === 'stdout') {
          appendOutput(String(message.chunk))
          return
        }

        if (message.type === 'done') {
          cleanup()
          resolve(message.exitCode)
          return
        }

        if (message.type === 'error') {
          cleanup()
          reject(new Error(message.error))
        }
      }

      const onError = (event) => {
        cleanup()
        reject(new Error(event?.message || 'Worker 执行失败'))
      }

      currentWorker.addEventListener('message', onMessage)
      currentWorker.addEventListener('error', onError)
      currentWorker.postMessage({ type: 'run', id: activeId, code, input })

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('timeout'))
      }, timeoutMs)
    })
  }

  const runCode = async (code, input = '') => {
    if (isRunning) return

    if (!code.trim()) {
      setStatus('Ready')
      output = '请输入代码后再运行。'
      emitOutput()
      return
    }

    setRunning(true)
    setStatus('Running')
    output = '>>> 正在执行 C++98/03 (JSCPP)\n\n'
    emitOutput()

    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const canUseWorker = useWorker && (workerFactory || typeof Worker !== 'undefined')
      const exitCode = canUseWorker ? await runWithWorker(code, input) : await runInlineCode(code, input)
      appendOutput(`\n\n>>> 运行结束，退出码 ${exitCode}`)
      setStatus('Ready')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'timeout') {
        appendOutput(`\n\n>>> 运行超时：已终止（超过 ${timeoutMs}ms）`)
      } else {
        const parsed = parseErrorMessage(message)
        appendOutput(`\n\n>>> 运行错误：${parsed.summary}`)
        appendOutput(`\n>>> 详细信息：${parsed.detail}`)
      }
      setStatus('Error')
    } finally {
      setRunning(false)
    }
  }

  const getState = () => ({
    output,
    status,
    isRunning,
  })

  return {
    runCode,
    resetOutput,
    stop: stopWorker,
    getState,
  }
}
