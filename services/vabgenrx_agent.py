'''
"""
VabGenRx — Multi-Agent Clinical Intelligence Platform
Microsoft Agent Framework — azure-ai-agents v1.1.0

Architecture:
  VabGenRxSafetyAgent    — Drug-Drug + Drug-Food interactions
  VabGenRxDiseaseAgent   — Drug-Disease contraindications
  VabGenRxCounselingAgent — Patient counseling + FDA dosing
  VabGenRxOrchestrator   — Coordinates all three agents, merges results

Run: python services/vabgenrx_agent.py
"""

import os
import sys
import json
import itertools
from typing import Dict, List

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from azure.ai.agents import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.identity import DefaultAzureCredential
from azure.core.rest import HttpRequest

# ── Module-level service instances (created once, reused on every tool call) ──
_drug_counseling_service      = None
_condition_counseling_service = None
_dosing_service               = None

# ── Module-level result collectors ────────────────────────────────────────────
# Store full tool results here so agent truncation doesn't lose data
_dosing_results               = {}
_drug_counseling_results      = {}
_condition_counseling_results = {}


def _get_drug_counseling_service():
    global _drug_counseling_service
    if _drug_counseling_service is None:
        from services.counselling_service import DrugCounselingService
        _drug_counseling_service = DrugCounselingService()
    return _drug_counseling_service


def _get_condition_counseling_service():
    global _condition_counseling_service
    if _condition_counseling_service is None:
        from services.condition_service import ConditionCounselingService
        _condition_counseling_service = ConditionCounselingService()
    return _condition_counseling_service


def _get_dosing_service():
    global _dosing_service
    if _dosing_service is None:
        from services.dosing_service import DosingService
        _dosing_service = DosingService()
    return _dosing_service


# ── Shared Tool Functions ──────────────────────────────────────────────────────
# All three agents share the same toolset — each agent only uses
# the tools relevant to its role (enforced via instructions).

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
    ONLY use for drug-drug pairs — never for drug-disease.
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
    cache_type: drug_drug | drug_disease | food
    drug2: second drug (drug_drug) or disease name (drug_disease).
    For food, only drug1 is needed.
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
    cache_type: drug_drug | drug_disease | food
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
                        dose: str = "",
                        conditions: str = "",
                        patient_profile_json: str = "{}") -> str:
    """
    Get patient-specific drug counseling points.
    Filters by age, sex, and confirmed habits — no irrelevant warnings.
    """
    service   = _get_drug_counseling_service()
    cond_list = [c.strip() for c in conditions.split(',') if c.strip()] if conditions else []

    try:
        patient_profile = json.loads(patient_profile_json)
    except Exception:
        patient_profile = {}

    print(f"   🧪 Drug counseling profile for {drug}: {patient_profile}")
    if not patient_profile:
        print(f"   ⚠️  Warning: empty patient_profile for {drug} "
              f"— habit-based filtering will be skipped")

    result = service.get_drug_counseling(
        drug            = drug,
        age             = age,
        sex             = sex,
        dose            = dose,
        conditions      = cond_list,
        patient_profile = patient_profile
    )
    _drug_counseling_results[drug.lower()] = result
    return json.dumps(result)


def get_condition_counseling(condition: str, age: int, sex: str,
                             medications: str = "",
                             patient_profile_json: str = "{}") -> str:
    """
    Get lifestyle, diet, exercise and safety counseling for a condition.
    Only counsels on confirmed patient habits — never assumes.
    """
    service   = _get_condition_counseling_service()
    meds_list = [m.strip() for m in medications.split(',') if m.strip()] if medications else []

    try:
        patient_profile = json.loads(patient_profile_json)
    except Exception:
        patient_profile = {}

    print(f"   🧪 Condition counseling profile for {condition}: {patient_profile}")

    result = service.get_condition_counseling(
        condition       = condition,
        age             = age,
        sex             = sex,
        medications     = meds_list,
        patient_profile = patient_profile
    )
    _condition_counseling_results[condition.lower()] = result
    return json.dumps(result)


def get_dosing_recommendation(drug: str, age: int, sex: str,
                              current_dose: str = "",
                              conditions: str = "",
                              patient_data_json: str = "{}") -> str:
    """
    Get FDA label-based dosing recommendation for a specific patient.
    Always runs fresh — no cache — since patient labs change frequently.
    """
    service = _get_dosing_service()

    try:
        patient_data = json.loads(patient_data_json)
    except Exception:
        patient_data = {}

    patient_data['age']          = age
    patient_data['sex']          = sex
    patient_data['current_dose'] = current_dose
    patient_data['current_drug'] = drug
    patient_data['conditions']   = [
        c.strip() for c in conditions.split(',') if c.strip()
    ] if conditions else []

    result = service.get_dosing_recommendation(
        drug         = drug,
        patient_data = patient_data
    )
    _dosing_results[drug.lower()] = result
    return json.dumps(result)


# ── Base Agent ────────────────────────────────────────────────────────────────

class _BaseAgent:
    """
    Shared infrastructure for all VabGenRx specialist agents.
    Handles agent creation, run execution, message fetching, and cleanup.
    Each specialist agent inherits this and only defines its own
    instructions and run content.
    """

    def __init__(self, client: AgentsClient, model: str, endpoint: str):
        self.client   = client
        self.model    = model
        self.endpoint = endpoint

    def _build_toolset(self) -> ToolSet:
        functions = FunctionTool(functions={
            search_pubmed,
            search_fda_events,
            get_fda_label,
            check_cache,
            save_cache,
            get_drug_counseling,
            get_condition_counseling,
            get_dosing_recommendation,
        })
        toolset = ToolSet()
        toolset.add(functions)
        return toolset

    def _run(self, name: str, instructions: str,
             content: str, toolset: ToolSet) -> Dict:
        """
        Create an agent, run it, parse the JSON response, delete the agent.
        Returns parsed dict or empty dict on failure.
        """
        agent = self.client.create_agent(
            model        = self.model,
            name         = name,
            instructions = instructions,
            toolset      = toolset,
        )
        try:
            ctx = self.client.enable_auto_function_calls(toolset)
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

            print(f"   ✅ {name} status: {run.status}")

            if run.status == RunStatus.COMPLETED:
                messages_data = self._get_messages(run.thread_id)
                for msg in messages_data:
                    if msg.get("role") == "assistant":
                        for block in msg.get("content", []):
                            if block.get("type") == "text":
                                raw = block["text"]["value"]
                                try:
                                    start = raw.find('{')
                                    end   = raw.rfind('}') + 1
                                    if start >= 0:
                                        return json.loads(raw[start:end])
                                except Exception as e:
                                    print(f"   ⚠️  {name} JSON parse error: {e}")
                                    return {}
            else:
                print(f"   ❌ {name} run failed: {run.status}")
                return {}

        finally:
            self.client.delete_agent(agent.id)

        return {}

    def _get_messages(self, thread_id: str) -> list:
        url = f"{self.endpoint}/threads/{thread_id}/messages?api-version=2025-05-01"
        try:
            req      = HttpRequest(method="GET", url=url)
            response = self.client.send_request(req)
            data     = response.json()
            if "data" in data:
                return data["data"]
            return []
        except Exception as e:
            print(f"   ⚠️  Failed to fetch messages: {e}")
            return []


# ── Specialist Agent 1 — Safety (Drug-Drug + Drug-Food) ───────────────────────

class VabGenRxSafetyAgent(_BaseAgent):
    """
    Specialist agent for drug-drug interactions and drug-food interactions.
    Searches PubMed + FDA adverse events for every drug pair.
    Checks and saves Azure SQL cache.
    Does NOT handle drug-disease — that is VabGenRxDiseaseAgent's role.
    """

    def analyze(self, medications: List[str], n_ddi_pairs: int,
                meds_str: str, toolset: ToolSet) -> Dict:

        print(f"\n   🔬 VabGenRxSafetyAgent: Drug-Drug + Food "
              f"({n_ddi_pairs} pairs, {len(medications)} food checks)...")

        instructions = f"""
You are VabGenRxSafetyAgent, a clinical pharmacology safety specialist.
Analyze ONLY drug-drug interactions and drug-food interactions.
Do NOT analyze drug-disease — that is handled by a separate agent.

MEDICATIONS: {meds_str}

AVAILABLE TOOLS:
- check_cache(cache_type, drug1, drug2="")
- search_pubmed(drug1, drug2="", disease="")
- search_fda_events(drug1, drug2)
- get_fda_label(drug_name)
- save_cache(cache_type, drug1, analysis_json, drug2="")

DRUG-DRUG — ALL STEPS MANDATORY for every unique pair:
Step 1: check_cache(cache_type="drug_drug", drug1=..., drug2=...)
Step 2: ALWAYS call search_pubmed(drug1=..., drug2=...)
Step 3: ALWAYS call search_fda_events(drug1=..., drug2=...)
        ⚠️ search_fda_events takes ONLY drug1 and drug2 — NEVER pass disease
Step 4: If cache_hit=false: synthesize result from evidence
Step 5: If cache_hit=false: save_cache(cache_type="drug_drug", ...)

CONFIDENCE — NEVER set 0.0:
- FDA > 1000 → 0.90–0.98 | FDA 100–1000 → 0.80–0.90
- FDA 10–100 → 0.70–0.85 | No data → get_fda_label() then 0.65–0.75

DRUG-FOOD — for every drug in [{meds_str}]:
Step 1: check_cache(cache_type="food", drug1=drug)
Step 2: If miss: search_pubmed(drug1=drug)
Step 3: If miss: save_cache(cache_type="food", ...)

Expected: {n_ddi_pairs} drug-drug results, {len(medications)} food results.

Return ONLY valid JSON:
{{
  "drug_drug": [
    {{
      "drug1":"...","drug2":"...",
      "severity":"severe|moderate|minor","confidence":0.00,
      "evidence_tier_info":{{}},
      "mechanism":"...","clinical_effects":"...","recommendation":"...",
      "pubmed_papers":0,"fda_reports":0,"from_cache":true
    }}
  ],
  "drug_food": [
    {{
      "drug":"...","foods_to_avoid":[],"foods_to_separate":[],
      "foods_to_monitor":[],"mechanism":"...","from_cache":true
    }}
  ]
}}
"""

        content = (
            f"Analyze drug-drug and food interactions:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"Expected: {n_ddi_pairs} drug-drug pairs, {len(medications)} food checks.\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxSafetyAgent", instructions, content, toolset)


# ── Specialist Agent 2 — Disease (Drug-Disease Contraindications) ─────────────

class VabGenRxDiseaseAgent(_BaseAgent):
    """
    Specialist agent for drug-disease contraindications.
    Gets its own Azure agent step budget — ensures ALL drug-disease
    pairs are checked without competing with safety or counseling work.
    Does NOT call search_fda_events (only works for drug pairs).
    """

    def analyze(self, medications: List[str], diseases: List[str],
                n_dd_pairs: int, meds_str: str, diseases_str: str,
                dd_pairs_str: str, toolset: ToolSet) -> Dict:

        print(f"\n   🔬 VabGenRxDiseaseAgent: Drug-Disease "
              f"({n_dd_pairs} pairs: {dd_pairs_str})...")

        instructions = f"""
You are VabGenRxDiseaseAgent, a clinical pharmacology disease contraindication specialist.
Analyze ONLY drug-disease contraindications — nothing else.

MEDICATIONS: {meds_str}
CONDITIONS:  {diseases_str}

AVAILABLE TOOLS:
- check_cache(cache_type, drug1, drug2="")
- search_pubmed(drug1, drug2="", disease="")
- get_fda_label(drug_name)
- save_cache(cache_type, drug1, analysis_json, drug2="")

⚠️ Do NOT call search_fda_events — it does not work for drug-disease.

ALL {n_dd_pairs} PAIRS ARE MANDATORY: {dd_pairs_str}

For EACH pair:
Step 1: check_cache(cache_type="drug_disease", drug1=<drug>, drug2=<condition>)
Step 2: If miss: search_pubmed(drug1=<drug>, disease=<condition>)
Step 3: If miss: get_fda_label(drug_name=<drug>)
Step 4: If miss: save_cache(cache_type="drug_disease", drug1=<drug>,
                             drug2=<condition>, analysis_json=...)

VERIFY before returning: drug_disease array must have {n_dd_pairs} items.
If any pair is missing — call the tools for it before returning.

Return ONLY valid JSON:
{{
  "drug_disease": [
    {{
      "drug":"...","disease":"...",
      "contraindicated":false,
      "severity":"severe|moderate|minor","confidence":0.00,
      "evidence_tier_info":{{}},
      "clinical_evidence":"...","recommendation":"...",
      "alternative_drugs":[],"from_cache":true
    }}
  ]
}}
"""

        content = (
            f"Check ALL drug-disease contraindications:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {diseases_str}\n"
            f"ALL {n_dd_pairs} pairs required: {dd_pairs_str}\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxDiseaseAgent", instructions, content, toolset)


# ── Specialist Agent 3 — Counseling + Dosing ─────────────────────────────────

class VabGenRxCounselingAgent(_BaseAgent):
    """
    Specialist agent for patient-specific counseling and FDA-based dosing.
    Calls get_drug_counseling, get_condition_counseling, get_dosing_recommendation.
    Results are also captured in module-level collectors as a safety net
    against agent truncation.
    """

    def analyze(self, medications: List[str], diseases: List[str],
                age: int, sex: str, dose_map: Dict,
                patient_profile_json: str, patient_data_json: str,
                n_meds: int, n_diseases: int,
                meds_str: str, diseases_str: str,
                toolset: ToolSet) -> Dict:

        print(f"\n   💊 VabGenRxCounselingAgent: Counseling + Dosing "
              f"({n_meds} drugs, {n_diseases} conditions)...")

        instructions = f"""
You are VabGenRxCounselingAgent, a clinical counseling and dosing specialist.
Generate patient-specific counseling and dosing recommendations.

PATIENT CONTEXT:
- Age: {age} | Sex: {sex}
- Dose map: {json.dumps(dose_map)}
- Patient profile (confirmed habits): {patient_profile_json}
- Patient labs: {patient_data_json}

AVAILABLE TOOLS:
- get_drug_counseling(drug, age, sex, dose="", conditions="", patient_profile_json="{{}}")
- get_condition_counseling(condition, age, sex, medications="", patient_profile_json="{{}}")
- get_dosing_recommendation(drug, age, sex, current_dose="", conditions="", patient_data_json="{{}}")

DRUG COUNSELING — {n_meds} calls required: {meds_str}
For each drug:
  get_drug_counseling(
    drug=<drug>, age={age}, sex="{sex}",
    dose=<from dose map>,
    conditions="{diseases_str}",
    patient_profile_json='{patient_profile_json}'
  )

CONDITION COUNSELING — {n_diseases} calls required: {diseases_str}
For each condition:
  get_condition_counseling(
    condition=<condition>, age={age}, sex="{sex}",
    medications="{meds_str}",
    patient_profile_json='{patient_profile_json}'
  )

DOSING — {n_meds} calls required: {meds_str}
For each drug:
  get_dosing_recommendation(
    drug=<drug>, age={age}, sex="{sex}",
    current_dose=<from dose map>,
    conditions="{diseases_str}",
    patient_data_json='{patient_data_json}'
  )

CRITICAL:
- Pass patient_profile_json EXACTLY as shown — never pass {{}} empty
- Pass patient_data_json EXACTLY as shown — never pass {{}} empty
- Look up each drug's dose from dose map — pass exact value
- If drug not in dose map, pass current_dose="" (empty string)

Return ONLY valid JSON:
{{
  "drug_counseling": [
    {{
      "drug":"...","patient_context":"...",
      "counseling_points":[{{"title":"...","detail":"...","severity":"...","category":"..."}}],
      "key_monitoring":"...","patient_summary":"...","from_cache":true
    }}
  ],
  "condition_counseling": [
    {{
      "condition":"...","patient_context":"...",
      "exercise":[{{"title":"...","detail":"...","frequency":"..."}}],
      "lifestyle":[{{"title":"...","detail":"..."}}],
      "diet":[{{"title":"...","detail":"...","nutrients_to_increase":[],"nutrients_to_reduce":[]}}],
      "safety":[{{"title":"...","detail":"...","urgency":"high|medium|low"}}],
      "monitoring":"...","follow_up":"...","from_cache":true
    }}
  ],
  "dosing_recommendations": [
    {{
      "drug":"...","current_dose":"...","recommended_dose":"...",
      "adjustment_required":true,
      "adjustment_type":"renal|hepatic|age|weight|pregnancy|drug_level|none",
      "urgency":"high|medium|low",
      "adjustment_reason":"...","hold_threshold":"...",
      "monitoring_required":"...","fda_label_basis":"...",
      "evidence_tier":"...","evidence_confidence":"...",
      "patient_flags_used":[],"clinical_note":"...","from_cache":false
    }}
  ]
}}
"""

        content = (
            f"Generate counseling and dosing:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {diseases_str}\n"
            f"PATIENT:     {age}yo {sex}\n"
            f"DOSES:       {json.dumps(dose_map)}\n"
            f"PROFILE:     {patient_profile_json}\n"
            f"LABS:        {patient_data_json}\n\n"
            f"REQUIRED: {n_meds} drug counseling ({meds_str}), "
            f"{n_diseases} condition counseling ({diseases_str}), "
            f"{n_meds} dosing ({meds_str}).\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxCounselingAgent", instructions, content, toolset)


# ── Orchestrator ──────────────────────────────────────────────────────────────

class VabGenRxOrchestrator:
    """
    Coordinates the three VabGenRx specialist agents and merges their results.

    Execution order:
      1. VabGenRxSafetyAgent    — Drug-Drug + Drug-Food
      2. VabGenRxDiseaseAgent   — Drug-Disease contraindications
      3. VabGenRxCounselingAgent — Patient counseling + FDA dosing

    Each agent runs sequentially with its own Azure agent instance and
    dedicated step budget. Results are merged into a single output dict.
    """

    def __init__(self):
        endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
        if not endpoint:
            raise ValueError("AZURE_AI_PROJECT_ENDPOINT not set in .env")

        self.client   = AgentsClient(endpoint=endpoint, credential=DefaultAzureCredential())
        self.model    = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        self.endpoint = endpoint.rstrip('/')

        # Instantiate all three specialist agents with shared client
        self.safety_agent    = VabGenRxSafetyAgent(self.client, self.model, self.endpoint)
        self.disease_agent   = VabGenRxDiseaseAgent(self.client, self.model, self.endpoint)
        self.counseling_agent = VabGenRxCounselingAgent(self.client, self.model, self.endpoint)

        print("✅ VabGenRx Multi-Agent System initialized")
        print(f"   Endpoint  : {endpoint}")
        print(f"   Model     : {self.model}")
        print(f"   Agents    : VabGenRxSafetyAgent | VabGenRxDiseaseAgent | VabGenRxCounselingAgent")
        print(f"   Orchestrator: VabGenRxOrchestrator")

    def analyze(self,
                medications:     List[str],
                diseases:        List[str] = None,
                foods:           List[str] = None,
                age:             int = 45,
                sex:             str = "unknown",
                dose_map:        Dict[str, str] = None,
                patient_profile: Dict = None,
                patient_data:    Dict = None) -> Dict:
        """
        Orchestrate all three specialist agents and return merged results.

        patient_profile — confirmed lifestyle habits:
        {
            "drinks_alcohol": True/False,
            "smokes": True/False,
            "sedentary": True/False,
            "has_mobility_issues": True/False,
            "has_joint_pain": True/False,
            "is_pregnant": True/False,
            "has_kidney_disease": True/False,
            "has_liver_disease": True/False
        }

        patient_data — labs and investigations for dosing:
        {
            "weight_kg": 72, "height_cm": 168, "bmi": 25.5,
            "egfr": 38, "sodium": 128, "potassium": 5.6,
            "bilirubin": 2.1, "tsh": 7.8, "pulse": 92,
            "other_investigations": {"eGFR_trend": "declining"}
        }
        """
        diseases        = diseases        or []
        foods           = foods           or []
        dose_map        = dose_map        or {}
        patient_profile = patient_profile or {}
        patient_data    = patient_data    or {}

        patient_profile_json = json.dumps(patient_profile)
        patient_data_json    = json.dumps(patient_data)

        # Pre-compute counts used across all three agents
        n_meds       = len(medications)
        n_diseases   = len(diseases)
        n_ddi_pairs  = len(list(itertools.combinations(medications, 2)))
        n_dd_pairs   = n_meds * n_diseases
        meds_str     = ', '.join(medications)
        diseases_str = ', '.join(diseases) if diseases else 'None'

        # Explicit list of all drug-disease pairs so disease agent can't miss any
        dd_pairs_str = ', '.join(
            f"{drug}+{disease}"
            for drug in medications
            for disease in diseases
        )

        print(f"\n🤖 VabGenRx Orchestrator — Starting Analysis...")
        print(f"   Medications : {meds_str}")
        print(f"   Conditions  : {diseases_str}")
        print(f"   Patient     : {age}yo {sex}")
        print(f"   Profile     : {patient_profile_json}")
        print(f"   Labs        : eGFR={patient_data.get('egfr','?')}  "
              f"K+={patient_data.get('potassium','?')}  "
              f"TSH={patient_data.get('tsh','?')}")

        # Clear module-level collectors for this run
        global _dosing_results, _drug_counseling_results, _condition_counseling_results
        _dosing_results               = {}
        _drug_counseling_results      = {}
        _condition_counseling_results = {}

        # Build one shared toolset — all agents use the same tool registry
        toolset = self.safety_agent._build_toolset()

        # ── Agent 1: Safety ───────────────────────────────────────────────────
        safety_result = self.safety_agent.analyze(
            medications  = medications,
            n_ddi_pairs  = n_ddi_pairs,
            meds_str     = meds_str,
            toolset      = toolset
        )

        # ── Agent 2: Disease ──────────────────────────────────────────────────
        disease_result = self.disease_agent.analyze(
            medications  = medications,
            diseases     = diseases,
            n_dd_pairs   = n_dd_pairs,
            meds_str     = meds_str,
            diseases_str = diseases_str,
            dd_pairs_str = dd_pairs_str,
            toolset      = toolset
        )

        # ── Agent 3: Counseling ───────────────────────────────────────────────
        counseling_result = self.counseling_agent.analyze(
            medications          = medications,
            diseases             = diseases,
            age                  = age,
            sex                  = sex,
            dose_map             = dose_map,
            patient_profile_json = patient_profile_json,
            patient_data_json    = patient_data_json,
            n_meds               = n_meds,
            n_diseases           = n_diseases,
            meds_str             = meds_str,
            diseases_str         = diseases_str,
            toolset              = toolset
        )

        # ── Merge — combine all three results ─────────────────────────────────
        print(f"\n   🔀 Orchestrator merging results from all 3 agents...")

        all_ddi      = safety_result.get("drug_drug", [])
        all_dd       = disease_result.get("drug_disease", [])
        severe_count = sum(1 for r in all_ddi if r.get("severity") == "severe")
        mod_count    = sum(1 for r in all_ddi if r.get("severity") == "moderate")
        contra_count = sum(1 for r in all_dd  if r.get("contraindicated"))

        final = {
            "drug_drug":              all_ddi,
            "drug_disease":           all_dd,
            "drug_food":              safety_result.get("drug_food", []),
            "drug_counseling":        [],
            "condition_counseling":   [],
            "dosing_recommendations": [],
            "risk_summary": {
                "level": (
                    "HIGH"     if severe_count > 0 or contra_count > 0 else
                    "MODERATE" if mod_count > 0 else
                    "LOW"
                ),
                "severe_count":                severe_count,
                "moderate_count":              mod_count,
                "contraindicated_count":       contra_count,
                "dosing_adjustments_required": 0
            }
        }

        # Drug counseling — prefer full collected results over agent-assembled
        final["drug_counseling"] = (
            [_drug_counseling_results[d.lower()]
             for d in medications if d.lower() in _drug_counseling_results]
            if _drug_counseling_results
            else counseling_result.get("drug_counseling", [])
        )

        # Condition counseling — prefer full collected results
        final["condition_counseling"] = (
            [_condition_counseling_results[d.lower()]
             for d in diseases if d.lower() in _condition_counseling_results]
            if _condition_counseling_results
            else counseling_result.get("condition_counseling", [])
        )

        # Dosing — prefer full collected results (all FDA fields intact)
        final["dosing_recommendations"] = (
            [_dosing_results[d.lower()]
             for d in medications if d.lower() in _dosing_results]
            if _dosing_results
            else counseling_result.get("dosing_recommendations", [])
        )

        # Update dosing adjustment count in risk summary
        dosing_adjustments = sum(
            1 for r in final["dosing_recommendations"]
            if r.get("adjustment_required")
        )
        final["risk_summary"]["dosing_adjustments_required"] = dosing_adjustments

        print(f"\n   📊 Orchestrator — Final output counts:")
        print(f"      drug_drug:             {len(final['drug_drug'])}")
        print(f"      drug_disease:          {len(final['drug_disease'])} / {n_dd_pairs} expected")
        print(f"      drug_food:             {len(final['drug_food'])}")
        print(f"      drug_counseling:       {len(final['drug_counseling'])} / {n_meds} expected")
        print(f"      condition_counseling:  {len(final['condition_counseling'])} / {n_diseases} expected")
        print(f"      dosing_recommendations:{len(final['dosing_recommendations'])} / {n_meds} expected")
        print(f"      dosing_adjustments:    {dosing_adjustments}")
        print(f"      risk_level:            {final['risk_summary']['level']}")

        return {"status": "completed", "analysis": final}


# ── Backward Compatibility Alias ──────────────────────────────────────────────
# If any other file in the project imports VabGenRxAgentService,
# it will still work without any changes.
VabGenRxAgentService = VabGenRxOrchestrator


# ── CLI Test ──────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("VABGENRX — MULTI-AGENT SYSTEM TEST")
    print("=" * 60)

    try:
        orchestrator = VabGenRxOrchestrator()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    result = orchestrator.analyze(
        medications = ["azacitidine", "tacrolimus", "beclomethasone"],
        diseases    = ["cancer", "multiple myeloma"],
        age         = 32,
        sex         = "male",
        dose_map    = {
            "azacitidine": "100mg od",
            "tacrolimus":  "0.5mg bd",
            "beclomethasone": "40mcg"
        },
        patient_profile = {
            "drinks_alcohol":     True,
            "smokes":             True,
            "has_kidney_disease": True,
            "has_liver_disease":  False,
            "sedentary":          True
        },
        patient_data = {
            "weight_kg":  80,
            "height_cm":  170,
            "bmi":        27.7,
            "egfr":       38,
            "sodium":     140,
            "potassium":  4.9,
            "bilirubin":  0.9,
            "tsh":        2.0,
            "pulse":      110,
            "other_investigations": {
                "CXR":          "infiltrates",
                "presentation": "acute exacerbation"
            }
        }
    )

    print("\n📊 ORCHESTRATOR RESULT:")
    if "analysis" in result:
        print(json.dumps(result["analysis"], indent=2))
    else:
        print("Error:", result.get("error", "No response"))


if __name__ == "__main__":
    main()'''




