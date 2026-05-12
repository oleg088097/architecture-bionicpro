"""
Reports export API: validates the browser session via bionicpro-auth, reads pre-aggregated
rows from ClickHouse, and returns a CSV download. Session cookies returned by /user
(for example after rotation) are forwarded on every response so the client stays in sync.
"""

import ast
import csv
import io
import json
import os
from datetime import date, datetime
from typing import Annotated, Any, Optional

import clickhouse_connect
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.datastructures import MutableHeaders

app = FastAPI(title="reports-api")

# Browser reads Content-Disposition when saving the file; must be exposed for cross-origin fetch.
_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


def _auth_base_url() -> str:
    return os.getenv("BIONICPRO_AUTH_URL", "http://127.0.0.1:4000").rstrip("/")


def _clickhouse_client():
    host = os.getenv("CLICKHOUSE_HOST", "127.0.0.1")
    port = int(os.getenv("CLICKHOUSE_HTTP_PORT", "8123"))
    database = os.getenv(
        "CLICKHOUSE_DATABASE",
        "default",
    )
    username = os.getenv("CLICKHOUSE_USER", "default")
    password = os.getenv("CLICKHOUSE_PASSWORD", "")
    return clickhouse_connect.get_client(
        host=host,
        port=port,
        database=database,
        username=username,
        password=password,
    )


def _parse_report_date(raw: str) -> date:
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as e:
        raise ValueError("date must be YYYY-MM-DD") from e


def _format_ts(value) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat(sep=" ")
    return str(value)


def _extract_auth_set_cookie_values(auth_resp: httpx.Response) -> list[str]:
    # Auth may emit several Set-Cookie lines; multi_items preserves duplicates unlike Mapping.get.
    return [
        value
        for key, value in auth_resp.headers.multi_items()
        if key.lower() == "set-cookie"
    ]


def _json_with_auth_cookies(
    *,
    detail: str,
    status_code: int,
    auth_cookies: list[str],
) -> JSONResponse:
    # dict-based headers cannot repeat keys; MutableHeaders supports multiple Set-Cookie.
    headers = MutableHeaders()
    for cookie in auth_cookies:
        headers.append("set-cookie", cookie)
    return JSONResponse(
        content={"detail": detail},
        status_code=status_code,
        headers=headers,
    )


# Body columns for the CSV section below the JSON title line (matches telemetry tuple order in OLAP).
_REPORT_HEADER = [
    "user_id",
    "prosthesis_type",
    "muscle_group",
    "signal_frequency",
    "signal_duration",
    "signal_amplitude",
    "signal_time",
]


def _parse_signal_rows(report_text: str) -> list[list[Any]]:
    # Stored value is usually JSON; Airflow may sometimes persist a Python repr—try both.
    raw = report_text.strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("report column is not valid JSON") from e

    if not isinstance(payload, list):
        raise ValueError("report payload must be a list")

    rows: list[list[Any]] = []
    for entry in payload:
        if not isinstance(entry, (list, tuple)):
            raise ValueError("each report row must be a list")
        if len(entry) != 6:
            raise ValueError("each report row must have 6 signal fields")
        rows.append(list(entry))
    return rows


def _build_report_csv(
    user_id: Any,
    email: str,
    report_text: str,
    from_dt: Any,
    to_dt: Any,
) -> str:
    # Format: TITLE (JSON metadata) + blank line + HEADER + data rows with user_id prefix.
    signal_rows = _parse_signal_rows(report_text)

    title = {
        "user_id": user_id,
        "email": email,
        "from_date": _format_ts(from_dt),
        "to_date": _format_ts(to_dt),
    }

    buf = io.StringIO()
    buf.write(json.dumps(title, ensure_ascii=False))
    buf.write("\n\n")

    writer = csv.writer(buf)
    writer.writerow(_REPORT_HEADER)
    for sig in signal_rows:
        writer.writerow([user_id, *sig])

    return buf.getvalue()


@app.get("/reports")
async def get_report(
    request: Request,
    date: Annotated[Optional[str], Query(alias="date")] = None,
):
    # Delegate identity to bionicpro-auth; never handle IdP tokens on this service.
    cookie_header = request.headers.get("cookie")
    auth_url = f"{_auth_base_url()}/user"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            auth_resp = await client.get(
                auth_url,
                headers={"Cookie": cookie_header or ""},
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=400,
                detail="failed to reach auth service",
            ) from None

    if auth_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="invalid or missing session")

    # Forward any new session cookies (e.g. rotation) on our response; browser applies them with credentials: include.
    auth_cookies = _extract_auth_set_cookie_values(auth_resp)

    try:
        user = auth_resp.json()
    except ValueError:
        return _json_with_auth_cookies(
            detail="invalid user payload",
            status_code=400,
            auth_cookies=auth_cookies,
        )

    email = user.get("email")
    if not email:
        return _json_with_auth_cookies(
            detail="email missing in user profile",
            status_code=400,
            auth_cookies=auth_cookies,
        )

    parsed_date: Optional[date] = None
    if date is not None:
        try:
            parsed_date = _parse_report_date(date)
        except ValueError:
            return _json_with_auth_cookies(
                detail="date must be YYYY-MM-DD",
                status_code=400,
                auth_cookies=auth_cookies,
            )

    ch = _clickhouse_client()

    # Optional filter by calendar day of from_date; otherwise latest snapshot for this email.
    if parsed_date is not None:
        q = """
            SELECT user_id, email, report, from_date, to_date
            FROM reports
            WHERE email = {email:String}
              AND toDate(from_date) = {report_date:Date}
            ORDER BY to_date DESC
            LIMIT 1
            """
        params = {"email": email, "report_date": parsed_date}
    else:
        q = """
            SELECT user_id, email, report, from_date, to_date
            FROM reports
            WHERE email = {email:String}
            ORDER BY from_date DESC, to_date DESC
            LIMIT 1
            """
        params = {"email": email}

    try:
        result = ch.query(q, parameters=params)
    except Exception:
        return _json_with_auth_cookies(
            detail="reports data source unavailable",
            status_code=503,
            auth_cookies=auth_cookies,
        )

    if not result.result_rows:
        return _json_with_auth_cookies(
            detail="report not found",
            status_code=404,
            auth_cookies=auth_cookies,
        )

    _user_id, row_email, report_text, from_dt, to_dt = result.result_rows[0]

    if hasattr(from_dt, "strftime"):
        date_slug = from_dt.strftime("%Y-%m-%d")
    else:
        date_slug = str(from_dt)[:10]

    try:
        csv_body = _build_report_csv(
            _user_id,
            row_email,
            report_text,
            from_dt,
            to_dt,
        )
    except ValueError as e:
        return _json_with_auth_cookies(
            detail=str(e),
            status_code=503,
            auth_cookies=auth_cookies,
        )

    csv_bytes = csv_body.encode("utf-8")
    filename = f"report-{date_slug}.csv"

    # Attachment response: same Set-Cookie forwarding rules as JSON errors above.
    headers = MutableHeaders()
    headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    for cookie in auth_cookies:
        headers.append("set-cookie", cookie)

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


@app.get("/health")
def health():
    return {"status": "ok"}
