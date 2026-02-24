'''

"""
VabGenRx — Drug Counseling Service
Generates patient-specific drug counseling points
based on drug, patient age, sex, dose and conditions.

Filters out irrelevant counseling (e.g. pregnancy warnings for males).
"""

import os
import json
import pyodbc
from typing import Dict, List, Optional
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()


def _get_age_group(age: int) -> str:
    """Convert numeric age to age group for cache key."""
    if age < 18:
        return "pediatric"
    elif age < 65:
        return "adult"
    else:
        return "elderly"


class DrugCounselingService:
    """
    Generates relevant drug counseling points for a specific patient.

    Takes into account:
    - Patient sex (filters irrelevant warnings e.g. pregnancy for males)
    - Patient age group (pediatric/adult/elderly dosing concerns)
    - Drug dose (high dose warnings vs standard dose)
    - Patient conditions (co-morbidity relevant warnings)
    """

    def __init__(self):
        self.llm = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        self.conn_str   = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
            f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
            f"UID={os.getenv('AZURE_SQL_USERNAME')};"
            f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
        )

    # ── Cache helpers ──────────────────────────────────────────────────────────

    def _cache_key(self, drug: str, sex: str, age_group: str) -> str:
        return f"{drug.lower()}|{sex.lower()}|{age_group}"

    def _get_cached(self, cache_key: str) -> Optional[Dict]:
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result FROM drug_counseling_cache
                WHERE cache_key = ?
                  AND DATEDIFF(day, cached_at, GETDATE()) < 30
            """, cache_key)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE drug_counseling_cache
                    SET access_count = access_count + 1
                    WHERE cache_key = ?
                """, cache_key)
                conn.commit()
            conn.close()
            return json.loads(row[0]) if row else None
        except:
            return None

    def _save_cache(self, cache_key: str, drug: str,
                    sex: str, age_group: str, result: Dict):
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                MERGE drug_counseling_cache AS t
                USING (SELECT ? AS cache_key) AS s
                ON t.cache_key = s.cache_key
                WHEN MATCHED THEN UPDATE SET
                    full_result  = ?,
                    cached_at    = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (cache_key, drug, sex, age_group, full_result)
                VALUES (?, ?, ?, ?, ?);
            """, cache_key, json.dumps(result),
                cache_key, drug, sex, age_group, json.dumps(result))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"   ⚠️  Counseling cache save error: {e}")

    # ── Main method ───────────────────────────────────────────────────────────

    def get_drug_counseling(
        self,
        drug:       str,
        age:        int,
        sex:        str,          # "male" | "female" | "other"
        dose:       str = "",     # e.g. "10mg daily"
        conditions: List[str] = None
    ) -> Dict:
        """
        Generate patient-specific counseling points for a drug.

        Returns a list of counseling points, each with:
        - title: short heading
        - detail: what the patient/doctor should know
        - severity: high | medium | low
        - category: bleeding | monitoring | timing | lifestyle | warning
        """
        conditions = conditions or []
        age_group  = _get_age_group(age)
        cache_key  = self._cache_key(drug, sex, age_group)

        # Check cache first
        cached = self._get_cached(cache_key)
        if cached:
            print(f"   💾 Drug counseling cache HIT: {drug} ({sex}, {age_group})")
            return cached

        print(f"   🔬 Generating drug counseling: {drug} ({sex}, age {age}, {dose})")

        # Get FDA label for this drug
        from services.fda_service import FDAService
        fda    = FDAService()
        label  = fda.get_drug_contraindications(drug)

        fda_text = ""
        if label.get('found'):
            fda_text = f"""
FDA WARNINGS: {label.get('warnings', '')[:600]}
FDA CONTRAINDICATIONS: {label.get('contraindications', '')[:400]}
FDA DRUG INTERACTIONS: {label.get('drug_interactions', '')[:400]}
"""

        # Build patient context
        conditions_text = ', '.join(conditions) if conditions else 'none specified'

        prompt = f"""
You are a clinical pharmacist generating drug counseling points for a specific patient.

DRUG: {drug}
DOSE: {dose if dose else 'standard dose'}
PATIENT: {age} year old {sex} ({age_group})
CONDITIONS: {conditions_text}

{fda_text}

CRITICAL RULES — FILTER IRRELEVANT COUNSELING:
1. Sex filtering:
   - Do NOT mention pregnancy, breastfeeding, or menstrual effects for MALE patients
   - Do NOT mention erectile dysfunction warnings for FEMALE patients
   - Do NOT mention prostate effects for FEMALE patients

2. Age filtering:
   - For PEDIATRIC patients: focus on weight-based dosing, growth effects
   - For ELDERLY patients: focus on fall risk, kidney function, polypharmacy
   - For ADULT patients: focus on standard clinical monitoring

3. Relevance filtering:
   - Only include side effects likely at THIS dose level
   - Only include warnings relevant to THIS patient's conditions
   - Skip theoretical risks with <1% occurrence unless serious

4. Prioritize:
   - HIGH severity: life-threatening, requires immediate action
   - MEDIUM severity: requires monitoring or dose adjustment
   - LOW severity: patient awareness, lifestyle adjustment

Return JSON with counseling points (maximum 6 most relevant):
{{
  "drug": "{drug}",
  "patient_context": "{age}yo {sex}",
  "counseling_points": [
    {{
      "title": "Short heading (5 words max)",
      "detail": "Specific actionable advice for this patient",
      "severity": "high|medium|low",
      "category": "bleeding|monitoring|timing|lifestyle|warning|renal|cardiac"
    }}
  ],
  "key_monitoring": "Most important thing to monitor for this patient",
  "patient_summary": "One sentence summary for the patient"
}}

Focus on the TOP counseling points that are MOST RELEVANT to this specific patient.
Do not include generic advice that applies to everyone.
"""

        result = self._call_llm(prompt)
        result['from_cache'] = False

        # Save to cache
        self._save_cache(cache_key, drug, sex, age_group, result)

        return result

    def get_counseling_for_all_drugs(
        self,
        medications: List[str],
        age:         int,
        sex:         str,
        dose_map:    Dict[str, str] = None,   # {"warfarin": "10mg daily"}
        conditions:  List[str] = None
    ) -> List[Dict]:
        """
        Get counseling for all medications at once.
        Called from app.py with patient details.
        """
        dose_map   = dose_map or {}
        conditions = conditions or []
        results    = []

        for drug in medications:
            dose   = dose_map.get(drug, "")
            result = self.get_drug_counseling(
                drug       = drug,
                age        = age,
                sex        = sex,
                dose       = dose,
                conditions = conditions
            )
            results.append(result)

        return results

    # ── LLM call ──────────────────────────────────────────────────────────────

    def _call_llm(self, prompt: str) -> Dict:
        try:
            response = self.llm.chat.completions.create(
                model           = self.deployment,
                messages        = [
                    {
                        "role":    "system",
                        "content": "You are a clinical pharmacist. Generate concise, patient-specific drug counseling. Always filter by patient sex and age. Never include irrelevant warnings."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 800,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"   ❌ LLM error: {e}")
            return {
                "drug":             "",
                "counseling_points": [],
                "key_monitoring":   "Consult pharmacist",
                "patient_summary":  "Unable to generate counseling",
                "error":            str(e)
            } '''