"""
VabGenRx — Multi-Agent Clinical Intelligence Platform
Microsoft Agent Framework — azure-ai-agents v1.1.0

Architecture:
  VabGenRxSafetyAgent    — Drug-Drug + Drug-Food interactions
  VabGenRxDiseaseAgent   — Drug-Disease contraindications
  VabGenRxCounselingAgent — Patient counseling + FDA dosing
  VabGenRxOrchestrator   — Coordinates all three agents, merges results

Run: python services/vabgenrx_agent.py
"""

import os
import sys
import json
import itertools
from typing import Dict, List
from concurrent.futures import ThreadPoolExecutor, as_completed

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from azure.ai.agents import AgentsClient
from azure.ai.agents.models import FunctionTool, ToolSet, RunStatus
from azure.identity import DefaultAzureCredential
from azure.core.rest import HttpRequest

# ── Module-level service instances (created once, reused on every tool call) ──
_drug_counseling_service      = None
_condition_counseling_service = None
_dosing_service               = None

# ── Module-level result collectors ────────────────────────────────────────────
# Store full tool results here so agent truncation doesn't lose data
_dosing_results               = {}
_drug_counseling_results      = {}
_condition_counseling_results = {}


def _get_drug_counseling_service():
    global _drug_counseling_service
    if _drug_counseling_service is None:
        from services.counselling_service import DrugCounselingService
        _drug_counseling_service = DrugCounselingService()
    return _drug_counseling_service


