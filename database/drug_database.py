"""
Run this ONCE to create all tables in Azure SQL Database.
Place in project root and run: python setup_database.py
"""

import pyodbc

import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()
load_dotenv()

connection_string = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
    f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
    f"UID={os.getenv('AZURE_SQL_USERNAME')};"
    f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
)

# ── SQL DDL ──────────────────────────────────────────────────────────────────

CREATE_INTERACTION_CACHE = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='interaction_cache' AND xtype='U'
)
CREATE TABLE interaction_cache (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    drug1            NVARCHAR(100)  NOT NULL,
    drug2            NVARCHAR(100)  NOT NULL,
    interaction_type NVARCHAR(50)   NOT NULL DEFAULT 'drug_drug',
    severity         NVARCHAR(20),
    confidence       FLOAT,
    pubmed_papers    INT            DEFAULT 0,
    fda_reports      INT            DEFAULT 0,
    full_result      NVARCHAR(MAX)  NOT NULL,
    cached_at        DATETIME       DEFAULT GETDATE(),
    last_accessed    DATETIME       DEFAULT GETDATE(),
    access_count     INT            DEFAULT 1,
    CONSTRAINT UQ_drug_pair UNIQUE (drug1, drug2)
);
"""

CREATE_DISEASE_CACHE = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='disease_cache' AND xtype='U'
)
CREATE TABLE disease_cache (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    drug           NVARCHAR(100) NOT NULL,
    disease        NVARCHAR(100) NOT NULL,
    contraindicated BIT          DEFAULT 0,
    severity       NVARCHAR(20),
    confidence     FLOAT,
    pubmed_papers  INT           DEFAULT 0,
    full_result    NVARCHAR(MAX) NOT NULL,
    cached_at      DATETIME      DEFAULT GETDATE(),
    last_accessed  DATETIME      DEFAULT GETDATE(),
    access_count   INT           DEFAULT 1,
    CONSTRAINT UQ_drug_disease UNIQUE (drug, disease)
);
"""

CREATE_FOOD_CACHE = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='food_cache' AND xtype='U'
)
CREATE TABLE food_cache (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    drug               NVARCHAR(100) NOT NULL UNIQUE,
    foods_to_avoid     NVARCHAR(MAX),
    foods_to_separate  NVARCHAR(MAX),
    foods_to_monitor   NVARCHAR(MAX),
    pubmed_papers      INT           DEFAULT 0,
    full_result        NVARCHAR(MAX) NOT NULL,
    cached_at          DATETIME      DEFAULT GETDATE(),
    last_accessed      DATETIME      DEFAULT GETDATE(),
    access_count       INT           DEFAULT 1
);
"""

CREATE_ANALYSIS_LOG = """
IF NOT EXISTS (
    SELECT * FROM sysobjects WHERE name='analysis_log' AND xtype='U'
)
CREATE TABLE analysis_log (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    session_id      NVARCHAR(50),
    medications     NVARCHAR(MAX),
    diseases        NVARCHAR(MAX),
    risk_level      NVARCHAR(20),
    severe_ddi      INT DEFAULT 0,
    moderate_ddi    INT DEFAULT 0,
    total_papers    INT DEFAULT 0,
    analyzed_at     DATETIME DEFAULT GETDATE()
);
"""

# ── Runner ───────────────────────────────────────────────────────────────────

def create_tables():
    print("Connecting to Azure SQL Database...")
    try:
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()
        print("✅ Connected\n")

        tables = {
            "interaction_cache": CREATE_INTERACTION_CACHE,
            "disease_cache":     CREATE_DISEASE_CACHE,
            "food_cache":        CREATE_FOOD_CACHE,
            "analysis_log":      CREATE_ANALYSIS_LOG,
        }

        for name, ddl in tables.items():
            print(f"Creating table: {name}...", end="")
            cursor.execute(ddl)
            conn.commit()
            print(" ✅")

        # Verify
        print("\nVerifying tables exist:")
        cursor.execute("""
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        """)
        for row in cursor.fetchall():
            print(f"   ✅ {row[0]}")

        conn.close()
        print("\n🎉 Database setup complete!")
        print("   You can now run comprehensive_checker.py and results will be cached.")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nTroubleshooting:")
        print("  1. Check your .env values are correct")
        print("  2. Ensure Azure SQL firewall allows your IP")
        print("  3. Ensure ODBC Driver 18 is installed:")
        print("     brew install msodbcsql18  (macOS)")

if __name__ == "__main__":
    create_tables()