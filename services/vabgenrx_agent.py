'''
BEFORE COUNSELLING

"""
VabGenRx — Azure AI Agent Service
Clinical Intelligence Platform — Microsoft Agent Framework

Uses azure-ai-agents v1.1.0
Run: python services/vabgenrx_agent.py
"""

import os
import sys
import json
from typing import Dict, List

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from azure.ai.agents import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.identity import DefaultAzureCredential
from azure.core.rest import HttpRequest


# ── Tool Functions ─────────────────────────────────────────────────────────────
# IMPORTANT: Keep signatures simple — agent must match these exactly

def search_pubmed(drug1: str, drug2: str = "", disease: str = "") -> str:
    """
    Search PubMed medical research database.
    For drug-drug: provide drug1 and drug2.
    For drug-disease: provide drug1 and disease.
    For food interactions: provide only drug1.
    """
    from services.pubmed_service import PubMedService
    pubmed = PubMedService()
    if drug2:
        result = pubmed.search_drug_interaction(drug1, drug2)
    elif disease:
        result = pubmed.search_disease_contraindication(drug1, disease)
    else:
        result = pubmed.search_all_food_interactions_for_drug(drug1, max_results=5)
    return json.dumps({
        'paper_count': result.get('count', 0),
        'pmids':       result.get('pmids', [])[:5],
        'abstracts':   [a['text'][:400] for a in result.get('abstracts', [])[:2]]
    })


def search_fda_events(drug1: str, drug2: str) -> str:
    """
    Search FDA adverse event database for a drug pair.
    Requires both drug1 and drug2.
    """
    from services.fda_service import FDAService
    result = FDAService().search_adverse_events(drug1, drug2)
    return json.dumps({
        'total_reports':   result.get('total_reports', 0),
        'serious_reports': result.get('serious_reports', 0),
        'severity_ratio':  result.get('severity_ratio', 0)
    })


def get_fda_label(drug_name: str) -> str:
    """
    Get FDA official drug label for a single drug.
    Returns contraindications and warnings.
    """
    from services.fda_service import FDAService
    result = FDAService().get_drug_contraindications(drug_name)
    return json.dumps({
        'found':             result.get('found', False),
        'contraindications': result.get('contraindications', '')[:500],
        'warnings':          result.get('warnings', '')[:300],
    })


def check_cache(cache_type: str, drug1: str, drug2: str = "") -> str:
    """
    Check Azure SQL cache for a previous result.
    cache_type must be one of: drug_drug, drug_disease, food
    drug2 is the second drug (for drug_drug) or the disease name (for drug_disease).
    For food cache_type, only drug1 is needed.
    """
    from services.cache_service import AzureSQLCacheService
    cache = AzureSQLCacheService()
    if cache_type == 'drug_drug' and drug2:
        result = cache.get_drug_drug(drug1, drug2)
    elif cache_type == 'drug_disease' and drug2:
        result = cache.get_drug_disease(drug1, drug2)
    elif cache_type == 'food':
        result = cache.get_food(drug1)
    else:
        result = None
    return json.dumps({'cache_hit': result is not None, 'cached_data': result})


def save_cache(cache_type: str, drug1: str, analysis_json: str, drug2: str = "") -> str:
    """
    Save an analysis result to Azure SQL cache.
    cache_type: drug_drug, drug_disease, or food
    analysis_json: the JSON string of the analysis result
    """
    from services.cache_service import AzureSQLCacheService
    cache = AzureSQLCacheService()
    try:
        result = json.loads(analysis_json)
        if cache_type == 'drug_drug' and drug2:
            cache.save_drug_drug(drug1, drug2, result)
        elif cache_type == 'drug_disease' and drug2:
            cache.save_drug_disease(drug1, drug2, result)
        elif cache_type == 'food':
            cache.save_food(drug1, result)
        return json.dumps({'saved': True})
    except Exception as e:
        return json.dumps({'saved': False, 'error': str(e)})


# ── Agent Service ─────────────────────────────────────────────────────────────

class VabGenRxAgentService:

    def __init__(self):
        endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
        if not endpoint:
            raise ValueError("AZURE_AI_PROJECT_ENDPOINT not set in .env")

        self.client   = AgentsClient(endpoint=endpoint, credential=DefaultAzureCredential())
        self.model    = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        self.endpoint = endpoint.rstrip('/')

        print("✅ VabGenRx Agent Service initialized")
        print(f"   Endpoint: {endpoint}")
        print(f"   Model:    {self.model}")

    def _build_toolset(self) -> ToolSet:
        """Register all tools with clear names the agent can call."""
        functions = FunctionTool(functions={
            search_pubmed,
            search_fda_events,
            get_fda_label,
            check_cache,
            save_cache,
        })
        toolset = ToolSet()
        toolset.add(functions)
        return toolset

    def _get_messages(self, thread_id: str) -> list:
        """Fetch thread messages using confirmed API version 2025-05-01."""
        url = f"{self.endpoint}/threads/{thread_id}/messages?api-version=2025-05-01"
        try:
            req      = HttpRequest(method="GET", url=url)
            response = self.client.send_request(req)
            data     = response.json()
            if "data" in data:
                print(f"   ✅ Messages fetched ({len(data['data'])} found)")
                return data["data"]
            else:
                print(f"   ⚠️  Unexpected response: {list(data.keys())}")
                return []
        except Exception as e:
            print(f"   ⚠️  Failed to fetch messages: {e}")
            return []

    def analyze(self, medications: List[str],
                diseases: List[str] = None,
                foods: List[str] = None) -> Dict:

        diseases = diseases or []
        foods    = foods    or []

        print(f"\n🤖 Starting VabGenRx Agent Analysis...")
        print(f"   Medications: {', '.join(medications)}")
        if diseases:
            print(f"   Conditions:  {', '.join(diseases)}")

        toolset = self._build_toolset()

        agent = self.client.create_agent(
            model        = self.model,
            name         = "VabGenRx-Safety-Agent",
            instructions = """
You are VabGenRx, a clinical pharmacology agent. Analyze medication safety.

AVAILABLE TOOLS (use EXACTLY these names and arguments):
- check_cache(cache_type, drug1, drug2="")     ← ALWAYS call first
- search_pubmed(drug1, drug2="", disease="")   ← for evidence
- search_fda_events(drug1, drug2)              ← for adverse events
- get_fda_label(drug_name)                     ← for official label
- save_cache(cache_type, drug1, analysis_json, drug2="")  ← save new results

WORKFLOW for each drug pair (e.g. aspirin + warfarin):
1. check_cache(cache_type="drug_drug", drug1="aspirin", drug2="warfarin")
2. If cache_hit=false: search_pubmed(drug1="aspirin", drug2="warfarin")
3. If cache_hit=false: search_fda_events(drug1="aspirin", drug2="warfarin")
4. If cache_hit=false: save_cache(cache_type="drug_drug", drug1="aspirin", drug2="warfarin", analysis_json="...")

WORKFLOW for each drug+disease (e.g. aspirin + cold):
1. check_cache(cache_type="drug_disease", drug1="aspirin", drug2="cold")
2. If cache_hit=false: search_pubmed(drug1="aspirin", disease="cold")
3. If cache_hit=false: get_fda_label(drug_name="aspirin")

WORKFLOW for food interactions (e.g. warfarin food):
1. check_cache(cache_type="food", drug1="warfarin")
2. If cache_hit=false: search_pubmed(drug1="warfarin")

After all checks, return ONLY this JSON structure:
{
  "drug_drug": [
    {
      "drug1": "aspirin",
      "drug2": "warfarin",
      "severity": "severe",
      "confidence": 0.95,
      "mechanism": "...",
      "clinical_effects": "...",
      "recommendation": "...",
      "pubmed_papers": 0,
      "fda_reports": 16448,
      "from_cache": true
    }
  ],
  "drug_disease": [
    {
      "drug": "aspirin",
      "disease": "cold",
      "contraindicated": false,
      "severity": "minor",
      "confidence": 0.90,
      "clinical_evidence": "...",
      "recommendation": "...",
      "alternative_drugs": ["acetaminophen"],
      "from_cache": true
    }
  ],
  "drug_food": [
    {
      "drug": "warfarin",
      "foods_to_avoid": ["spinach", "cranberry juice"],
      "foods_to_separate": [],
      "foods_to_monitor": ["ginger"],
      "mechanism": "...",
      "from_cache": true
    }
  ],
  "risk_summary": {
    "level": "HIGH",
    "severe_count": 1,
    "moderate_count": 0,
    "contraindicated_count": 0
  }
}
""",
            toolset=toolset,
        )

        print("   🔄 Agent running (calling tools autonomously)...")

        try:
            ctx = self.client.enable_auto_function_calls(toolset)

            if ctx is not None:
                with ctx:
                    run = self.client.create_thread_and_process_run(
                        agent_id = agent.id,
                        thread   = {
                            "messages": [{
                                "role":    "user",
                                "content": (
                                    f"Analyze medication safety.\n"
                                    f"MEDICATIONS: {', '.join(medications)}\n"
                                    f"PATIENT CONDITIONS: {', '.join(diseases) if diseases else 'None'}\n"
                                    f"FOODS: {', '.join(foods) if foods else 'General food interactions'}\n"
                                    f"Follow your workflow. Return JSON only."
                                )
                            }]
                        }
                    )
            else:
                run = self.client.create_thread_and_process_run(
                    agent_id = agent.id,
                    thread   = {
                        "messages": [{
                            "role":    "user",
                            "content": (
                                f"Analyze medication safety.\n"
                                f"MEDICATIONS: {', '.join(medications)}\n"
                                f"PATIENT CONDITIONS: {', '.join(diseases) if diseases else 'None'}\n"
                                f"FOODS: {', '.join(foods) if foods else 'General food interactions'}\n"
                                f"Follow your workflow. Return JSON only."
                            )
                        }]
                    },
                    toolset = toolset
                )

            print(f"   ✅ Run status: {run.status}")
            self._last_run = run

            result = {"status": str(run.status), "raw": ""}

            if run.status == RunStatus.COMPLETED:
                messages_data = self._get_messages(run.thread_id)
                for msg in messages_data:
                    if msg.get("role") == "assistant":
                        for block in msg.get("content", []):
                            if block.get("type") == "text":
                                raw = block["text"]["value"]
                                result["raw"] = raw
                                try:
                                    start = raw.find('{')
                                    end   = raw.rfind('}') + 1
                                    if start >= 0:
                                        result["analysis"] = json.loads(raw[start:end])
                                        print("   ✅ JSON parsed successfully")
                                except Exception as e:
                                    result["parse_error"] = str(e)
                                break
                        break
            else:
                result["error"] = f"Run ended with status: {run.status}"

        finally:
            self.client.delete_agent(agent.id)

        return result


# ── CLI Test ──────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("VABGENRX — AZURE AI AGENT SERVICE TEST")
    print("=" * 60)

    try:
        service = VabGenRxAgentService()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    result = service.analyze(
        medications = ["aspirin", "warfarin"],
        diseases    = ["cold"],
        foods       = ["dairy"]
    )

    print("\n📊 AGENT RESULT:")
    if "analysis" in result:
        print(json.dumps(result["analysis"], indent=2))
    else:
        print("Raw:", result.get("raw", "No response"))
        if "error" in result:
            print("Error:", result["error"])
        if "parse_error" in result:
            print("Parse error:", result["parse_error"])


if __name__ == "__main__":
    main()
'''




