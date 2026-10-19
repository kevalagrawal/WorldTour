"""Stateless, one-message-at-a-time version of the chat for the web API.

The browser keeps the session dict and sends it back with every message, so no server
memory is needed between requests (which suits serverless hosting). Stages:

    collecting  -> asking for missing trip details
    feasibility -> the trip doesn't add up; waiting for yes / a change / continue
    ready       -> the request is complete; the client should run the plan
    planned     -> a plan exists; new messages are treated as changes to it
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from worldtour_ai.config.settings import get_settings
from worldtour_ai.schemas.models import TravelRequest
from worldtour_ai.services.intake import (
    MAX_ROUNDS,
    _OPTIONAL,
    accept_remaining,
    apply_feasibility_answer,
    apply_refinement,
    blocking_issues,
    feasibility_message,
    finalize_collected,
    intake_missing,
    merge_grounded,
    trim_suggested_cities,
)
from worldtour_ai.services.request_parser import (
    clarification_message,
    grounded_llm_fields,
    parse_travel_text,
    user_skipped,
)
from worldtour_ai.utils.money import display_currency


def new_session() -> dict:
    return {"stage": "collecting", "request": None, "pending": [], "skipped": [], "round": 0, "history": []}


def chat_step(session: dict | None, message: str, use_llm: bool = True) -> dict:
    """Advance the conversation by one user message. Returns {session, reply, ready, changes}."""
    session = dict(session or new_session())
    text = (message or "").strip()
    history = list(session.get("history") or [])
    history.append({"role": "user", "content": text})
    stage = session.get("stage") or "collecting"
    changes: list[str] = []

    if stage == "planned":
        updated, changes = apply_refinement(session["request"], text)
        if not changes:
            return _reply(session, history, "I didn't catch a change there. Try 'premium', 'by train', '5 days', "
                          "'budget 50000 INR', 'remove <place>' or 'more relaxed'.")
        session["request"] = updated
        return _check_feasibility(session, history, changes, round_number=0)

    if stage == "feasibility":
        issues = blocking_issues(session["request"])
        data, understood = apply_feasibility_answer(session["request"], issues, text)
        if not understood:
            return _reply(session, history, "Sorry, I didn't understand. Reply 'yes', tell me what to change "
                          "(for example '6 days' or 'budget 80000 INR'), or say 'continue'.")
        session["request"] = data
        return _check_feasibility(session, history, changes, round_number=int(session.get("feasibility_round") or 0) + 1)

    # Collecting the trip details.
    if session.get("request") is None:
        request = parse_travel_text(text or "trip", use_llm=False)
        data = request.model_dump()
        if use_llm:
            merge_grounded(data, _llm_fields_within_limit(text))
        request = TravelRequest.model_validate(data)
    elif user_skipped(text):
        session["skipped"] = [*session.get("skipped", []), *(f for f in session.get("pending", []) if f not in _OPTIONAL)]
        request = TravelRequest.model_validate(session["request"])
    else:
        request = parse_travel_text(text, pending_fields=session.get("pending") or [], previous=session["request"], use_llm=False)
    round_number = int(session.get("round") or 0)
    missing = [field for field in intake_missing(request, round_number == 0) if field not in session.get("skipped", [])]
    if missing and round_number < MAX_ROUNDS:
        session.update(request=request.model_dump(), pending=missing, round=round_number + 1)
        return _reply(session, history, clarification_message(missing))
    data = finalize_collected(request, session.get("skipped", []), None)
    trim_suggested_cities(data)
    session.update(request=data, pending=[])
    return _check_feasibility(session, history, changes, round_number=0)


def _llm_fields_within_limit(text: str) -> dict | None:
    """The AI reading of the first message, but never longer than PARSER_LLM_WAIT_SECONDS.

    The heuristic parse already has the essentials, so a slow free model must not
    keep the user waiting for the first reply.
    """
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(grounded_llm_fields, text)
    try:
        return future.result(timeout=get_settings().parser_llm_wait_seconds)
    except Exception:
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _check_feasibility(session: dict, history: list[dict], changes: list[str], round_number: int) -> dict:
    issues = blocking_issues(session["request"])
    if issues and round_number < MAX_ROUNDS:
        session.update(stage="feasibility", feasibility_round=round_number)
        return _reply(session, history, feasibility_message(issues), changes=changes)
    if issues:
        session["request"] = accept_remaining(session["request"])
    session.update(stage="ready", feasibility_round=0)
    lead = ("Updating the plan: " + "; ".join(changes) + ".") if changes else "Great, I have everything I need."
    return _reply(session, history, lead + " Planning your trip now…", ready=True, changes=changes)


def _reply(session: dict, history: list[dict], text: str, ready: bool = False, changes: list[str] | None = None) -> dict:
    history.append({"role": "assistant", "content": text})
    session["history"] = history[-40:]
    request = session.get("request")
    return {
        "session": session,
        "reply": text,
        "ready": ready,
        "changes": changes or [],
        "summary": summary(request) if request else None,
    }


def summary(request: dict) -> dict:
    """What the chat has understood so far, for the summary card in the UI."""
    return {
        "origin": request.get("origin"),
        "destination": request.get("destination"),
        "cities": request.get("cities") or [],
        "cities_are_suggestions": request.get("cities_are_suggestions", False),
        "start_date": request.get("start_date"),
        "end_date": request.get("end_date"),
        "duration_days": request.get("duration_days"),
        "budget": request.get("budget"),
        "currency": request.get("currency"),
        "budget_scope": request.get("budget_scope"),
        "travelers": request.get("travelers"),
        "pace": request.get("pace"),
        "preferences": request.get("preferences") or [],
        "transport_preferences": request.get("transport_preferences") or [],
        "display_currency": display_currency(request),
        "notes": request.get("parser_notes") or [],
    }
