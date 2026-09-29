-- explore_climate.sql
-- First questions to ask the NOAA climate table (one row per state per month). Run with:
--     .venv\Scripts\python scripts\run_sql.py sql\explore_climate.sql

-- 1. The hottest July highs (2021-2025 average)
SELECT state_name, high_recent, low_recent
FROM climate_by_state
WHERE month = 7
ORDER BY high_recent DESC
LIMIT 5;

-- 2. Where July has warmed most compared with the 1991-2020 normal
SELECT state_name, high_normal, high_recent, high_change
FROM climate_by_state
WHERE month = 7
ORDER BY high_change DESC
LIMIT 5;

-- 3. What the site asks for, month by month: the same thresholds as warmthFor() in site/js/model.js
SELECT month_name,
       COUNT(*) FILTER (WHERE high_recent < 50)                     AS warm_states,
       COUNT(*) FILTER (WHERE high_recent >= 50 AND high_recent < 72) AS mid_weight_states,
       COUNT(*) FILTER (WHERE high_recent >= 72)                    AS light_states
FROM climate_by_state
GROUP BY month, month_name
ORDER BY month;

-- 4. Maryland all year, with how much each month changed
SELECT month_name, high_recent, low_recent, precip_recent, high_normal, high_change
FROM climate_by_state
WHERE state = 'MD'
ORDER BY month;

-- 5. Sanity check: every state has 12 months, 5 recent years and 30 normal years per month
SELECT COUNT(DISTINCT state) AS states,
       MIN(years_recent) AS min_recent_years, MAX(years_recent) AS max_recent_years,
       MIN(years_normal) AS min_normal_years, MAX(years_normal) AS max_normal_years
FROM climate_by_state;