"""
VabGenRx — Azure AI Agent Service
Clinical Intelligence Platform — Microsoft Agent Framework

Uses azure-ai-agents v1.1.0
Run: python services/vabgenrx_agent.py
"""

import os
import sys
import json
from typing import Dict, List

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from azure.ai.agents import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.identity import DefaultAzureCredential
from azure.core.rest import HttpRequest


# ── Tool Functions ─────────────────────────────────────────────────────────────

def search_pubmed(drug1: str, drug2: str = "", disease: str = "") -> str:
    """
    Search PubMed medical research database.
    For drug-drug: provide drug1 and drug2.
    For drug-disease: provide drug1 and disease.
    For food interactions: provide only drug1.
    """
    from services.pubmed_service import PubMedService
    pubmed = PubMedService()
    if drug2:
        result = pubmed.search_drug_interaction(drug1, drug2)
    elif disease:
        result = pubmed.search_disease_contraindication(drug1, disease)
    else:
        result = pubmed.search_all_food_interactions_for_drug(drug1, max_results=5)
    return json.dumps({
        'paper_count': result.get('count', 0),
        'pmids':       result.get('pmids', [])[:5],
        'abstracts':   [a['text'][:400] for a in result.get('abstracts', [])[:2]]
    })


def search_fda_events(drug1: str, drug2: str) -> str:
    """
    Search FDA adverse event database for a drug pair.
    Requires both drug1 and drug2.
    """
    from services.fda_service import FDAService
    result = FDAService().search_adverse_events(drug1, drug2)
    return json.dumps({
        'total_reports':   result.get('total_reports', 0),
        'serious_reports': result.get('serious_reports', 0),
        'severity_ratio':  result.get('severity_ratio', 0)
    })


