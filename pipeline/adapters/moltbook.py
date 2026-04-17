"""Moltbook observer adapter.

Fetches data from SimulaMet/moltbook-observatory-archive on HuggingFace.
Each call to fetch_raw pulls posts + comments for a given dump_date,
or defaults to the latest available dump.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from pipeline.observer.base import BaseObserver


class MoltbookObserver(BaseObserver):
    platform = "moltbook"

    def __init__(self, snapshot_dir: str | Path = "pipeline/snapshots"):
        super().__init__(snapshot_dir)
        self._posts_cache = None
        self._comments_cache = None

    def _ensure_loaded(self):
        """Download the full HF dataset once and cache in memory."""
        if self._posts_cache is not None:
            return
        from datasets import load_dataset

        print("[moltbook] Loading posts from HuggingFace …")
        self._posts_cache = load_dataset(
            "SimulaMet/moltbook-observatory-archive", "posts", split="archive"
        ).to_pandas()

        print("[moltbook] Loading comments from HuggingFace …")
        self._comments_cache = load_dataset(
            "SimulaMet/moltbook-observatory-archive", "comments", split="archive"
        ).to_pandas()

    def fetch_raw(self, dump_date: str | None = None, **kwargs) -> dict:
        self._ensure_loaded()

        posts = self._posts_cache.copy()
        comments = self._comments_cache.copy()

        if dump_date is None:
            dump_date = posts["dump_date"].max()
            print(f"[moltbook] Using latest dump_date: {dump_date}")

        posts = posts[posts["dump_date"] == dump_date].drop_duplicates(subset="id")
        comments = comments[comments["dump_date"] == dump_date].drop_duplicates(subset="id")

        return {
            "posts": posts,
            "comments": comments,
            "dump_date": dump_date,
        }

    def normalize(self, raw: dict, snapshot_time: datetime) -> pd.DataFrame:
        posts: pd.DataFrame = raw["posts"]
        comments: pd.DataFrame = raw["comments"]
        now = datetime.now(timezone.utc)

        # -- Posts (thread roots) --
        p = pd.DataFrame({
            "platform": "moltbook",
            "snapshot_time": snapshot_time,
            "observed_at": now,
            "thread_id": posts["id"],
            "post_id": posts["id"],
            "parent_id": pd.NA,
            "author_id": posts["agent_name"],
            "timestamp": pd.to_datetime(posts["created_at"], errors="coerce", utc=True),
            "content": posts["title"].fillna("") + "\n" + posts["content"].fillna(""),
            "subcommunity": posts["submolt"],
            "lang": pd.NA,
            "score": posts["score"],
            "meta": posts.apply(
                lambda r: {"comment_count": r.get("comment_count"), "url": r.get("url")},
                axis=1,
            ),
        })

        # -- Comments (thread children) --
        # parent_id is None when the comment is a direct reply to the post
        c = pd.DataFrame({
            "platform": "moltbook",
            "snapshot_time": snapshot_time,
            "observed_at": now,
            "thread_id": comments["post_id"],
            "post_id": comments["id"],
            "parent_id": comments["parent_id"].where(
                comments["parent_id"].notna(), comments["post_id"]
            ),
            "author_id": comments["agent_name"],
            "timestamp": pd.to_datetime(comments["created_at"], errors="coerce", utc=True),
            "content": comments["content"].fillna(""),
            "subcommunity": pd.NA,
            "lang": pd.NA,
            "score": comments["score"],
            "meta": None,
        })

        df = pd.concat([p, c], ignore_index=True)
        return df.sort_values(["thread_id", "timestamp"]).reset_index(drop=True)
