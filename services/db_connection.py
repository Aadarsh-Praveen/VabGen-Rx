"""
Thread-Safe Supabase Postgres Connection Manager for VabGenRx.

This module provides a shared database connection utility
used by the caching and logging services.

Design Goals
------------
• Ensure safe concurrent access from multiple agents
• Prevent database connection conflicts
• Maintain high performance under parallel workloads

Implementation
--------------
Each thread receives its own database connection using
thread-local storage. This avoids the "connection busy"
errors that occur when multiple threads share a single
database connection.

Typical Usage
-------------
Other services call get_connection() whenever they need
to interact with the cache schema in the main Supabase project.
"""

import os
import psycopg2
from threading import local
from dotenv import load_dotenv

load_dotenv()

_dsn = os.getenv("DATABASE_URL")

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
    _thread_local.connection = psycopg2.connect(_dsn, connect_timeout=10)
    print("✅ Supabase Postgres (cache schema) connected")
    return _thread_local.connection
