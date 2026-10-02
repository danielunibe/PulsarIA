"""TikTok profile metadata resolver.

Extracts real profile metadata (display name, avatar, verified state,
following, followers, likes, bio) using local requests without requiring
browser automation or cloud services.

CRITICAL INVARIANT:
Unknown values MUST remain None (null).
Confirmed zero is 0.
Never fabricate or estimate metrics.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlsplit

from process_utils import hidden_process_kwargs


def extract_username(handle_or_url: str) -> str | None:
    """Normalize input handle or URL into a clean username (without @)."""
    raw = (handle_or_url or "").strip()
    if not raw:
        return None
    if raw.startswith("@"):
        username = raw.lstrip("@").split("/")[0].split("?")[0].split("#")[0]
        return username if re.fullmatch(r"[A-Za-z0-9._]{1,24}", username) else None

    if "tiktok.com" in raw.lower():
        path = urlsplit(raw).path.rstrip("/")
        match = re.search(r"/@([A-Za-z0-9._]{1,24})", path)
        if match:
            return match.group(1)

    # Raw alphanumeric handle without @
    if re.fullmatch(r"[A-Za-z0-9._]{1,24}", raw):
        return raw

    return None


def resolve_profile_metadata(handle_or_url: str, timeout: int = 15) -> dict[str, Any]:
    """Resolve canonical profile identity and metrics from TikTok.
    
    Returns structured dictionary with nullable fields.
    """
    username = extract_username(handle_or_url)
    if not username:
        return {
            "error": "Nombre de usuario o URL de TikTok no válida",
            "username": None,
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

    canonical_url = f"https://www.tiktok.com/@{username}"
    embed_url = f"https://www.tiktok.com/embed/@{username}"

    # Primary method: Official TikTok Embed hydration state via curl_cffi
    try:
        from curl_cffi import requests

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/130.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.tiktok.com/",
        }

        response = requests.get(embed_url, headers=headers, impersonate="chrome", timeout=timeout)
        if response.status_code == 200 and response.text:
            match = re.search(
                r'<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>(.*?)</script>',
                response.text,
            )
            if match:
                state = json.loads(match.group(1))
                source_data = state.get("source", {}).get("data", {})
                route_key = f"/embed/@{username}"
                user_info = None

                if route_key in source_data:
                    user_info = source_data[route_key].get("userInfo")
                else:
                    for key, val in source_data.items():
                        if isinstance(val, dict) and "userInfo" in val:
                            user_info = val["userInfo"]
                            break

                if isinstance(user_info, dict):
                    # Check if account was not found
                    code = user_info.get("code")
                    if code == 404:
                        return {
                            "error": "Perfil de TikTok no encontrado (404)",
                            "username": username,
                            "canonical_url": canonical_url,
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

                    following = user_info.get("followingCount")
                    followers = user_info.get("followerCount")
                    likes = user_info.get("heartCount")
                    posts = user_info.get("videoCount")

                    return {
                        "error": None,
                        "username": user_info.get("uniqueId") or username,
                        "canonical_url": canonical_url,
                        "display_name": user_info.get("nickname") or None,
                        "avatar_url": user_info.get("avatarThumbUrl") or user_info.get("avatarMediumUrl") or None,
                        "cover_url": None,
                        "verified": bool(user_info.get("verified")) if user_info.get("verified") is not None else None,
                        "following_count": int(following) if isinstance(following, (int, float)) else None,
                        "followers_count": int(followers) if isinstance(followers, (int, float)) else None,
                        "likes_count": int(likes) if isinstance(likes, (int, float)) else None,
                        "posts_count": int(posts) if isinstance(posts, (int, float)) else None,
                        "signature": user_info.get("signature") or None,
                        "private_account": bool(user_info.get("privateAccount")) if user_info.get("privateAccount") is not None else None,
                    }
    except Exception as exc:
        # Fallback to standard yt-dlp metadata if embed fetch fails
        pass

    # Fallback method: yt-dlp metadata extraction
    try:
        from downloader import build_yt_dlp_base_cmd
        import subprocess

        cmd = build_yt_dlp_base_cmd() + [
            "--quiet",
            "--no-warnings",
            "--flat-playlist",
            "--playlist-end", "1",
            "--dump-single-json",
            canonical_url,
        ]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            **hidden_process_kwargs(),
        )
        if res.returncode == 0 and res.stdout.strip():
            info = json.loads(res.stdout)
            channel = info.get("channel") or info.get("uploader") or None
            entries = info.get("entries") or []
            first_entry = entries[0] if entries and isinstance(entries[0], dict) else {}
            display_name = channel or first_entry.get("channel") or first_entry.get("uploader")

            return {
                "error": None,
                "username": username,
                "canonical_url": canonical_url,
                "display_name": str(display_name) if display_name else None,
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
    except Exception:
        pass

    return {
        "error": "No se pudieron resolver los metadatos del perfil",
        "username": username,
        "canonical_url": canonical_url,
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
