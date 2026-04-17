"""Download and normalize Moltbook + Reddit datasets into a shared schema.

Shared schema columns:
    thread_id, post_id, parent_id, author, timestamp, content, is_agent

Moltbook source: SimulaMet/moltbook-observatory-archive (Hugging Face)
Reddit source:   ConvoKit subreddit corpus
"""

import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


# ---------------------------------------------------------------------------
# Moltbook loader
# ---------------------------------------------------------------------------

def download_moltbook(dump_date: str | None = None) -> pd.DataFrame:
    """Load Moltbook posts + comments from HuggingFace and normalize.

    Args:
        dump_date: Optional filter to a single snapshot (e.g. "2026-02-15").
                   Uses the latest dump by default.
    """
    from datasets import load_dataset

    print("Downloading Moltbook posts …")
    posts_ds = load_dataset(
        "SimulaMet/moltbook-observatory-archive", "posts", split="archive"
    )
    print("Downloading Moltbook comments …")
    comments_ds = load_dataset(
        "SimulaMet/moltbook-observatory-archive", "comments", split="archive"
    )

    posts = posts_ds.to_pandas()
    comments = comments_ds.to_pandas()

    if dump_date:
        posts = posts[posts["dump_date"] == dump_date]
        comments = comments[comments["dump_date"] == dump_date]
    else:
        latest = posts["dump_date"].max()
        print(f"Using latest dump: {latest}")
        posts = posts[posts["dump_date"] == latest]
        comments = comments[comments["dump_date"] == latest]

    posts = posts.drop_duplicates(subset="id")
    comments = comments.drop_duplicates(subset="id")

    # Normalize posts (root of each thread)
    p = pd.DataFrame({
        "thread_id": posts["id"],
        "post_id": posts["id"],
        "parent_id": pd.NA,
        "author": posts["agent_name"],
        "timestamp": pd.to_datetime(posts["created_at"], errors="coerce"),
        "content": posts["title"].fillna("") + "\n" + posts["content"].fillna(""),
        "is_agent": True,
        "source": "moltbook",
        "submolt": posts["submolt"],
    })

    # Normalize comments (children in thread)
    c = pd.DataFrame({
        "thread_id": comments["post_id"],
        "post_id": comments["id"],
        "parent_id": comments["parent_id"].where(
            comments["parent_id"].notna(), comments["post_id"]
        ),
        "author": comments["agent_name"],
        "timestamp": pd.to_datetime(comments["created_at"], errors="coerce"),
        "content": comments["content"].fillna(""),
        "is_agent": True,
        "source": "moltbook",
        "submolt": pd.NA,
    })

    df = pd.concat([p, c], ignore_index=True)
    df = df.sort_values(["thread_id", "timestamp"]).reset_index(drop=True)

    out = DATA_DIR / "moltbook.parquet"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"Saved {len(df):,} rows → {out}")
    return df


# ---------------------------------------------------------------------------
# Reddit loader (via ConvoKit)
# ---------------------------------------------------------------------------

def download_reddit(subreddit: str = "changemyview", max_convos: int | None = None) -> pd.DataFrame:
    """Load a subreddit corpus from ConvoKit and normalize.

    Args:
        subreddit: Name without the r/ prefix (default: changemyview).
        max_convos: Cap the number of conversations for quick testing.
    """
    from convokit import Corpus, download

    corpus_name = f"subreddit-{subreddit}"
    print(f"Downloading ConvoKit corpus '{corpus_name}' …")
    corpus = Corpus(filename=download(corpus_name))

    rows = []
    convos = list(corpus.iter_conversations())
    if max_convos:
        convos = convos[:max_convos]

    for convo in convos:
        thread_id = convo.id
        for utt in convo.iter_utterances():
            rows.append({
                "thread_id": thread_id,
                "post_id": utt.id,
                "parent_id": utt.reply_to if utt.reply_to else pd.NA,
                "author": utt.speaker.id,
                "timestamp": pd.to_datetime(utt.timestamp, unit="s", errors="coerce")
                if utt.timestamp else pd.NaT,
                "content": utt.text or "",
                "is_agent": False,
                "source": "reddit",
                "subreddit": subreddit,
            })

    df = pd.DataFrame(rows)
    df = df.sort_values(["thread_id", "timestamp"]).reset_index(drop=True)

    out = DATA_DIR / f"reddit_{subreddit}.parquet"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    print(f"Saved {len(df):,} rows → {out}")
    return df


# ---------------------------------------------------------------------------
# Unified loader
# ---------------------------------------------------------------------------

def load_all() -> pd.DataFrame:
    """Load cached parquet files and return a combined DataFrame."""
    frames = []
    for f in sorted(DATA_DIR.glob("*.parquet")):
        print(f"Loading {f.name} …")
        frames.append(pd.read_parquet(f))
    if not frames:
        raise FileNotFoundError(
            "No data in data/. Run download_moltbook() and download_reddit() first."
        )
    df = pd.concat(frames, ignore_index=True)
    print(f"Combined dataset: {len(df):,} rows")
    return df


def summary(df: pd.DataFrame):
    """Print a quick summary of the unified dataset."""
    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)
    for source, g in df.groupby("source"):
        n_threads = g["thread_id"].nunique()
        n_posts = len(g)
        n_authors = g["author"].nunique()
        date_range = f"{g['timestamp'].min()} → {g['timestamp'].max()}"
        print(f"\n[{source.upper()}]")
        print(f"  Threads:  {n_threads:>10,}")
        print(f"  Posts:    {n_posts:>10,}")
        print(f"  Authors:  {n_authors:>10,}")
        print(f"  Period:   {date_range}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download & normalize datasets")
    parser.add_argument("--moltbook", action="store_true", help="Download Moltbook")
    parser.add_argument("--reddit", type=str, default=None,
                        metavar="SUBREDDIT",
                        help="Download Reddit subreddit (e.g. changemyview)")
    parser.add_argument("--dump-date", type=str, default=None,
                        help="Moltbook dump date filter (e.g. 2026-02-15)")
    parser.add_argument("--max-convos", type=int, default=None,
                        help="Cap Reddit conversations for testing")
    parser.add_argument("--summary", action="store_true",
                        help="Print summary of cached data")
    args = parser.parse_args()

    if args.moltbook:
        download_moltbook(dump_date=args.dump_date)
    if args.reddit:
        download_reddit(subreddit=args.reddit, max_convos=args.max_convos)
    if args.summary or (not args.moltbook and not args.reddit):
        try:
            df = load_all()
            summary(df)
        except FileNotFoundError as e:
            print(e)
