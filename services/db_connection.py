"""
Shared database connection for VabGenRx.
Uses thread-local storage so each thread gets its own connection.

Why thread-local?
  The multi-agent parallel execution (VabGenRxSafetyAgent +
  VabGenRxDiseaseAgent running simultaneously) means two threads
  hit the database at the same time. A single shared connection
  causes "Connection is busy with results for another command".
  thread-local gives each thread its own private connection —
  they never collide.
"""

import os
import pyodbc
from threading import local
from dotenv import load_dotenv

load_dotenv()

_conn_str = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
    f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
    f"UID={os.getenv('AZURE_SQL_USERNAME')};"
    f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
)

# Each thread gets its own private connection object
_thread_local = local()


def get_connection():
    """
    Get or create a thread-local database connection.
    Each thread (Safety Agent, Disease Agent, main thread) gets
    its own connection — no sharing, no collision.
    """
    conn = getattr(_thread_local, 'connection', None)

    # Test if existing connection is still alive
    try:
        if conn:
            conn.cursor().execute("SELECT 1")
            return conn
    except Exception:
        _thread_local.connection = None

    # Create a new connection for this thread
    _thread_local.connection = pyodbc.connect(_conn_str, timeout=10)
    print("✅ Azure SQL Cache connected")
    return _thread_local.connection