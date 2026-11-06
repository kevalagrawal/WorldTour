"""Build providers. Live data only; routing and currency have computed fallbacks."""

from __future__ import annotations

from worldtour_ai.config.settings import get_settings
from worldtour_ai.providers.currency.frankfurter_provider import FrankfurterProvider
from worldtour_ai.providers.currency.static_currency_provider import StaticCurrencyProvider
from worldtour_ai.providers.flights.aviationstack_flight_provider import AviationStackFlightProvider
from worldtour_ai.providers.flights.serpapi_flight_provider import SerpApiFlightProvider
from worldtour_ai.providers.hotels.geoapify_hotel_provider import GeoapifyHotelProvider
from worldtour_ai.providers.hotels.openrouter_hotel_provider import OpenRouterHotelProvider
from worldtour_ai.providers.hotels.serpapi_hotel_provider import SerpApiHotelProvider
from worldtour_ai.providers.places.geoapify_places_provider import GeoapifyPlacesProvider
from worldtour_ai.providers.routing.local_graph_provider import LocalGraphProvider
from worldtour_ai.providers.routing.osrm_provider import OSRMProvider
from worldtour_ai.providers.weather.open_meteo_provider import OpenMeteoProvider
from worldtour_ai.utils.exceptions import ProviderError
from worldtour_ai.utils.agent_logs import log_event
from worldtour_ai.utils.logging import get_logger

logger = get_logger("worldtour.providers")


def _call(primary, fallback, method: str, *args, label: str = "provider", **kwargs) -> dict:
    settings = get_settings()
    last_error = f"{label} is not configured (check the API key and provider setting)"
    if primary is not None:
        try:
            result = getattr(primary, method)(*args, **kwargs)
            if not result:
                raise ProviderError("empty provider result")
            return result
        except Exception as exc:
            last_error = str(exc)
            logger.debug("Provider %s failed: %s", getattr(primary, "name", primary), exc)
            if not settings.use_mock_fallback or fallback is None:
                raise
    if fallback is None:
        raise ProviderError(last_error)
    result = getattr(fallback, method)(*args, **kwargs)
    result["fallback_reason"] = last_error
    return result


def _first_success(chain: list, method: str, label: str, *args, **kwargs) -> dict:
    """Try each provider in order; the first non-empty result wins and records why earlier ones failed."""
    errors = []
    for provider in chain:
        try:
            result = getattr(provider, method)(*args, **kwargs)
            if result and result.get("options"):
                if errors:
                    result["fallback_reason"] = "; ".join(errors)
                return result
            errors.append(f"{provider.name}: empty result")
        except Exception as exc:
            errors.append(f"{provider.name}: {exc}")
            logger.debug("%s provider %s failed: %s", label, provider.name, exc)
            log_event("provider_failed", level="warning", kind=label.lower(), provider=provider.name, error_type=type(exc).__name__, error=str(exc), next_provider=_next_name(chain, provider))
            continue
        log_event("provider_empty", level="warning", kind=label.lower(), provider=provider.name, next_provider=_next_name(chain, provider))
    log_event("provider_chain_failed", level="error", kind=label.lower(), tried=[p.name for p in chain], errors=errors or ["no provider is configured"])
    raise ProviderError("; ".join(errors) or f"no {label.lower()} provider is configured")


def _next_name(chain: list, provider) -> str | None:
    index = chain.index(provider)
    return chain[index + 1].name if index + 1 < len(chain) else None


class FlightGateway:
    """Google Flights via SerpApi (future dates, real fares) first, Aviationstack schedules second."""

    def __init__(self) -> None:
        settings = get_settings()
        self.chain = []
        if settings.disable_network:
            return
        if settings.serpapi_api_key:
            self.chain.append(SerpApiFlightProvider())
        if settings.flight_provider == "aviationstack" and settings.aviationstack_api_key:
            self.chain.append(AviationStackFlightProvider())

    def search_flights(self, *args, **kwargs) -> dict:
        return _first_success(self.chain, "search_flights", "Flight", *args, **kwargs)


class HotelGateway:
    """Google Hotels via SerpApi first, then OpenRouter suggestions, then Geoapify accommodation records."""

    def __init__(self) -> None:
        settings = get_settings()
        self.chain = []
        if settings.disable_network:
            return
        if settings.serpapi_api_key:
            self.chain.append(SerpApiHotelProvider())
        if settings.hotel_provider in {"openrouter", "llm"} and settings.openrouter_api_key:
            self.chain.append(OpenRouterHotelProvider())
        if settings.geoapify_api_key:
            self.chain.append(GeoapifyHotelProvider())

    def search_hotels(self, *args, **kwargs) -> dict:
        return _first_success(self.chain, "search_hotels", "Hotel", *args, **kwargs)