def _get_condition_counseling_service():
    global _condition_counseling_service
    if _condition_counseling_service is None:
        from services.condition_service import ConditionCounselingService
        _condition_counseling_service = ConditionCounselingService()
    return _condition_counseling_service


def _get_dosing_service():
    global _dosing_service
    if _dosing_service is None:
        from services.dosing_service import DosingService
        _dosing_service = DosingService()
    return _dosing_service


# ── Shared Tool Functions ──────────────────────────────────────────────────────
# All three agents share the same toolset — each agent only uses
# the tools relevant to its role (enforced via instructions).

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
    ONLY use for drug-drug pairs — never for drug-disease.
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
    cache_type: drug_drug | drug_disease | food
    drug2: second drug (drug_drug) or disease name (drug_disease).
    For food, only drug1 is needed.
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
    cache_type: drug_drug | drug_disease | food
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
                        dose: str = "",
                        conditions: str = "",
                        patient_profile_json: str = "{}") -> str:
    """
    Get patient-specific drug counseling points.
    Filters by age, sex, and confirmed habits — no irrelevant warnings.
    """
    service   = _get_drug_counseling_service()
    cond_list = [c.strip() for c in conditions.split(',') if c.strip()] if conditions else []

    try:
        patient_profile = json.loads(patient_profile_json)
    except Exception:
        patient_profile = {}

    print(f"   🧪 Drug counseling profile for {drug}: {patient_profile}")
    if not patient_profile:
        print(f"   ⚠️  Warning: empty patient_profile for {drug} "
              f"— habit-based filtering will be skipped")

    result = service.get_drug_counseling(
        drug            = drug,
        age             = age,
        sex             = sex,
        dose            = dose,
        conditions      = cond_list,
        patient_profile = patient_profile
    )
    _drug_counseling_results[drug.lower()] = result
    return json.dumps(result)


