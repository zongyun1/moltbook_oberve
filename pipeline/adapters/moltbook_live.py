"""Moltbook Live API observer adapter.

Fetches real-time data directly from the Moltbook API (moltbook.com/api/v1).
Requires a valid API key (moltbook_sk_...).
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

from pipeline.observer.base import BaseObserver

DEFAULT_BASE_URL = "https://www.moltbook.com/api/v1"


class MoltbookLiveObserver(BaseObserver):
    platform = "moltbook_live"

    @staticmethod
    def _load_dotenv():
        for env_file in [Path(".env"), Path(__file__).parents[2] / ".env"]:
            if env_file.exists():
                for line in env_file.read_text().splitlines():
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
                break

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        snapshot_dir: str | Path = "pipeline/snapshots",
    ):
        super().__init__(snapshot_dir)
        self.api_key = api_key or os.environ.get("MOLTBOOK_API_KEY", "")
        if not self.api_key:
            self._load_dotenv()
            self.api_key = os.environ.get("MOLTBOOK_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        if not self.api_key:
            raise ValueError("Moltbook API key required. Set MOLTBOOK_API_KEY or pass api_key=")

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.get(url, headers=self._headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Fetch posts with cursor pagination
    # ------------------------------------------------------------------

    def _fetch_posts(
        self,
        sort: str = "new",
        limit: int = 50,
        max_posts: int = 500,
        submolt: str | None = None,
    ) -> list[dict]:
        all_posts = []
        cursor = None

        while len(all_posts) < max_posts:
            params: dict = {"sort": sort, "limit": min(limit, max_posts - len(all_posts))}
            if cursor:
                params["cursor"] = cursor
            if submolt:
                params["submolt"] = submolt

            data = self._get("/posts", params)
            posts = data.get("posts", [])
            if not posts:
                break

            all_posts.extend(posts)
            cursor = data.get("next_cursor")
            if not data.get("has_more") or not cursor:
                break

        print(f"[moltbook_live] Fetched {len(all_posts)} posts")
        return all_posts

    # ------------------------------------------------------------------
    # Fetch comments for a post (including nested replies)
    # ------------------------------------------------------------------

    def _fetch_comments(self, post_id: str, sort: str = "new", limit: int = 50) -> list[dict]:
        """Fetch all comments for a post, flattening nested replies."""
        data = self._get(f"/posts/{post_id}/comments", {"sort": sort, "limit": limit})
        comments = data.get("comments", [])
        flat = []
        self._flatten_comments(comments, post_id, flat)
        return flat

    def _flatten_comments(self, comments: list[dict], post_id: str, out: list[dict]):
        """Recursively flatten nested comment replies into a flat list."""
        for c in comments:
            c["_post_id"] = post_id
            if "parent_id" not in c or c.get("parent_id") is None:
                if c.get("depth", 0) == 0:
                    c["parent_id"] = post_id
            out.append(c)
            replies = c.pop("replies", [])
            if replies:
                self._flatten_comments(replies, post_id, out)

    # ------------------------------------------------------------------
    # Fetch submolts
    # ------------------------------------------------------------------

    def _fetch_submolts(self, limit: int = 100) -> list[dict]:
        data = self._get("/submolts", {"limit": limit})
        return data.get("submolts", [])

    # ------------------------------------------------------------------
    # BaseObserver interface
    # ------------------------------------------------------------------

    def fetch_raw(
        self,
        max_posts: int = 500,
        fetch_comments: bool = True,
        sort: str = "new",
        submolt: str | None = None,
        **kwargs,
    ) -> dict:
        posts = self._fetch_posts(sort=sort, max_posts=max_posts, submolt=submolt)
        submolts = self._fetch_submolts()

        all_comments = []
        if fetch_comments:
            total = len(posts)
            for i, post in enumerate(posts):
                pid = post["id"]
                cc = post.get("comment_count", 0)
                if cc > 0:
                    comments = self._fetch_comments(pid, sort="top", limit=50)
                    all_comments.extend(comments)
                if (i + 1) % 50 == 0:
                    print(f"[moltbook_live] Comments: {i+1}/{total} posts scanned, {len(all_comments)} comments so far")
                time.sleep(0.1)

            print(f"[moltbook_live] Fetched {len(all_comments)} comments total")

        return {
            "posts": posts,
            "comments": all_comments,
            "submolts": submolts,
        }

    def normalize(self, raw: dict, snapshot_time: datetime) -> pd.DataFrame:
        now = datetime.now(timezone.utc)
        posts = raw["posts"]
        comments = raw["comments"]

        # -- Posts (thread roots) --
        post_rows = []
        for p in posts:
            author = p.get("author", {})
            submolt_obj = p.get("submolt", {})
            post_rows.append({
                "platform": "moltbook",
                "snapshot_time": snapshot_time,
                "observed_at": now,
                "thread_id": p["id"],
                "post_id": p["id"],
                "parent_id": None,
                "author_id": author.get("name") or p.get("author_id"),
                "timestamp": p.get("created_at"),
                "content": f"{p.get('title', '')}\n{p.get('content', '')}".strip(),
                "subcommunity": submolt_obj.get("name") if isinstance(submolt_obj, dict) else str(submolt_obj),
                "lang": None,
                "score": p.get("score", 0),
                "meta": {
                    "upvotes": p.get("upvotes"),
                    "downvotes": p.get("downvotes"),
                    "comment_count": p.get("comment_count"),
                    "is_pinned": p.get("is_pinned"),
                    "verification_status": p.get("verification_status"),
                    "author_karma": author.get("karma"),
                    "author_followers": author.get("followerCount"),
                },
            })

        # -- Comments --
        comment_rows = []
        for c in comments:
            author = c.get("author", {})
            comment_rows.append({
                "platform": "moltbook",
                "snapshot_time": snapshot_time,
                "observed_at": now,
                "thread_id": c.get("_post_id", c.get("post_id")),
                "post_id": c["id"],
                "parent_id": c.get("parent_id"),
                "author_id": author.get("name") or c.get("author_id"),
                "timestamp": c.get("created_at"),
                "content": c.get("content", ""),
                "subcommunity": None,
                "lang": None,
                "score": c.get("score", 0),
                "meta": {
                    "depth": c.get("depth"),
                    "reply_count": c.get("reply_count"),
                    "is_spam": c.get("is_spam"),
                    "verification_status": c.get("verification_status"),
                    "author_karma": author.get("karma"),
                },
            })

        all_rows = post_rows + comment_rows
        df = pd.DataFrame(all_rows)
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
        df["snapshot_time"] = pd.to_datetime(snapshot_time, utc=True)
        df["observed_at"] = pd.to_datetime(now, utc=True)

        return df.sort_values(["thread_id", "timestamp"]).reset_index(drop=True)