"""
VabGenRx — Drug Counseling Service
Generates patient-specific drug counseling points.

Key principles:
- Never assume lifestyle habits (alcohol, smoking, diet)
- Only counsel on habits the patient has confirmed
- Never suggest avoiding cultural/religious foods
- Focus only on pharmacological drug interactions
"""

import os
import json
import pyodbc
from typing import Dict, List, Optional
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()


def _get_age_group(age: int) -> str:
    if age < 18:   return "pediatric"
    elif age < 65: return "adult"
    else:          return "elderly"


class DrugCounselingService:

    def __init__(self):
        self.llm = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        self.conn_str   = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={os.getenv('AZURE_SQL_SERVER')};"
            f"DATABASE={os.getenv('AZURE_SQL_DATABASE')};"
            f"UID={os.getenv('AZURE_SQL_USERNAME')};"
            f"PWD={os.getenv('AZURE_SQL_PASSWORD')}"
        )

    # ── Cache ──────────────────────────────────────────────────────────────────

    def _cache_key(self, drug: str, sex: str, age_group: str) -> str:
        return f"{drug.lower()}|{sex.lower()}|{age_group}"

    def _get_cached(self, cache_key: str) -> Optional[Dict]:
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result FROM drug_counseling_cache
                WHERE cache_key = ?
                AND DATEDIFF(day, cached_at, GETDATE()) < 30
            """, cache_key)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE drug_counseling_cache
                    SET access_count = access_count + 1
                    WHERE cache_key = ?
                """, cache_key)
                conn.commit()
            conn.close()
            return json.loads(row[0]) if row else None
        except:
            return None

    def _save_cache(self, cache_key: str, drug: str,
                    sex: str, age_group: str, result: Dict):
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                MERGE drug_counseling_cache AS t
                USING (SELECT ? AS cache_key) AS s
                ON t.cache_key = s.cache_key
                WHEN MATCHED THEN UPDATE SET
                    full_result = ?, cached_at = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (cache_key, drug, sex, age_group, full_result)
                VALUES (?, ?, ?, ?, ?);
            """, cache_key, json.dumps(result),
                cache_key, drug, sex, age_group, json.dumps(result))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"   ⚠️  Cache save error: {e}")

    # ── Main method ────────────────────────────────────────────────────────────

    def get_drug_counseling(
        self,
        drug:            str,
        age:             int,
        sex:             str,
        dose:            str = "",
        conditions:      List[str] = None,
        patient_profile: Dict = None   # confirmed habits only
    ) -> Dict:
        """
        Generate counseling based only on confirmed patient information.

        patient_profile example:
        {
            "drinks_alcohol": True,
            "smokes": False,
            "is_pregnant": False,    # only relevant for females
            "has_kidney_disease": True,
            "has_liver_disease": False
        }
        Only pass keys you actually know about the patient.
        """
        conditions      = conditions or []
        patient_profile = patient_profile or {}
        age_group       = _get_age_group(age)
        cache_key       = self._cache_key(drug, sex, age_group)

        cached = self._get_cached(cache_key)
        if cached:
            print(f"   💾 Drug counseling cache HIT: {drug} ({sex}, {age_group})")
            return cached

        print(f"   🔬 Generating drug counseling: {drug} ({sex}, age {age}, {dose})")

        from services.fda_service import FDAService
        label    = FDAService().get_drug_contraindications(drug)
        fda_text = ""
        if label.get('found'):
            fda_text = (
                f"FDA WARNINGS: {label.get('warnings','')[:600]}\n"
                f"FDA CONTRAINDICATIONS: {label.get('contraindications','')[:400]}\n"
                f"FDA DRUG INTERACTIONS: {label.get('drug_interactions','')[:400]}"
            )

        # Build confirmed habits text — only what we know
        confirmed_habits = []
        if patient_profile.get('drinks_alcohol') is True:
            confirmed_habits.append("Patient confirmed: drinks alcohol")
        if patient_profile.get('smokes') is True:
            confirmed_habits.append("Patient confirmed: smoker")
        if patient_profile.get('is_pregnant') is True and sex == "female":
            confirmed_habits.append("Patient confirmed: pregnant")
        if patient_profile.get('has_kidney_disease') is True:
            confirmed_habits.append("Patient confirmed: has kidney disease")
        if patient_profile.get('has_liver_disease') is True:
            confirmed_habits.append("Patient confirmed: has liver disease")

        habits_text = (
            "\n".join(confirmed_habits)
            if confirmed_habits
            else "No lifestyle habits confirmed — do not assume any."
        )

        conditions_text = ', '.join(conditions) if conditions else 'none'

        prompt = f"""
