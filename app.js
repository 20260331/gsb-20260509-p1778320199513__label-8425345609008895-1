import {
  EditorState,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  cpp,
  defaultKeymap,
  history,
  historyKeymap,
} from './vendor/codemirror.js'
import { createRunner } from './runner.js'

const DEFAULT_CODE = `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, Web IDE!" << endl;
    return 0;
}
`

const DEFAULT_INPUT = ''
const STORAGE_CODE_KEY = 'cpp-web-ide:code'
const STORAGE_INPUT_KEY = 'cpp-web-ide:input'
const TIMEOUT_MS = 3000

const editorContainer = document.getElementById('editor')
const inputArea = document.getElementById('input-area')
const outputEl = document.getElementById('output')
const outputPlaceholder = document.getElementById('output-placeholder')
const statusPill = document.getElementById('status-pill')
const outputStatus = document.getElementById('output-status')
const runBtn = document.getElementById('run-btn')
const resetBtn = document.getElementById('reset-btn')
const copyBtn = document.getElementById('copy-btn')
const copySuccess = document.getElementById('copy-success')

const loadStoredValue = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

let code = loadStoredValue(STORAGE_CODE_KEY, DEFAULT_CODE)
let inputValue = loadStoredValue(STORAGE_INPUT_KEY, DEFAULT_INPUT)
let outputText = ''
let status = 'Ready'
let isRunning = false
let saveTimer = null

const scheduleSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_CODE_KEY, code)
      localStorage.setItem(STORAGE_INPUT_KEY, inputValue)
    } catch {
      // 忽略本地存储失败
    }
  }, 200)
}

const setStatus = (next) => {
  status = next
  statusPill.dataset.status = next
  statusPill.textContent = `状态：${next}`
  outputStatus.textContent = next
}

const updateButtons = () => {
  runBtn.disabled = isRunning
  resetBtn.disabled = isRunning
  runBtn.textContent = isRunning ? '运行中...' : '运行代码'
}

const renderOutput = () => {
  outputEl.textContent = outputText
  outputPlaceholder.style.display = outputText ? 'none' : 'block'
}

const runner = createRunner({
  timeoutMs: TIMEOUT_MS,
  onOutput: (text) => {
    outputText = text
    renderOutput()
  },
  onStatusChange: (next) => {
    setStatus(next)
  },
  onRunningChange: (next) => {
    isRunning = next
    updateButtons()
  },
})

const startRun = () => {
  runner.runCode(code, inputValue)
}

const resetAll = () => {
  runner.stop()
  isRunning = false
  code = DEFAULT_CODE
  inputValue = DEFAULT_INPUT
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: DEFAULT_CODE },
  })
  inputArea.value = inputValue
  runner.resetOutput()
  updateButtons()
  scheduleSave()
}

inputArea.value = inputValue
inputArea.addEventListener('input', (event) => {
  inputValue = event.target.value
  scheduleSave()
})

runBtn.addEventListener('click', startRun)
resetBtn.addEventListener('click', resetAll)

let copySuccessTimer = null

const copyOutput = async () => {
  if (!outputText) {
    return
  }

  try {
    await navigator.clipboard.writeText(outputText)

    if (copySuccessTimer) {
      clearTimeout(copySuccessTimer)
    }

    copySuccess.style.display = 'inline'
    copySuccess.style.animation = 'none'
    copySuccess.offsetHeight
    copySuccess.style.animation = 'fadeInOut 2s ease'

    copySuccessTimer = setTimeout(() => {
      copySuccess.style.display = 'none'
    }, 2000)
  } catch {
    // 忽略复制失败
  }
}

copyBtn.addEventListener('click', copyOutput)

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.6',
    },
    '.cm-gutters': {
      backgroundColor: '#0f1320',
      color: 'rgba(255, 255, 255, 0.35)',
      borderRight: '1px solid var(--color-outline)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    '.cm-content': {
      padding: '12px 0',
    },
    '.cm-line': {
      padding: '0 16px',
    },
  },
  { dark: true }
)

const editorState = EditorState.create({
  doc: code,
  extensions: [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    cpp(),
    EditorView.lineWrapping,
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        code = update.state.doc.toString()
        scheduleSave()
      }
    }),
  ],
})

const editorView = new EditorView({
  state: editorState,
  parent: editorContainer,
})

const initialState = runner.getState()
outputText = initialState.output
status = initialState.status
isRunning = initialState.isRunning
setStatus(status)
updateButtons()
renderOutput()
