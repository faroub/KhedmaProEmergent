"""Helper to run playwright and take screenshots of the app.
Usage: python3 screenshot_helper.py <scenario_name>
Each scenario is a function that lives here so we keep them versioned.
"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = Path("/app/screenshots")
VIEWPORT = {"width": 390, "height": 844}


async def wait_ready(page, min_len=20, timeout=30000):
    """Wait until #root has rendered visible text."""
    await page.wait_for_selector("#root", timeout=timeout)
    for _ in range(60):
        text = await page.evaluate(
            "() => document.querySelector('#root') ? document.querySelector('#root').innerText.trim() : ''"
        )
        if text and len(text) > min_len:
            break
        await page.wait_for_timeout(500)
    await page.wait_for_timeout(2500)


async def shot(page, folder, name):
    """Save a screenshot into /app/screenshots/<folder>/<name>.png"""
    d = OUT / folder
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{name}.png"
    await page.screenshot(path=str(p), type="png", full_page=False)
    print(f"  ✓ {p}")


async def wheel_scroll(page, dy=700):
    await page.mouse.move(195, 500)
    await page.mouse.wheel(0, dy)
    await page.wait_for_timeout(1200)


async def scenario_landing_auth(page):
    """Landing + language variants + auth screens."""
    folder = "01_landing_auth"
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "01_landing_en")

    # French
    await page.get_by_text("English", exact=True).click()
    await page.wait_for_timeout(600)
    await page.get_by_text("Français", exact=True).click()
    await page.wait_for_timeout(1500)
    await shot(page, folder, "02_landing_fr")

    # Arabic
    await page.get_by_text("Français", exact=True).click()
    await page.wait_for_timeout(600)
    await page.get_by_text("العربية", exact=True).click()
    await page.wait_for_timeout(1800)
    await shot(page, folder, "03_landing_ar")

    # Back to English
    await page.get_by_text("العربية", exact=True).click()
    await page.wait_for_timeout(600)
    await page.get_by_text("English", exact=True).click()
    await page.wait_for_timeout(1200)

    # Continue with phone
    await page.get_by_text("Continue with phone", exact=True).click()
    await page.wait_for_timeout(1500)
    await shot(page, folder, "04_login_phone_entry")

    # Login (email)
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "05_login_email")

    # OTP (direct URL)
    await page.goto(f"{BASE}/otp?phone=%2B213555000001&role=client", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "06_otp_screen")

    # Register (client tab)
    await page.goto(f"{BASE}/register", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "07_register_client")

    # Register — provider tab
    await page.get_by_text("Provider", exact=True).first.click()
    await page.wait_for_timeout(1200)
    await shot(page, folder, "08_register_provider")
    await wheel_scroll(page, 900)
    await shot(page, folder, "09_register_provider_scroll")
    await wheel_scroll(page, 900)
    await shot(page, folder, "10_register_provider_scroll2")

    # Complete profile
    await page.goto(f"{BASE}/complete-profile", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "11_complete_profile")


async def scenario_client(page):
    """Client browse/search/filters/profile/booking/review."""
    folder = "02_client"
    await page.goto(f"{BASE}/home", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "01_home_browse")
    await wheel_scroll(page, 800)
    await shot(page, folder, "02_home_scrolled")
    await wheel_scroll(page, 800)
    await shot(page, folder, "03_home_scrolled2")

    # Filters
    await page.goto(f"{BASE}/home", wait_until="domcontentloaded")
    await wait_ready(page)
    await page.get_by_text("Filters", exact=True).click()
    await page.wait_for_timeout(1200)
    await shot(page, folder, "04_filters_sheet")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(600)

    # Provider profile
    await page.get_by_text("Amina Cherif", exact=True).first.click()
    await page.wait_for_timeout(3500)
    await shot(page, folder, "05_provider_profile_top")
    await wheel_scroll(page, 700)
    await shot(page, folder, "06_provider_profile_mid")
    await wheel_scroll(page, 700)
    await shot(page, folder, "07_provider_profile_reviews")
    await wheel_scroll(page, 700)
    await shot(page, folder, "08_provider_profile_bottom")

    # Booking new — scroll from top
    await page.get_by_text("Request Booking", exact=True).click()
    await page.wait_for_timeout(3500)
    await shot(page, folder, "09_booking_new_top")
    await wheel_scroll(page, 700)
    await shot(page, folder, "10_booking_new_map")
    await wheel_scroll(page, 700)
    await shot(page, folder, "11_booking_new_bottom")


async def sign_in_email(page, email, password):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await wait_ready(page)
    inputs = page.locator("input")
    await inputs.nth(0).fill(email)
    await inputs.nth(1).fill(password)
    await page.get_by_text("Sign in", exact=True).click()
    await page.wait_for_timeout(6000)


