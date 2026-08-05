"""Capture marketing site pages in FR + AR, and mobile ad view."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8001"
OUT = Path("/app/screenshots/05_marketing_site")
OUT.mkdir(parents=True, exist_ok=True)


async def snap(page, name):
    await page.wait_for_timeout(2200)
    p = OUT / f"{name}.png"
    await page.screenshot(path=str(p))
    print(f"  ✓ {p}")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # Set language via localStorage before opening pages
        await page.goto(f"{BASE}/api/site/", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate("() => localStorage.setItem('khedmapro_site_lang','fr')")
        # ---- French ----
        await page.goto(f"{BASE}/api/site/", wait_until="domcontentloaded")
        await snap(page, "09_home_fr")
        await page.goto(f"{BASE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await snap(page, "10_for_providers_fr")
        await page.evaluate("() => window.scrollTo(0, 1200)")
        await snap(page, "11_for_providers_fr_pricing")
        await page.evaluate("() => window.scrollTo(0, 2200)")
        await snap(page, "12_for_providers_fr_bottom")

        # ---- Arabic ----
        await page.evaluate("() => localStorage.setItem('khedmapro_site_lang','ar')")
        await page.goto(f"{BASE}/api/site/", wait_until="domcontentloaded")
        await snap(page, "13_home_ar")
        await page.goto(f"{BASE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await snap(page, "14_for_providers_ar")
        await page.evaluate("() => window.scrollTo(0, 1200)")
        await snap(page, "15_for_providers_ar_pricing")

        # ---- Mobile FR ----
        await ctx.close()
        ctx2 = await browser.new_context(viewport={"width": 390, "height": 844})
        page2 = await ctx2.new_page()
        await page2.goto(f"{BASE}/api/site/", wait_until="domcontentloaded")
        await page2.wait_for_timeout(1500)
        await page2.evaluate("() => localStorage.setItem('khedmapro_site_lang','fr')")
        await page2.goto(f"{BASE}/api/site/", wait_until="domcontentloaded")
        await snap(page2, "16_home_fr_mobile")
        await page2.evaluate("() => window.scrollTo(0, 800)")
        await snap(page2, "17_home_fr_mobile_scroll")

        await browser.close()


asyncio.run(main())
