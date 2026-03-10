"""
Azure Key Vault Integration for VabGenRx.

This module provides a unified mechanism for loading application
secrets securely from Azure Key Vault in production environments,
while maintaining compatibility with local development using
`.env` files.

Key Features
------------
• Secure secret retrieval using Azure Key Vault
• Automatic fallback to `.env` variables for local development
• Lazy initialization of the Key Vault client
• Transparent injection of secrets into os.environ

This design allows existing services to continue using
`os.getenv()` without modification, regardless of whether
the application is running locally or in Azure.

Environment Variables
---------------------
KEY_VAULT_URL
    URL of the Azure Key Vault instance.

Example
-------
secrets = load_all_secrets()
openai_key = os.getenv("AZURE_OPENAI_KEY")
"""

import os
from dotenv import load_dotenv

load_dotenv()  

_kv_client = None


def _get_kv_client():
    """Lazy-init the Key Vault client only when needed."""
    global _kv_client
    if _kv_client is not None:
        return _kv_client
    try:
        from azure.keyvault.secrets import SecretClient
        from azure.identity import DefaultAzureCredential

        vault_url = os.environ.get("KEY_VAULT_URL")
        if not vault_url:
            print("⚠️  KEY_VAULT_URL not set — using .env fallback")
            return None

        credential = DefaultAzureCredential()
        _kv_client = SecretClient(
            vault_url  = vault_url,
            credential = credential
        )
        print("✅ Connected to Azure Key Vault")
        return _kv_client
    except Exception as e:
        print(f"⚠️  Key Vault unavailable — using .env fallback: {e}")
        return None


def get_secret(secret_name: str, env_fallback: str) -> str:
    """
    Fetch a secret from Key Vault.
    Falls back to .env variable if Key Vault is unreachable.

    Args:
        secret_name:  Name in Key Vault  e.g. "AZURE-OPENAI-KEY"
        env_fallback: Name in .env file  e.g. "AZURE_OPENAI_KEY"
    """
    client = _get_kv_client()
    if client:
        try:
            secret = client.get_secret(secret_name)
            return secret.value
        except Exception as e:
            print(f"⚠️  Key Vault: could not fetch '{secret_name}': {e}")

    # Fall back to .env
    value = os.environ.get(env_fallback)
    if not value:
        print(f"❌ Secret '{env_fallback}' not found in .env either!")
    return value


def load_all_secrets() -> dict:
    """
    Load all VabGenRx secrets.
    In production  → fetches from Azure Key Vault
    Locally        → reads from .env file

    Injects everything back into os.environ so all existing
    os.getenv() calls in services continue to work unchanged.
    """
    print("\n🔐 Loading secrets from Azure Key Vault...")

    secrets = {
        # ── Azure OpenAI ──────────────────────────────────────────
        "AZURE_OPENAI_KEY":
            get_secret("AZURE-OPENAI-KEY",         "AZURE_OPENAI_KEY"),
        "AZURE_OPENAI_ENDPOINT":
            get_secret("AZURE-OPENAI-ENDPOINT",    "AZURE_OPENAI_ENDPOINT"),
        "AZURE_OPENAI_DEPLOYMENT":
            get_secret("AZURE-OPENAI-DEPLOYMENT",  "AZURE_OPENAI_DEPLOYMENT"),
        "AZURE_OPENAI_API_VERSION":
            get_secret("AZURE-OPENAI-API-VERSION", "AZURE_OPENAI_API_VERSION"),

        # ── Azure AI Project (Agent Framework) ───────────────────
        "AZURE_AI_PROJECT_ENDPOINT":
            get_secret("AZURE-AI-PROJECT-ENDPOINT",
                       "AZURE_AI_PROJECT_ENDPOINT"),
        "AZURE_AI_PROJECT_CONNECTION_STRING":
            get_secret("AZURE-AI-PROJECT-CONNECTION-STRING",
                       "AZURE_AI_PROJECT_CONNECTION_STRING"),

        # ── Azure SQL Cache DB ────────────────────────────────────
        "AZURE_SQL_SERVER":
            get_secret("AZURE-SQL-SERVER",   "AZURE_SQL_SERVER"),
        "AZURE_SQL_DATABASE":
            get_secret("AZURE-SQL-DATABASE", "AZURE_SQL_DATABASE"),
        "AZURE_SQL_USERNAME":
            get_secret("AZURE-SQL-USERNAME", "AZURE_SQL_USERNAME"),
        "AZURE_SQL_PASSWORD":
            get_secret("AZURE-SQL-PASSWORD", "AZURE_SQL_PASSWORD"),

        # ── Azure SQL Audit DB ────────────────────────────────────
        "AZURE_SQL_AUDIT_SERVER":
            get_secret("AZURE-SQL-AUDIT-SERVER",
                       "AZURE_SQL_AUDIT_SERVER"),
        "AZURE_SQL_AUDIT_DATABASE":
            get_secret("AZURE-SQL-AUDIT-DATABASE",
                       "AZURE_SQL_AUDIT_DATABASE"),
        "AZURE_SQL_AUDIT_USERNAME":
            get_secret("AZURE-SQL-AUDIT-USERNAME",
                       "AZURE_SQL_AUDIT_USERNAME"),
        "AZURE_SQL_AUDIT_PASSWORD":
            get_secret("AZURE-SQL-AUDIT-PASSWORD",
                       "AZURE_SQL_AUDIT_PASSWORD"),

        # ── External APIs ─────────────────────────────────────────
        "NCBI_API_KEY":
            get_secret("NCBI-API-KEY",   "NCBI_API_KEY"),
        "NCBI_API_KEY_2":
            get_secret("NCBI-API-KEY-2", "NCBI_API_KEY_2"),
        "NCBI_API_KEY_3":
            get_secret("NCBI-API-KEY-3", "NCBI_API_KEY_3"),
        "NCBI_API_KEY_4":
            get_secret("NCBI-API-KEY-4", "NCBI_API_KEY_4"),
        "FDA_API_KEY":
            get_secret("FDA-API-KEY",    "FDA_API_KEY"),
    }

    loaded = 0
    for key, value in secrets.items():
        if value:
            os.environ[key] = value
            loaded += 1

    print(f"✅ Secrets loaded: {loaded}/{len(secrets)}")

    if loaded < len(secrets):
        missing = [k for k, v in secrets.items() if not v]
        print(f"⚠️  Missing secrets: {missing}")

    return secrets