def get_condition_counseling(condition: str, age: int, sex: str,
                             medications: str = "",
                             patient_profile_json: str = "{}") -> str:
    """
    Get lifestyle, diet, exercise and safety counseling for a condition.
    Only counsels on confirmed patient habits — never assumes.
    """
    service   = _get_condition_counseling_service()
    meds_list = [m.strip() for m in medications.split(',') if m.strip()] if medications else []

    try:
        patient_profile = json.loads(patient_profile_json)
    except Exception:
        patient_profile = {}

    print(f"   🧪 Condition counseling profile for {condition}: {patient_profile}")

    result = service.get_condition_counseling(
        condition       = condition,
        age             = age,
        sex             = sex,
        medications     = meds_list,
        patient_profile = patient_profile
    )
    _condition_counseling_results[condition.lower()] = result
    return json.dumps(result)


def get_dosing_recommendation(drug: str, age: int, sex: str,
                              current_dose: str = "",
                              conditions: str = "",
                              patient_data_json: str = "{}") -> str:
    """
    Get FDA label-based dosing recommendation for a specific patient.
    Always runs fresh — no cache — since patient labs change frequently.
    """
    service = _get_dosing_service()

    try:
        patient_data = json.loads(patient_data_json)
    except Exception:
        patient_data = {}

    patient_data['age']          = age
    patient_data['sex']          = sex
    patient_data['current_dose'] = current_dose
    patient_data['current_drug'] = drug
    patient_data['conditions']   = [
        c.strip() for c in conditions.split(',') if c.strip()
    ] if conditions else []

    result = service.get_dosing_recommendation(
        drug         = drug,
        patient_data = patient_data
    )
    _dosing_results[drug.lower()] = result
    return json.dumps(result)


