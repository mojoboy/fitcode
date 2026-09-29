-- explore_trends.sql
-- First questions to ask the Google Trends table. Run with:
--     .venv\Scripts\python scripts\run_sql.py sql\explore_trends.sql

-- 1. Where is each brand strongest? (the #1 state per brand)
SELECT brand, state, interest
FROM trends_by_state
WHERE rank_in_brand = 1
ORDER BY brand;

-- 2. How much data is missing per brand? (Google leaves out states with too few searches)
SELECT brand,
       COUNT(*) FILTER (WHERE NOT has_data) AS states_without_data
FROM trends_by_state
GROUP BY brand
ORDER BY states_without_data DESC, brand;

-- 3. Which brands does Maryland search for more than the average state does?
SELECT brand, interest, index_vs_avg
FROM trends_by_state
WHERE state = 'Maryland' AND has_data
ORDER BY index_vs_avg DESC;

-- 4. Workwear check: Carhartt's top 5 states
SELECT state, interest, index_vs_avg
FROM trends_by_state
WHERE brand = 'Carhartt'
ORDER BY interest DESC
LIMIT 5;