def get_fda_label(drug_name: str) -> str:
    """
    Get FDA official drug label for a single drug.
    Returns contraindications and warnings.
    """
    from services.fda_service import FDAService
    result = FDAService().get_drug_contraindications(drug_name)
    return json.dumps({
        'found':             result.get('found', False),
        'contraindications': result.get('contraindications', '')[:500],
        'warnings':          result.get('warnings', '')[:300],
    })


def check_cache(cache_type: str, drug1: str, drug2: str = "") -> str:
    """
    Check Azure SQL cache for a previous result.
    cache_type must be one of: drug_drug, drug_disease, food
    drug2 is the second drug (for drug_drug) or the disease name (for drug_disease).
    For food cache_type, only drug1 is needed.
    """
    from services.cache_service import AzureSQLCacheService
    cache = AzureSQLCacheService()
    if cache_type == 'drug_drug' and drug2:
        result = cache.get_drug_drug(drug1, drug2)
    elif cache_type == 'drug_disease' and drug2:
        result = cache.get_drug_disease(drug1, drug2)
    elif cache_type == 'food':
        result = cache.get_food(drug1)
    else:
        result = None
    return json.dumps({'cache_hit': result is not None, 'cached_data': result})


def save_cache(cache_type: str, drug1: str, analysis_json: str, drug2: str = "") -> str:
    """
    Save an analysis result to Azure SQL cache.
    cache_type: drug_drug, drug_disease, or food
    analysis_json: the JSON string of the analysis result
    """
    from services.cache_service import AzureSQLCacheService
    cache = AzureSQLCacheService()
    try:
        result = json.loads(analysis_json)
        if cache_type == 'drug_drug' and drug2:
            cache.save_drug_drug(drug1, drug2, result)
        elif cache_type == 'drug_disease' and drug2:
            cache.save_drug_disease(drug1, drug2, result)
        elif cache_type == 'food':
            cache.save_food(drug1, result)
        return json.dumps({'saved': True})
    except Exception as e:
        return json.dumps({'saved': False, 'error': str(e)})


