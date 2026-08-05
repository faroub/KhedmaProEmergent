"""Focused capture of the pricing block on the for-providers page in FR + AR."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

MSITE = "http://localhost:8001"
OUT = Path("/app/screenshots/05_marketing_site")


async def snap(page, name):
    await page.wait_for_timeout(2200)
    await page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"  ✓ {OUT / (name + '.png')}")


async def scroll_to_pricing(page, name_prefix):
    # Scroll the on-page element into view
    await page.evaluate(
        "() => { var el = document.querySelector('[data-i18n=\"prov.plan.active.price\"]'); if (el) el.scrollIntoView({block:'center'}); }"
    )
    await snap(page, name_prefix)


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # English pricing
        await page.goto(f"{MSITE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate("() => localStorage.setItem('khedmapro_site_lang','en')")
        await page.goto(f"{MSITE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await scroll_to_pricing(page, "20_for_providers_en_pricing_block")

        # French pricing
        await page.evaluate("() => localStorage.setItem('khedmapro_site_lang','fr')")
        await page.goto(f"{MSITE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await scroll_to_pricing(page, "21_for_providers_fr_pricing_block")

        # Arabic pricing
        await page.evaluate("() => localStorage.setItem('khedmapro_site_lang','ar')")
        await page.goto(f"{MSITE}/api/site/for-providers.html", wait_until="domcontentloaded")
        await scroll_to_pricing(page, "22_for_providers_ar_pricing_block")

        await browser.close()


asyncio.run(main())