You are a clinical pharmacist generating drug counseling for a specific patient.

DRUG: {drug}
DOSE: {dose if dose else 'standard dose'}
PATIENT: {age} year old {sex} ({age_group})
CONDITIONS: {conditions_text}

CONFIRMED PATIENT HABITS:
{habits_text}

{fda_text}

STRICT RULES — READ CAREFULLY:

1. SEX FILTERING:
   - MALE patients: Never mention pregnancy, breastfeeding, menstrual cycle effects
   - FEMALE patients: Never mention erectile dysfunction, prostate issues
   - Only mention sex-specific effects relevant to THIS patient's sex

2. HABIT-BASED COUNSELING:
   - ONLY mention alcohol if "drinks_alcohol" is confirmed
   - ONLY mention smoking if "smokes" is confirmed
   - ONLY mention pregnancy if "is_pregnant" is confirmed for female patient
   - If a habit is NOT confirmed, do NOT mention it at all
   - Do NOT say "avoid alcohol" if we don't know if they drink

3. DIETARY RESTRICTIONS:
   - NEVER suggest avoiding specific cultural or religious foods
     (e.g., never say "avoid pork", "avoid beef", "avoid halal/kosher foods")
   - ONLY mention foods that have a DIRECT PHARMACOLOGICAL interaction
     with this specific drug (e.g., grapefruit + statins, vitamin K + warfarin)
   - Do NOT give general healthy eating advice

