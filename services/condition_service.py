'''
"""
VabGenRx — Condition Counseling Service
Generates patient-specific lifestyle, diet, exercise and
safety counseling for each patient condition.

Examples:
- Diabetes → low carb diet, blood sugar monitoring, foot care
- Hypertension → low sodium diet, exercise, avoid NSAIDs
- Seizures → avoid driving, swimming alone, heights
"""

import os
import json
import pyodbc
from typing import Dict, List, Optional
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()


def _get_age_group(age: int) -> str:
    if age < 18:
        return "pediatric"
    elif age < 65:
        return "adult"
    else:
        return "elderly"


class ConditionCounselingService:
    """
    Generates condition-specific counseling covering:
    1. Exercise & Physical Activity
    2. Lifestyle Changes
    3. Diet Recommendations
    4. Safety Considerations

    Personalised by patient age, sex and current medications.
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

    def _cache_key(self, condition: str, sex: str, age_group: str) -> str:
        return f"{condition.lower()}|{sex.lower()}|{age_group}"

    def _get_cached(self, cache_key: str) -> Optional[Dict]:
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result FROM condition_counseling_cache
                WHERE cache_key = ?
                  AND DATEDIFF(day, cached_at, GETDATE()) < 30
            """, cache_key)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE condition_counseling_cache
                    SET access_count = access_count + 1
                    WHERE cache_key = ?
                """, cache_key)
                conn.commit()
            conn.close()
            return json.loads(row[0]) if row else None
        except:
            return None

    def _save_cache(self, cache_key: str, condition: str,
                    sex: str, age_group: str, result: Dict):
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                MERGE condition_counseling_cache AS t
                USING (SELECT ? AS cache_key) AS s
                ON t.cache_key = s.cache_key
                WHEN MATCHED THEN UPDATE SET
                    full_result = ?,
                    cached_at   = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (cache_key, condition, sex, age_group, full_result)
                VALUES (?, ?, ?, ?, ?);
            """, cache_key, json.dumps(result),
                cache_key, condition, sex, age_group, json.dumps(result))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"   ⚠️  Condition cache save error: {e}")

    # ── Main method ───────────────────────────────────────────────────────────

    def get_condition_counseling(
        self,
        condition:   str,
        age:         int,
        sex:         str,
        medications: List[str] = None
    ) -> Dict:
        """
        Generate lifestyle and safety counseling for a condition.

        Returns counseling in 4 categories:
        - exercise: physical activity recommendations
        - lifestyle: behaviour and habit changes
        - diet: food and nutrition guidance
        - safety: safety precautions specific to this condition
        """
        medications = medications or []
        age_group   = _get_age_group(age)
        cache_key   = self._cache_key(condition, sex, age_group)

        # Check cache first
        cached = self._get_cached(cache_key)
        if cached:
            print(f"   💾 Condition counseling cache HIT: {condition} ({sex}, {age_group})")
            return cached

        print(f"   🔬 Generating condition counseling: {condition} ({sex}, age {age})")

        meds_text = ', '.join(medications) if medications else 'none'

        prompt = f"""
You are a clinical physician generating patient counseling for a specific medical condition.

CONDITION: {condition}
PATIENT: {age} year old {sex} ({age_group})
CURRENT MEDICATIONS: {meds_text}

Generate practical, evidence-based counseling in exactly 4 categories.
Be specific and actionable — not generic advice.

RULES:
1. Exercise: Give specific activity type, duration, frequency
   - Consider age and condition severity
   - Example: "30 min brisk walking, 5 days/week" NOT "exercise regularly"

2. Lifestyle: Specific behaviour changes
   - Sleep, stress management, smoking/alcohol, relevant habits
   - Consider patient's medications (e.g. warfarin + alcohol risk)

3. Diet: Specific food guidance
   - Foods to eat more of
   - Foods to limit or avoid
   - Consider drug-food interactions with current medications
   - Example: "Low carb <130g/day" NOT "eat healthy"

4. Safety: Critical safety warnings specific to this condition
   - Driving restrictions (seizures, severe hypoglycemia)
   - Activity restrictions (fall risk, cardiac conditions)
   - Emergency signs to watch for
   - Monitoring requirements

Return JSON:
{{
  "condition": "{condition}",
  "patient_context": "{age}yo {sex}",
  "exercise": [
    {{
      "title": "Short heading",
      "detail": "Specific recommendation",
      "frequency": "e.g. 5 days/week"
    }}
  ],
  "lifestyle": [
    {{
      "title": "Short heading",
      "detail": "Specific actionable change"
    }}
  ],
  "diet": [
    {{
      "title": "Short heading",
      "detail": "Specific food guidance",
      "foods_to_include": ["food1", "food2"],
      "foods_to_avoid": ["food1", "food2"]
    }}
  ],
  "safety": [
    {{
      "title": "Short heading",
      "detail": "Specific safety instruction",
      "urgency": "high|medium|low"
    }}
  ],
  "monitoring": "Key metric to monitor and target value",
  "follow_up": "Recommended follow-up frequency"
}}

Maximum 3 points per category. Focus on the MOST IMPACTFUL advice for this patient.
"""

        result = self._call_llm(prompt)
        result['from_cache'] = False

        # Save to cache
        self._save_cache(cache_key, condition, sex, age_group, result)

        return result

    def get_counseling_for_all_conditions(
        self,
        conditions:  List[str],
        age:         int,
        sex:         str,
        medications: List[str] = None
    ) -> List[Dict]:
        """
        Get counseling for all patient conditions.
        Called from app.py with patient details.
        """
        medications = medications or []
        results     = []

        for condition in conditions:
            result = self.get_condition_counseling(
                condition   = condition,
                age         = age,
                sex         = sex,
                medications = medications
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
                        "content": "You are a clinical physician. Generate specific, actionable condition counseling. Be concise and practical. Focus on evidence-based recommendations tailored to the patient's age and sex."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 900,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"   ❌ LLM error: {e}")
            return {
                "condition":  "",
                "exercise":   [],
                "lifestyle":  [],
                "diet":       [],
                "safety":     [],
                "monitoring": "Consult physician",
                "follow_up":  "As needed",
                "error":      str(e)
            }'''


