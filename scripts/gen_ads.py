"""One-off ad-photo generator for khedmaPro.

Generates 5-8 marketing/social-media ad images using Gemini Nano Banana
(via EMERGENT_LLM_KEY) in the aspect ratios needed for Facebook, Instagram
and TikTok. Images are saved into `/app/generated_ads/`.

Run: `python /app/scripts/gen_ads.py`
"""
import asyncio
import base64
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")  # picks up backend/.env location
load_dotenv("/app/backend/.env")

# We import lazily so a missing dep doesn't crash the script before we log.
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
except Exception as e:
    print(f"emergentintegrations import failed: {e}", file=sys.stderr)
    raise

OUT_DIR = Path("/app/generated_ads")
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"

BRAND = "khedmaPro"
TAGLINE_EN = "Trusted pros, one tap away"
TAGLINE_FR = "Des pros de confiance, en un tap"
TAGLINE_AR = "محترفون موثوقون بضغطة واحدة"

# Base creative direction shared across all prompts. We ALWAYS ask the model
# to render the brand name and a short tagline overlayed on the image, and to
# include a 3D-rendered smartphone showing the app UI.
BASE_STYLE = (
    "Ultra-high-quality photorealistic marketing / advertising still, cinematic "
    "lighting, warm sunset accents, deep navy/amber brand palette. The composition "
    "MUST include: (a) a modern smartphone floating in mid-air, rendered in a stylish "
    "3D isometric view with a soft drop-shadow, showing the khedmaPro app's home "
    "screen with a list of service categories (plumbing, electrical, cleaning, "
    "painting, carpentry) and a bright amber CTA button; (b) subtle iconography "
    "hinting at those trades (wrench, wire, spray bottle, brush) tastefully arranged "
    "around the phone; (c) a bold BRAND TEXT OVERLAY that reads 'khedmaPro' in a "
    "clean sans-serif type, plus a short tagline underneath in white — spelled EXACTLY "
    "as provided, no misspellings. No fake logos, no watermarks, no lorem-ipsum. "
    "Text must be crisp and legible."
)

# Each entry: (filename, aspect_ratio_hint, extra_direction)
ADS = [
    (
        "hero_portrait_4x5.png",
        "portrait 4:5 (1080x1350), Facebook & Instagram feed hero",
        "Wide vista of an Algerian city (Algiers/Oran cityscape at golden hour), "
        f"BRAND TEXT: '{BRAND}' large centered top, TAGLINE: '{TAGLINE_EN}' below.",
    ),
    (
        "square_1x1_ig_feed.png",
        "square 1:1 (1080x1080), Instagram feed",
        "Tighter composition, three service pros (a plumber with wrench, a cleaner "
        "with spray bottle, an electrician with screwdriver) smiling in the "
        f"background, phone in foreground. BRAND: '{BRAND}', TAGLINE: '{TAGLINE_EN}'.",
    ),
    (
        "vertical_9x16_tiktok.png",
        "vertical 9:16 (1080x1920), TikTok / Reels story",
        "Vertical stack layout: BRAND '{BRAND}' huge at top, phone in middle "
        f"showing app, three tiny 3D icons at bottom (wrench/spray/paint), tagline: '{TAGLINE_EN}'. "
        "Leave clear top and bottom safe zones for TikTok UI overlays.",
    ),
    (
        "cat_plumbing_1x1.png",
        "square 1:1, Instagram category showcase — plumbing",
        f"Focus category: PLUMBING. A clean, well-lit shot of a friendly Algerian "
        "plumber (30s) fixing a modern kitchen faucet, phone with khedmaPro app "
        f"pinned in the corner. BRAND '{BRAND}' small top-left. TAGLINE: 'Plumbers you can trust — book in seconds'.",
    ),
    (
        "cat_electrical_4x5.png",
        "portrait 4:5, Facebook — electrical",
        f"Focus category: ELECTRICAL. A young Algerian electrician in a modern living "
        "room installing a smart light, sparks of positive energy motif, phone floating "
        f"with app UI showing 5-star reviews. BRAND '{BRAND}'. TAGLINE: 'Certified electricians, same-day'.",
    ),
    (
        "cat_cleaning_9x16.png",
        "vertical 9:16, TikTok — cleaning",
        f"Focus category: CLEANING. A cheerful Algerian cleaner (woman with headscarf) "
        "in a spotless modern home, natural light, phone floating with app UI showing a "
        f"booking-confirmed screen. BRAND '{BRAND}' top-center. TAGLINE: 'Sparkling clean, on demand'.",
    ),
    (
        "tagline_ar_1x1.png",
        "square 1:1, Instagram, Arabic-first",
        f"Same style but the tagline text overlaid is in ARABIC (right-to-left): "
        f"'{TAGLINE_AR}'. The BRAND '{BRAND}' stays in Latin letters. Include a "
        "small Algerian flag icon in one corner.",
    ),
    (
        "tagline_fr_4x5.png",
        "portrait 4:5, Facebook, French-first",
        f"French tagline: '{TAGLINE_FR}'. BRAND '{BRAND}'. Include a small Algerian "
        "flag icon in one corner.",
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
    kb = len(data) // 1024
    print(f"  ✓ saved {out_path} ({kb} KB)")


async def main() -> None:
    if not API_KEY:
        print("EMERGENT_LLM_KEY missing from env", file=sys.stderr)
        sys.exit(1)
    print(f"Model: {MODEL}. Output dir: {OUT_DIR}. Ads: {len(ADS)}")
    for i, (fname, ratio, extra) in enumerate(ADS):
        await _generate(i, fname, ratio, extra)
    print("\nAll done.")


if __name__ == "__main__":
    asyncio.run(main())