# ── Base Agent ────────────────────────────────────────────────────────────────

class _BaseAgent:
    """
    Shared infrastructure for all VabGenRx specialist agents.
    Handles agent creation, run execution, message fetching, and cleanup.
    Each specialist agent inherits this and only defines its own
    instructions and run content.
    """

    def __init__(self, client: AgentsClient, model: str, endpoint: str):
        self.client   = client
        self.model    = model
        self.endpoint = endpoint

    def _build_toolset(self) -> ToolSet:
        functions = FunctionTool(functions={
            search_pubmed,
            search_fda_events,
            get_fda_label,
            check_cache,
            save_cache,
            get_drug_counseling,
            get_condition_counseling,
            get_dosing_recommendation,
        })
        toolset = ToolSet()
        toolset.add(functions)
        return toolset

    def _run(self, name: str, instructions: str,
             content: str, toolset: ToolSet) -> Dict:
        """
        Create an agent, run it, parse the JSON response, delete the agent.
        Returns parsed dict or empty dict on failure.
        """
        agent = self.client.create_agent(
            model        = self.model,
            name         = name,
            instructions = instructions,
            toolset      = toolset,
        )
        try:
            ctx = self.client.enable_auto_function_calls(toolset)
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

            print(f"   ✅ {name} status: {run.status}")

            if run.status == RunStatus.COMPLETED:
                messages_data = self._get_messages(run.thread_id)
                for msg in messages_data:
                    if msg.get("role") == "assistant":
                        for block in msg.get("content", []):
                            if block.get("type") == "text":
                                raw = block["text"]["value"]
                                try:
                                    start = raw.find('{')
                                    end   = raw.rfind('}') + 1
                                    if start >= 0:
                                        return json.loads(raw[start:end])
                                except Exception as e:
                                    print(f"   ⚠️  {name} JSON parse error: {e}")
                                    return {}
            else:
                print(f"   ❌ {name} run failed: {run.status}")
                return {}

        finally:
            self.client.delete_agent(agent.id)

        return {}

    def _get_messages(self, thread_id: str) -> list:
        url = f"{self.endpoint}/threads/{thread_id}/messages?api-version=2025-05-01"
        try:
            req      = HttpRequest(method="GET", url=url)
            response = self.client.send_request(req)
            data     = response.json()
            if "data" in data:
                return data["data"]
            return []
        except Exception as e:
            print(f"   ⚠️  Failed to fetch messages: {e}")
            return []


# ── Specialist Agent 1 — Safety (Drug-Drug + Drug-Food) ───────────────────────

