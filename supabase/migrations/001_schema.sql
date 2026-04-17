-- Moltbook Observatory — Supabase schema
-- Run via: supabase db push  (or paste into SQL editor)

-- ---------------------------------------------------------------------------
-- 1. Snapshots — one row per observation run
-- ---------------------------------------------------------------------------
create table if not exists snapshots (
    id            uuid primary key default gen_random_uuid(),
    platform      text not null default 'moltbook',
    snapshot_time timestamptz not null default now(),
    dump_date     text,                          -- source dump identifier
    status        text not null default 'pending', -- pending | complete | failed
    post_count    int default 0,
    comment_count int default 0,
    raw_path      text,                          -- storage bucket path to raw JSON
    meta          jsonb default '{}',
    created_at    timestamptz not null default now()
);

create index idx_snapshots_time on snapshots (snapshot_time desc);
create index idx_snapshots_platform on snapshots (platform);

-- ---------------------------------------------------------------------------
-- 2. Records — normalized posts + comments (canonical schema)
-- ---------------------------------------------------------------------------
create table if not exists records (
    id            uuid primary key default gen_random_uuid(),
    snapshot_id   uuid references snapshots(id) on delete cascade,
    platform      text not null,
    thread_id     text not null,
    post_id       text not null,
    parent_id     text,                          -- null for root posts
    author_id     text,
    ts            timestamptz,                   -- original post timestamp
    content       text,
    subcommunity  text,
    lang          text default 'en',
    score         int default 0,
    meta          jsonb default '{}',
    created_at    timestamptz not null default now()
);

-- Prevent duplicate records within the same snapshot
create unique index idx_records_unique on records (snapshot_id, post_id);

create index idx_records_thread on records (thread_id);
create index idx_records_snapshot on records (snapshot_id);
create index idx_records_author on records (author_id);
create index idx_records_ts on records (ts desc);

-- ---------------------------------------------------------------------------
-- 3. Metrics — computed analysis results pushed from local pipeline
-- ---------------------------------------------------------------------------
create table if not exists metrics (
    id            uuid primary key default gen_random_uuid(),
    snapshot_id   uuid references snapshots(id) on delete cascade,
    platform      text not null,
    category      text not null,                 -- geometry | temporal | network
    name          text not null,                 -- metric name
    value         double precision,
    detail        jsonb default '{}',            -- breakdowns, distributions
    computed_at   timestamptz not null default now()
);

create index idx_metrics_snapshot on metrics (snapshot_id);
create index idx_metrics_category on metrics (category, name);

-- ---------------------------------------------------------------------------
-- 4. Thread geometry cache — per-thread metrics for fast dashboard queries
-- ---------------------------------------------------------------------------
create table if not exists thread_geometry (
    id            uuid primary key default gen_random_uuid(),
    snapshot_id   uuid references snapshots(id) on delete cascade,
    thread_id     text not null,
    size          int,
    depth         int,
    width         int,
    mean_branching double precision,
    max_branching  int,
    root_reply_share double precision,
    leaf_ratio    double precision,
    archetype     text,                          -- chain | star | tree
    lifetime_s    double precision,
    created_at    timestamptz not null default now()
);

create unique index idx_tg_unique on thread_geometry (snapshot_id, thread_id);
create index idx_tg_archetype on thread_geometry (archetype);

-- ---------------------------------------------------------------------------
-- 5. Useful views for the dashboard
-- ---------------------------------------------------------------------------

-- Latest snapshot per platform
create or replace view v_latest_snapshot as
select distinct on (platform)
    id, platform, snapshot_time, dump_date, status, post_count, comment_count
from snapshots
where status = 'complete'
order by platform, snapshot_time desc;

-- Thread count by archetype for latest snapshot
create or replace view v_archetype_counts as
select
    s.platform,
    tg.archetype,
    count(*) as thread_count,
    round(100.0 * count(*) / sum(count(*)) over (partition by s.platform), 1) as pct
from thread_geometry tg
join snapshots s on s.id = tg.snapshot_id
where s.id in (select id from v_latest_snapshot)
group by s.platform, tg.archetype
order by s.platform, thread_count desc;

-- Snapshot history (for time-series charts)
create or replace view v_snapshot_history as
select
    id,
    platform,
    snapshot_time,
    post_count,
    comment_count,
    post_count + comment_count as total_records
from snapshots
where status = 'complete'
order by snapshot_time desc;

-- ---------------------------------------------------------------------------
-- 6. Row-level security (allow read from anon, write from service_role)
-- ---------------------------------------------------------------------------
alter table snapshots    enable row level security;
alter table records      enable row level security;
alter table metrics      enable row level security;
alter table thread_geometry enable row level security;

-- Anon can read everything (dashboard is public for dev)
create policy "anon_read_snapshots"       on snapshots       for select using (true);
create policy "anon_read_records"         on records         for select using (true);
create policy "anon_read_metrics"         on metrics         for select using (true);
create policy "anon_read_thread_geometry" on thread_geometry  for select using (true);

-- Service role can do everything (edge functions + local pipeline)
create policy "service_all_snapshots"       on snapshots       for all using (true) with check (true);
create policy "service_all_records"         on records         for all using (true) with check (true);
create policy "service_all_metrics"         on metrics         for all using (true) with check (true);
create policy "service_all_thread_geometry" on thread_geometry  for all using (true) with check (true);
