"""One-off ad-photo generator for khedmaPro.

Generates 8 marketing/social-media ad images using Gemini Nano Banana
(via EMERGENT_LLM_KEY) in the aspect ratios needed for Facebook, Instagram
and TikTok. All taglines are in **French or Arabic only** (per Algeria target).
The brand wordmark "khedmaPro" always stays in Latin letters.

Run: `python /app/scripts/gen_ads.py`
Output: `/app/generated_ads/*.png` → also mirrored to `/app/backend/static/ads/`.
"""
import asyncio
import base64
import os
import shutil
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
except Exception as e:
    print(f"emergentintegrations import failed: {e}", file=sys.stderr)
    raise

OUT_DIR = Path("/app/generated_ads")
MIRROR_DIR = Path("/app/backend/static/ads")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MIRROR_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"

BRAND = "khedmaPro"

# Taglines: French + Arabic ONLY. English is intentionally excluded.
TAGLINE_FR_MAIN = "Des pros de confiance, en un click"
TAGLINE_AR_MAIN = "محترفون موثوقون بضغطة واحدة"
TAGLINE_FR_PLUMB = "Des plombiers de confiance — réservez en quelques secondes"
TAGLINE_FR_ELEC = "Des électriciens certifiés — même jour"
TAGLINE_AR_CLEAN = "منظّفون بضغطة — نظافة فورية"
TAGLINE_FR_CLEAN = "Un ménage impeccable, à la demande"
TAGLINE_AR_HERO = "احجز محترفاً موثوقاً في ثوانٍ"

BASE_STYLE = (
    "Ultra-high-quality photorealistic marketing / advertising still, cinematic "
    "lighting, warm sunset accents, deep navy/amber brand palette. The composition "
    "MUST include: (a) a modern smartphone floating in mid-air, rendered in a stylish "
    "3D isometric view with a soft drop-shadow, showing the khedmaPro app's home "
    "screen with a list of service categories (plumbing, electrical, cleaning, "
    "painting, carpentry) and a bright amber CTA button labelled in the ad's language; "
    "(b) subtle iconography hinting at those trades (wrench, wire, spray bottle, brush) "
    "tastefully arranged around the phone; (c) large brand wordmark text that reads "
    "'khedmaPro' in a clean sans-serif type — spelled EXACTLY as provided, no "
    "misspellings, brand ALWAYS in Latin letters even when the tagline is in Arabic. "
    "IMPORTANT: NEVER render meta phrases like 'Brand name TEXT OVERLAY', 'TAGLINE', "
    "'CTA', 'ASPECT', 'CONTEXT' or any other prompt-instruction words as visible text "
    "on the image. Only render the exact brand name and the exact tagline provided below. "
    "No English text anywhere in the image (except the brand wordmark). "
    "No fake logos, no watermarks, no lorem-ipsum. Text must be crisp and legible."
)

