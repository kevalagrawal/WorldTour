"""FastAPI app: the same chat, workflow and plan as the terminal, over HTTP.

Endpoints
    GET  /api/health        status and whether an access code is required
    POST /api/chat          one chat message -> next question, or ready to plan
    POST /api/plan          run the workflow; streams NDJSON progress events, then the plan
    POST /api/export/text   the plan as plain text
    POST /api/export/ics    the timetable as a calendar file

Protection (all optional, set as environment variables)
    ACCESS_CODE             visitors must send this in the X-Access-Code header
    ALLOWED_ORIGINS         comma-separated frontend URLs allowed by CORS (default *)
    UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
                            enable a per-visitor daily limit on plans (PLANS_PER_DAY, default 10)
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from datetime import date

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel

from worldtour_ai.services.chat_session import chat_step
from worldtour_ai.services.exporter import file_stem, plan_calendar, plan_text
from worldtour_ai.workflows.state import fresh_state
from worldtour_ai.workflows.travel_graph import build_workflow

app = FastAPI(title="WorldTour API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Access-Code"],
)
_WORKFLOW = None
logger = logging.getLogger("worldtour.web")


def _workflow():
    global _WORKFLOW
    if _WORKFLOW is None:
        _WORKFLOW = build_workflow()
    return _WORKFLOW


class ChatBody(BaseModel):
    session: dict | None = None
    message: str


class PlanBody(BaseModel):
    session: dict


class ExportBody(BaseModel):
    plan: dict


def _check_access(request: Request) -> None:
    code = os.environ.get("ACCESS_CODE")
    if code and not hmac.compare_digest(request.headers.get("X-Access-Code", ""), code):
        raise HTTPException(status_code=401, detail="This planner needs an access code.")


def _over_daily_limit(request: Request) -> bool:
    """Per-visitor daily plan limit via Upstash Redis REST. Off unless configured."""
    url, token = os.environ.get("UPSTASH_REDIS_REST_URL"), os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        return False
    visitor = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")).split(",")[0].strip()
    key = f"worldtour:plans:{visitor}:{date.today().isoformat()}"
    try:
        response = httpx.post(
            f"{url.rstrip('/')}/pipeline",
            headers={"Authorization": f"Bearer {token}"},
            json=[["INCR", key], ["EXPIRE", key, 86400]],
            timeout=5,
        )
        count = int(response.json()[0]["result"])
    except Exception:
        return False  # never block planning because the limiter is down
    return count > int(os.environ.get("PLANS_PER_DAY", "10"))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "access_code_required": bool(os.environ.get("ACCESS_CODE"))}


@app.post("/api/chat")
def chat(body: ChatBody, request: Request) -> dict:
    _check_access(request)
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Please type a message.")
    try:
        return chat_step(body.session, body.message[:2000])
    except Exception as exc:
        logger.exception("chat step failed")
        raise HTTPException(status_code=500, detail="Sorry, I couldn't process that message. Please try rephrasing it.") from exc


@app.post("/api/plan")
def plan(body: PlanBody, request: Request) -> StreamingResponse:
    _check_access(request)
    session = dict(body.session)
    trip = session.get("request")
    if session.get("stage") != "ready" or not trip:
        raise HTTPException(status_code=400, detail="The chat has not collected a complete trip yet.")
    if _over_daily_limit(request):
        raise HTTPException(status_code=429, detail="Daily plan limit reached for this visitor. Please try again tomorrow.")
    history = session.get("history") or []
    first = next((m["content"] for m in history if m.get("role") == "user"), "trip")

    def stream():
        seen, final = 0, None
        try:
            state = fresh_state(first, history, trip, ready=True)
            for snapshot in _workflow().stream(state, stream_mode="values"):
                final = snapshot
                events = snapshot.get("agent_execution_history") or []
                for event in events[seen:]:
                    yield json.dumps({"type": "event", "event": event}) + "\n"
                seen = len(events)
            plan_data = (final or {}).get("final_plan")
            if not plan_data:
                yield json.dumps({"type": "error", "message": "The planner finished without a plan."}) + "\n"
                return
            done = {**session, "stage": "planned"}
            yield json.dumps({"type": "plan", "plan": plan_data, "session": done}, default=str) + "\n"
        except Exception as exc:  # report, don't hang the browser
            yield json.dumps({"type": "error", "message": f"Planning failed: {exc}"}) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})


@app.post("/api/export/text")
def export_text(body: ExportBody) -> PlainTextResponse:
    return PlainTextResponse(
        plan_text(body.plan),
        headers={"Content-Disposition": f'attachment; filename="{file_stem(body.plan)}.txt"'},
    )


@app.post("/api/export/ics")
def export_ics(body: ExportBody) -> Response:
    calendar = plan_calendar(body.plan)
    if not calendar:
        raise HTTPException(status_code=400, detail="Add travel dates to get a calendar file.")
    return Response(
        calendar,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{file_stem(body.plan)}.ics"'},
    )
