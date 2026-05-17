CREATE TABLE IF NOT EXISTS customers_changes
(
    `before.id` Nullable(UInt32),
    `before.name` Nullable(String),
    `before.email` Nullable(String),

    `after.id` Nullable(UInt32),
    `after.name` Nullable(String),
    `after.email` Nullable(String),

    `op` LowCardinality(String),
    `ts_ms` UInt64,
    `source.sequence` String,
    `source.lsn` UInt64
) ENGINE = Kafka('localhost:9092', 'customers3.public.customers', 'group11123', 'JSONEachRow');

CREATE TABLE IF NOT EXISTS customers (
   id UInt32,
   name String,
   email String,
   version UInt64,
   deleted UInt8
)
    ENGINE = ReplacingMergeTree(version, deleted)
ORDER BY id;

CREATE MATERIALIZED VIEW IF NOT EXISTS customers_consumer TO customers
(
   id UInt32,
   name String,
   email String,
   version UInt64,
   deleted UInt8
) AS
SELECT
    if(op = 'd', before.id, after.id) AS id,
    if(op = 'd', before.name, after.name) AS name,
    if(op = 'd', before.email, after.email) AS email,
    if(op = 'd', source.lsn, source.lsn) AS version,
   if(op = 'd', 1, 0) AS deleted
FROM customers_changes
WHERE (op = 'c') OR (op = 'r') OR (op = 'u') OR (op = 'd');

--
-- CREATE TABLE IF NOT EXISTS customers_log (
--     `before.id` Nullable(UInt32),
--     `before.name` Nullable(String),
--     `before.email` Nullable(String),
--
--     `after.id` Nullable(UInt32),
--     `after.name` Nullable(String),
--     `after.email` Nullable(String),
--
--     `op` LowCardinality(String),
--     `ts_ms` UInt64,
--     `source.sequence` String,
--     `source.lsn` UInt64
--     )
--     ENGINE = MergeTree()
--     ORDER BY tuple();
--
--
-- CREATE MATERIALIZED VIEW IF NOT EXISTS customers_consumer_log TO customers_log
-- (
--     `before.id` Nullable(UInt32),
--     `before.name` Nullable(String),
--     `before.email` Nullable(String),
--
--     `after.id` Nullable(UInt32),
--     `after.name` Nullable(String),
--     `after.email` Nullable(String),
--
--     `op` LowCardinality(String),
--     `ts_ms` UInt64,
--     `source.sequence` String,
--     `source.lsn` UInt64
--     ) AS
-- SELECT * FROM customers_changes;
