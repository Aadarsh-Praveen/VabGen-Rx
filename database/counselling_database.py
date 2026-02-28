"""
Run this to add counseling cache tables to Azure SQL.
python setup_database.py
"""

import pyodbc
import os
from dotenv import load_dotenv
load_dotenv()

connection_string = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
    f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
    f"UID={os.getenv('AZURE_SQL_USERNAME')};"
    f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
)

CREATE_DRUG_COUNSELING = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='drug_counseling_cache' AND xtype='U'
)
CREATE TABLE drug_counseling_cache (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    cache_key    NVARCHAR(200) NOT NULL UNIQUE,  -- drug|sex|age_group
    drug         NVARCHAR(100) NOT NULL,
    sex          NVARCHAR(10),
    age_group    NVARCHAR(20),
    full_result  NVARCHAR(MAX) NOT NULL,
    cached_at    DATETIME DEFAULT GETDATE(),
    access_count INT DEFAULT 1
);
"""

CREATE_CONDITION_COUNSELING = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='condition_counseling_cache' AND xtype='U'
)
CREATE TABLE condition_counseling_cache (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    cache_key    NVARCHAR(200) NOT NULL UNIQUE,  -- condition|sex|age_group
    condition    NVARCHAR(100) NOT NULL,
    sex          NVARCHAR(10),
    age_group    NVARCHAR(20),
    full_result  NVARCHAR(MAX) NOT NULL,
    cached_at    DATETIME DEFAULT GETDATE(),
    access_count INT DEFAULT 1
);
"""

def create_tables():
    print("Connecting to Azure SQL...")
    try:
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()
        print("✅ Connected\n")

        tables = {
            "drug_counseling_cache":     CREATE_DRUG_COUNSELING,
            "condition_counseling_cache": CREATE_CONDITION_COUNSELING,
        }

        for name, ddl in tables.items():
            print(f"Creating table: {name}...", end="")
            cursor.execute(ddl)
            conn.commit()
            print(" ✅")

        # Verify
        print("\nAll tables in database:")
        cursor.execute("""
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        """)
        for row in cursor.fetchall():
            print(f"   ✅ {row[0]}")

        conn.close()
        print("\n🎉 Counseling tables created!")

    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    create_tables()