def get_drug_counseling(drug: str, age: int, sex: str,
                        dose: str = "", conditions: str = "") -> str:
    """
    Get patient-specific drug counseling points.
    Filters by patient age and sex — no irrelevant warnings.
    drug: drug name
    age: patient age as integer
    sex: male | female | other
    dose: optional dose string e.g. "10mg daily"
    conditions: comma-separated conditions e.g. "diabetes,hypertension"
    """
    from services.counselling_service import DrugCounselingService
    service    = DrugCounselingService()
    cond_list  = [c.strip() for c in conditions.split(',') if c.strip()] if conditions else []
    result     = service.get_drug_counseling(
        drug       = drug,
        age        = age,
        sex        = sex,
        dose       = dose,
        conditions = cond_list
    )
    return json.dumps(result)


def get_condition_counseling(condition: str, age: int, sex: str,
                             medications: str = "") -> str:
    """
    Get lifestyle, diet, exercise and safety counseling for a condition.
    condition: disease/condition name
    age: patient age as integer
    sex: male | female | other
    medications: comma-separated medications e.g. "warfarin,aspirin"
    """
    from services.condition_service import ConditionCounselingService
    service   = ConditionCounselingService()
    meds_list = [m.strip() for m in medications.split(',') if m.strip()] if medications else []
    result    = service.get_condition_counseling(
        condition   = condition,
        age         = age,
        sex         = sex,
        medications = meds_list
    )
    return json.dumps(result)


# ── Agent Service ─────────────────────────────────────────────────────────────

