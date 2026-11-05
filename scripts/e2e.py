#!/usr/bin/env python3
"""Smoke + performance test for the cutaway build.

Usage:
    python3 scripts/e2e.py <path-to-dist> [--shots DIR] [--chrome PATH] [--scale N]

Serves <dist> itself (http.server on a free port, background thread) and runs
four flows in headless Chromium: desktop 3D, desktop CSS fallback, iPhone, iPad.
Each step has its own timeout; prints PASS/FAIL per step plus perf metrics and
exits non-zero if any step fails or an unexpected JS error was seen.

Software WebGL (SwiftShader) is very slow, so desktop timeouts are generous;
--scale multiplies every timeout.
"""
from __future__ import annotations

import argparse
import asyncio
import functools
import http.server
import os
import socketserver
import sys
import threading
import time
import traceback
from pathlib import Path

from playwright.async_api import async_playwright, Page, BrowserContext

DEFAULT_SHOTS = "/tmp/claude-0/-home-claude/d42fd578-f159-54f9-bbca-17d62709cb57/scratchpad/e2e"
CHROME = "/usr/bin/google-chrome"
GL_ARGS = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]

IGNORED = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "THREE.Clock",
)

INIT_JS = r"""
(() => {
  window.__errs = [];
  const push = (kind, msg, stack) => window.__errs.push({ kind, msg: String(msg), stack: stack ? String(stack) : '' });
  window.addEventListener('error', (e) => {
    // resource load failures (img/link/script) have no e.error
    if (e.error || e.message) push('error', e.message, e.error && e.error.stack);
    else if (e.target && (e.target.src || e.target.href)) push('resource', 'failed to load ' + (e.target.src || e.target.href), '');
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    push('unhandledrejection', r && r.message ? r.message : r, r && r.stack);
  });
  window.__longTasks = { count: 0, total: 0, max: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const en of list.getEntries()) {
        window.__longTasks.count++;
        window.__longTasks.total += en.duration;
        window.__longTasks.max = Math.max(window.__longTasks.max, en.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { window.__longTasks.unsupported = String(e); }
})();
"""


# --------------------------------------------------------------------------- server

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D401
        pass


def serve(dist: Path) -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(QuietHandler, directory=str(dist))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


# --------------------------------------------------------------------------- harness

def ignored(text: str) -> bool:
    return any(s in text for s in IGNORED)