"""
VabGenRx — Condition Counseling Service
Generates patient-specific lifestyle, diet, exercise and safety counseling.

Key principles:
- Never assume lifestyle habits (alcohol, smoking, diet preferences)
- Only counsel on confirmed patient habits
- Never suggest avoiding cultural/religious foods
- Exercise advice must consider age and physical limitations
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


class ConditionCounselingService:

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

    def _cache_key(self, condition: str, sex: str, age_group: str) -> str:
        return f"{condition.lower()}|{sex.lower()}|{age_group}"

    def _get_cached(self, cache_key: str) -> Optional[Dict]:
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                SELECT full_result FROM condition_counseling_cache
                WHERE cache_key = ?
                AND DATEDIFF(day, cached_at, GETDATE()) < 30
            """, cache_key)
            row = cur.fetchone()
            if row:
                cur.execute("""
                    UPDATE condition_counseling_cache
                    SET access_count = access_count + 1
                    WHERE cache_key = ?
                """, cache_key)
                conn.commit()
            conn.close()
            return json.loads(row[0]) if row else None
        except:
            return None

    def _save_cache(self, cache_key: str, condition: str,
                    sex: str, age_group: str, result: Dict):
        try:
            conn = pyodbc.connect(self.conn_str, timeout=5)
            cur  = conn.cursor()
            cur.execute("""
                MERGE condition_counseling_cache AS t
                USING (SELECT ? AS cache_key) AS s
                ON t.cache_key = s.cache_key
                WHEN MATCHED THEN UPDATE SET
                    full_result = ?, cached_at = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (cache_key, condition, sex, age_group, full_result)
                VALUES (?, ?, ?, ?, ?);
            """, cache_key, json.dumps(result),
                cache_key, condition, sex, age_group, json.dumps(result))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"   ⚠️  Cache save error: {e}")

    # ── Main method ────────────────────────────────────────────────────────────

    def get_condition_counseling(
        self,
        condition:       str,
        age:             int,
        sex:             str,
        medications:     List[str] = None,
        patient_profile: Dict = None
    ) -> Dict:
        """
        Generate condition counseling based only on confirmed information.

        patient_profile example:
        {
            "drinks_alcohol": True,
            "smokes": False,
            "sedentary": True,         # confirmed not physically active
            "has_mobility_issues": True,
            "has_joint_pain": True
        }
        Only pass keys you actually know about the patient.
        """
        medications     = medications or []
        patient_profile = patient_profile or {}
        age_group       = _get_age_group(age)
        cache_key       = self._cache_key(condition, sex, age_group)

        cached = self._get_cached(cache_key)
        if cached:
            print(f"   💾 Condition counseling cache HIT: {condition} ({sex}, {age_group})")
            return cached

        print(f"   🔬 Generating condition counseling: {condition} ({sex}, age {age})")

        meds_text = ', '.join(medications) if medications else 'none'

        # Build confirmed habits text
        confirmed_habits = []
        if patient_profile.get('drinks_alcohol') is True:
            confirmed_habits.append("Patient confirmed: drinks alcohol")
        if patient_profile.get('smokes') is True:
            confirmed_habits.append("Patient confirmed: smoker")
        if patient_profile.get('sedentary') is True:
            confirmed_habits.append("Patient confirmed: currently sedentary/inactive")
        if patient_profile.get('has_mobility_issues') is True:
            confirmed_habits.append("Patient confirmed: has mobility issues")
        if patient_profile.get('has_joint_pain') is True:
            confirmed_habits.append("Patient confirmed: has joint pain")

        habits_text = (
            "\n".join(confirmed_habits)
            if confirmed_habits
            else "No lifestyle habits confirmed — do not assume any."
        )

        prompt = f"""
You are a clinical physician generating condition counseling for a specific patient.

CONDITION: {condition}
PATIENT: {age} year old {sex} ({age_group})
CURRENT MEDICATIONS: {meds_text}

CONFIRMED PATIENT HABITS:
{habits_text}

STRICT RULES — READ CAREFULLY:

1. HABIT-BASED COUNSELING:
   - ONLY mention alcohol if "drinks_alcohol" is confirmed
   - ONLY mention smoking cessation if "smokes" is confirmed
   - If a habit is NOT confirmed, do NOT mention it
   - Do NOT say "quit smoking" if we don't know they smoke
   - Do NOT say "reduce alcohol" if we don't know they drink

2. DIETARY RULES — MOST IMPORTANT:
   - NEVER suggest avoiding specific cultural or religious foods
   - NEVER mention: pork, beef, shellfish, halal, kosher, or any
     religiously/culturally significant food items
   - ONLY mention foods with a DIRECT clinical impact on the condition
     (e.g., low sodium for hypertension, low glycemic index for diabetes)
   - Use NUTRIENT categories not specific foods
     (say "reduce saturated fats" NOT "avoid butter and cheese")
   - Exception: if a food has a specific pharmacological interaction
     with a current medication (e.g., grapefruit + statin, vitamin K + warfarin)
     then you may mention it specifically

3. EXERCISE RULES:
   - Consider age: elderly patients need lower intensity, balance focus
   - If mobility issues confirmed: suggest seated/chair exercises
   - If joint pain confirmed: suggest low-impact options (swimming, cycling)
   - Give SPECIFIC duration and frequency, not vague advice
   - Do NOT suggest high-impact activities for elderly patients

4. SAFETY RULES:
   - Include CRITICAL safety warnings for this condition
     (e.g., no driving for seizures, no heavy lifting post-cardiac event)
   - Consider current medications for safety interactions
   - Include emergency warning signs

5. RELEVANCE:
   - Maximum 3 points per category
   - Focus on the MOST IMPACTFUL advice
   - Be specific and actionable

Return JSON:
{{
  "condition": "{condition}",
  "patient_context": "{age}yo {sex}",
  "exercise": [
    {{
      "title": "Short heading",
      "detail": "Specific recommendation with intensity",
      "frequency": "e.g. 5 days/week, 30 min"
    }}
  ],
  "lifestyle": [
    {{
      "title": "Short heading",
      "detail": "Specific actionable change (only if confirmed habit or universally applicable)"
    }}
  ],
  "diet": [
    {{
      "title": "Short heading",
      "detail": "Nutrient or clinically relevant food guidance only",
      "nutrients_to_increase": ["e.g. potassium", "fibre"],
      "nutrients_to_reduce": ["e.g. sodium", "saturated fat"]
    }}
  ],
  "safety": [
    {{
      "title": "Short heading",
      "detail": "Specific safety instruction",
      "urgency": "high|medium|low"
    }}
  ],
  "monitoring": "Specific metric and target value",
  "follow_up": "Recommended follow-up timeframe"
}}
"""

        result               = self._call_llm(prompt)
        result['from_cache'] = False
        self._save_cache(cache_key, condition, sex, age_group, result)
        return result

    def get_counseling_for_all_conditions(
        self,
        conditions:      List[str],
        age:             int,
        sex:             str,
        medications:     List[str] = None,
        patient_profile: Dict = None
    ) -> List[Dict]:
        medications     = medications or []
        patient_profile = patient_profile or {}
        results         = []

        for condition in conditions:
            result = self.get_condition_counseling(
                condition       = condition,
                age             = age,
                sex             = sex,
                medications     = medications,
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
                            "You are a clinical physician. Generate precise condition counseling "
                            "based ONLY on confirmed patient information. "
                            "Never assume lifestyle habits. "
                            "Never mention cultural, religious or ethnically specific foods. "
                            "Use nutrient categories for diet advice, not specific food items. "
                            "Only mention pharmacological food interactions when clinically significant."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 900,
                response_format = {"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"   ❌ LLM error: {e}")
            return {
                "condition":  "",
                "exercise":   [],
                "lifestyle":  [],
                "diet":       [],
                "safety":     [],
                "monitoring": "Consult physician",
                "follow_up":  "As needed",
                "error":      str(e)
            }