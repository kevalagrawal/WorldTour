"""Chat translation for Hindi, Gujarati and Marathi through the free MyMemory API.

The planner works in English. A message written in Devanagari or Gujarati script is translated to
English before it is parsed; Hinglish typed in Latin letters ("delhi se 2 log") is left alone because
the parser already reads it. Replies are translated back line by line so numbered questions keep
their layout. When the service is unavailable the English text is returned unchanged.

MyMemory needs no key. Setting MYMEMORY_EMAIL raises the free daily limit (about 5,000 to 50,000 words).
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import httpx

from worldtour_ai.config.settings import get_settings

LANGUAGES = {"en", "hi", "gu", "mr"}
API_URL = "https://api.mymemory.translated.net/get"
MAX_CHARS = 450  # the free API translates up to 500 characters per request

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_GUJARATI = re.compile(r"[઀-૿]")
_NUMBERED = re.compile(r"^(\s*\d+\.\s+)(.*)$")


def written_in(text: str) -> str | None:
    """The language a message's script points to, or None for Latin text."""
    if _GUJARATI.search(text):
        return "gu"
    if _DEVANAGARI.search(text):
        return "devanagari"
    return None


def to_english(text: str, language: str) -> str:
    """The traveler's message in English when it is written in an Indian script."""
    script = written_in(text)
    if not script:
        return text
    source = "gu" if script == "gu" else ("mr" if language == "mr" else "hi")
    return _translate(text, source, "en") or text


def from_english(text: str, language: str) -> str:
    """A reply in the traveler's language, keeping line breaks and numbered lists."""
    if language not in LANGUAGES or language == "en" or not text.strip():
        return text
    lines = text.split("\n")
    work = [(index, line) for index, line in enumerate(lines) if line.strip()]
    with ThreadPoolExecutor(max_workers=6) as pool:
        done = list(pool.map(lambda item: _line(item[1], language), work))
    for (index, _line_text), translated in zip(work, done):
        lines[index] = translated
    return "\n".join(lines)


def _line(line: str, language: str) -> str:
    numbered = _NUMBERED.match(line)
    prefix, body = (numbered.group(1), numbered.group(2)) if numbered else ("", line)
    return prefix + (_translate(body, "en", language) or body)


def _translate(text: str, source: str, target: str) -> str | None:
    pieces = _chunks(text)
    out = []
    for piece in pieces:
        translated = _translate_piece(piece, source, target)
        if translated is None:
            return None
        out.append(translated)
    return " ".join(out)


@lru_cache(maxsize=2048)
def _translate_piece(text: str, source: str, target: str) -> str | None:
    settings = get_settings()
    if settings.disable_network:
        return None
    params = {"q": text, "langpair": f"{source}|{target}"}
    if settings.mymemory_email:
        params["de"] = settings.mymemory_email
    try:
        response = httpx.get(API_URL, params=params, timeout=12)
        payload = response.json()
    except Exception:
        return None
    if payload.get("responseStatus") != 200 or payload.get("quotaFinished"):
        return None
    translated = (payload.get("responseData") or {}).get("translatedText")
    # The API reports problems as text in the result ("MYMEMORY WARNING ...", "INVALID LANGUAGE PAIR").
    if not translated or translated.isupper() and "MYMEMORY" in translated:
        return None
    return translated


def _chunks(text: str) -> list[str]:
    if len(text) <= MAX_CHARS:
        return [text]
    sentences = re.split(r"(?<=[.!?।])\s+", text)
    chunks, current = [], ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > MAX_CHARS:
            chunks.append(current)
            current = ""
        current = f"{current} {sentence}".strip()
        while len(current) > MAX_CHARS:
            chunks.append(current[:MAX_CHARS])
            current = current[MAX_CHARS:]
    if current:
        chunks.append(current)
    return chunks
