"""Canonical normalized schema shared across all pipeline layers.

Every platform adapter must produce records conforming to this schema.
The schema is the single source of truth for column names and types.
"""

import pandas as pd

COLUMNS = [
    "platform",       # str   — source platform identifier
    "snapshot_time",   # datetime — when this snapshot was taken
    "observed_at",     # datetime — when this record was first/last observed
    "thread_id",       # str   — root post id (groups a conversation)
    "post_id",         # str   — unique id of this post or comment
    "parent_id",       # str   — id of the parent post/comment (None for roots)
    "author_id",       # str   — author identifier
    "timestamp",       # datetime — when the post was created on-platform
    "content",         # str   — text body
    "subcommunity",    # str   — submolt, subreddit, etc.
    "lang",            # str   — detected language (ISO 639-1)
    "score",           # int   — upvotes, karma, etc.
    "meta",            # dict  — platform-specific extras (JSON-serializable)
]

DTYPES = {
    "platform": "string",
    "thread_id": "string",
    "post_id": "string",
    "parent_id": "string",
    "author_id": "string",
    "content": "string",
    "subcommunity": "string",
    "lang": "string",
    "score": "Int64",
}

DATETIME_COLS = ["snapshot_time", "observed_at", "timestamp"]


def empty_frame() -> pd.DataFrame:
    """Return an empty DataFrame with the canonical schema."""
    df = pd.DataFrame(columns=COLUMNS)
    for col, dtype in DTYPES.items():
        df[col] = df[col].astype(dtype)
    for col in DATETIME_COLS:
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


def validate(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and coerce a DataFrame to the canonical schema.

    Raises ValueError on missing required columns.
    """
    missing = set(COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = df[COLUMNS].copy()

    for col, dtype in DTYPES.items():
        df[col] = df[col].astype(dtype)
    for col in DATETIME_COLS:
        df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")

    return df