class VabGenRxSafetyAgent(_BaseAgent):
    """
    Specialist agent for drug-drug interactions and drug-food interactions.
    Searches PubMed + FDA adverse events for every drug pair.
    Checks and saves Azure SQL cache.
    Does NOT handle drug-disease — that is VabGenRxDiseaseAgent's role.
    """

    def analyze(self, medications: List[str], n_ddi_pairs: int,
                meds_str: str, toolset: ToolSet) -> Dict:

        print(f"\n   🔬 VabGenRxSafetyAgent: Drug-Drug + Food "
              f"({n_ddi_pairs} pairs, {len(medications)} food checks)...")

        instructions = f"""
You are VabGenRxSafetyAgent, a clinical pharmacology safety specialist.
Analyze ONLY drug-drug interactions and drug-food interactions.
Do NOT analyze drug-disease — that is handled by a separate agent.

MEDICATIONS: {meds_str}

AVAILABLE TOOLS:
- check_cache(cache_type, drug1, drug2="")
- search_pubmed(drug1, drug2="", disease="")
- search_fda_events(drug1, drug2)
- get_fda_label(drug_name)
- save_cache(cache_type, drug1, analysis_json, drug2="")

DRUG-DRUG — ALL STEPS MANDATORY for every unique pair:
Step 1: check_cache(cache_type="drug_drug", drug1=..., drug2=...)
Step 2: ALWAYS call search_pubmed(drug1=..., drug2=...)
Step 3: ALWAYS call search_fda_events(drug1=..., drug2=...)
        ⚠️ search_fda_events takes ONLY drug1 and drug2 — NEVER pass disease
Step 4: If cache_hit=false: synthesize result from evidence
Step 5: If cache_hit=false: save_cache(cache_type="drug_drug", ...)

CONFIDENCE — NEVER set 0.0:
- FDA > 1000 → 0.90–0.98 | FDA 100–1000 → 0.80–0.90
- FDA 10–100 → 0.70–0.85 | No data → get_fda_label() then 0.65–0.75

DRUG-FOOD — for every drug in [{meds_str}]:
Step 1: check_cache(cache_type="food", drug1=drug)
Step 2: If miss: search_pubmed(drug1=drug)
Step 3: If miss: save_cache(cache_type="food", ...)

Expected: {n_ddi_pairs} drug-drug results, {len(medications)} food results.

Return ONLY valid JSON:
{{
  "drug_drug": [
    {{
      "drug1":"...","drug2":"...",
      "severity":"severe|moderate|minor","confidence":0.00,
      "evidence_tier_info":{{}},
      "mechanism":"...","clinical_effects":"...","recommendation":"...",
      "pubmed_papers":0,"fda_reports":0,"from_cache":true
    }}
  ],
  "drug_food": [
    {{
      "drug":"...","foods_to_avoid":[],"foods_to_separate":[],
      "foods_to_monitor":[],"mechanism":"...","from_cache":true
    }}
  ]
}}
"""

        content = (
            f"Analyze drug-drug and food interactions:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"Expected: {n_ddi_pairs} drug-drug pairs, {len(medications)} food checks.\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxSafetyAgent", instructions, content, toolset)


# ── Specialist Agent 2 — Disease (Drug-Disease Contraindications) ─────────────

class VabGenRxDiseaseAgent(_BaseAgent):
    """
    Specialist agent for drug-disease contraindications.
    Gets its own Azure agent step budget — ensures ALL drug-disease
    pairs are checked without competing with safety or counseling work.
    Does NOT call search_fda_events (only works for drug pairs).
    """

    def analyze(self, medications: List[str], diseases: List[str],
                n_dd_pairs: int, meds_str: str, diseases_str: str,
                dd_pairs_str: str, toolset: ToolSet) -> Dict:

        print(f"\n   🔬 VabGenRxDiseaseAgent: Drug-Disease "
              f"({n_dd_pairs} pairs: {dd_pairs_str})...")

        instructions = f"""
You are VabGenRxDiseaseAgent, a clinical pharmacology disease contraindication specialist.
Analyze ONLY drug-disease contraindications — nothing else.

MEDICATIONS: {meds_str}
CONDITIONS:  {diseases_str}

AVAILABLE TOOLS:
- check_cache(cache_type, drug1, drug2="")
- search_pubmed(drug1, drug2="", disease="")
- get_fda_label(drug_name)
- save_cache(cache_type, drug1, analysis_json, drug2="")

⚠️ Do NOT call search_fda_events — it does not work for drug-disease.

ALL {n_dd_pairs} PAIRS ARE MANDATORY: {dd_pairs_str}

For EACH pair:
Step 1: check_cache(cache_type="drug_disease", drug1=<drug>, drug2=<condition>)
Step 2: If miss: search_pubmed(drug1=<drug>, disease=<condition>)
Step 3: If miss: get_fda_label(drug_name=<drug>)
Step 4: If miss: save_cache(cache_type="drug_disease", drug1=<drug>,
                             drug2=<condition>, analysis_json=...)

VERIFY before returning: drug_disease array must have {n_dd_pairs} items.
If any pair is missing — call the tools for it before returning.

Return ONLY valid JSON:
{{
  "drug_disease": [
    {{
      "drug":"...","disease":"...",
      "contraindicated":false,
      "severity":"severe|moderate|minor","confidence":0.00,
      "evidence_tier_info":{{}},
      "clinical_evidence":"...","recommendation":"...",
      "alternative_drugs":[],"from_cache":true
    }}
  ]
}}
"""

        content = (
            f"Check ALL drug-disease contraindications:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {diseases_str}\n"
            f"ALL {n_dd_pairs} pairs required: {dd_pairs_str}\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxDiseaseAgent", instructions, content, toolset)


# ── Specialist Agent 3 — Counseling + Dosing ─────────────────────────────────

class VabGenRxCounselingAgent(_BaseAgent):
    """
    Specialist agent for patient-specific counseling and FDA-based dosing.
    Calls get_drug_counseling, get_condition_counseling, get_dosing_recommendation.
    Results are also captured in module-level collectors as a safety net
    against agent truncation.
    """

    def analyze(self, medications: List[str], diseases: List[str],
                age: int, sex: str, dose_map: Dict,
                patient_profile_json: str, patient_data_json: str,
                n_meds: int, n_diseases: int,
                meds_str: str, diseases_str: str,
                toolset: ToolSet) -> Dict:

        print(f"\n   💊 VabGenRxCounselingAgent: Counseling + Dosing "
              f"({n_meds} drugs, {n_diseases} conditions)...")

        instructions = f"""
You are VabGenRxCounselingAgent, a clinical counseling and dosing specialist.
Generate patient-specific counseling and dosing recommendations.

PATIENT CONTEXT:
- Age: {age} | Sex: {sex}
- Dose map: {json.dumps(dose_map)}
- Patient profile (confirmed habits): {patient_profile_json}
- Patient labs: {patient_data_json}

AVAILABLE TOOLS:
- get_drug_counseling(drug, age, sex, dose="", conditions="", patient_profile_json="{{}}")
- get_condition_counseling(condition, age, sex, medications="", patient_profile_json="{{}}")
- get_dosing_recommendation(drug, age, sex, current_dose="", conditions="", patient_data_json="{{}}")

DRUG COUNSELING — {n_meds} calls required: {meds_str}
For each drug:
  get_drug_counseling(
    drug=<drug>, age={age}, sex="{sex}",
    dose=<from dose map>,
    conditions="{diseases_str}",
    patient_profile_json='{patient_profile_json}'
  )

CONDITION COUNSELING — {n_diseases} calls required: {diseases_str}
For each condition:
  get_condition_counseling(
    condition=<condition>, age={age}, sex="{sex}",
    medications="{meds_str}",
    patient_profile_json='{patient_profile_json}'
  )

DOSING — {n_meds} calls required: {meds_str}
For each drug:
  get_dosing_recommendation(
    drug=<drug>, age={age}, sex="{sex}",
    current_dose=<from dose map>,
    conditions="{diseases_str}",
    patient_data_json='{patient_data_json}'
  )

CRITICAL:
- Pass patient_profile_json EXACTLY as shown — never pass {{}} empty
- Pass patient_data_json EXACTLY as shown — never pass {{}} empty
- Look up each drug's dose from dose map — pass exact value
- If drug not in dose map, pass current_dose="" (empty string)

Return ONLY valid JSON:
{{
  "drug_counseling": [
    {{
      "drug":"...","patient_context":"...",
      "counseling_points":[{{"title":"...","detail":"...","severity":"...","category":"..."}}],
      "key_monitoring":"...","patient_summary":"...","from_cache":true
    }}
  ],
  "condition_counseling": [
    {{
      "condition":"...","patient_context":"...",
      "exercise":[{{"title":"...","detail":"...","frequency":"..."}}],
      "lifestyle":[{{"title":"...","detail":"..."}}],
      "diet":[{{"title":"...","detail":"...","nutrients_to_increase":[],"nutrients_to_reduce":[]}}],
      "safety":[{{"title":"...","detail":"...","urgency":"high|medium|low"}}],
      "monitoring":"...","follow_up":"...","from_cache":true
    }}
  ],
  "dosing_recommendations": [
    {{
      "drug":"...","current_dose":"...","recommended_dose":"...",
      "adjustment_required":true,
      "adjustment_type":"renal|hepatic|age|weight|pregnancy|drug_level|none",
      "urgency":"high|medium|low",
      "adjustment_reason":"...","hold_threshold":"...",
      "monitoring_required":"...","fda_label_basis":"...",
      "evidence_tier":"...","evidence_confidence":"...",
      "patient_flags_used":[],"clinical_note":"...","from_cache":false
    }}
  ]
}}
"""

        content = (
            f"Generate counseling and dosing:\n"
            f"MEDICATIONS: {meds_str}\n"
            f"CONDITIONS:  {diseases_str}\n"
            f"PATIENT:     {age}yo {sex}\n"
            f"DOSES:       {json.dumps(dose_map)}\n"
            f"PROFILE:     {patient_profile_json}\n"
            f"LABS:        {patient_data_json}\n\n"
            f"REQUIRED: {n_meds} drug counseling ({meds_str}), "
            f"{n_diseases} condition counseling ({diseases_str}), "
            f"{n_meds} dosing ({meds_str}).\n"
            f"Return JSON only."
        )

        return self._run("VabGenRxCounselingAgent", instructions, content, toolset)


# ── Orchestrator ──────────────────────────────────────────────────────────────

class VabGenRxOrchestrator:
    """
    Coordinates the three VabGenRx specialist agents and merges their results.

    Execution order:
      1. VabGenRxSafetyAgent    — Drug-Drug + Drug-Food
      2. VabGenRxDiseaseAgent   — Drug-Disease contraindications
      3. VabGenRxCounselingAgent — Patient counseling + FDA dosing

    Each agent runs sequentially with its own Azure agent instance and
    dedicated step budget. Results are merged into a single output dict.
    """

    def __init__(self):
        endpoint = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
        if not endpoint:
            raise ValueError("AZURE_AI_PROJECT_ENDPOINT not set in .env")

        self.client   = AgentsClient(endpoint=endpoint, credential=DefaultAzureCredential())
        self.model    = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        self.endpoint = endpoint.rstrip('/')

        # Instantiate all three specialist agents with shared client
        self.safety_agent    = VabGenRxSafetyAgent(self.client, self.model, self.endpoint)
        self.disease_agent   = VabGenRxDiseaseAgent(self.client, self.model, self.endpoint)
        self.counseling_agent = VabGenRxCounselingAgent(self.client, self.model, self.endpoint)

        print("✅ VabGenRx Multi-Agent System initialized")
        print(f"   Endpoint  : {endpoint}")
        print(f"   Model     : {self.model}")
        print(f"   Agents    : VabGenRxSafetyAgent | VabGenRxDiseaseAgent | VabGenRxCounselingAgent")
        print(f"   Orchestrator: VabGenRxOrchestrator")

    def analyze(self,
                medications:     List[str],
                diseases:        List[str] = None,
                foods:           List[str] = None,
                age:             int = 45,
                sex:             str = "unknown",
                dose_map:        Dict[str, str] = None,
                patient_profile: Dict = None,
                patient_data:    Dict = None) -> Dict:
        """
        Orchestrate all three specialist agents and return merged results.

        patient_profile — confirmed lifestyle habits:
        {
            "drinks_alcohol": True/False,
            "smokes": True/False,
            "sedentary": True/False,
            "has_mobility_issues": True/False,
            "has_joint_pain": True/False,
            "is_pregnant": True/False,
            "has_kidney_disease": True/False,
            "has_liver_disease": True/False
        }

        patient_data — labs and investigations for dosing:
        {
            "weight_kg": 72, "height_cm": 168, "bmi": 25.5,
            "egfr": 38, "sodium": 128, "potassium": 5.6,
            "bilirubin": 2.1, "tsh": 7.8, "pulse": 92,
            "other_investigations": {"eGFR_trend": "declining"}
        }
        """
        diseases        = diseases        or []
        foods           = foods           or []
        dose_map        = dose_map        or {}
        patient_profile = patient_profile or {}
        patient_data    = patient_data    or {}

        patient_profile_json = json.dumps(patient_profile)
        patient_data_json    = json.dumps(patient_data)

        # Pre-compute counts used across all three agents
        n_meds       = len(medications)
        n_diseases   = len(diseases)
        n_ddi_pairs  = len(list(itertools.combinations(medications, 2)))
        n_dd_pairs   = n_meds * n_diseases
        meds_str     = ', '.join(medications)
        diseases_str = ', '.join(diseases) if diseases else 'None'

        # Explicit list of all drug-disease pairs so disease agent can't miss any
        dd_pairs_str = ', '.join(
            f"{drug}+{disease}"
            for drug in medications
            for disease in diseases
        )

        print(f"\n🤖 VabGenRx Orchestrator — Starting Analysis...")
        print(f"   Medications : {meds_str}")
        print(f"   Conditions  : {diseases_str}")
        print(f"   Patient     : {age}yo {sex}")
        print(f"   Profile     : {patient_profile_json}")
        print(f"   Labs        : eGFR={patient_data.get('egfr','?')}  "
              f"K+={patient_data.get('potassium','?')}  "
              f"TSH={patient_data.get('tsh','?')}")

        # Clear module-level collectors for this run
        global _dosing_results, _drug_counseling_results, _condition_counseling_results
        _dosing_results               = {}
        _drug_counseling_results      = {}
        _condition_counseling_results = {}

        # Each agent needs its own toolset instance — ThreadPoolExecutor runs
        # agents in separate threads, sharing one toolset causes race conditions
        safety_toolset    = self.safety_agent._build_toolset()
        disease_toolset   = self.disease_agent._build_toolset()
        counseling_toolset = self.counseling_agent._build_toolset()

        # ── Phase 1: Safety + Disease run IN PARALLEL ─────────────────────────
        # These two agents are fully independent — neither needs the other's
        # results. Running them simultaneously saves ~30-50s per analysis.
        print(f"\n   ⚡ Phase 1 — Parallel: VabGenRxSafetyAgent + VabGenRxDiseaseAgent")

        safety_result  = {}
        disease_result = {}

        def run_safety():
            return self.safety_agent.analyze(
                medications = medications,
                n_ddi_pairs = n_ddi_pairs,
                meds_str    = meds_str,
                toolset     = safety_toolset
            )

        def run_disease():
            return self.disease_agent.analyze(
                medications  = medications,
                diseases     = diseases,
                n_dd_pairs   = n_dd_pairs,
                meds_str     = meds_str,
                diseases_str = diseases_str,
                dd_pairs_str = dd_pairs_str,
                toolset      = disease_toolset
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_safety  = executor.submit(run_safety)
            future_disease = executor.submit(run_disease)

            # as_completed yields each future as it finishes —
            # so we log completion order in real time
            for future in as_completed([future_safety, future_disease]):
                if future is future_safety:
                    safety_result = future.result()
                    print(f"   ✅ VabGenRxSafetyAgent finished")
                else:
                    disease_result = future.result()
                    print(f"   ✅ VabGenRxDiseaseAgent finished")

        print(f"   ✅ Phase 1 complete — both safety agents done")

        # ── Phase 2: Counseling runs AFTER Phase 1 ────────────────────────────
        # VabGenRxCounselingAgent runs sequentially after Phase 1 because it
        # needs the full patient picture (including interaction context) to
        # generate accurate cross-aware counseling.
        print(f"\n   ⚡ Phase 2 — Sequential: VabGenRxCounselingAgent")

        counseling_result = self.counseling_agent.analyze(
            medications          = medications,
            diseases             = diseases,
            age                  = age,
            sex                  = sex,
            dose_map             = dose_map,
            patient_profile_json = patient_profile_json,
            patient_data_json    = patient_data_json,
            n_meds               = n_meds,
            n_diseases           = n_diseases,
            meds_str             = meds_str,
            diseases_str         = diseases_str,
            toolset              = counseling_toolset
        )

        # ── Merge — combine all three results ─────────────────────────────────
        print(f"\n   🔀 Orchestrator merging results from all 3 agents...")

        all_ddi      = safety_result.get("drug_drug", [])
        all_dd       = disease_result.get("drug_disease", [])
        severe_count = sum(1 for r in all_ddi if r.get("severity") == "severe")
        mod_count    = sum(1 for r in all_ddi if r.get("severity") == "moderate")
        contra_count = sum(1 for r in all_dd  if r.get("contraindicated"))

        final = {
            "drug_drug":              all_ddi,
            "drug_disease":           all_dd,
            "drug_food":              safety_result.get("drug_food", []),
            "drug_counseling":        [],
            "condition_counseling":   [],
            "dosing_recommendations": [],
            "risk_summary": {
                "level": (
                    "HIGH"     if severe_count > 0 or contra_count > 0 else
                    "MODERATE" if mod_count > 0 else
                    "LOW"
                ),
                "severe_count":                severe_count,
                "moderate_count":              mod_count,
                "contraindicated_count":       contra_count,
                "dosing_adjustments_required": 0
            }
        }

        # Drug counseling — prefer full collected results over agent-assembled
        final["drug_counseling"] = (
            [_drug_counseling_results[d.lower()]
             for d in medications if d.lower() in _drug_counseling_results]
            if _drug_counseling_results
            else counseling_result.get("drug_counseling", [])
        )

        # Condition counseling — prefer full collected results
        final["condition_counseling"] = (
            [_condition_counseling_results[d.lower()]
             for d in diseases if d.lower() in _condition_counseling_results]
            if _condition_counseling_results
            else counseling_result.get("condition_counseling", [])
        )

        # Dosing — prefer full collected results (all FDA fields intact)
        final["dosing_recommendations"] = (
            [_dosing_results[d.lower()]
             for d in medications if d.lower() in _dosing_results]
            if _dosing_results
            else counseling_result.get("dosing_recommendations", [])
        )

        # Update dosing adjustment count in risk summary
        dosing_adjustments = sum(
            1 for r in final["dosing_recommendations"]
            if r.get("adjustment_required")
        )
        final["risk_summary"]["dosing_adjustments_required"] = dosing_adjustments

        print(f"\n   📊 Orchestrator — Final output counts:")
        print(f"      drug_drug:             {len(final['drug_drug'])}")
        print(f"      drug_disease:          {len(final['drug_disease'])} / {n_dd_pairs} expected")
        print(f"      drug_food:             {len(final['drug_food'])}")
        print(f"      drug_counseling:       {len(final['drug_counseling'])} / {n_meds} expected")
        print(f"      condition_counseling:  {len(final['condition_counseling'])} / {n_diseases} expected")
        print(f"      dosing_recommendations:{len(final['dosing_recommendations'])} / {n_meds} expected")
        print(f"      dosing_adjustments:    {dosing_adjustments}")
        print(f"      risk_level:            {final['risk_summary']['level']}")

        return {"status": "completed", "analysis": final}


# ── Backward Compatibility Alias ──────────────────────────────────────────────
# If any other file in the project imports VabGenRxAgentService,
# it will still work without any changes.
VabGenRxAgentService = VabGenRxOrchestrator


# ── CLI Test ──────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("VABGENRX — MULTI-AGENT SYSTEM TEST")
    print("=" * 60)

    try:
        orchestrator = VabGenRxOrchestrator()
    except ValueError as e:
        print(f"\n❌ {e}")
        return

    result = orchestrator.analyze(
        medications = ["beclomethasone", "carbamazepine", "beclofen"],
        diseases    = ["seizure", "multiple sclerosis"],
        age         = 12,
        sex         = "male",
        dose_map    = {
            "beclomethasone": "80mcg",
            "carbamazepine":  "200mg bd",
            "beclofen": "10mg daily"
        },
        patient_profile = {
            "drinks_alcohol":     True,
            "smokes":             True,
            "has_kidney_disease": True,
            "has_liver_disease":  False,
            "sedentary":          True
        },
        patient_data = {
            "weight_kg":  80,
            "height_cm":  170,
            "bmi":        27.7,
            "egfr":       38,
            "sodium":     140,
            "potassium":  4.9,
            "bilirubin":  0.9,
            "tsh":        2.0,
            "pulse":      110,
            "other_investigations": {
                "CXR":          "infiltrates",
                "presentation": "acute exacerbation"
            }
        }
    )

    print("\n📊 ORCHESTRATOR RESULT:")
    if "analysis" in result:
        print(json.dumps(result["analysis"], indent=2))
    else:
        print("Error:", result.get("error", "No response"))


if __name__ == "__main__":
    main()
