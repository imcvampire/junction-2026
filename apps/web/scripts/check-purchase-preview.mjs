// Browser smoke checks against the built application, using Chrome's DevTools protocol.
// Usage: node scripts/check-purchase-preview.mjs <path-to-chrome-or-edge>
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = resolve(webRoot, "dist")
const output = await mkdtemp(resolve(tmpdir(), "aimo-preview-"))
const profile = resolve(output, "browser-profile")
await mkdir(profile)
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
}
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname
    )
    const target = resolve(dist, `.${pathname}`)
    if (target !== dist && !target.startsWith(`${dist}${sep}`)) {
      res.writeHead(403).end()
      return
    }
    const path = extname(target) ? target : resolve(dist, "index.html")
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
    })
    res.end(await readFile(path))
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((accept) => server.listen(0, "127.0.0.1", accept))
const origin = `http://127.0.0.1:${server.address().port}`
const browserPath = process.argv[2]
if (!browserPath) throw new Error("Provide a Chrome or Edge executable path.")
const chrome = spawn(
  browserPath,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" }
)
const delay = (ms) => new Promise((accept) => setTimeout(accept, ms))
let socket
try {
  let port
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(resolve(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0]
      break
    } catch {
      await delay(100)
    }
  }
  assert.ok(port, "Browser DevTools port must become available")
  const target = await (
    await fetch(`http://127.0.0.1:${port}/json/new?${origin}/journal-viewer`, {
      method: "PUT",
    })
  ).json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((accept, reject) => {
    socket.addEventListener("open", accept, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const errors = []
  const requests = []
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const task = pending.get(message.id)
      if (!task) return
      pending.delete(message.id)
      clearTimeout(task.timer)
      if (message.error) task.reject(new Error(JSON.stringify(message.error)))
      else task.accept(message.result)
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text)
    else if (message.method === "Network.requestWillBeSent")
      requests.push(message.params.request.url)
  })
  const call = (method, params = {}) =>
    new Promise((accept, reject) => {
      const next = ++id
      const timer = setTimeout(() => {
        pending.delete(next)
        reject(new Error(`Timeout: ${method}`))
      }, 10000)
      pending.set(next, { accept, reject, timer })
      socket.send(JSON.stringify({ id: next, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await delay(50)
    }
    throw new Error(`Condition not met: ${expression}`)
  }
  await call("Runtime.enable")
  await call("Network.enable")
  await call("Page.enable")
  await call("Page.navigate", { url: `${origin}/journal-viewer` })
  await until(
    '!!Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Explore Example Purchase"))'
  )
  await evaluate(
    'Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Explore Example Purchase")).click()'
  )
  await until('!!document.querySelector("article")')
  assert.equal(
    await evaluate(
      `document.querySelectorAll('[aria-label="Key purchase facts"] dt').length`
    ),
    5
  )
  assert.ok(
    await evaluate(
      'document.body.innerText.includes("€350.00") && document.body.innerText.includes("€1,540.00")'
    )
  )
  assert.equal(
    await evaluate("getComputedStyle(document.body).backgroundColor"),
    "rgb(245, 247, 250)"
  )
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector("h1").parentElement.parentElement).backgroundColor'
    ),
    "rgb(0, 82, 165)"
  )
  assert.equal(
    await evaluate(
      "/agt_mcp|q_example|ord_example|mcp_elicitation/.test(document.body.innerText)"
    ),
    false
  )
  const sizes = [
    [1440, 1000, "desktop"],
    [768, 1024, "tablet"],
    [390, 844, "mobile"],
    [320, 760, "small-mobile"],
  ]
  for (const [width, height, name] of sizes) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    })
    await evaluate("document.fonts.ready")
    await delay(100)
    assert.ok(
      await evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth"
      ),
      `No horizontal overflow at ${width}px`
    )
    const picture = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })
    await writeFile(
      resolve(output, `${name}.png`),
      Buffer.from(picture.data, "base64")
    )
  }
  await evaluate(
    'Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Check Purchase Record")).click()'
  )
  await until(
    `!!document.querySelector('[aria-label="Purchase safety results"]')`
  )
  assert.ok(
    await evaluate(
      `document.querySelector('[aria-label="Purchase safety results"]').innerText.includes("Cannot verify")`
    )
  )
  const load = async (data, name) => {
    const path = resolve(output, name)
    await writeFile(
      path,
      typeof data === "string" ? data : JSON.stringify(data)
    )
    const { root } = await call("DOM.getDocument")
    const { nodeId } = await call("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    })
    await call("DOM.setFileInputFiles", { nodeId, files: [path] })
  }
  const example = JSON.parse(
    await readFile(
      resolve(
        webRoot,
        "../../skills/valio-aimo-purchasing/references/journal-example.json"
      ),
      "utf8"
    )
  )
  for (const status of ["pending_approval", "rejected"]) {
    const j = structuredClone(example)
    j.outcome = status
    j.orders[0].status = status
    j.orders[0].decision =
      status === "pending_approval"
        ? null
        : {
            decision: "rejected",
            reason: "Buyer declined",
            confirmed_via: "mcp_elicitation",
          }
    j.summary =
      status === "pending_approval"
        ? "Waiting for buyer approval."
        : "The buyer declined this purchase."
    if (status === "pending_approval")
      j.timeline = j.timeline.filter((e) => e.type !== "approval")
    else
      j.timeline.find((e) => e.type === "approval").title =
        "Buyer declined this purchase."
    await load(j, `${status}.json`)
    await until(
      `document.body.innerText.includes(${JSON.stringify(j.summary)})`
    )
    assert.equal(
      await evaluate(
        '!!Array.from(document.querySelectorAll("h4")).find(h => h.textContent === "Purchase Approved")'
      ),
      false
    )
  }
  const incomplete = structuredClone(example)
  incomplete.title = "Incomplete purchase"
  incomplete.summary = "No selection recorded."
  incomplete.orders = []
  incomplete.quotes = []
  incomplete.candidates = []
  incomplete.decision = null
  incomplete.timeline = []
  incomplete.outcome = "no_order"
  await load(incomplete, "incomplete.json")
  await until('document.body.innerText.includes("No price offers recorded.")')
  await load("{", "malformed.json")
  await until('!!document.querySelector("[role=alert]")')
  assert.equal(await evaluate('!!document.querySelector("article")'), false)
  assert.deepEqual(errors, [], "No uncaught browser errors")
  assert.equal(
    requests.some((url) => url.includes("/api/")),
    false,
    "No purchasing API requests"
  )
  console.log(
    JSON.stringify(
      {
        result: "Passed",
        widths: sizes.map(([w]) => w),
        checks: [
          "example",
          "brand colors",
          "hidden technical IDs",
          "four summary cards",
          "safety results",
          "pending",
          "rejected",
          "incomplete",
          "malformed",
          "no horizontal overflow",
          "no API calls",
          "no browser errors",
        ],
        screenshots: output,
      },
      null,
      2
    )
  )
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }))
    socket.close()
  }
  chrome.kill()
  await new Promise((accept) => server.close(accept))
}
