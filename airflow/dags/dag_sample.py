import json
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.utils.dates import days_ago
from airflow_clickhouse_plugin.operators.clickhouse import ClickHouseOperator
from datetime import datetime
from airflow_clickhouse_plugin.hooks.clickhouse import ClickHouseHook
from airflow.operators.python import ShortCircuitOperator

from airflow import DAG

# Аргументы по умолчанию: владелец процесса и время отсчета для задачи
default_args = {
    'owner': 'airflow',
    'start_date': datetime(2024, 12, 1),
}


def create_report_fn(**kwargs):
    ti = kwargs['ti']
    customers = ti.xcom_pull(task_ids='query_customers')
    customers_map = {x[0]: x[2] for x in customers}
    reports = []
    for item in ti.xcom_pull(task_ids='query_telemetry'):
        reports.append({"user_id": item[0],
                        "email": customers_map.get(item[0]),
                        "report": json.dumps(item[1], default=str),
                        "from_date": kwargs['data_interval_start'].format('YYYY-MM-DD HH:mm:ss'),
                        "to_date": kwargs['data_interval_end'].format('YYYY-MM-DD HH:mm:ss')})
    return reports

def insert_to_clickhouse_fn(**kwargs):
    ti = kwargs['ti']
    rows = ti.xcom_pull(task_ids='create_report')
    values = ", ".join([f'({row.get("user_id")}, \'{row.get("email")}\', \'{row.get("report")}\', \'{row.get("from_date")}\', \'{row.get("to_date") }\')' for row in rows])
    return_value = ClickHouseHook(clickhouse_conn_id='olap_db',).execute(
        f"INSERT INTO reports VALUES {values};",
        with_column_types=True,
        query_id=f'{ti.dag_id}-{ti.task_id}-{ti.run_id}-{ti.try_number}',
        types_check=True,
    )
    return return_value


def flat_user_ids_fn(**kwargs):
    ids = [item for sublist in kwargs['ti'].xcom_pull(task_ids='select_user_ids') for item in sublist]
    return ",".join(str(x) for x in ids)

def user_ids_short_circuit_fn(**kwargs):
    return len(kwargs['ti'].xcom_pull(task_ids='flat_user_ids')) != 0

# Определяем DAG
with DAG('reports_dag',
         default_args=default_args,  # аргументы по умолчанию в начале скрипта
         schedule_interval='@daily',
         catchup=True) as dag:
    select_user_ids = ClickHouseOperator(
        task_id='select_user_ids',
        database='default',
        sql=(
            """
            SELECT DISTINCT user_id
            from emg_sensor_data
            WHERE signal_time BETWEEN '{{ data_interval_start.format('YYYY-MM-DD HH:mm:ss') }}' and '{{ data_interval_end.format('YYYY-MM-DD HH:mm:ss') }}'
            """
        ),
        # query_id is templated and allows to quickly identify query in ClickHouse logs
        query_id='{{ ti.dag_id }}-{{ ti.task_id }}-{{ ti.run_id }}-{{ ti.try_number }}',
        clickhouse_conn_id='olap_db',
    )

    flat_user_ids = PythonOperator(
        task_id='flat_user_ids',
        python_callable=flat_user_ids_fn
    )

    user_ids_short_circuit = ShortCircuitOperator(
        task_id='user_ids_short_circuit',
        python_callable=user_ids_short_circuit_fn,
    )

    query_customers = PostgresOperator(
        task_id='query_customers',
        postgres_conn_id='crm_db',
        sql=(
            """
            SELECT *
            from customers
            WHERE id IN ({{task_instance.xcom_pull(task_ids='flat_user_ids')}})
            """
        ),
    )

    query_telemetry = ClickHouseOperator(
        task_id='query_telemetry',
        database='default',
        sql=(
            """
            SELECT user_id,
                   groupArray(tuple(prosthesis_type, muscle_group, signal_frequency, signal_duration, signal_amplitude,
                                    signal_time)) AS signals
            from emg_sensor_data
            WHERE signal_time BETWEEN '{{ data_interval_start.format('YYYY-MM-DD HH:mm:ss') }}' and '{{ data_interval_end.format('YYYY-MM-DD HH:mm:ss') }}'
            GROUP BY user_id
            """
        ),
        # query_id is templated and allows to quickly identify query in ClickHouse logs
        query_id='{{ ti.dag_id }}-{{ ti.task_id }}-{{ ti.run_id }}-{{ ti.try_number }}',
        clickhouse_conn_id='olap_db',
    )

    create_report = PythonOperator(
        task_id='create_report',
        python_callable=create_report_fn,
    )

    insert_to_clickhouse = PythonOperator(
        task_id='insert_to_clickhouse',
        python_callable=insert_to_clickhouse_fn,
    )


    select_user_ids >> flat_user_ids >> user_ids_short_circuit >> query_customers
    [query_telemetry, query_customers] >> create_report >> insert_to_clickhouse

