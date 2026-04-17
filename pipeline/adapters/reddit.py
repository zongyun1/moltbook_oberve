"""Reddit observer adapter.

Fetches data from ConvoKit subreddit corpora.
Designed as a drop-in comparison platform for benchmarking.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from pipeline.observer.base import BaseObserver


class RedditObserver(BaseObserver):
    platform = "reddit"

    def __init__(self, snapshot_dir: str | Path = "pipeline/snapshots"):
        super().__init__(snapshot_dir)

    def fetch_raw(
        self,
        subreddit: str = "changemyview",
        max_convos: int | None = None,
        **kwargs,
    ) -> dict:
        from convokit import Corpus, download

        corpus_name = f"subreddit-{subreddit}"
        print(f"[reddit] Loading ConvoKit corpus '{corpus_name}' …")
        corpus = Corpus(filename=download(corpus_name))

        rows = []
        convos = list(corpus.iter_conversations())
        if max_convos:
            convos = convos[:max_convos]

        for convo in convos:
            for utt in convo.iter_utterances():
                rows.append({
                    "thread_id": convo.id,
                    "post_id": utt.id,
                    "parent_id": utt.reply_to if utt.reply_to else None,
                    "author_id": utt.speaker.id,
                    "timestamp": utt.timestamp,
                    "content": utt.text or "",
                    "subreddit": subreddit,
                    "score": utt.meta.get("score", None),
                })

        return {"utterances": rows, "subreddit": subreddit}

    def normalize(self, raw: dict, snapshot_time: datetime) -> pd.DataFrame:
        rows = raw["utterances"]
        subreddit = raw["subreddit"]
        now = datetime.now(timezone.utc)

        df = pd.DataFrame(rows)
        out = pd.DataFrame({
            "platform": "reddit",
            "snapshot_time": snapshot_time,
            "observed_at": now,
            "thread_id": df["thread_id"],
            "post_id": df["post_id"],
            "parent_id": df["parent_id"],
            "author_id": df["author_id"],
            "timestamp": pd.to_datetime(df["timestamp"], unit="s", errors="coerce", utc=True),
            "content": df["content"],
            "subcommunity": subreddit,
            "lang": pd.NA,
            "score": df["score"],
            "meta": None,
        })

        return out.sort_values(["thread_id", "timestamp"]).reset_index(drop=True)