class VabGenRxAgentService:

    def __init__(self):
        endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
        if not endpoint:
            raise ValueError("AZURE_AI_PROJECT_ENDPOINT not set in .env")

        self.client   = AgentsClient(endpoint=endpoint, credential=DefaultAzureCredential())
        self.model    = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        self.endpoint = endpoint.rstrip('/')

        print("✅ VabGenRx Agent Service initialized")
        print(f"   Endpoint: {endpoint}")
        print(f"   Model:    {self.model}")
        print(f"   Tools:    search_pubmed, search_fda_events, get_fda_label,")
        print(f"             check_cache, save_cache,")
        print(f"             get_drug_counseling, get_condition_counseling")

    def _build_toolset(self) -> ToolSet:
        """Register all tools the agent can call autonomously."""
        functions = FunctionTool(functions={
            search_pubmed,
            search_fda_events,
            get_fda_label,
            check_cache,
            save_cache,
            get_drug_counseling,
            get_condition_counseling,
        })
        toolset = ToolSet()
        toolset.add(functions)
        return toolset

    def _get_messages(self, thread_id: str) -> list:
        """Fetch thread messages using confirmed API version 2025-05-01."""
        url = f"{self.endpoint}/threads/{thread_id}/messages?api-version=2025-05-01"
        try:
            req      = HttpRequest(method="GET", url=url)
            response = self.client.send_request(req)
            data     = response.json()
            if "data" in data:
                print(f"   ✅ Messages fetched ({len(data['data'])} found)")
                return data["data"]
            else:
                print(f"   ⚠️  Unexpected response: {list(data.keys())}")
                return []
        except Exception as e:
            print(f"   ⚠️  Failed to fetch messages: {e}")
            return []

    def analyze(self, medications: List[str],
                diseases:    List[str] = None,
                foods:       List[str] = None,
                age:         int = 45,
                sex:         str = "unknown",
                dose_map:    Dict[str, str] = None) -> Dict:
        """
        Run the VabGenRx agent to analyze a complete prescription
        including drug counseling and condition counseling.
        """
        diseases = diseases or []
        foods    = foods    or []
        dose_map = dose_map or {}

        print(f"\n🤖 Starting VabGenRx Agent Analysis...")
        print(f"   Medications: {', '.join(medications)}")
        if diseases:
            print(f"   Conditions:  {', '.join(diseases)}")
        if age and sex != "unknown":
            print(f"   Patient:     {age}yo {sex}")

        toolset = self._build_toolset()

        agent = self.client.create_agent(
            model        = self.model,
            name         = "VabGenRx-Safety-Agent",
            instructions = f"""
You are VabGenRx, a clinical pharmacology agent. Analyze medication safety
AND generate patient counseling.

PATIENT CONTEXT:
- Age: {age}
- Sex: {sex}
- Dose map: {json.dumps(dose_map)}

AVAILABLE TOOLS:
- check_cache(cache_type, drug1, drug2="")
- search_pubmed(drug1, drug2="", disease="")
- search_fda_events(drug1, drug2)
- get_fda_label(drug_name)
- save_cache(cache_type, drug1, analysis_json, drug2="")
- get_drug_counseling(drug, age, sex, dose="", conditions="")
- get_condition_counseling(condition, age, sex, medications="")

WORKFLOW:

PART 1 — Drug-Drug, Drug-Disease, Drug-Food:
1. For every drug pair: check_cache first → if miss: search evidence → save_cache
2. For every drug+disease: check_cache first → if miss: search evidence → save_cache
3. For every drug food: check_cache first → if miss: search_pubmed → save_cache

PART 2 — Counseling (use patient age={age}, sex={sex}):
4. For every drug: get_drug_counseling(drug=drug, age={age}, sex="{sex}", dose=dose, conditions="comma-separated conditions")
5. For every condition: get_condition_counseling(condition=condition, age={age}, sex="{sex}", medications="comma-separated meds")

SEVERITY: SEVERE | MODERATE | MINOR
CONFIDENCE: 0.65-0.98

Return ONLY valid JSON:
{{
  "drug_drug": [
    {{
      "drug1": "...", "drug2": "...",
      "severity": "severe/moderate/minor",
      "confidence": 0.00,
      "mechanism": "...",
      "clinical_effects": "...",
      "recommendation": "...",
      "pubmed_papers": 0,
      "fda_reports": 0,
      "from_cache": true
    }}
  ],
  "drug_disease": [
    {{
      "drug": "...", "disease": "...",
      "contraindicated": false,
      "severity": "...",
      "confidence": 0.00,
      "clinical_evidence": "...",
      "recommendation": "...",
      "alternative_drugs": [],
      "from_cache": true
    }}
  ],
  "drug_food": [
    {{
      "drug": "...",
      "foods_to_avoid": [],
      "foods_to_separate": [],
      "foods_to_monitor": [],
      "mechanism": "...",
      "from_cache": true
    }}
  ],
  "drug_counseling": [
    {{
      "drug": "...",
      "counseling_points": [
        {{
          "title": "...",
          "detail": "...",
          "severity": "high|medium|low",
          "category": "..."
        }}
      ],
      "key_monitoring": "...",
      "patient_summary": "..."
    }}
  ],
  "condition_counseling": [
    {{
      "condition": "...",
      "exercise":  [{{"title": "...", "detail": "...", "frequency": "..."}}],
      "lifestyle": [{{"title": "...", "detail": "..."}}],
      "diet":      [{{"title": "...", "detail": "...", "foods_to_include": [], "foods_to_avoid": []}}],
      "safety":    [{{"title": "...", "detail": "...", "urgency": "high|medium|low"}}],
      "monitoring": "...",
      "follow_up": "..."
    }}
  ],
  "risk_summary": {{
    "level": "HIGH/MODERATE/LOW",
    "severe_count": 0,
    "moderate_count": 0,
    "contraindicated_count": 0
  }}
}}
""",
            toolset=toolset,
        )

        print("   🔄 Agent running (calling tools autonomously)...")

        try:
            ctx = self.client.enable_auto_function_calls(toolset)

            content = (
                f"Analyze this prescription:\n"
                f"MEDICATIONS: {', '.join(medications)}\n"
                f"CONDITIONS:  {', '.join(diseases) if diseases else 'None'}\n"
                f"FOODS:       {', '.join(foods) if foods else 'General'}\n"
                f"PATIENT:     {age}yo {sex}\n"
                f"DOSES:       {json.dumps(dose_map) if dose_map else 'standard'}\n\n"
                f"Run BOTH parts: safety analysis AND counseling. Return JSON only."
            )

            if ctx is not None:
                with ctx:
                    run = self.client.create_thread_and_process_run(
                        agent_id = agent.id,
                        thread   = {"messages": [{"role": "user", "content": content}]}
                    )
            else:
                run = self.client.create_thread_and_process_run(
                    agent_id = agent.id,
                    thread   = {"messages": [{"role": "user", "content": content}]},
                    toolset  = toolset
                )

            print(f"   ✅ Run status: {run.status}")
            self._last_run = run

            result = {"status": str(run.status), "raw": ""}

            if run.status == RunStatus.COMPLETED:
                messages_data = self._get_messages(run.thread_id)
                for msg in messages_data:
                    if msg.get("role") == "assistant":
                        for block in msg.get("content", []):
                            if block.get("type") == "text":
                                raw = block["text"]["value"]
                                result["raw"] = raw
                                try:
                                    start = raw.find('{')
                                    end   = raw.rfind('}') + 1
                                    if start >= 0:
                                        result["analysis"] = json.loads(raw[start:end])
                                        print("   ✅ JSON parsed successfully")
                                except Exception as e:
                                    result["parse_error"] = str(e)
                                break
                        break
            else:
                result["error"] = f"Run ended with status: {run.status}"

        finally:
            self.client.delete_agent(agent.id)

        return result


# ── CLI Test ──────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("VABGENRX — AZURE AI AGENT SERVICE TEST")
    print("=" * 60)

    try:
        service = VabGenRxAgentService()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    result = service.analyze(
        medications = ["warfarin", "aspirin"],
        diseases    = ["diabetes", "hypertension"],
        foods       = ["dairy"],
        age         = 68,
        sex         = "male",
        dose_map    = {"warfarin": "10mg daily", "aspirin": "81mg daily"}
    )

    print("\n📊 AGENT RESULT:")
    if "analysis" in result:
        print(json.dumps(result["analysis"], indent=2))
    else:
        print("Raw:", result.get("raw", "No response"))
        if "error" in result:
            print("Error:", result["error"])
        if "parse_error" in result:
            print("Parse error:", result["parse_error"])


if __name__ == "__main__":
    main()