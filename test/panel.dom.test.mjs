// 面板 DOM 冒烟（jsdom）：「马上使用」按钮必须能跳到对话并填好商机调研指令。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(ROOT, 'package.json'))
const EXPECTED_PROMPT = '使用‘痛点发现’插件 进行商机调研：'

let deps = null
try {
  deps = {
    JSDOM: require_('jsdom').JSDOM,
    React: require_('react'),
    createRoot: require_('react-dom/client').createRoot,
    act: require_('react').act,
  }
} catch {
  deps = null
}

test('面板：「马上使用」→ uiWorkspace.startSession 预填商机调研指令', { skip: deps ? false : '未安装 jsdom/react/react-dom，跳过' }, async () => {
  const { JSDOM, React, createRoot, act } = deps
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://127.0.0.1:61448/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  globalThis.fetch = window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })

  let factory = null
  window.__ModuleLoader__ = { load: ({ factory: f }) => { factory = f } }
  new Function(readFileSync(join(ROOT, 'dist', 'client.js'), 'utf8'))()
  const mod = factory((spec) => {
    if (spec === 'react') return React
    throw new Error(`bundle 请求了白名单外的模块：${spec}`)
  })
  assert.ok(mod.inject.includes('uiWorkspace'), 'client 必须 inject uiWorkspace 才能开对话')

  let Panel = null
  const starts = []
  mod.apply({
    slots: {
      inject: (_name, fn) => fn(),
      register: (desc, comp) => { if (desc.name === 'main') Panel = comp },
    },
    uiWorkspace: { startSession: (...args) => starts.push(args) },
  })
  assert.equal(typeof Panel, 'function', '面板应注册到 main slot')

  const root = createRoot(document.getElementById('app'))
  await act(async () => { root.render(React.createElement(Panel)) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('马上使用'))
  assert.ok(btn, '面板里应有一个「马上使用」按钮')

  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
  })
  assert.equal(starts.length, 1, '点击应调用一次 startSession')
  const [sessionArg, options] = starts[0]
  assert.equal(sessionArg, undefined, '应开新对话')
  assert.equal(options.prompt, EXPECTED_PROMPT, '预填指令应与约定完全一致')
  assert.equal(options.whenDraftExists, 'replace', '已有草稿时替换')

  await act(async () => { root.unmount() })
})
