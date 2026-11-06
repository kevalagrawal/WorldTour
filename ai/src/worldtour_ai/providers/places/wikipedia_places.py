"""Landmarks near a point from Wikipedia's geosearch (free, no key).

Geoapify (OpenStreetMap) finds plenty of beaches and parks but misses many famous sights in
smaller towns (temples, forts, waterfalls, viewpoints). Wikipedia has an article for nearly every
landmark worth a visit, with coordinates and a one-line description, so it fills those gaps and
gives the itinerary a real description of each place.
"""

from __future__ import annotations

import re

from worldtour_ai.utils.http import HttpClient

API = "https://en.wikipedia.org/w/api.php"

# Description or title words → itinerary category. Order matters: the first match wins.
_KINDS = (
    (("beach",), "beach"),
    (("fort", "palace", "museum", "monument", "tomb", "mausoleum", "heritage", "ruins", "archaeolog", "castle", "haveli", "stepwell", "memorial"), "history"),
    (("temple", "church", "cathedral", "basilica", "mosque", "gurudwara", "gurdwara", "monastery", "shrine", "math ", "ashram", "dargah", "synagogue", "stupa"), "culture"),
    (("waterfall", "falls", "lake", "valley", "peak", "hill", "pass", "glacier", "national park", "sanctuary", "reserve", "garden", "park", "cave", "island", "dam", "viewpoint", "point", "forest", "backwater"), "nature"),
    (("zoo", "aquarium", "amusement", "theme park", "water park"), "entertainment"),
    (("market", "bazaar", "mall", "street"), "shopping"),
)
# Articles that are not places to visit.
_NOT_SIGHTS = re.compile(
    r"\b(railway station|metro station|bus station|airport|school|college|university|hospital|village|town in|city in|"
    r"district|constituency|neighbourhood|neighborhood|suburb|locality|census town|company|hotel|bank|road|highway|"
    r"office|ward|municipal|tehsil|taluk|panchayat|mandal|block|area of|residential|building in|skyscraper|apartment|"
    r"stadium|cricket ground|river in|tributary|sports venue|club|court|prison|cemetery|power station|resort|restaurant)\b",
    re.IGNORECASE,
)


_HEADERS = {"User-Agent": "WorldTour trip planner (https://worldtour-xi.vercel.app)"}


def wikipedia_landmarks(city: str, lat: float, lon: float, http: HttpClient | None = None, radius_m: int = 10000, limit: int = 100) -> list[dict]:
    """Landmark articles for a city, from two Wikipedia queries:

    * the curated category "Tourist attractions in <city>" (finds famous sights a little outside
      town, such as Amber Fort for Jaipur), kept when within 75 km, and
    * every article within radius_m of the centre (Wikipedia allows up to 10 km).
    """
    from worldtour_ai.algorithms.graphs.geo import haversine_km

    client = http or HttpClient()
    common = {"action": "query", "format": "json", "prop": "coordinates|description", "formatversion": 2, "colimit": "max"}
    pages: list[dict] = []
    for title in (f"Category:Tourist attractions in {city}", f"Category:Tourist attractions in {city} district"):
        try:
            curated = client.get_json(
                API,
                params={**common, "generator": "categorymembers", "gcmtitle": title, "gcmlimit": 100, "gcmtype": "page"},
                headers=_HEADERS, cache_ttl=24 * 3600, attempts=1,
            )
        except Exception:
            continue  # many towns have no such category; the nearby search below still runs
        known = {page.get("pageid") for page in pages}
        pages += [page for page in (curated.get("query") or {}).get("pages") or []
                  if page.get("pageid") not in known
                  and (page.get("coordinates") or [{}])[0].get("lat") is not None
                  and haversine_km(lat, lon, page["coordinates"][0]["lat"], page["coordinates"][0]["lon"]) <= 75]
    nearby = client.get_json(
        API,
        params={**common, "generator": "geosearch", "ggscoord": f"{lat}|{lon}", "ggsradius": min(radius_m, 10000), "ggslimit": limit},
        headers=_HEADERS, cache_ttl=24 * 3600, attempts=1,
    )
    seen = {page.get("pageid") for page in pages}
    pages += [page for page in (nearby.get("query") or {}).get("pages") or [] if page.get("pageid") not in seen]
    places = []
    for page in pages:
        title = page.get("title") or ""
        description = page.get("description") or ""
        coords = (page.get("coordinates") or [{}])[0]
        if not title or coords.get("lat") is None:
            continue
        text = f"{title} {description}".lower()
        if _NOT_SIGHTS.search(description) or _NOT_SIGHTS.search(title):
            continue
        category = next((kind for words, kind in _KINDS if any(word in text for word in words)), None)
        if not category:
            continue  # unknown kind of article: people, events, rivers' tributaries…
        places.append(
            {
                "place_id": f"wiki-{page.get('pageid')}",
                "name": re.sub(r"\s*\(.*?\)\s*$", "", title),
                "category": category,
                "address": description[:1].upper() + description[1:] if description else "",
                "city": city,
                "lat": coords["lat"],
                "lon": coords["lon"],
                # Places famous enough for an encyclopedia article rank above a plain map point.
                "rating": 4.6,
                "data_source": "live",
            }
        )
    return places
