"""Phone-number normalization and OTP SMS dispatch."""
import logging
import re
from fastapi import HTTPException

from sms import send_sms_otp

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
    """Delegate to the pluggable SMS dispatcher.

    Delivery failures are not swallowed: a user who just requested a code must
    learn it could not be sent, so this raises 503 with a generic message.
    Provider details (gateway response, credentials state) stay in the server
    log and never reach the client.
    """
    result = await send_sms_otp(phone_e164, code)
    if not result.get("ok"):
        logger.warning(
            "send_otp_code: delivery failed via %s — %s",
            result.get("provider"),
            result.get("error"),
        )
        raise HTTPException(
            status_code=503,
            detail="SMS delivery failed — please try again later",
        )