class Flow:
    """One browser context + page, error collection, step bookkeeping."""

    def __init__(self, name: str, ctx: BrowserContext, page: Page, shots: Path, scale: float):
        self.name, self.ctx, self.page, self.shots, self.scale = name, ctx, page, shots, scale
        self.results: list[tuple[str, bool, str]] = []
        self.console_errs: list[str] = []
        self.transfer: dict[str, int] = {}
        self.metrics: dict[str, object] = {}
        self.aborted = False
        self._responses: list = []
        page.on("console", self._on_console)
        page.on("pageerror", lambda e: self.console_errs.append(f"pageerror: {e}\n{getattr(e, 'stack', '') or ''}"))
        page.on("response", lambda r: self._responses.append(r))
        page.on("requestfailed", self._on_failed)

    def _on_console(self, msg):
        if msg.type != "error":
            return
        loc = msg.location or {}
        text = f"console.error: {msg.text}  @ {loc.get('url', '')}:{loc.get('lineNumber', '')}"
        if not ignored(text):
            self.console_errs.append(text)

    def _on_failed(self, req):
        if not ignored(req.url):
            self.console_errs.append(f"requestfailed: {req.url} ({req.failure})")

    async def step(self, label: str, coro_fn, timeout: float):
        """Run one step with its own timeout. Later steps are skipped after a failure."""
        full = f"{self.name} / {label}"
        if self.aborted:
            self.results.append((full, None, "skipped (earlier step failed)"))
            print(f"  SKIP {full}", flush=True)
            return None
        t0 = time.perf_counter()
        try:
            val = await asyncio.wait_for(coro_fn(), timeout * self.scale)
            dt = time.perf_counter() - t0
            note = f"{dt:.1f}s" + (f" | {val}" if isinstance(val, str) and val else "")
            self.results.append((full, True, note))
            print(f"  PASS {full}  ({note})", flush=True)
            return val
        except Exception as e:  # includes asyncio.TimeoutError
            dt = time.perf_counter() - t0
            msg = "timeout" if isinstance(e, asyncio.TimeoutError) else f"{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}"
            self.results.append((full, False, f"{msg} after {dt:.1f}s"))
            print(f"  FAIL {full}  ({msg} after {dt:.1f}s)", flush=True)
            self.aborted = True
            await self.shot(f"FAIL-{label}")
            return None

    async def shot(self, label: str):
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:60]
        path = self.shots / f"{self.name}-{len(list(self.shots.glob(self.name + '-*'))):02d}-{safe}.png"
        try:
            await asyncio.wait_for(self.page.screenshot(path=str(path)), 30 * self.scale)
        except Exception as e:
            print(f"    (screenshot {path.name} failed: {type(e).__name__})", flush=True)

    async def page_errors(self) -> list[dict]:
        try:
            errs = await asyncio.wait_for(self.page.evaluate("window.__errs || []"), 15)
        except Exception as e:
            return [{"kind": "harness", "msg": f"could not read __errs: {e}", "stack": ""}]
        return [e for e in errs if not ignored(e.get("msg", "") + e.get("stack", ""))]

    async def check_errors(self, label="no JS errors", timeout=20):
        async def run():
            errs = await self.page_errors()
            if errs or self.console_errs:
                lines = [f"[{e['kind']}] {e['msg']}\n{e['stack']}" for e in errs] + list(self.console_errs)
                self.metrics.setdefault("errors", []).extend(lines)
                raise AssertionError(f"{len(lines)} error(s), first: {lines[0].splitlines()[0]}")
        # error check must run even after an aborted step
        was = self.aborted
        self.aborted = False
        await self.step(label, run, timeout)
        self.aborted = was or self.aborted

    async def collect_perf(self):
        try:
            perf = await asyncio.wait_for(self.page.evaluate("""() => ({
                heap: performance.memory ? performance.memory.usedJSHeapSize : null,
                heapTotal: performance.memory ? performance.memory.totalJSHeapSize : null,
                lt: window.__longTasks || null,
            })"""), 20 * self.scale)
        except Exception as e:
            perf = {"heap": None, "lt": None, "err": str(e)}
        self.metrics["heap_used"] = perf.get("heap")
        self.metrics["heap_total"] = perf.get("heapTotal")
        self.metrics["long_tasks"] = perf.get("lt")
        by_type: dict[str, int] = {}
        files: dict[str, int] = {}
        for r in self._responses:
            rt = r.request.resource_type
            if rt not in ("script", "stylesheet"):
                continue
            try:
                sizes = await asyncio.wait_for(r.request.sizes(), 10)
                n = sizes.get("responseBodySize") or 0
                if n <= 0:
                    n = len(await r.body())
            except Exception:
                n = 0
            by_type[rt] = by_type.get(rt, 0) + n
            files[r.url.rsplit("/", 1)[-1]] = n
        self.metrics["transfer"] = by_type
        self.metrics["transfer_files"] = files


# --------------------------------------------------------------------------- helpers

async def wait_ms(page: Page, js: str, timeout_s: float, arg=None) -> float:
    """Wait until js predicate is truthy; return page-side performance.now() at that moment (ms since nav)."""
    h = await page.wait_for_function(
        f"(arg) => ((() => {{ {js} }})() ? performance.now() : 0)", arg=arg,
        polling=100, timeout=timeout_s * 1000)
    return await h.json_value()


VISIBLE = "const el = document.querySelector(SEL); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'"


def vis(sel: str) -> str:
    return VISIBLE.replace("SEL", repr(sel))


class Touch:
    """Real touch input through CDP (mobile emulation)."""

    def __init__(self, page: Page):
        self.page = page
        self.cdp = None

    async def _c(self):
        if self.cdp is None:
            self.cdp = await self.page.context.new_cdp_session(self.page)
        return self.cdp

    async def drag(self, x0, y0, x1, y1, steps=12, hold_cb=None):
        c = await self._c()
        await c.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
        for i in range(1, steps + 1):
            x = x0 + (x1 - x0) * i / steps
            y = y0 + (y1 - y0) * i / steps
            await c.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y}]})
            await asyncio.sleep(0.03)
        held = await hold_cb() if hold_cb else None
        await c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        return held


async def center(page: Page, sel: str):
    box = await page.locator(sel).first.bounding_box()
    assert box, f"{sel} has no box"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, box


# --------------------------------------------------------------------------- flows

