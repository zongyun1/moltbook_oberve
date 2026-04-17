# Moltbook Observatory — Architecture

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Frontend)                     │
│  Next.js dashboard — reads from Supabase via client SDK │
└──────────────────────────┬──────────────────────────────┘
                           │ supabase-js
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Supabase                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Postgres   │  │ Edge Function│  │   Storage     │  │
│  │              │  │  /observe    │  │  (raw JSON)   │  │
│  │ • snapshots  │  │              │  │               │  │
│  │ • records    │  │ fetches HF   │  │               │  │
│  │ • metrics    │  │ normalizes   │  │               │  │
│  │ • views      │  │ inserts rows │  │               │  │
│  └──────────────┘  └──────┬───────┘  └───────────────┘  │
│                           │                             │
│  ┌──────────────┐         │                             │
│  │  pg_cron     │─────────┘ calls /observe daily        │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               Local (Python pipeline)                   │
│  Heavy analysis: geometry, temporal, network, semantic  │
│  Pulls from Supabase → runs analysis → pushes metrics   │
└─────────────────────────────────────────────────────────┘
```

## What runs where

| Component              | Where      | Why                                    |
|------------------------|------------|----------------------------------------|
| Observation (fetch)    | Supabase   | Edge Function + cron = zero-ops        |
| Raw snapshot storage   | Supabase   | Storage bucket for JSON blobs          |
| Normalized records     | Supabase   | Postgres — queryable from dashboard    |
| Dashboard              | Vercel     | Next.js + supabase-js                  |
| Geometry analysis      | Local      | Needs networkx, heavy compute          |
| Temporal analysis      | Local      | Same                                   |
| Network analysis       | Local      | Same                                   |
| Semantic analysis      | Local      | Needs sentence-transformers + GPU      |
| Computed metrics cache | Supabase   | Local pushes summary metrics to PG     |
