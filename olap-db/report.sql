CREATE TABLE IF NOT EXISTS cdc_emg_interval_agg
(
    from_date DateTime,
    to_date DateTime,

    user_id UInt32,

    signals AggregateFunction(
        groupArray,
        Tuple(
            String,
            String,
            UInt32,
            UInt32,
            Decimal(5,2),
            DateTime
        )
    )
)
    ENGINE = AggregatingMergeTree
ORDER BY (from_date, to_date, user_id);


CREATE MATERIALIZED VIEW IF NOT EXISTS  cdc_emg_interval_agg_mv
TO cdc_emg_interval_agg
AS
SELECT
    toStartOfDay(signal_time) AS from_date,
    toStartOfDay(signal_time) + INTERVAL 1 DAY AS to_date,
    user_id,
    groupArrayState(
        tuple(
            prosthesis_type,
            muscle_group,
            signal_frequency,
            signal_duration,
            signal_amplitude,
            signal_time
        )
    ) AS signals

FROM emg_sensor_data
GROUP BY
    from_date,
    to_date,
    user_id;


CREATE TABLE IF NOT EXISTS cdc_reports(
  user_id UInt32,
  email String,
  report String,

  from_date DateTime,
  to_date DateTime
)
ENGINE = ReplacingMergeTree
ORDER BY (from_date, to_date, user_id);


CREATE MATERIALIZED VIEW IF NOT EXISTS cdc_reports_mv
TO cdc_reports
AS
SELECT
    a.from_date,
    a.to_date,
    a.user_id,
    c.email,

    toJSONString(
            groupArrayMerge(a.signals)
    ) AS report

FROM cdc_emg_interval_agg a
         LEFT JOIN customers c
                   ON a.user_id = c.id
WHERE c.deleted = 0
GROUP BY
    a.user_id,
    c.email,
    a.from_date,
    a.to_date;