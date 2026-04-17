"""Behavioral analysis: circadian rhythm, linguistic homogeneity, karma economy.

Compares AI agent communities (Moltbook) with human communities (Reddit CMV)
on three dimensions that reveal fundamental behavioral differences.
"""

from __future__ import annotations

import re
from collections import Counter

import numpy as np
import pandas as pd
from scipy import stats as sp_stats


# ── Circadian rhythm analysis ────────────────────────────────────────

def activity_by_hour(df: pd.DataFrame, ts_col: str = "timestamp") -> np.ndarray:
    """Count posts per hour-of-day (0–23). Returns array of 24 counts."""
    ts = pd.to_datetime(df[ts_col], utc=True, errors="coerce").dropna()
    hours = ts.dt.hour
    counts = np.zeros(24, dtype=int)
    for h, c in hours.value_counts().items():
        counts[int(h)] = c
    return counts


def activity_by_dow(df: pd.DataFrame, ts_col: str = "timestamp") -> np.ndarray:
    """Count posts per day-of-week (0=Mon, 6=Sun). Returns array of 7 counts."""
    ts = pd.to_datetime(df[ts_col], utc=True, errors="coerce").dropna()
    dows = ts.dt.dayofweek
    counts = np.zeros(7, dtype=int)
    for d, c in dows.value_counts().items():
        counts[int(d)] = c
    return counts


def circadian_strength(hourly_counts: np.ndarray) -> dict:
    """Measure how non-uniform the hour-of-day distribution is.

    Returns:
        chi2_stat: chi-squared statistic vs uniform (higher = more rhythmic)
        chi2_p: p-value (low = significantly non-uniform)
        coeff_var: coefficient of variation (higher = more variation)
        peak_hour: hour with most activity
        trough_hour: hour with least activity
        peak_trough_ratio: ratio of peak to trough
    """
    total = hourly_counts.sum()
    if total == 0:
        return {"chi2_stat": 0, "chi2_p": 1, "coeff_var": 0,
                "peak_hour": 0, "trough_hour": 0, "peak_trough_ratio": 1}

    expected = np.full(24, total / 24)
    chi2, p = sp_stats.chisquare(hourly_counts, expected)

    mean = hourly_counts.mean()
    std = hourly_counts.std()
    cv = std / mean if mean > 0 else 0

    peak = int(np.argmax(hourly_counts))
    trough = int(np.argmin(hourly_counts))
    ptr = hourly_counts[peak] / hourly_counts[trough] if hourly_counts[trough] > 0 else float("inf")

    return {
        "chi2_stat": round(float(chi2), 2),
        "chi2_p": float(p),
        "coeff_var": round(float(cv), 4),
        "peak_hour": peak,
        "trough_hour": trough,
        "peak_trough_ratio": round(float(ptr), 2),
    }


# ── Linguistic homogeneity analysis ─────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Simple whitespace + punctuation tokenizer."""
    return re.findall(r"[a-zA-Z]+", text.lower())


def type_token_ratio(texts: pd.Series) -> pd.Series:
    """Compute type-token ratio for each text. TTR = unique_words / total_words."""
    def _ttr(text):
        if not isinstance(text, str) or len(text) == 0:
            return 0.0
        tokens = _tokenize(text)
        if len(tokens) == 0:
            return 0.0
        return len(set(tokens)) / len(tokens)
    return texts.apply(_ttr)


def content_length_stats(texts: pd.Series) -> dict:
    """Word count statistics for a collection of texts."""
    word_counts = texts.dropna().apply(lambda t: len(_tokenize(t)) if isinstance(t, str) else 0)
    word_counts = word_counts[word_counts > 0]
    if len(word_counts) == 0:
        return {"mean_words": 0, "median_words": 0, "std_words": 0}
    return {
        "mean_words": round(float(word_counts.mean()), 1),
        "median_words": round(float(word_counts.median()), 1),
        "std_words": round(float(word_counts.std()), 1),
    }


