"""Extra screens: review submission, OTP modal during provider registration, chat detail."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
API = "http://localhost:8001/api"
OUT = Path("/app/screenshots")


async def snap(page, folder, name):
    d = OUT / folder
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{name}.png"
    await page.wait_for_timeout(1500)
    await page.screenshot(path=str(p))
    print(f"  ✓ {p}")


async def sign_in(page, email, password):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_selector("#root", timeout=30000)
    for _ in range(60):
        t = await page.evaluate("() => document.querySelector('#root').innerText.trim()")
        if t and len(t) > 20:
            break
        await page.wait_for_timeout(500)
    await page.wait_for_timeout(2000)
    inputs = page.locator("input")
    await inputs.nth(0).fill(email)
    await inputs.nth(1).fill(password)
    await page.get_by_text("Sign in", exact=True).click()
    await page.wait_for_timeout(6000)


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()

        # ---- Client → open a completed booking → leave a review ----
        # Provider1 has bookings from clients. Use one of the seeded clients if any,
        # otherwise open the review URL directly to at least capture the composer UI.
        await sign_in(page, "admin@khedmapro.dz", "admin123")
        # Admin's bookings list → grab a bookingId from the API
        booking_id = await page.evaluate(
            """() => fetch('http://localhost:8001/api/admin/bookings?limit=1', {headers:{Authorization:'Bearer '+localStorage.getItem('sp_token')}})
                .then(r=>r.json()).then(d=>{
                  const arr = Array.isArray(d) ? d : (d.items||[]);
                  return (arr[0]&&arr[0].id)||null;
                }).catch(()=>null)"""
        )
        print("booking_id:", booking_id)
        if booking_id:
            await page.goto(f"{BASE}/review/{booking_id}", wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            await snap(page, "02_client", "12_review_submit_top")
            await page.mouse.move(195, 500)
            await page.mouse.wheel(0, 700)
            await page.wait_for_timeout(1000)
            await snap(page, "02_client", "13_review_submit_photos")

        # ---- Provider registration OTP modal ----
        # Open the register page in provider tab, fill enough to trigger OTP modal
        await page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        try:
            await page.get_by_text("Provider", exact=True).first.click()
            await page.wait_for_timeout(1200)
            # Fill phone and try to send OTP (button label likely "Send code" / "Verify phone")
            phone_inputs = page.locator("input")
            n = await phone_inputs.count()
            print("provider register inputs:", n)
            # We just capture the OTP button state — click "Verify phone" if visible
            for label in ["Verify phone", "Send code", "Send OTP", "Vérifier", "التحقق"]:
                try:
                    await page.get_by_text(label, exact=False).first.click(timeout=1500)
                    await page.wait_for_timeout(2500)
                    await snap(page, "01_landing_auth", "12_provider_reg_otp_modal")
                    break
                except Exception:
                    continue
        except Exception as e:
            print("provider OTP flow:", e)

        # ---- Chat detail (via direct URL to provider chat with a known client id) ----
        await sign_in(page, "provider1@khedmapro.dz", "password123")
        # get first bookings/threads
        thread_client_id = await page.evaluate(
            """() => fetch('http://localhost:8001/api/threads', {headers:{Authorization:'Bearer '+localStorage.getItem('sp_token')}})
                .then(r=>r.json()).then(d=>(d.items&&d.items[0]&&(d.items[0].other_id||d.items[0].client_id))||null).catch(()=>null)"""
        )
        print("thread other id:", thread_client_id)
        if thread_client_id:
            await page.goto(f"{BASE}/chat/{thread_client_id}", wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            await snap(page, "03_provider", "13_chat_detail")

        await browser.close()


asyncio.run(main())
