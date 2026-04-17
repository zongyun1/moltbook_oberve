"""Abstract base observer that all platform observers must implement.

The observer is responsible for:
  1. Fetching raw data from a platform
  2. Saving timestamped raw snapshots
  3. Producing a normalized DataFrame via its adapter
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from pipeline.schema import validate


class BaseObserver(ABC):
    """Abstract observer for a single platform."""

    platform: str = "unknown"

    def __init__(self, snapshot_dir: str | Path = "pipeline/snapshots"):
        self.snapshot_dir = Path(snapshot_dir) / self.platform
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Subclasses must implement these
    # ------------------------------------------------------------------

    @abstractmethod
    def fetch_raw(self, **kwargs) -> dict:
        """Fetch raw data from the platform. Returns a dict of DataFrames or lists."""
        ...

    @abstractmethod
    def normalize(self, raw: dict, snapshot_time: datetime) -> pd.DataFrame:
        """Convert raw platform data into the canonical schema."""
        ...

    # ------------------------------------------------------------------
    # Shared infrastructure
    # ------------------------------------------------------------------

    def snapshot(self, **kwargs) -> pd.DataFrame:
        """Run one full observation cycle: fetch → save raw → normalize → save normalized."""
        snapshot_time = datetime.now(timezone.utc)
        stamp = snapshot_time.strftime("%Y%m%dT%H%M%SZ")

        print(f"[{self.platform}] Fetching snapshot at {stamp} …")
        raw = self.fetch_raw(**kwargs)

        raw_path = self.snapshot_dir / f"raw_{stamp}.json"
        self._save_raw(raw, raw_path)
        print(f"[{self.platform}] Raw snapshot → {raw_path}")

        df = self.normalize(raw, snapshot_time)
        df = validate(df)

        norm_path = self.snapshot_dir / f"norm_{stamp}.parquet"
        df.to_parquet(norm_path, index=False)
        print(f"[{self.platform}] Normalized {len(df):,} records → {norm_path}")

        return df

    def load_latest(self) -> pd.DataFrame:
        """Load the most recent normalized snapshot."""
        files = sorted(self.snapshot_dir.glob("norm_*.parquet"))
        if not files:
            raise FileNotFoundError(f"No snapshots in {self.snapshot_dir}")
        return pd.read_parquet(files[-1])

    def load_all_snapshots(self) -> pd.DataFrame:
        """Load and concatenate all normalized snapshots."""
        files = sorted(self.snapshot_dir.glob("norm_*.parquet"))
        if not files:
            raise FileNotFoundError(f"No snapshots in {self.snapshot_dir}")
        frames = [pd.read_parquet(f) for f in files]
        return pd.concat(frames, ignore_index=True)

    def list_snapshots(self) -> list[str]:
        """Return timestamps of all saved snapshots."""
        files = sorted(self.snapshot_dir.glob("norm_*.parquet"))
        return [f.stem.replace("norm_", "") for f in files]

    @staticmethod
    def _save_raw(raw: dict, path: Path):
        """Serialize raw data to JSON. Handles DataFrames and common types."""
        serializable = {}
        for key, val in raw.items():
            if isinstance(val, pd.DataFrame):
                serializable[key] = val.to_dict(orient="records")
            else:
                serializable[key] = val

        def _default(obj):
            if isinstance(obj, (datetime, pd.Timestamp)):
                return obj.isoformat()
            if pd.isna(obj):
                return None
            return str(obj)

        with open(path, "w") as f:
            json.dump(serializable, f, default=_default, ensure_ascii=False)
