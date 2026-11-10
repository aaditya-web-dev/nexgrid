import asyncio
import time

import httpx

from app.core.config import settings

URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"

CANDIDATES = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
]


async def main():
    headers = {
        "x-goog-api-key": settings.GEMINI_API_KEY.strip(),
        "Content-Type": "application/json",
    }
    body = {"contents": [{"parts": [{"text": "Say hello"}]}]}

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        for model in CANDIDATES:
            start = time.time()
            try:
                r = await client.post(URL.format(model), json=body)
                result = f"STATUS {r.status_code}"
                if r.status_code != 200:
                    result += " - " + r.text.replace("\n", " ")[:120]
            except Exception as exc:
                result = f"FAILED {exc!r}"
            print(f"{model:28} {round(time.time() - start, 1):>5}s  {result}")


asyncio.run(main())