async def desktop_flow(fl: Flow, base: str, three_d: bool):
    p = fl.page
    url = base + ("/?desktop" if three_d else "/?css&desktop")

    async def load():
        await p.goto(url, wait_until="domcontentloaded", timeout=120_000 * fl.scale)
        title_ms = await wait_ms(p, vis(".crate-panel h1") + " && el.textContent.trim().length > 0", 180 * fl.scale)
        fl.metrics["first_content_ms"] = round(title_ms)
        stage_sel = ".stage3d canvas" if three_d else ".stage"
        stage_ms = await wait_ms(p, vis(stage_sel), 240 * fl.scale)
        fl.metrics["crate_ms"] = round(stage_ms)
        h1 = await p.locator(".crate-panel h1").inner_text()
        return f"title '{h1}' @ {title_ms:.0f}ms, {'canvas' if three_d else 'stage'} @ {stage_ms:.0f}ms"
    await fl.step("load crate + first title", load, 300)
    if three_d:
        async def gl_ok():
            info = await p.evaluate("""() => { const c = document.querySelector('.stage3d canvas');
                const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
                return { w: c ? c.width : 0, h: c ? c.height : 0, gl: !!gl, lost: gl ? gl.isContextLost() : null }; }""")
            assert info["w"] > 0 and info["h"] > 0, f"canvas size {info}"
            assert info["lost"] is not True, "WebGL context lost"
            return f"canvas {info['w']}x{info['h']}"
        await fl.step("WebGL canvas alive", gl_ok, 30)
        await asyncio.sleep(0 if fl.aborted else 4)  # let a few slow software frames render
    await fl.shot("crate")

    async def hover():
        sel = ".stage3d" if three_d else ".stage"
        _, _, box = await center(p, sel)
        y = box["y"] + box["height"] * 0.55
        before = await p.locator(".crate-panel h1").inner_text()
        seen = {before}
        # Under SwiftShader each input event waits for a rendered frame (~seconds),
        # so keep the number of mouse events small on the 3D scene.
        pts = 5 if three_d else 9
        slow = 0.0
        for i in range(pts):
            x = box["x"] + box["width"] * (0.15 + 0.7 * i / (pts - 1))
            t0 = time.perf_counter()
            await p.mouse.move(x, y, steps=1)
            slow = max(slow, time.perf_counter() - t0)
            await asyncio.sleep(0.5 if three_d else 0.2)
            seen.add(await p.evaluate("document.querySelector('.crate-panel h1').textContent"))
        fl.metrics["slowest_mousemove_s"] = round(slow, 1)
        return f"{len(seen)} distinct title(s); slowest mousemove {slow:.1f}s"
    await fl.step("hover across crate", hover, 300)
    await fl.shot("hovered")

    async def open_player():
        await p.evaluate("document.querySelector('.btn.primary').click()")
        ms = await wait_ms(p, vis(".player") + " && !!document.querySelector('.player h2')", 120 * fl.scale)
        if three_d:
            await wait_ms(p, vis(".deck canvas"), 180 * fl.scale)
        else:
            await wait_ms(p, vis(".deck .disc"), 30 * fl.scale)
        h2 = await p.locator(".player h2").inner_text()
        return f"player '{h2}'"
    await fl.step("open player", open_player, 240)
    if three_d:
        async def deck_canvas():
            n = await p.locator(".deck canvas").count()
            assert n >= 1, "no canvas inside .deck"
            return f"{n} canvas in .deck"
        await fl.step("canvas inside .deck", deck_canvas, 20)
        await asyncio.sleep(0 if fl.aborted else 5)
    await fl.shot("player")

    async def back():
        # JS click: a real click would wait for actionability/frames under software GL
        await wait_ms(p, "return [...document.querySelectorAll('.player button')].some(b => b.textContent.includes('Обратно в ящик'))", 30 * fl.scale)
        await p.evaluate("[...document.querySelectorAll('.player button')].find(b => b.textContent.includes('Обратно в ящик')).click()")
        await wait_ms(p, vis(".crate-panel h1") + " && !document.querySelector('.player')", 180 * fl.scale)
        if three_d:
            await wait_ms(p, vis(".stage3d canvas"), 180 * fl.scale)
        return ""
    await fl.step("back to crate", back, 240)
    if three_d:
        await asyncio.sleep(0 if fl.aborted else 3)
    await fl.shot("back")


