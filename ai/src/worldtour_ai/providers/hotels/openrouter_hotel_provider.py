"""Hotel search through the configured free OpenRouter model, located with Geoapify.

The model names real hotels that match the request and estimates a nightly rate.
Each name is geocoded with Geoapify. Hotels that cannot be found near the city
are marked unverified. Rates remain model estimates, not live availability.
"""

from __future__ import annotations

import hashlib
import json
import re

from worldtour_ai.algorithms.graphs.geo import haversine_km
from worldtour_ai.config.settings import get_settings
from worldtour_ai.providers.hotels.base_hotel_provider import BaseHotelProvider
from worldtour_ai.providers.llm.openrouter_provider import OpenRouterProvider
from worldtour_ai.utils.cache import ResponseCache
from worldtour_ai.utils.exceptions import EmptyResultError, ProviderError
from worldtour_ai.utils.http import HttpClient

SYSTEM_PROMPT = """You are a hotel research assistant.
Return ONLY a JSON object, no prose, in this shape:
{"hotels": [{"name": str, "area": str, "tier": "budget"|"mid"|"comfort"|"luxury",
"price_per_night_usd": number, "rating": number, "why": str}]}
Rules:
- List 6 to 8 real hotels that exist in the given city. Use their exact public names.
- Only include hotels you are confident exist. Do not invent names.
- Cover a spread of tiers that fits the traveler's budget and trip style.
- price_per_night_usd is a typical nightly room rate in USD for one room.
- rating is the typical guest rating out of 5.
- why is one short sentence tying the hotel to the traveler's request."""

_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"hotel", "the", "and", "by", "resort", "inn", "suites", "a", "of", "at", "&"}


class OpenRouterHotelProvider(BaseHotelProvider):
    name = "openrouter_hotels"
    data_source = "llm"

    def __init__(self, llm: OpenRouterProvider | None = None, http: HttpClient | None = None) -> None:
        self.llm = llm or OpenRouterProvider()
        self.http = http or HttpClient()
        self.cache = ResponseCache()

    def search_hotels(
        self,
        city: str,
        lat: float | None,
        lon: float | None,
        nights: int,
        preferences: list[str],
        **context,
    ) -> dict:
        if not city:
            raise ProviderError("A city is required for hotel search")
        prompt = _user_prompt(city, nights, preferences, context)
        cache_key = "llm-hotels-" + hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:24]
        hotels = (self.cache.get(cache_key) or {}).get("hotels")
        if not hotels:
            hotels = []
            for _ in range(2):  # a free model occasionally answers with prose instead of JSON
                raw = self.llm.complete(SYSTEM_PROMPT, prompt, timeout=120, attempts=3)
                hotels = _parse_hotels(raw)
                if hotels:
                    break
            if not hotels:
                raise EmptyResultError("OpenRouter returned no usable hotel list")
            self.cache.set(cache_key, {"hotels": hotels}, 24 * 3600)

        options = []
        for index, item in enumerate(hotels, start=1):
            located = self._locate(item["name"], city, lat, lon)
            distance = None
            if located and lat is not None and lon is not None:
                distance = round(haversine_km(lat, lon, located["lat"], located["lon"]), 2)
            options.append(
                {
                    "option_id": f"llm-hotel-{_slug(city)}-{index}",
                    "name": item["name"],
                    "city": city,
                    "area": item.get("area"),
                    "tier": item.get("tier"),
                    "price_per_night": item.get("price_per_night_usd"),
                    "currency": "USD",
                    "rating": item.get("rating"),
                    "location": (located or {}).get("address") or item.get("area") or city,
                    "distance_to_center_km": distance,
                    "why": item.get("why"),
                    "lat": (located or {}).get("lat"),
                    "lon": (located or {}).get("lon"),
                    "nights": nights,
                    "verified_on_map": bool(located),
                    "data_source": "llm",
                    "note": (
                        "Suggested by the OpenRouter model"
                        + (" and located on Geoapify." if located else "; Geoapify could not confirm the location.")
                        + " Nightly rate is a model estimate."
                    ),
                }
            )
        verified = [option for option in options if option["verified_on_map"]]
        chosen = verified if len(verified) >= 3 else options
        return {
            "provider_used": self.name,
            "data_source": "llm",
            "options": chosen,
            "verified_count": len(verified),
            "limitation": "Model-suggested hotels with estimated rates. Not live availability.",
        }

    def _locate(self, name: str, city: str, lat: float | None, lon: float | None) -> dict | None:
        settings = get_settings()
        if not settings.geoapify_api_key or settings.disable_network:
            return None
        params = {"text": f"{name}, {city}", "format": "json", "limit": 1, "apiKey": settings.geoapify_api_key}
        if lat is not None and lon is not None:
            params["filter"] = f"circle:{lon},{lat},60000"
        try:
            payload = self.http.get_json("https://api.geoapify.com/v1/geocode/search", params=params, cache_ttl=7 * 24 * 3600)
        except Exception:
            return None
        results = payload.get("results") or []
        if not results:
            return None
        top = results[0]
        if not _same_place(name, top.get("name") or top.get("formatted") or "", city):
            return None
        return {"lat": top.get("lat"), "lon": top.get("lon"), "address": top.get("formatted")}


