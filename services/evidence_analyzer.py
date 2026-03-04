"""
VabGenRx — Evidence Analyzer
Uses Azure OpenAI to analyze medical evidence from multiple sources.

CHANGES from original:
1. Tier 4 removed — replaced with INSUFFICIENT EVIDENCE response
   No AI knowledge fallback — evidence-only approach
   When no PubMed papers and no FDA reports exist:
   → severity="unknown", confidence=null, insufficient_evidence=true

2. Evidence counts added to drug-disease analysis path
   drug-drug already had pubmed_papers + fda_reports
   drug-disease now has pubmed_papers + fda_label_sections_found
   + fda_label_sections_count

3. _build_evidence_text updated — removes AI knowledge fallback
   text when no evidence found

Everything else identical to original.
"""

from openai import AzureOpenAI
import json
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()


class EvidenceAnalyzer:
    """
    Analyzes medical evidence using Azure OpenAI GPT-4o.

    Evidence-only approach:
    - Tier 1: High evidence  (20+ papers or 1000+ FDA reports)
    - Tier 2: Medium evidence (5+ papers or 100+ FDA reports)
    - Tier 3: Low evidence    (1+ papers or 10+ FDA reports)
    - Insufficient: No evidence found → unknown severity
    """

    def __init__(self):
        self.client = AzureOpenAI(
            api_key        = os.getenv("AZURE_OPENAI_KEY"),
            api_version    = os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")

    # ── Evidence Tier ─────────────────────────────────────────────────────────

    def determine_evidence_tier(
        self,
        pubmed_count: int,
        fda_reports:  int
    ) -> Dict:
        """
        Determine evidence tier based on available data.

        CHANGED: Tier 4 (AI Knowledge) removed entirely.
        When no evidence exists → INSUFFICIENT EVIDENCE.
        Severity will be set to unknown, confidence to null.
        """

        if pubmed_count >= 20 or fda_reports >= 1000:
            return {
                'tier':             1,
                'tier_name':        'HIGH EVIDENCE',
                'confidence_range': '95-98%',
                'description':      (
                    'Well-established — extensive published research'
                ),
                'reliability':      'Highest',
                'icon':             '📚📚📚',
                'recommendation_note': (
                    'Strong evidence base supports this '
                    'classification'
                ),
                'insufficient': False,
            }

        elif pubmed_count >= 5 or fda_reports >= 100:
            return {
                'tier':             2,
                'tier_name':        'MEDIUM EVIDENCE',
                'confidence_range': '85-92%',
                'description':      (
                    'Probable — supported by published research'
                ),
                'reliability':      'High',
                'icon':             '📚📚',
                'recommendation_note': (
                    'Adequate research supports this finding'
                ),
                'insufficient': False,
            }

        elif pubmed_count >= 1 or fda_reports >= 10:
            return {
                'tier':             3,
                'tier_name':        'LOW EVIDENCE',
                'confidence_range': '75-85%',
                'description':      'Limited published research',
                'reliability':      'Medium',
                'icon':             '📚',
                'recommendation_note': (
                    'Limited research available — '
                    'clinical judgment advised'
                ),
                'insufficient': False,
            }

        else:
            # CHANGED: No AI knowledge fallback
            # Return insufficient evidence — agent will set
            # severity=unknown and confidence=null
            return {
                'tier':             4,
                'tier_name':        'INSUFFICIENT EVIDENCE',
                'confidence_range': 'N/A',
                'description':      (
                    'No published research or FDA reports found'
                ),
                'reliability':      (
                    'Cannot assess — consult clinical pharmacist'
                ),
                'icon':             '⚠️',
                'recommendation_note': (
                    'No evidence found — do not use for clinical '
                    'decisions without pharmacist review'
                ),
                'insufficient': True,
            }

    # ── Drug-Drug Interaction Analysis ───────────────────────────────────────

    def analyze_drug_drug_interaction(
        self,
        drug1:    str,
        drug2:    str,
        evidence: Dict
    ) -> Dict:
        """
        Analyze drug-drug interaction.
        CHANGED: Tier 4 returns unknown/null instead of AI guess.
        """
        pubmed_data = evidence.get('pubmed', {})
        fda_data    = evidence.get('fda',    {})

        tier_info = self.determine_evidence_tier(
            pubmed_count = pubmed_data.get('count', 0),
            fda_reports  = fda_data.get('total_reports', 0)
        )

        # CHANGED: If insufficient evidence — return structured
        # unknown result immediately without LLM call
        if tier_info.get('insufficient'):
            return {
                'severity':           'unknown',
                'confidence':         None,
                'evidence_level':     'insufficient',
                'clinical_basis':     (
                    'No published research or FDA adverse event '
                    'reports found for this drug combination'
                ),
                'mechanism':          (
                    'Unknown — no evidence available'
                ),
                'clinical_effects':   (
                    'Cannot assess — insufficient evidence'
                ),
                'recommendation':     (
                    'Consult clinical pharmacist — '
                    'no published evidence available for '
                    'this combination'
                ),
                'commonly_prescribed_together': None,
                'references':         'No evidence found',
                'evidence_tier_info': tier_info,
                'pubmed_papers':      pubmed_data.get('count', 0),
                'fda_reports':        fda_data.get(
                    'total_reports', 0
                ),
                'insufficient_evidence': True,
            }

        evidence_text = self._build_evidence_text(
            pubmed_data, fda_data, drug1, drug2
        )

        prompt = f"""
You are a clinical pharmacologist analyzing drug interaction.

DRUG PAIR: {drug1} and {drug2}

EVIDENCE TIER: {tier_info['tier_name']}
Evidence available: {pubmed_data.get('count', 0)} PubMed papers,
{fda_data.get('total_reports', 0)} FDA reports

EVIDENCE DETAILS:
{evidence_text}

Based on this evidence tier, classify realistically:

SEVERE (5-10% of interactions):
- Contraindicated in FDA labeling or clinical guidelines
- Documented deaths or serious harm in literature
- Standard practice is to avoid combination

MODERATE (30-40% of interactions):
- Dose adjustment or monitoring needed
- Documented adverse events requiring intervention
- Used together WITH specific precautions

MINOR (50-60% of interactions):
- Commonly prescribed together safely
- Theoretical interaction with minimal clinical significance
- No dose adjustment typically needed

CONFIDENCE CALIBRATION BY TIER:
- Tier 1 (20+ papers): confidence 0.90-0.98
- Tier 2 (5-20 papers): confidence 0.80-0.92
- Tier 3 (1-5 papers): confidence 0.70-0.85

Return JSON:
{{
  "severity": "severe|moderate|minor",
  "confidence": 0.XX,
  "evidence_level": "well-established|probable|theoretical",
  "clinical_basis": "specific sources cited",
  "mechanism": "pharmacological explanation",
  "clinical_effects": "what happens to patient",
  "recommendation": "what healthcare provider should do",
  "commonly_prescribed_together": true,
  "references": "cite PMIDs"
}}
"""

        result = self._call_gpt4o(prompt)

        result['evidence_tier_info'] = tier_info
        result['pubmed_papers']      = pubmed_data.get('count', 0)
        result['fda_reports']        = fda_data.get(
            'total_reports', 0
        )
        result['insufficient_evidence'] = False

        return result

    # ── Drug-Disease Interaction Analysis ────────────────────────────────────

    def analyze_drug_disease_interaction(
        self,
        drug:     str,
        disease:  str,
        evidence: Dict
    ) -> Dict:
        """
        Analyze drug contraindication in disease.

        CHANGED:
        1. Tier 4 returns unknown/null instead of AI guess
        2. Evidence counts added to return value —
           pubmed_papers, fda_label_sections_found,
           fda_label_sections_count
        """
        pubmed_data = evidence.get('pubmed',    {})
        fda_label   = evidence.get('fda_label', {})

        tier_info = self.determine_evidence_tier(
            pubmed_count = pubmed_data.get('count', 0),
            fda_reports  = 0
        )

        # Build FDA sections found list
        fda_sections_found = []
        if fda_label.get('contraindications'):
            fda_sections_found.append('contraindications')
        if fda_label.get('warnings'):
            fda_sections_found.append('warnings_and_precautions')
        if fda_label.get('drug_interactions'):
            fda_sections_found.append('drug_interactions')

        # CHANGED: If insufficient evidence — return structured
        # unknown result immediately without LLM call
        if (
            tier_info.get('insufficient')
            and not fda_label.get('found')
        ):
            return {
                'contraindicated':     False,
                'severity':            'unknown',
                'confidence':          None,
                'clinical_evidence':   (
                    'No published research or FDA label found '
                    'for this drug-disease combination'
                ),
                'recommendation':      (
                    'Consult clinical pharmacist — '
                    'no published evidence available'
                ),
                'alternative_drugs':   [],
                'references':          'No evidence found',
                'evidence_tier_info':  tier_info,
                'pubmed_papers':       pubmed_data.get('count', 0),
                'fda_label_sections_found':  fda_sections_found,
                'fda_label_sections_count':  len(fda_sections_found),
                'insufficient_evidence': True,
            }

        # Build evidence text
        evidence_text = ""

        if fda_label.get('found'):
            contraindications = fda_label.get(
                'contraindications', ''
            )
            if contraindications:
                evidence_text += (
                    f"FDA LABEL CONTRAINDICATIONS:\n"
                    f"{contraindications}\n\n"
                )
            warnings = fda_label.get('warnings', '')
            if warnings:
                evidence_text += (
                    f"FDA LABEL WARNINGS:\n{warnings}\n\n"
                )
            drug_interactions = fda_label.get(
                'drug_interactions', ''
            )
            if drug_interactions:
                evidence_text += (
                    f"FDA DRUG INTERACTIONS:\n"
                    f"{drug_interactions}\n\n"
                )

        if pubmed_data.get('abstracts'):
            evidence_text += (
                f"PUBLISHED RESEARCH "
                f"({pubmed_data['count']} papers):\n"
            )
            for abstract in pubmed_data['abstracts'][:3]:
                evidence_text += (
                    f"\nPMID {abstract['pmid']}:\n"
                    f"{abstract['text']}\n"
                )

        prompt = f"""
Analyze safety of {drug} in patient with {disease}.

EVIDENCE TIER: {tier_info['tier_name']}

EVIDENCE:
{evidence_text}

Determine based on evidence only:
- Is this drug contraindicated in this disease?
- What is the risk level?
- What are safer alternatives?

CONFIDENCE CALIBRATION:
- Full FDA label + 10+ papers  → 0.88–0.95
- Partial FDA label + 5+ papers → 0.78–0.88
- Papers only (no FDA label)   → 0.68–0.78

Return JSON:
{{
  "contraindicated": true,
  "severity": "severe|moderate|minor",
  "confidence": 0.XX,
  "clinical_evidence": "what research/FDA shows",
  "recommendation": "clinical guidance",
  "alternative_drugs": ["safer", "alternatives"],
  "references": "cite PMIDs or FDA label"
}}
"""

        result = self._call_gpt4o(prompt)

        # CHANGED: Add evidence counts to return value
        result['evidence_tier_info']       = tier_info
        result['pubmed_papers']            = pubmed_data.get(
            'count', 0
        )
        result['fda_label_sections_found'] = fda_sections_found
        result['fda_label_sections_count'] = len(fda_sections_found)
        result['insufficient_evidence']    = False

        return result

    # ── Food Recommendations ──────────────────────────────────────────────────

    def get_food_recommendations_for_drug(
        self,
        drug:    str,
        disease: str = None
    ) -> Dict:
        """
        Focus only on pharmacological food interactions.
        CHANGED: Tier 4 returns no_significant_interactions=true
        instead of AI knowledge guess.
        """
        from services.pubmed_service import PubMedService
        from services.fda_service    import FDAService

        pubmed = PubMedService()
        fda    = FDAService()

        food_evidence = pubmed.search_all_food_interactions_for_drug(
            drug, max_results=10
        )
        fda_label = fda.get_drug_contraindications(drug)

        tier_info = self.determine_evidence_tier(
            pubmed_count = food_evidence.get('count', 0),
            fda_reports  = 0
        )

        result = None

        if food_evidence.get('abstracts'):
            all_research_text = "\n\n---\n\n".join([
                f"Study (PMID {a['pmid']}):\n{a['text']}"
                for a in food_evidence['abstracts']
            ])

            prompt = f"""
You are a clinical pharmacologist analyzing DRUG-FOOD
INTERACTIONS for {drug}.

EVIDENCE TIER: {tier_info['tier_name']}
Papers available: {food_evidence.get('count', 0)}

CRITICAL INSTRUCTIONS:
ONLY extract foods that have PHARMACOLOGICAL/CHEMICAL
interaction with {drug}.

✅ INCLUDE:
- Foods that affect drug ABSORPTION
- Foods that affect drug METABOLISM (e.g. CYP3A4)
- Foods that affect drug MECHANISM
- Foods that CHEMICALLY bind to drug

❌ EXCLUDE:
- General food safety for sick patients
- Dietary advice for disease management
- Foods to eat for health
- Infection precautions

READ RESEARCH ABSTRACTS:
{all_research_text}

TASK: Extract ONLY foods with PHARMACOLOGICAL interaction
with {drug}.

Return JSON:
{{
  "foods_to_avoid": [],
  "foods_to_separate": [],
  "foods_to_monitor": [],
  "mechanism_explanation": "HOW food affects drug",
  "evidence_summary": "what research shows",
  "no_significant_interactions": false
}}

If research discusses ONLY food safety (not drug interaction):
Return: {{"no_significant_interactions": true,
          "evidence_summary": "Research discusses food safety,
          not pharmacological interactions"}}
"""
            result = self._call_gpt4o(prompt)

        elif fda_label.get('found') and fda_label.get('food_info'):
            fda_info = fda_label['food_info']

            prompt = f"""
Extract ONLY pharmacological food interactions from FDA label
for {drug}.

FDA PATIENT INFORMATION:
{fda_info}

Look ONLY for:
✅ "take with food" or "take on empty stomach"
✅ "avoid [specific food/beverage]"
✅ "do not take with dairy/calcium/iron"
✅ "separate from..."

EXCLUDE general dietary advice.

Return JSON with ONLY pharmacological interactions.
If none found: {{"no_significant_interactions": true}}
"""
            result = self._call_gpt4o(prompt)
            if result:
                result['source'] = 'FDA label only'

        else:
            # CHANGED: No AI knowledge fallback
            # Return clean no-interaction result
            result = {
                'foods_to_avoid':            [],
                'foods_to_separate':         [],
                'foods_to_monitor':          [],
                'no_significant_interactions': True,
                'evidence_summary':          (
                    f'No published pharmacological food '
                    f'interactions found for {drug}. '
                    f'No specific dietary restrictions required '
                    f'based on available evidence.'
                ),
                'mechanism_explanation':     (
                    'No known food interactions documented '
                    'in published literature'
                ),
                'pubmed_count':              0,
            }

        if result:
            result['pubmed_count']      = food_evidence.get(
                'count', 0
            )
            result['pmids']             = food_evidence.get(
                'pmids', []
            )
            result['evidence_tier_info'] = tier_info

        else:
            result = {
                'no_significant_interactions': True,
                'evidence_summary':            'Analysis unavailable',
                'pubmed_count':                0,
                'evidence_tier_info':          tier_info,
            }

        return result

    # ── Evidence Text Builder ─────────────────────────────────────────────────

    def _build_evidence_text(
        self,
        pubmed_data: Dict,
        fda_data:    Dict,
        drug1:       str,
        drug2:       str
    ) -> str:
        """
        Build evidence summary for LLM prompt.

        CHANGED: Removed AI knowledge fallback text.
        When no evidence — returns plain statement only.
        insufficient_evidence tier handles this case before
        this method is called now.
        """
        text         = ""
        pubmed_count = pubmed_data.get('count', 0)

        if pubmed_count > 0:
            text += (
                f"PUBLISHED RESEARCH: {pubmed_count} papers "
                f"found in PubMed\n\n"
            )
            for i, abstract in enumerate(
                pubmed_data.get('abstracts', [])[:3], 1
            ):
                text += (
                    f"Study {i} (PMID: {abstract['pmid']}):\n"
                    f"{abstract['text']}\n\n"
                )

        fda_reports = fda_data.get('total_reports', 0)

        if fda_reports > 0:
            text += "FDA ADVERSE EVENT REPORTS:\n"
            text += f"Total reports: {fda_reports:,}\n"
            serious = fda_data.get('serious_reports', 0)
            if serious > 0:
                text += f"Serious adverse events: {serious:,}\n"
                severity_ratio = serious / fda_reports
                text += f"Severity ratio: {severity_ratio:.1%}\n"
            text += "\n"

        # CHANGED: No AI knowledge text when no evidence found
        # This branch should not be reached since
        # insufficient_evidence tier is handled before this call
        # but kept as safety net
        if pubmed_count == 0 and fda_reports == 0:
            text += (
                f"NO PUBLISHED RESEARCH OR FDA REPORTS FOUND "
                f"FOR {drug1.upper()} + {drug2.upper()}.\n"
                f"Insufficient evidence to assess this combination."
            )

        return text

    # ── GPT-4o Call ───────────────────────────────────────────────────────────

    def _call_gpt4o(self, prompt: str) -> Dict:
        """
        Call Azure OpenAI GPT-4o with error handling.
        System prompt updated — removed AI knowledge fallback
        instruction.
        """
        try:
            response = self.client.chat.completions.create(
                model    = self.deployment,
                messages = [
                    {
                        "role":    "system",
                        "content": (
                            "You are a board-certified clinical "
                            "pharmacologist with expertise in drug "
                            "interactions, pharmacokinetics, and "
                            "evidence-based medicine.\n\n"
                            "PRINCIPLES:\n"
                            "1. Base conclusions ONLY on the "
                            "evidence provided\n"
                            "2. Be realistic about clinical practice"
                            " — not overly cautious\n"
                            "3. Distinguish between theoretical risk"
                            " and clinical significance\n"
                            "4. If no evidence is provided — do not "
                            "guess. Return unknown severity and "
                            "null confidence.\n"
                            "5. Only extract facts from research "
                            "provided — never add from general "
                            "knowledge\n"
                            "6. When uncertain — recommend clinical "
                            "review\n\n"
                            "SEVERITY GUIDELINES:\n"
                            "- SEVERE: True contraindications, "
                            "documented serious harm\n"
                            "- MODERATE: Common in practice but "
                            "needs monitoring\n"
                            "- MINOR: Theoretical or minimal "
                            "clinical significance\n"
                            "- UNKNOWN: Insufficient evidence — "
                            "do not classify"
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature     = 0.1,
                max_tokens      = 700,
                response_format = {"type": "json_object"}
            )

            return json.loads(
                response.choices[0].message.content
            )

        except Exception as e:
            print(f"\n   ❌ GPT-4o Error: {e}")
            return {
                'severity':   'error',
                'confidence': None,
                'error':      str(e),
                'recommendation': (
                    'System error — consult pharmacist'
                )
            }