"""
Shared OpenAI client factory for VabGenRx.

Centralizes API key/model configuration so every service that calls
the LLM does so through one client instance instead of each
constructing its own (previously: six separate AzureOpenAI(...)
constructions duplicated across services).
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

_client = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client