def _user_prompt(city: str, nights: int, preferences: list[str], context: dict) -> str:
    lines = [f"City: {city}", f"Nights: {nights}"]
    if context.get("travelers"):
        lines.append(f"Travelers: {context['travelers']}")
    if context.get("trip_type"):
        lines.append(f"Trip style: {context['trip_type']}")
    if context.get("rooms"):
        lines.append(f"Rooms needed: {context['rooms']}")
    if context.get("budget"):
        lines.append(f"Total trip budget (flights included): {context['budget']} {context.get('currency') or 'USD'}")
    if context.get("nightly_target"):
        lines.append(
            f"Target room rate: about {context['nightly_target']} {context.get('currency') or 'USD'} per room per night. "
            "At least four hotels must be at or below this rate; the rest may be up to 50% above it."
        )
    if context.get("start_date"):
        lines.append(f"Check-in: {context['start_date']}")
    if preferences:
        lines.append("Interests: " + ", ".join(preferences))
    if context.get("hotel_preferences"):
        lines.append("Hotel preferences: " + ", ".join(context["hotel_preferences"]))
    return "\n".join(lines)


def _parse_hotels(raw: str) -> list[dict]:
    cleaned = re.sub(r"^```(?:json)?|```$", "", (raw or "").strip()).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return []
    try:
        payload = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return []
    hotels = []
    seen = set()
    for item in payload.get("hotels") or []:
        if not isinstance(item, dict) or not str(item.get("name") or "").strip():
            continue
        name = str(item["name"]).strip()
        if name.lower() in seen:
            continue
        seen.add(name.lower())
        price = item.get("price_per_night_usd")
        rating = item.get("rating")
        hotels.append(
            {
                "name": name,
                "area": item.get("area"),
                "tier": item.get("tier") if item.get("tier") in {"budget", "mid", "comfort", "luxury"} else None,
                "price_per_night_usd": float(price) if isinstance(price, (int, float)) and price > 0 else None,
                "rating": float(rating) if isinstance(rating, (int, float)) and 0 < rating <= 5 else None,
                "why": item.get("why"),
            }
        )
    return hotels


def _same_place(expected: str, found: str, city: str = "") -> bool:
    """Match on the distinctive words of the hotel name, ignoring generic and city words.

    Short names must match every distinctive word, so "Address Downtown" does not
    match "Address Harbour Point".
    """
    ignore = _STOP | set(_WORD.findall(city.lower()))
    want = {word for word in _WORD.findall(expected.lower()) if word not in ignore}
    got = set(_WORD.findall(found.lower()))
    if not want:
        return False
    share = len(want & got) / len(want)
    return share == 1.0 if len(want) <= 3 else share >= 0.75


def _slug(text: str) -> str:
    return "-".join(_WORD.findall(text.lower())) or "city"
