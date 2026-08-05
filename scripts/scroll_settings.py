"""Extra scroll captures for admin settings page (nav labels + pricing block)."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = Path("/app/screenshots/04_admin")
OUT.mkdir(parents=True, exist_ok=True)


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        # Login
        await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await page.wait_for_selector("#root", timeout=30000)
        for _ in range(60):
            t = await page.evaluate("() => document.querySelector('#root').innerText.trim()")
            if t and len(t) > 20:
                break
            await page.wait_for_timeout(500)
        await page.wait_for_timeout(2000)
        inputs = page.locator("input")
        await inputs.nth(0).fill("admin@khedmapro.dz")
        await inputs.nth(1).fill("admin123")
        await page.get_by_text("Sign in", exact=True).click()
        await page.wait_for_timeout(5000)
        # Settings
        await page.goto(f"{BASE}/admin/settings", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        # scroll multiple times and capture
        for i in range(1, 10):
            await page.mouse.move(195, 500)
            await page.mouse.wheel(0, 800)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(OUT / f"12_settings_scroll{i+2}.png"))
            print(f"scroll{i+2} saved")
        await browser.close()


asyncio.run(main())