def pairwise_similarity_sample(texts: pd.Series, n_pairs: int = 500, seed: int = 42) -> dict:
    """Estimate average pairwise cosine similarity using TF-IDF on a sample.

    Returns mean and std of cosine similarities between random pairs.
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    valid = texts.dropna()
    valid = valid[valid.str.len() > 20]
    if len(valid) < 10:
        return {"mean_similarity": 0, "std_similarity": 0, "n_pairs": 0}

    # Cap at 2000 docs for TF-IDF performance
    if len(valid) > 2000:
        valid = valid.sample(2000, random_state=seed)

    vectorizer = TfidfVectorizer(max_features=5000, stop_words="english", min_df=2)
    try:
        tfidf = vectorizer.fit_transform(valid.values)
    except ValueError:
        return {"mean_similarity": 0, "std_similarity": 0, "n_pairs": 0}

    rng = np.random.RandomState(seed)
    n = tfidf.shape[0]
    n_pairs = min(n_pairs, n * (n - 1) // 2)

    sims = []
    pairs_seen = set()
    attempts = 0
    while len(sims) < n_pairs and attempts < n_pairs * 3:
        i, j = rng.randint(0, n, 2)
        if i == j or (i, j) in pairs_seen:
            attempts += 1
            continue
        pairs_seen.add((i, j))
        sim = cosine_similarity(tfidf[i], tfidf[j])[0, 0]
        sims.append(sim)
        attempts += 1

    sims = np.array(sims)
    return {
        "mean_similarity": round(float(sims.mean()), 4),
        "std_similarity": round(float(sims.std()), 4),
        "n_pairs": len(sims),
    }


def per_author_ttr(df: pd.DataFrame, content_col: str = "content",
                   author_col: str = "author_id", min_posts: int = 3) -> pd.DataFrame:
    """Compute per-author vocabulary diversity (TTR).

    Only includes authors with at least min_posts posts.
    """
    grouped = df.groupby(author_col)[content_col].apply(
        lambda texts: " ".join(t for t in texts if isinstance(t, str))
    )
    result = []
    for author, combined in grouped.items():
        tokens = _tokenize(combined)
        if len(tokens) < 20:
            continue
        result.append({
            "author": author,
            "n_tokens": len(tokens),
            "n_types": len(set(tokens)),
            "ttr": len(set(tokens)) / len(tokens),
        })
    return pd.DataFrame(result)


def linguistic_summary(df: pd.DataFrame, content_col: str = "content",
                       author_col: str = "author_id") -> dict:
    """Full linguistic analysis summary."""
    texts = df[content_col].dropna()

    # Overall TTR
    ttr_values = type_token_ratio(texts)
    ttr_values = ttr_values[ttr_values > 0]

    # Content length
    cl = content_length_stats(texts)

    # Pairwise similarity
    pw = pairwise_similarity_sample(texts)

    # Per-author diversity
    author_ttr = per_author_ttr(df, content_col, author_col)

    result = {
        "mean_ttr": round(float(ttr_values.mean()), 4) if len(ttr_values) > 0 else 0,
        "std_ttr": round(float(ttr_values.std()), 4) if len(ttr_values) > 0 else 0,
        "median_ttr": round(float(ttr_values.median()), 4) if len(ttr_values) > 0 else 0,
    }
    result.update(cl)
    result.update({f"pairwise_{k}": v for k, v in pw.items()})

    if len(author_ttr) > 0:
        result["author_mean_ttr"] = round(float(author_ttr["ttr"].mean()), 4)
        result["author_std_ttr"] = round(float(author_ttr["ttr"].std()), 4)
        result["n_authors_analyzed"] = len(author_ttr)

    return result


# ── Score / karma economy analysis ──────────────────────────────────

def score_distribution(df: pd.DataFrame, score_col: str = "score") -> dict:
    """Analyze the score distribution."""
    scores = pd.to_numeric(df[score_col], errors="coerce").dropna()
    if len(scores) == 0:
        return {"mean_score": 0, "median_score": 0, "std_score": 0,
                "gini_score": 0, "pct_zero": 100, "max_score": 0}

    scores_arr = scores.values.astype(float)
    sorted_s = np.sort(np.abs(scores_arr))
    n = len(sorted_s)
    if sorted_s.sum() == 0:
        gini = 0
    else:
        index = np.arange(1, n + 1)
        gini = float((2 * np.sum(index * sorted_s) - (n + 1) * np.sum(sorted_s)) / (n * np.sum(sorted_s)))

    return {
        "mean_score": round(float(scores.mean()), 2),
        "median_score": round(float(scores.median()), 2),
        "std_score": round(float(scores.std()), 2),
        "max_score": int(scores.max()),
        "min_score": int(scores.min()),
        "pct_zero": round(float((scores == 0).mean() * 100), 1),
        "pct_positive": round(float((scores > 0).mean() * 100), 1),
        "gini_score": round(gini, 4),
        "n_scored": len(scores),
    }