4. AGE FILTERING:
   - Elderly ({age_group}): focus on fall risk, kidney function, polypharmacy
   - Adult: focus on standard monitoring
   - Pediatric: focus on weight-based dosing

5. RELEVANCE:
   - Only include side effects likely at THIS dose
   - Maximum 5 most clinically important points
   - Skip theoretical risks unless serious

Return JSON:
{{
  "drug": "{drug}",
  "patient_context": "{age}yo {sex}",
  "counseling_points": [
    {{
      "title": "Short heading (5 words max)",
      "detail": "Specific actionable advice for this patient only",
      "severity": "high|medium|low",
      "category": "bleeding|monitoring|timing|renal|cardiac|warning"
    }}
  ],
  "key_monitoring": "Most important thing to monitor",
  "patient_summary": "One sentence summary"
}}
"""

        result             = self._call_llm(prompt)
        result['from_cache'] = False
        self._save_cache(cache_key, drug, sex, age_group, result)
        return result

    def get_counseling_for_all_drugs(
        self,
        medications:     List[str],
        age:             int,
        sex:             str,
        dose_map:        Dict[str, str] = None,
        conditions:      List[str] = None,
        patient_profile: Dict = None
    ) -> List[Dict]:
        dose_map        = dose_map or {}
        conditions      = conditions or []
        patient_profile = patient_profile or {}
        results         = []

        for drug in medications:
            result = self.get_drug_counseling(
                drug            = drug,
                age             = age,
                sex             = sex,
                dose            = dose_map.get(drug, ""),
                conditions      = conditions,
                patient_profile = patient_profile
            )
            results.append(result)

        return results

    # ── LLM call ──────────────────────────────────────────────────────────────

    def _call_llm(self, prompt: str) -> Dict:
        try:
            response = self.llm.chat.completions.create(
                model           = self.deployment,
                messages        = [
                    {
                        "role":    "system",
                        "content": (
                            "You are a clinical pharmacist. Generate precise drug counseling "
                            "based ONLY on confirmed patient information. "
                            "Never assume lifestyle habits. "
                            "Never mention cultural or religious dietary restrictions. "
                            "Only counsel on pharmacological drug interactions with food."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 700,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"   ❌ LLM error: {e}")
            return {
                "drug":              "",
                "counseling_points": [],
                "key_monitoring":    "Consult pharmacist",
                "patient_summary":   "Unable to generate counseling",
                "error":             str(e)
            }