# Each entry: (filename, aspect_ratio_hint, extra_direction)
ADS = [
    (
        "hero_portrait_4x5_fr.png",
        "portrait 4:5 (1080x1350), Facebook & Instagram feed hero",
        "Wide vista of an Algerian city (Algiers/Oran cityscape at golden hour). "
        f"Brand text (render as-is): '{BRAND}' large centered top. French tagline below (render as-is): '{TAGLINE_FR_MAIN}'. "
        "Absolutely no other language on the image.",
    ),
    (
        "hero_portrait_4x5_ar.png",
        "portrait 4:5 (1080x1350), Facebook & Instagram feed hero, Arabic-first",
        "Same Algerian city vista at golden hour. "
        f"Brand text (render as-is): '{BRAND}' large top (Latin letters). Arabic tagline below right-to-left (render as-is): "
        f"'{TAGLINE_AR_HERO}'. Absolutely no French or English text — only Arabic.",
    ),
    (
        "square_1x1_fr.png",
        "square 1:1 (1080x1080), Instagram feed",
        "Tighter composition, three service pros (a plumber, a cleaner, an electrician) smiling "
        "in the background, phone in foreground showing the app UI. "
        f"Brand name (render as-is): '{BRAND}'. French tagline (render as-is): '{TAGLINE_FR_MAIN}'. No English.",
    ),
    (
        "square_1x1_ar.png",
        "square 1:1, Instagram, Arabic-first",
        "Same 3-pros composition but Arabic tagline. "
        f"Brand name '{BRAND}' stays in Latin. Arabic tagline right-to-left (render as-is): '{TAGLINE_AR_MAIN}'. "
        "Include a small Algerian flag icon in one corner.",
    ),
    (
        "vertical_9x16_tiktok_fr.png",
        "vertical 9:16 (1080x1920), TikTok / Reels story",
        f"Vertical stack layout: Brand name '{BRAND}' huge at top, phone in middle showing app, "
        "three tiny 3D icons at bottom (wrench/spray/paint). "
        f"French tagline at bottom (render as-is): '{TAGLINE_FR_MAIN}'. "
        "Leave clear top and bottom safe zones for TikTok UI overlays. No English.",
    ),
    (
        "vertical_9x16_tiktok_ar.png",
        "vertical 9:16, TikTok / Reels story, Arabic-first",
        f"Same vertical stack but Arabic tagline right-to-left (render as-is): '{TAGLINE_AR_MAIN}'. "
        f"Brand name '{BRAND}' in Latin. Absolutely no French or English.",
    ),
    (
        "cat_plumbing_fr.png",
        "square 1:1, Instagram category — plumbing",
        f"Focus category: PLUMBING. A clean shot of a friendly Algerian plumber (30s) fixing "
        "a modern kitchen faucet, phone with khedmaPro app pinned in the corner. "
        f"Brand name '{BRAND}' small top-left. French tagline (render as-is): '{TAGLINE_FR_PLUMB}'. No English.",
    ),
    (
        "cat_cleaning_ar.png",
        "vertical 9:16, TikTok — cleaning, Arabic-first",
        "Focus category: CLEANING. A cheerful Algerian cleaner (woman with headscarf) in a "
        "spotless modern home, natural light, phone floating with app UI showing a "
        f"booking-confirmed screen. Brand name '{BRAND}' top-center. "
        f"Arabic tagline right-to-left (render as-is): '{TAGLINE_AR_CLEAN}'. Only Arabic, no English or French.",
    ),
]


async def _generate(idx: int, filename: str, ratio: str, extra: str) -> None:
    print(f"[{idx+1}/{len(ADS)}] → {filename}  ({ratio})")
    prompt = f"{BASE_STYLE}\n\nASPECT / CONTEXT: {ratio}.\n{extra}"
    session = f"khedmapro-ad-{filename}-{int(time.time())}"
    chat = LlmChat(api_key=API_KEY, session_id=session, system_message="You are a world-class advertising art director.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    msg = UserMessage(text=prompt)
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"  ! generation failed: {e}", file=sys.stderr)
        return
    if not images:
        print(f"  ! no image returned. text={text[:120]!r}", file=sys.stderr)
        return
    img = images[0]
    data = base64.b64decode(img["data"])
    out_path = OUT_DIR / filename
    with open(out_path, "wb") as f:
        f.write(data)
    # Mirror to the static-served directory so admins can consume the URL.
    try:
        shutil.copy2(out_path, MIRROR_DIR / filename)
    except Exception as e:
        print(f"  ! mirror copy failed: {e}", file=sys.stderr)
    kb = len(data) // 1024
    print(f"  ✓ saved {out_path} ({kb} KB)")


async def main() -> None:
    if not API_KEY:
        print("EMERGENT_LLM_KEY missing from env", file=sys.stderr)
        sys.exit(1)
    print(f"Model: {MODEL}. Output dir: {OUT_DIR}. Ads: {len(ADS)}")
    # Clear old English ads so nothing stale lingers.
    for stale in list(OUT_DIR.glob("*.png")) + list(MIRROR_DIR.glob("*.png")):
        try:
            stale.unlink()
        except Exception:
            pass
    for i, (fname, ratio, extra) in enumerate(ADS):
        await _generate(i, fname, ratio, extra)
    print("\nAll done.")


if __name__ == "__main__":
    asyncio.run(main())
