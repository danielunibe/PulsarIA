"""TikTok activity source scanner.

The scanner only discovers canonical video entries. It never downloads media
and never writes user credentials. Acquisition continues to be delegated to
the approved yt-dlp runtime through downloader.py.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Iterable
from urllib.parse import urlsplit

from downloader import extract_playlist_entries
from profile_metadata import resolve_profile_metadata


ACTIVITY_SUFFIXES = {
    "posts": "",
    "likes": "/liked",
    "saved": "/saved",
    "reposts": "/reposts",
}


def profile_identity(profile_url: str) -> dict[str, Any]:
    try:
        meta = resolve_profile_metadata(profile_url)
        username = meta.get("username")
        formatted_username = f"@{username}" if username and not username.startswith("@") else username
        return {
            "profile_url": meta.get("canonical_url") or profile_url,
            "username": formatted_username,
            "display_name": meta.get("display_name"),
            "avatar_url": meta.get("avatar_url"),
            "cover_url": meta.get("cover_url"),
            "verified": meta.get("verified"),
            "following_count": meta.get("following_count"),
            "followers_count": meta.get("followers_count"),
            "likes_count": meta.get("likes_count"),
            "posts_count": meta.get("posts_count"),
            "signature": meta.get("signature"),
            "private_account": meta.get("private_account"),
        }
    except Exception:
        path = urlsplit(profile_url).path.rstrip("/")
        match = re.search(r"/@([A-Za-z0-9._]{1,24})", path)
        username = f"@{match.group(1)}" if match else None
        return {
            "profile_url": profile_url,
            "username": username,
            "display_name": None,
            "avatar_url": None,
            "cover_url": None,
            "verified": None,
            "following_count": None,
            "followers_count": None,
            "likes_count": None,
            "posts_count": None,
            "signature": None,
            "private_account": None,
        }


def classify_category_error(category: str, error: str) -> dict[str, Any]:
    """Diagnose runtime capability without failing silently or showing false zeros."""
    normalized = error.lower()
    
    if any(tok in normalized for tok in ("429", "rate limit", "too many requests", "captcha")):
        return {
            "status": "rate_limited",
            "auth_required": False,
            "reason": "TikTok limitó temporalmente las consultas para esta categoría (reintentando con espera)",
        }

    if any(
        tok in normalized
        for tok in (
            "login",
            "log in",
            "sign in",
            "cookie",
            "authentication",
            "unauthorized",
            "forbidden",
            "401",
            "403",
            "foryou",
        )
    ):
        return {
            "status": "requires_session",
            "auth_required": True,
            "reason": "Esta categoría requiere una sesión autenticada con cookies locales en TikTok",
        }

    if "private" in normalized:
        return {
            "status": "private",
            "auth_required": True,
            "reason": "Esta categoría está marcada como privada en TikTok",
        }

    # If reposts/saved/likes fail with unsupported URL or general error without cookies,
    # treat as requires_session or unsupported per product rule
    if category in ("saved", "likes"):
        return {
            "status": "requires_session",
            "auth_required": True,
            "reason": "Esta categoría requiere una sesión de usuario activa en el navegador",
        }

    if category == "reposts":
        return {
            "status": "unsupported",
            "auth_required": False,
            "reason": "Los reposts no están disponibles públicamente sin sesión autorizada",
        }

    return {
        "status": "error",
        "auth_required": False,
        "reason": error.strip() or "TikTok no devolvió una respuesta utilizable",
    }


def _date_value(entry: dict) -> str | None:
    upload_date = entry.get("upload_date")
    if isinstance(upload_date, str) and re.fullmatch(r"\d{8}", upload_date):
        return upload_date
    timestamp = entry.get("timestamp")
    if isinstance(timestamp, (int, float)) and timestamp > 0:
        return datetime.utcfromtimestamp(timestamp).strftime("%Y%m%d")
    return None


def _filter_from_date(entries: Iterable[dict], history_from: str | None) -> list[dict]:
    if not history_from:
        return list(entries)
    try:
        threshold = datetime.strptime(history_from, "%Y-%m-%d").strftime("%Y%m%d")
    except ValueError as error:
        raise ValueError("history_from debe usar el formato YYYY-MM-DD") from error

    filtered = []
    for entry in entries:
        entry_date = _date_value(entry)
        if entry_date is None or entry_date >= threshold:
            filtered.append(entry)
    return filtered


def _dedupe_video_entries(entries: Iterable[dict]) -> list[dict]:
    """Keep only concrete TikTok video URLs and collapse tracking variants."""
    result: list[dict] = []
    seen: set[str] = set()
    for entry in entries:
        candidate = entry.get("url") if isinstance(entry, dict) else None
        if not isinstance(candidate, str) or not candidate.startswith("https://"):
            continue
        parsed = urlsplit(candidate)
        host = parsed.hostname.lower() if parsed.hostname else ""
        if host == "tiktok.com":
            host = "www.tiktok.com"
        path = parsed.path.rstrip("/")
        if not (host == "tiktok.com" or host.endswith(".tiktok.com")):
            continue
        if "/video/" not in path.lower():
            continue
        canonical = f"https://{host}{path}"
        if canonical in seen:
            continue
        seen.add(canonical)
        result.append({**entry, "url": canonical})
    return result


def scan_tiktok_source(
    profile_url: str,
    categories: Iterable[str],
    limit: int | None = None,
    history_from: str | None = None,
) -> dict:
    """Inspect each requested activity category and return structured data."""
    requested = [category for category in categories if category in ACTIVITY_SUFFIXES]
    if not requested:
        requested = list(ACTIVITY_SUFFIXES)

    fetch_limit = max(1, min(1000, limit or 200))
    result = {
        "profile": profile_identity(profile_url),
        "categories": {},
    }

    for category in requested:
        source_url = f"{profile_url.rstrip('/')}{ACTIVITY_SUFFIXES[category]}"
        try:
            raw_entries = extract_playlist_entries(source_url, fetch_limit)
            entries = _filter_from_date(_dedupe_video_entries(raw_entries), history_from)
            result["categories"][category] = {
                "available": True,
                "status": "available",
                "reason": None,
                "auth_required": False,
                "truncated": len(raw_entries) >= fetch_limit,
                "items": entries[:fetch_limit],
            }
        except Exception as error:
            diagnosis = classify_category_error(category, str(error))
            result["categories"][category] = {
                "available": False,
                "status": diagnosis["status"],
                "reason": diagnosis["reason"],
                "auth_required": diagnosis["auth_required"],
                "truncated": False,
                "items": [],
            }

    return result