async def mobile_flow(fl: Flow, base: str):
    p = fl.page
    t = Touch(p)

    async def load():
        await p.goto(base + "/?mobile", wait_until="domcontentloaded", timeout=60_000 * fl.scale)
        ms = await wait_ms(p, vis(".m-crate") + " && !!document.querySelector('.m-sleeve') && !!document.querySelector('.m-code')", 60 * fl.scale)
        fl.metrics["first_content_ms"] = round(ms)
        n = await p.locator(".m-sleeve").count()
        return f"{n} sleeves @ {ms:.0f}ms"
    await fl.step("stack renders", load, 90)
    await asyncio.sleep(1.5)
    await fl.shot("stack")

    async def drag_stack():
        before = (await p.locator(".m-code").first.inner_text()).strip()
        x, y, box = await center(p, ".m-crate")
        top, bot = box["y"] + box["height"] * 0.2, box["y"] + box["height"] * 0.8
        # pulling down advances the stack; at index 0 an upward drag only rubber-bands
        await t.drag(x, top, x, bot, steps=14)
        await asyncio.sleep(1.5)
        after = (await p.locator(".m-code").first.inner_text()).strip()
        if after == before:
            await t.drag(x, bot, x, top, steps=14)
            await asyncio.sleep(1.5)
            after = (await p.locator(".m-code").first.inner_text()).strip()
        assert after != before, f".m-code unchanged ({before!r})"
        return f"{before} -> {after}"
    await fl.step("vertical drag changes .m-code", drag_stack, 30)
    await fl.shot("dragged")

    async def tap_open():
        x, y, _ = await center(p, ".m-crate")
        await p.touchscreen.tap(x, y)
        await wait_ms(p, vis(".m-insp-stage"), 20 * fl.scale)
        return ""
    await fl.step("tap opens .m-insp-stage", tap_open, 30)
    await asyncio.sleep(3)  # intro spin ends at ~2.45s
    await fl.shot("inspect")

    async def rotate():
        get = "() => getComputedStyle(document.querySelector('.m-insp-box')).getPropertyValue('--ry').trim()"
        before = await p.evaluate(get)
        x, y, box = await center(p, ".m-insp-stage")

        async def during():
            await asyncio.sleep(0.2)
            await fl.shot("inspect-rotated")
            return await p.evaluate(get)
        held = await t.drag(x - box["width"] * 0.25, y, x + box["width"] * 0.25, y, steps=12, hold_cb=during)
        b, h = float(before.replace("deg", "") or 0), float(held.replace("deg", "") or 0)
        assert abs(h - b) > 10, f"--ry barely changed: {before} -> {held}"
        return f"--ry {before} -> {held}"
    await fl.step("drag rotates sleeve", rotate, 30)
    await asyncio.sleep(1.5)

    async def to_player():
        await p.locator(".m-inspect .btn.primary", has_text="Поставить на проигрыватель").click(timeout=10_000 * fl.scale)
        await wait_ms(p, vis(".pp-disc"), 20 * fl.scale)
        return ""
    await fl.step("play opens .pp-disc", to_player, 30)
    await asyncio.sleep(2.5)
    await fl.shot("player")

    async def toggle():
        np = p.locator(".now-playing")
        s0 = (await np.inner_text()).upper()
        await p.locator(".pp-start").click(timeout=10_000)
        await asyncio.sleep(0.6)
        s1 = (await np.inner_text()).upper()
        await p.locator(".pp-start").click(timeout=10_000)
        await asyncio.sleep(0.6)
        s2 = (await np.inner_text()).upper()
        st = [("ИГРАЕТ" if "ИГРАЕТ" in s else "ПАУЗА" if "ПАУЗА" in s else "?") for s in (s0, s1, s2)]
        assert "?" not in st and st[0] != st[1] and st[1] != st[2], f"states {st} ({s0!r},{s1!r},{s2!r})"
        return " -> ".join(st)
    await fl.step("START·STOP toggles ИГРАЕТ/ПАУЗА", toggle, 30)
    await fl.shot("paused-toggle")

    async def back():
        await p.locator(".pp .m-back").click(timeout=10_000)
        await wait_ms(p, vis(".m-crate") + " && !document.querySelector('.pp')", 30 * fl.scale)
        return ""
    await fl.step("← В ящик returns to .m-crate", back, 45)
    await asyncio.sleep(1)
    await fl.shot("back")


async def tablet_flow(fl: Flow, base: str):
    p = fl.page

    async def load():
        await p.goto(base + "/", wait_until="domcontentloaded", timeout=60_000 * fl.scale)
        ms = await wait_ms(p, vis(".m-crate") + " && !!document.querySelector('.m-sleeve')", 60 * fl.scale)
        fl.metrics["first_content_ms"] = round(ms)
        three = await p.locator(".stage3d, .crate-panel").count()
        assert three == 0, "desktop UI rendered on tablet"
        return f"mobile version auto-selected @ {ms:.0f}ms"
    await fl.step("loads mobile version (no ?mobile)", load, 90)
    await asyncio.sleep(2)
    await fl.shot("stack")


# --------------------------------------------------------------------------- main

def fmt_bytes(n) -> str:
    if n is None:
        return "n/a"
    return f"{n / 1024:.1f} KiB" if n < 1024 * 1024 else f"{n / 1048576:.2f} MiB"


