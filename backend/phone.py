"""Phone-number normalization and mock OTP sender."""
import logging
import re
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def normalize_dz_phone(raw: str) -> str:
    """Normalize any DZ-format phone into E.164 (+213XXXXXXXXX)."""
    s = re.sub(r"[\s().-]", "", raw or "")
    if s.startswith("+213"):
        national = s[4:]
    elif s.startswith("00213"):
        national = s[5:]
    elif s.startswith("0"):
        national = s[1:]
    else:
        national = s
    if not re.fullmatch(r"[567]\d{8}", national):
        raise HTTPException(status_code=400, detail="Invalid Algerian phone number")
    return "+213" + national


async def send_otp_code(phone_e164: str, code: str) -> None:
    """MOCK sender — logs the code. Swap this to add Twilio / Firebase / local SMS gateway."""
    logger.warning("MOCK OTP for %s: %s", phone_e164, code)