class WeatherGateway:
    def __init__(self) -> None:
        settings = get_settings()
        use_live = settings.weather_provider == "open_meteo" and not settings.disable_network
        self.primary = OpenMeteoProvider() if use_live else None

    def forecast(self, *args, **kwargs) -> dict:
        return _call(self.primary, None, "forecast", *args, label="Open-Meteo", **kwargs)


class PlacesGateway:
    def __init__(self) -> None:
        settings = get_settings()
        use_live = (
            settings.places_provider == "geoapify"
            and bool(settings.geoapify_api_key)
            and not settings.disable_network
        )
        self.primary = GeoapifyPlacesProvider() if use_live else None

    def search_places(self, city: str, lat, lon, preferences, limit: int = 24) -> dict:
        """Geoapify and Wikipedia at the same time; landmarks found by both keep Wikipedia's description."""
        import contextvars
        from concurrent.futures import ThreadPoolExecutor

        from worldtour_ai.providers.places.wikipedia_places import wikipedia_landmarks

        settings = get_settings()
        with ThreadPoolExecutor(max_workers=2) as pool:
            osm = pool.submit(contextvars.copy_context().run, _call, self.primary, None, "search_places", city, lat, lon, preferences, label="Geoapify", limit=limit)
            wiki = None
            if not settings.disable_network and lat is not None:
                wiki = pool.submit(contextvars.copy_context().run, wikipedia_landmarks, city, lat, lon)
            try:
                result = osm.result()
            except Exception as exc:
                result, osm_error = None, exc
            try:
                landmarks = wiki.result() if wiki else []
            except Exception as exc:
                logger.debug("Wikipedia landmarks failed: %s", exc)
                landmarks = []
        if result is None and not landmarks:
            raise osm_error
        result = result or {"provider_used": "wikipedia", "data_source": "live", "places": []}
        merged = _merge_landmarks(result.get("places") or [], landmarks)
        if landmarks:
            result["provider_used"] = f"{result.get('provider_used')}+wikipedia" if result.get("places") else "wikipedia"
        result["places"] = merged
        return result


class RoutingGateway:
    def __init__(self) -> None:
        settings = get_settings()
        self.fallback = LocalGraphProvider()
        use_live = settings.routing_provider == "osrm" and not settings.disable_network
        self.primary = OSRMProvider() if use_live else None

    def table(self, points):
        return _call(self.primary, self.fallback, "table", points, label="OSRM")

    def route(self, points):
        return _call(self.primary, self.fallback, "route", points, label="OSRM")

    def trip(self, points):
        return _call(self.primary, self.fallback, "trip", points, label="OSRM")


class CurrencyGateway:
    def __init__(self) -> None:
        settings = get_settings()
        self.fallback = StaticCurrencyProvider()
        use_live = settings.currency_provider == "frankfurter" and not settings.disable_network
        self.primary = FrankfurterProvider() if use_live else None

    def convert(self, amount, source, target):
        return _call(self.primary, self.fallback, "convert", amount, source, target, label="Frankfurter")


def _merge_landmarks(places: list[dict], landmarks: list[dict]) -> list[dict]:
    """Union of both lists. A landmark within 300 m of a place with a similar name is the same spot:
    the place keeps its id and gains the Wikipedia description and the higher rating."""
    from worldtour_ai.algorithms.graphs.geo import haversine_km

    def key(name: str) -> str:
        return "".join(ch for ch in name.lower() if ch.isalnum())

    merged = [dict(place) for place in places]
    for landmark in landmarks:
        twin = next(
            (
                place for place in merged
                if place.get("lat") is not None
                and haversine_km(place["lat"], place["lon"], landmark["lat"], landmark["lon"]) <= 0.3
                and (key(landmark["name"]) in key(place["name"]) or key(place["name"]) in key(landmark["name"]))
            ),
            None,
        )
        if twin:
            twin["address"] = landmark["address"] or twin.get("address")
            twin["rating"] = max(twin.get("rating") or 0, landmark["rating"])
            if twin.get("category") == "sightseeing":
                twin["category"] = landmark["category"]
        elif not any(key(landmark["name"]) == key(place["name"]) for place in merged):
            merged.append(dict(landmark))
    return merged
