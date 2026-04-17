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


# ── LLM signature / marker analysis ─────────────────────────────────

# Words known to be overrepresented in GPT-4 / Claude / mainstream LLM output
LLM_MARKERS = [
    "delve", "tapestry", "nuanced", "multifaceted", "navigat",
    "foster", "underscores", "resonates", "paradigm", "leverage",
    "realm", "robust", "pivotal", "crucial", "comprehensive",
    "utilize", "facilitate", "endeavor",
]


def marker_prevalence(texts: pd.Series, markers: list[str] | None = None) -> dict[str, float]:
    """Count what fraction of texts contain each marker word.

    Returns dict of marker -> fraction (0-1).
    """
    if markers is None:
        markers = LLM_MARKERS
    valid = texts.dropna()
    valid = valid[valid.str.len() > 30]
    n = len(valid)
    if n == 0:
        return {m: 0.0 for m in markers}

    lower = valid.str.lower()
    result = {}
    for m in markers:
        count = lower.str.contains(m, regex=False).sum()
        result[m] = round(float(count / n), 5)
    return result


def posts_with_any_marker(texts: pd.Series, markers: list[str] | None = None) -> float:
    """Fraction of texts containing at least one LLM marker."""
    if markers is None:
        markers = LLM_MARKERS
    valid = texts.dropna()
    valid = valid[valid.str.len() > 30]
    if len(valid) == 0:
        return 0.0
    lower = valid.str.lower()
    has_any = lower.apply(lambda t: any(m in t for m in markers))
    return round(float(has_any.mean()), 4)


def per_author_marker_density(df: pd.DataFrame, content_col: str = "content",
                               author_col: str = "author_id",
                               min_posts: int = 3) -> pd.DataFrame:
    """Compute per-author LLM marker density (markers per post).

    Only includes authors with at least min_posts.
    """
    grouped = df.groupby(author_col)[content_col].apply(list)
    rows = []
    for author, posts in grouped.items():
        valid = [p for p in posts if isinstance(p, str) and len(p) > 30]
        if len(valid) < min_posts:
            continue
        marker_count = 0
        for t in valid:
            lower = t.lower()
            marker_count += sum(1 for m in LLM_MARKERS if m in lower)
        rows.append({
            "author": author,
            "n_posts": len(valid),
            "marker_count": marker_count,
            "marker_density": round(marker_count / len(valid), 3),
        })
    return pd.DataFrame(rows)


def classify_agent_types(df: pd.DataFrame, content_col: str = "content",
                          author_col: str = "author_id",
                          min_posts: int = 3) -> dict:
    """Classify agents into behavioral types and return summary stats.

    Types:
      - gpt_verbose: high LLM marker density (>0.5 markers/post)
      - terse_bot: very short outputs (mean < 100 chars)
      - mixed: everything else

    Returns dict with type counts and within-type similarity info.
    """
    grouped = df.groupby(author_col)[content_col].apply(list)
    classifications = {}

    for author, posts in grouped.items():
        valid = [p for p in posts if isinstance(p, str) and len(p) > 30]
        if len(valid) < min_posts:
            continue

        # Marker density
        marker_count = sum(
            sum(1 for m in LLM_MARKERS if m in t.lower())
            for t in valid
        )
        density = marker_count / len(valid)

        avg_len = np.mean([len(p) for p in valid])

        if density > 0.5:
            classifications[author] = "gpt_verbose"
        elif avg_len < 100:
            classifications[author] = "terse_bot"
        else:
            classifications[author] = "mixed"

    from collections import Counter
    counts = Counter(classifications.values())
    total = len(classifications)

    return {
        "n_agents": total,
        "types": {t: {"count": c, "pct": round(c / total * 100, 1)} for t, c in counts.items()},
        "classifications": classifications,
    }


def marker_summary(df: pd.DataFrame, content_col: str = "content",
                    author_col: str = "author_id") -> dict:
    """Full LLM marker analysis summary."""
    texts = df[content_col]

    # Overall marker prevalence
    prevalence = marker_prevalence(texts)
    any_marker_pct = posts_with_any_marker(texts)

    # Per-author density
    author_density = per_author_marker_density(df, content_col, author_col)

    # Agent type classification
    agent_types = classify_agent_types(df, content_col, author_col)

    result = {
        "pct_posts_with_marker": round(any_marker_pct * 100, 1),
        "n_agents_classified": agent_types["n_agents"],
    }

    # Add type percentages
    for t, info in agent_types["types"].items():
        result[f"pct_{t}"] = info["pct"]

    # Author density stats
    if len(author_density) > 0:
        result["author_mean_marker_density"] = round(float(author_density["marker_density"].mean()), 3)
        result["author_median_marker_density"] = round(float(author_density["marker_density"].median()), 3)
        result["pct_authors_zero_markers"] = round(
            float((author_density["marker_density"] == 0).mean() * 100), 1
        )
        result["pct_authors_high_markers"] = round(
            float((author_density["marker_density"] > 0.3).mean() * 100), 1
        )

    # Top markers by prevalence
    top_markers = sorted(prevalence.items(), key=lambda x: -x[1])[:10]
    result["top_markers"] = {m: round(v * 100, 2) for m, v in top_markers}

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