async def scenario_provider(page):
    folder = "03_provider"
    await sign_in_email(page, "provider1@khedmapro.dz", "password123")
    await shot(page, folder, "01_dashboard_top")
    await wheel_scroll(page, 700)
    await shot(page, folder, "02_dashboard_analytics")
    await wheel_scroll(page, 700)
    await shot(page, folder, "03_dashboard_portfolio")
    await wheel_scroll(page, 700)
    await shot(page, folder, "04_dashboard_bottom")

    # Bookings tab
    await page.get_by_text("Bookings", exact=True).first.click()
    await page.wait_for_timeout(2500)
    await shot(page, folder, "05_bookings")

    # Schedule tab
    await page.get_by_text("Schedule", exact=True).first.click()
    await page.wait_for_timeout(2500)
    await shot(page, folder, "06_schedule_top")
    await wheel_scroll(page, 700)
    await shot(page, folder, "07_schedule_calendar")

    # Messages
    await page.get_by_text("Messages", exact=True).first.click()
    await page.wait_for_timeout(2500)
    await shot(page, folder, "08_messages_list")
    # open first
    try:
        await page.get_by_text("TEST Chat Client", exact=True).first.click()
        await page.wait_for_timeout(3000)
        await shot(page, folder, "09_chat_conversation")
    except Exception as e:
        print(f"  chat open failed: {e}")

    # Profile
    await page.goto(f"{BASE}/(provider)/profile", wait_until="domcontentloaded")
    await wait_ready(page)
    await shot(page, folder, "10_profile_top")
    await wheel_scroll(page, 700)
    await shot(page, folder, "11_profile_subscription")
    await wheel_scroll(page, 700)
    await shot(page, folder, "12_profile_danger")


async def scenario_admin(page):
    folder = "04_admin"
    await sign_in_email(page, "admin@khedmapro.dz", "admin123")
    # Admin uses its own routes
    admin_pages = [
        ("index", "01_dashboard_kpis"),
        ("users", "02_users"),
        ("bookings", "03_bookings"),
        ("subscriptions", "04_subscriptions"),
        ("categories", "05_categories"),
        ("ads", "06_ads"),
        ("verification", "07_verification"),
        ("flags", "08_flags"),
        ("broadcast", "09_broadcast"),
        ("revenue", "10_revenue"),
        ("marketing-kit", "11_marketing_kit"),
        ("settings", "12_settings"),
    ]
    for path, name in admin_pages:
        url = f"{BASE}/admin" if path == "index" else f"{BASE}/admin/{path}"
        await page.goto(url, wait_until="domcontentloaded")
        try:
            await wait_ready(page, min_len=10)
        except Exception:
            await page.wait_for_timeout(3000)
        await shot(page, folder, name)
        # scroll variants for key pages
        if path in ("index", "settings", "marketing-kit", "revenue"):
            await wheel_scroll(page, 800)
            await shot(page, folder, f"{name}_scroll1")
            await wheel_scroll(page, 800)
            await shot(page, folder, f"{name}_scroll2")


async def scenario_marketing_site(page):
    folder = "05_marketing_site"
    MSITE = "http://localhost:8001"
    site_pages = [
        ("", "01_home"),
        ("for-providers.html", "02_for_providers"),
        ("how-it-works.html", "03_how_it_works"),
        ("contact.html", "04_contact"),
        ("privacy.html", "05_privacy"),
        ("terms.html", "06_terms"),
    ]
    # Desktop viewport for marketing site
    await page.set_viewport_size({"width": 1280, "height": 900})
    for path, name in site_pages:
        url = f"{MSITE}/api/site/" if not path else f"{MSITE}/api/site/{path}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(2500)
            await shot(page, folder, name)
            if path in ("", "for-providers.html"):
                await page.evaluate("() => window.scrollTo(0, 900)")
                await page.wait_for_timeout(700)
                await shot(page, folder, f"{name}_scroll1")
                await page.evaluate("() => window.scrollTo(0, 1800)")
                await page.wait_for_timeout(700)
                await shot(page, folder, f"{name}_scroll2")
                await page.evaluate("() => window.scrollTo(0, 2700)")
                await page.wait_for_timeout(700)
                await shot(page, folder, f"{name}_scroll3")
        except Exception as e:
            print(f"  marketing {path} failed: {e}")
    # Mobile view for the site home
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto(f"{MSITE}/api/site/", wait_until="domcontentloaded", timeout=15000)
    await page.wait_for_timeout(2500)
    await shot(page, folder, "07_home_mobile")
    await page.evaluate("() => window.scrollTo(0, 800)")
    await page.wait_for_timeout(700)
    await shot(page, folder, "08_home_mobile_scroll")


SCENARIOS = {
    "landing": scenario_landing_auth,
    "client": scenario_client,
    "provider": scenario_provider,
    "admin": scenario_admin,
    "marketing": scenario_marketing_site,
}


async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport=VIEWPORT)
        page = await context.new_page()
        page.on("console", lambda msg: None)
        try:
            if which == "all":
                for name, fn in SCENARIOS.items():
                    print(f"\n=== {name} ===")
                    try:
                        await fn(page)
                    except Exception as e:
                        print(f"  scenario {name} error: {e}")
            else:
                await SCENARIOS[which](page)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