async def run_flow(pw, name, launch_args, ctx_opts, body, shots, scale, chrome):
    print(f"\n== {name}", flush=True)
    browser = await pw.chromium.launch(executable_path=chrome, args=launch_args, headless=True)
    fl = None
    try:
        ctx = await browser.new_context(**ctx_opts)
        await ctx.add_init_script(INIT_JS)
        page = await ctx.new_page()
        fl = Flow(name, ctx, page, shots, scale)
        try:
            await body(fl)
        except Exception as e:  # harness bug — record, don't crash the run
            fl.results.append((f"{name} / harness", False, f"{type(e).__name__}: {e}"))
            traceback.print_exc()
        await fl.check_errors()
        await fl.collect_perf()
    finally:
        try:
            await asyncio.wait_for(browser.close(), 30)
        except Exception:
            pass
    return fl


async def main_async(args) -> int:
    dist = Path(args.dist).resolve()
    assert (dist / "index.html").is_file(), f"{dist}/index.html not found"
    shots = Path(args.shots)
    shots.mkdir(parents=True, exist_ok=True)
    for f in shots.glob("*.png"):
        f.unlink()

    print(f"dist: {dist}")
    print("dist/assets:")
    total = 0
    for f in sorted((dist / "assets").iterdir()):
        sz = f.stat().st_size
        total += sz
        print(f"  {sz:>10,d} B  {f.name}")
    print(f"  {total:>10,d} B  TOTAL")

    httpd, port = serve(dist)
    base = f"http://127.0.0.1:{port}"
    print(f"serving on {base}; screenshots -> {shots}")

    flows: list[Flow] = []
    async with async_playwright() as pw:
        dev = pw.devices
        plan = [
            ("desktop-3d", GL_ARGS, {"viewport": {"width": 1440, "height": 900}}, lambda f: desktop_flow(f, base, True)),
            ("desktop-css", GL_ARGS, {"viewport": {"width": 1440, "height": 900}}, lambda f: desktop_flow(f, base, False)),
            ("iphone13", ["--no-sandbox"], dict(dev["iPhone 13"]), lambda f: mobile_flow(f, base)),
            ("ipad-pro11-land", ["--no-sandbox"], dict(dev["iPad Pro 11 landscape"]), lambda f: tablet_flow(f, base)),
        ]
        only = set(args.only.split(",")) if args.only else None
        for name, la, co, body in plan:
            if only and name not in only:
                continue
            # chromium can't emulate WebKit UA-specific features; just pass the descriptor through
            co.pop("default_browser_type", None)
            flows.append(await run_flow(pw, name, la, co, body, shots, args.scale, args.chrome))

    httpd.shutdown()

    print("\n== RESULTS")
    failed = skipped = 0
    for fl in flows:
        for label, ok, note in fl.results:
            failed += ok is False
            skipped += ok is None
            print(f"  {'PASS' if ok else 'SKIP' if ok is None else 'FAIL'}  {label}  [{note}]")

    print("\n== METRICS")
    for fl in flows:
        m = fl.metrics
        lt = m.get("long_tasks") or {}
        print(f"  {fl.name}:")
        print(f"    first meaningful content: {m.get('first_content_ms', 'n/a')} ms"
              + (f"; crate stage visible: {m['crate_ms']} ms" if "crate_ms" in m else ""))
        print(f"    JS heap used: {fmt_bytes(m.get('heap_used'))} (total {fmt_bytes(m.get('heap_total'))})")
        print(f"    long tasks: {lt.get('count', 'n/a')} totalling {lt.get('total', 0):.0f} ms (max {lt.get('max', 0):.0f} ms)")
        tr = m.get("transfer") or {}
        print(f"    transferred JS: {fmt_bytes(tr.get('script', 0))}, CSS: {fmt_bytes(tr.get('stylesheet', 0))}"
              f"  ({', '.join(sorted(m.get('transfer_files', {})))})")

    errs = [(fl.name, e) for fl in flows for e in fl.metrics.get("errors", [])]
    if errs:
        print("\n== ERRORS")
        for name, e in errs:
            print(f"  [{name}] " + e.replace("\n", "\n      "))

    print(f"\n{'FAIL' if failed else 'PASS'}: {failed} failed, {skipped} skipped step(s); screenshots in {shots}")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dist", help="path to a built dist folder")
    ap.add_argument("--shots", default=DEFAULT_SHOTS, help="screenshot directory")
    ap.add_argument("--chrome", default=CHROME if os.path.exists(CHROME) else None, help="Chromium executable")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply all timeouts")
    ap.add_argument("--only", default="", help="comma list: desktop-3d,desktop-css,iphone13,ipad-pro11-land")
    args = ap.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
