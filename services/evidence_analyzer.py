"""
Evidence Analyzer
Uses Azure OpenAI to analyze medical evidence from multiple sources
"""
'''
from openai import AzureOpenAI
import json
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

class EvidenceAnalyzer:
    """
    Analyzes medical evidence using Azure OpenAI GPT-4o
    """
    
    def __init__(self):
        self.client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    
    def analyze_drug_drug_interaction(self, drug1: str, drug2: str, evidence: Dict) -> Dict:
        """Analyze drug-drug interaction evidence"""
        
        pubmed_data = evidence.get('pubmed', {})
        fda_data = evidence.get('fda', {})
        
        evidence_text = self._build_evidence_text(pubmed_data, fda_data, drug1, drug2)
        
        prompt = f"""
You are a clinical pharmacologist analyzing evidence for drug interaction.

DRUG PAIR: {drug1} and {drug2}

EVIDENCE:
{evidence_text}

Classify based on evidence (be realistic about clinical practice):

SEVERE: Contraindicated, documented deaths/serious harm, FDA black box
MODERATE: Monitoring/dose adjustment needed in clinical practice
MINOR: Minimal clinical significance, commonly used safely together

Return JSON:
{{
  "severity": "severe/moderate/minor",
  "confidence": 0.XX,
  "evidence_level": "well-established/probable/theoretical",
  "clinical_basis": "FDA label/clinical guidelines/pharmacology",
  "mechanism": "pharmacological explanation",
  "clinical_effects": "what happens to patient",
  "recommendation": "what healthcare provider should do",
  "commonly_prescribed_together": true/false,
  "references": "cite key evidence"
}}
"""
        
        return self._call_gpt4o(prompt)
    
    def analyze_drug_disease_interaction(self, drug: str, disease: str, evidence: Dict) -> Dict:
        """Analyze drug contraindication in disease"""
        
        pubmed_data = evidence.get('pubmed', {})
        fda_label = evidence.get('fda_label', {})
        
        evidence_text = ""
        
        if fda_label.get('found'):
            contraindications = fda_label.get('contraindications', '')
            if contraindications:
                evidence_text += f"FDA LABEL CONTRAINDICATIONS:\n{contraindications}\n\n"
        
        if pubmed_data.get('abstracts'):
            evidence_text += f"PUBLISHED RESEARCH ({pubmed_data['count']} papers):\n"
            for abstract in pubmed_data['abstracts'][:3]:
                evidence_text += f"\nPMID {abstract['pmid']}:\n{abstract['text']}\n"
        
        if not evidence_text:
            evidence_text = f"No specific evidence found. Analyze based on drug pharmacology and disease pathophysiology."
        
        prompt = f"""
Analyze safety of {drug} in patient with {disease}.

EVIDENCE:
{evidence_text}

Determine:
- Is this drug contraindicated in this disease?
- What is the risk level?
- What are safer alternatives?

Return JSON:
{{
  "contraindicated": true/false,
  "severity": "severe/moderate/minor",
  "confidence": 0.XX,
  "clinical_evidence": "what research/FDA shows",
  "recommendation": "clinical guidance",
  "alternative_drugs": ["safer", "alternatives"],
  "references": "evidence citations"
}}
"""
        
        return self._call_gpt4o(prompt)
    
    def get_food_recommendations_for_drug(self, drug: str, disease: str = None) -> Dict:
        """
        IMPROVED: Focus only on pharmacological food interactions
        Excludes general food safety advice
        """
        
        from services.pubmed_service import PubMedService
        from services.fda_service import FDAService
        
        pubmed = PubMedService()
        fda = FDAService()
        
        # Search for food interactions
        food_evidence = pubmed.search_all_food_interactions_for_drug(drug, max_results=10)
        fda_label = fda.get_drug_contraindications(drug)
        
        # Build evidence text
        if food_evidence.get('abstracts'):
            all_research_text = "\n\n".join([
                f"PMID {a['pmid']}:\n{a['text']}"
                for a in food_evidence['abstracts']
            ])
            
            prompt = f"""
    You are a clinical pharmacologist analyzing DRUG-FOOD INTERACTIONS for {drug}.

    CRITICAL INSTRUCTIONS:
    - ONLY extract foods that CHEMICALLY interact with {drug}
    - Focus on: absorption, metabolism, pharmacokinetics, pharmacodynamics
    - EXCLUDE: General infection food safety, listeria warnings, food hygiene
    - EXCLUDE: Dietary advice for diseases (diabetic diet, heart-healthy eating)

    INCLUDE ONLY:
    ✅ Foods that reduce drug absorption (dairy + tetracyclines)
    ✅ Foods that inhibit drug metabolism (grapefruit + statins)  
    ✅ Foods that enhance drug effects (vitamin K + warfarin)
    ✅ Foods that cause chemical interactions

    READ RESEARCH:
    {all_research_text}

    TASK: Extract ONLY foods that have PHARMACOLOGICAL interaction with {drug}.

    Look for phrases like:
    - "reduces absorption of..."
    - "inhibits metabolism via CYP450..."
    - "increases bioavailability..."
    - "interferes with..."
    - "binds to the drug..."

    IGNORE phrases like:
    - "avoid raw foods during infection" (food safety, not interaction)
    - "patients should eat healthy diet" (general advice)
    - "foods high in..." (unless specifically interacting with drug)

    Return JSON:
    {{
    "foods_to_avoid": ["foods that CHEMICALLY contraindicate drug"],
    "foods_to_separate": ["foods that affect absorption - need timing separation"],
    "foods_to_monitor": ["foods with minor pharmacological interaction"],
    "mechanism_explanation": "HOW each food affects drug pharmacology",
    "evidence_summary": "what research says about CHEMICAL interactions",
    "no_significant_interactions": true/false
    }}

    If research mentions NO specific food interactions, return:
    {{"no_significant_interactions": true, "foods_to_avoid": [], ...}}

    If research only discusses food safety (not drug interaction), return:
    {{"no_significant_interactions": true, "note": "Research discusses food safety, not drug interactions"}}
    """
            
        else:
            # No research - check FDA label
            fda_info = fda_label.get('food_info', '') if fda_label.get('found') else ''
            
            if fda_info:
                prompt = f"""
    Extract ONLY pharmacological food interactions from FDA label for {drug}.

    FDA TEXT:
    {fda_info}

    Look for:
    - "take with food" or "take without food" (absorption)
    - "avoid [specific food]" (interaction)
    - "do not take with dairy/calcium/iron" (binding)

    EXCLUDE general dietary advice.

    Return JSON with foods that affect drug pharmacology only.
    """
            else:
                # No evidence at all
                return {
                    'foods_to_avoid': [],
                    'foods_to_separate': [],
                    'foods_to_monitor': [],
                    'no_significant_interactions': True,
                    'evidence_summary': f'No published pharmacological food interactions found for {drug}.',
                    'pubmed_count': 0,
                    'confidence_tier': 'low'
                }
        
        result = self._call_gpt4o(prompt)
        
        # Add metadata
        result['pubmed_count'] = food_evidence['count']
        result['pmids'] = food_evidence.get('pmids', [])
        
        # Determine confidence tier based on evidence
        if food_evidence['count'] > 20:
            result['confidence_tier'] = 'high'
            result['evidence_quality'] = 'Well-established'
        elif food_evidence['count'] > 5:
            result['confidence_tier'] = 'medium'
            result['evidence_quality'] = 'Probable'
        else:
            result['confidence_tier'] = 'low'
            result['evidence_quality'] = 'Theoretical'
        
        return result
    
    def _build_evidence_text(self, pubmed_data: Dict, fda_data: Dict, drug1: str, drug2: str) -> str:
        """Build comprehensive evidence summary from all sources"""
        
        text = ""
        
        # PubMed research
        if pubmed_data.get('count', 0) > 0:
            text += f"PUBLISHED RESEARCH: {pubmed_data['count']} papers found in PubMed\n\n"
            
            for i, abstract in enumerate(pubmed_data.get('abstracts', [])[:3], 1):
                text += f"Study {i} (PMID: {abstract['pmid']}):\n"
                text += f"{abstract['text']}\n\n"
        else:
            text += "No specific published research found in PubMed for this drug pair.\n\n"
        
        # FDA adverse events
        if fda_data.get('total_reports', 0) > 0:
            text += f"FDA ADVERSE EVENT REPORTS:\n"
            text += f"Total reports: {fda_data['total_reports']}\n"
            text += f"Serious events: {fda_data.get('serious_reports', 0)}\n"
            
            if fda_data.get('serious_reports', 0) > 0:
                severity_ratio = fda_data['serious_reports'] / fda_data['total_reports']
                text += f"Severity ratio: {severity_ratio:.1%}\n"
            
            text += "\n"
        
        # If no evidence at all
        if not text.strip() or pubmed_data.get('count', 0) == 0 and fda_data.get('total_reports', 0) == 0:
            text += f"No published evidence or FDA reports found.\n"
            text += f"Analysis based on pharmacological principles of {drug1} and {drug2}.\n"
        
        return text
    
    
    def determine_evidence_tier(self, pubmed_count: int, fda_reports: int) -> Dict:
        """
        Determine evidence tier and confidence based on available data
        
        Returns tier information for transparency
        """
        
        total_evidence = pubmed_count + (1 if fda_reports > 100 else 0)
        
        if pubmed_count >= 20 or fda_reports >= 1000:
            return {
                'tier': 1,
                'tier_name': 'HIGH EVIDENCE',
                'confidence_range': '95-98%',
                'description': 'Well-established - Extensive published research',
                'reliability': 'Highest',
                'icon': '📚📚📚'
            }
        
        elif pubmed_count >= 5 or fda_reports >= 100:
            return {
                'tier': 2,
                'tier_name': 'MEDIUM EVIDENCE',
                'confidence_range': '85-92%',
                'description': 'Probable - Supported by published research',
                'reliability': 'High',
                'icon': '📚📚'
            }
        
        elif pubmed_count >= 1 or fda_reports >= 10:
            return {
                'tier': 3,
                'tier_name': 'LOW EVIDENCE',
                'confidence_range': '75-85%',
                'description': 'Limited research - Based on case reports',
                'reliability': 'Medium',
                'icon': '📚'
            }
        
        else:
            return {
                'tier': 4,
                'tier_name': 'AI KNOWLEDGE',
                'confidence_range': '70-80%',
                'description': 'Based on pharmacological principles & AI medical training',
                'reliability': 'Medium - Recommend pharmacist review',
                'icon': '🤖'
            }
        
    def _call_gpt4o(self, prompt: str) -> Dict:
        """Call Azure OpenAI GPT-4o"""
        
        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a clinical pharmacologist analyzing medical evidence. Base classifications on published research and clinical guidelines. Be realistic about clinical practice, not overly cautious. Only state facts supported by evidence."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=600,
                response_format={"type": "json_object"}
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            return {
                'severity': 'error',
                'confidence': 0.0,
                'error': str(e)
            }'''

"""
Evidence Analyzer
Uses Azure OpenAI to analyze medical evidence from multiple sources

IMPROVEMENTS:
- Multi-tier confidence system (Problem 3)
- Better food interaction prompting (Problem 1)
- Transparent about evidence quality
- Accepts GPT-4o knowledge when no research (Problem 2)
"""

from openai import AzureOpenAI
import json
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

class EvidenceAnalyzer:
    """
    Analyzes medical evidence using Azure OpenAI GPT-4o
    
    Features:
    - Multi-tier evidence classification
    - Pharmacological food interaction focus
    - Transparent confidence scoring
    - Evidence-based or AI-based clearly labeled
    """
    
    def __init__(self):
        self.client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    
    def determine_evidence_tier(self, pubmed_count: int, fda_reports: int) -> Dict:
        """
        Determine evidence tier based on available data
        Provides transparency about evidence quality
        """
        
        if pubmed_count >= 20 or fda_reports >= 1000:
            return {
                'tier': 1,
                'tier_name': 'HIGH EVIDENCE',
                'confidence_range': '95-98%',
                'description': 'Well-established - Extensive published research',
                'reliability': 'Highest',
                'icon': '📚📚📚',
                'recommendation_note': 'Strong evidence base supports this classification'
            }
        
        elif pubmed_count >= 5 or fda_reports >= 100:
            return {
                'tier': 2,
                'tier_name': 'MEDIUM EVIDENCE',
                'confidence_range': '85-92%',
                'description': 'Probable - Supported by published research',
                'reliability': 'High',
                'icon': '📚📚',
                'recommendation_note': 'Adequate research supports this finding'
            }
        
        elif pubmed_count >= 1 or fda_reports >= 10:
            return {
                'tier': 3,
                'tier_name': 'LOW EVIDENCE',
                'confidence_range': '75-85%',
                'description': 'Limited published research',
                'reliability': 'Medium',
                'icon': '📚',
                'recommendation_note': 'Limited research available - clinical judgment advised'
            }
        
        else:
            return {
                'tier': 4,
                'tier_name': 'AI MEDICAL KNOWLEDGE',
                'confidence_range': '70-80%',
                'description': 'Based on pharmacological principles & FDA drug training',
                'reliability': 'Medium - Pharmacist review recommended',
                'icon': '🤖',
                'recommendation_note': 'Classification based on drug pharmacology and medical AI training'
            }
    
    def analyze_drug_drug_interaction(self, drug1: str, drug2: str, evidence: Dict) -> Dict:
        """
        Analyze drug-drug interaction with tier system
        """
        
        pubmed_data = evidence.get('pubmed', {})
        fda_data = evidence.get('fda', {})
        
        # Determine evidence tier FIRST
        tier_info = self.determine_evidence_tier(
            pubmed_count=pubmed_data.get('count', 0),
            fda_reports=fda_data.get('total_reports', 0)
        )
        
        # Build evidence text
        evidence_text = self._build_evidence_text(pubmed_data, fda_data, drug1, drug2)
        
        # Enhanced prompt with tier awareness
        prompt = f"""
You are a clinical pharmacologist analyzing drug interaction.

DRUG PAIR: {drug1} and {drug2}

EVIDENCE TIER: {tier_info['tier_name']}
Evidence available: {pubmed_data.get('count', 0)} PubMed papers, {fda_data.get('total_reports', 0)} FDA reports

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
- Tier 1 (20+ papers): Use confidence 0.90-0.98
- Tier 2 (5-20 papers): Use confidence 0.80-0.92
- Tier 3 (1-5 papers): Use confidence 0.70-0.85
- Tier 4 (0 papers): Use confidence 0.65-0.80

When using Tier 4 (no research), state:
"Based on pharmacological principles of [drug class] and [drug class]"

Return JSON:
{{
  "severity": "severe/moderate/minor",
  "confidence": 0.XX,
  "evidence_level": "well-established/probable/theoretical/pharmacological",
  "clinical_basis": "specific sources (PubMed/FDA/pharmacology)",
  "mechanism": "pharmacological explanation",
  "clinical_effects": "what happens to patient",
  "recommendation": "what healthcare provider should do",
  "commonly_prescribed_together": true/false,
  "references": "cite PMIDs or state 'pharmacological principles'"
}}
"""
        
        result = self._call_gpt4o(prompt)
        
        # Add tier metadata
        result['evidence_tier_info'] = tier_info
        result['pubmed_papers'] = pubmed_data.get('count', 0)
        result['fda_reports'] = fda_data.get('total_reports', 0)
        
        return result
    
    def analyze_drug_disease_interaction(self, drug: str, disease: str, evidence: Dict) -> Dict:
        """Analyze drug contraindication in disease"""
        
        pubmed_data = evidence.get('pubmed', {})
        fda_label = evidence.get('fda_label', {})
        
        # Determine tier
        tier_info = self.determine_evidence_tier(
            pubmed_count=pubmed_data.get('count', 0),
            fda_reports=0  # No FDA adverse events for disease contraindications
        )
        
        # Build evidence
        evidence_text = ""
        
        if fda_label.get('found'):
            contraindications = fda_label.get('contraindications', '')
            if contraindications:
                evidence_text += f"FDA LABEL CONTRAINDICATIONS:\n{contraindications}\n\n"
        
        if pubmed_data.get('abstracts'):
            evidence_text += f"PUBLISHED RESEARCH ({pubmed_data['count']} papers):\n"
            for abstract in pubmed_data['abstracts'][:3]:
                evidence_text += f"\nPMID {abstract['pmid']}:\n{abstract['text']}\n"
        
        if not evidence_text:
            evidence_text = f"No specific evidence found. Analyze based on drug pharmacology and disease pathophysiology."
        
        prompt = f"""
Analyze safety of {drug} in patient with {disease}.

EVIDENCE TIER: {tier_info['tier_name']}

EVIDENCE:
{evidence_text}

Determine based on evidence:
- Is this drug contraindicated in this disease?
- What is the risk level?
- What are safer alternatives?

CONFIDENCE CALIBRATION:
Use {tier_info['confidence_range']} based on evidence tier.

Return JSON:
{{
  "contraindicated": true/false,
  "severity": "severe/moderate/minor",
  "confidence": 0.XX,
  "clinical_evidence": "what research/FDA shows",
  "recommendation": "clinical guidance",
  "alternative_drugs": ["safer", "alternatives"],
  "references": "cite PMIDs or FDA label or state 'clinical pharmacology'"
}}
"""
        
        result = self._call_gpt4o(prompt)
        result['evidence_tier_info'] = tier_info
        result['pubmed_count'] = pubmed_data.get('count', 0)
        
        return result
    
    def get_food_recommendations_for_drug(self, drug: str, disease: str = None) -> Dict:
        """
        IMPROVED: Focus only on pharmacological food interactions
        Excludes general food safety advice (Problem 1 fix)
        """
        
        from services.pubmed_service import PubMedService
        from services.fda_service import FDAService
        
        pubmed = PubMedService()
        fda = FDAService()
        
        # Search for food interactions
        food_evidence = pubmed.search_all_food_interactions_for_drug(drug, max_results=10)
        fda_label = fda.get_drug_contraindications(drug)
        
        # Determine tier for food evidence
        tier_info = self.determine_evidence_tier(
            pubmed_count=food_evidence.get('count', 0),
            fda_reports=0
        )
        
        result = None  # ← FIX: Initialize result variable
        
        # Build evidence text
        if food_evidence.get('abstracts'):
            all_research_text = "\n\n---\n\n".join([
                f"Study (PMID {a['pmid']}):\n{a['text']}"
                for a in food_evidence['abstracts']
            ])
            
            prompt = f"""
    You are a clinical pharmacologist analyzing DRUG-FOOD INTERACTIONS for {drug}.

    EVIDENCE TIER: {tier_info['tier_name']}
    Papers available: {food_evidence.get('count', 0)}

    CRITICAL INSTRUCTIONS - READ CAREFULLY:

    ONLY extract foods that have PHARMACOLOGICAL/CHEMICAL interaction with {drug}.

    ✅ INCLUDE:
    - Foods that affect drug ABSORPTION (e.g., "dairy reduces absorption")
    - Foods that affect drug METABOLISM (e.g., "grapefruit inhibits CYP3A4")
    - Foods that affect drug MECHANISM (e.g., "vitamin K antagonizes warfarin")
    - Foods that CHEMICALLY bind to drug (e.g., "calcium chelates tetracycline")

    ❌ EXCLUDE:
    - General food safety for sick patients (listeria, raw eggs, etc.)
    - Dietary advice for disease management (low-sodium diet, diabetic diet)
    - Foods to eat for health (fruits, vegetables for nutrition)
    - Infection precautions (avoid raw foods during infection)

    READ RESEARCH ABSTRACTS:
    {all_research_text}

    TASK: Extract ONLY foods with PHARMACOLOGICAL interaction with {drug}.

    Look for key phrases:
    ✅ "reduces absorption of {drug}"
    ✅ "inhibits metabolism of {drug}"
    ✅ "{drug} should not be taken with..."
    ✅ "bioavailability decreased by..."
    ✅ "plasma concentration affected by..."

    IGNORE phrases:
    ❌ "patients should avoid raw foods" (food safety)
    ❌ "maintain healthy diet" (general advice)  
    ❌ "foods high in fiber" (unless specifically affects drug)
    ❌ "listeria risk" (food safety, not drug interaction)

    Return JSON:
    {{
    "foods_to_avoid": ["foods that CHEMICALLY contraindicate the drug"],
    "foods_to_separate": ["foods affecting absorption - timing separation needed"],
    "foods_to_monitor": ["minor pharmacological interaction"],
    "mechanism_explanation": "HOW food affects drug at molecular/pharmacological level",
    "evidence_summary": "what research says about CHEMICAL interactions ONLY",
    "no_significant_interactions": true/false,
    "confidence_note": "based on evidence quality"
    }}

    If research discusses ONLY food safety (not drug interaction):
    Return: {{"no_significant_interactions": true, "evidence_summary": "Research discusses food safety, not pharmacological drug interactions"}}

    If NO foods with pharmacological interaction found:
    Return: {{"no_significant_interactions": true, "foods_to_avoid": [], "foods_to_separate": [], "foods_to_monitor": []}}
    """
            
            result = self._call_gpt4o(prompt)
            
        elif fda_label.get('found') and fda_label.get('food_info'):
            # No research - check FDA label only
            fda_info = fda_label['food_info']
            
            prompt = f"""
    Extract ONLY pharmacological food interactions from FDA label for {drug}.

    FDA PATIENT INFORMATION:
    {fda_info}

    Look ONLY for:
    ✅ "take with food" or "take on empty stomach" (absorption interaction)
    ✅ "avoid [specific food/beverage]" (pharmacological interaction)
    ✅ "do not take with dairy/calcium/iron" (chemical binding)
    ✅ "separate from..." (timing-dependent interaction)

    EXCLUDE:
    ❌ General dietary advice
    ❌ Food safety warnings
    ❌ Nutritional recommendations

    Return JSON with ONLY pharmacological interactions.
    If none found, return: {{"no_significant_interactions": true}}
    """
            
            result = self._call_gpt4o(prompt)
            result['source'] = 'FDA label only'
            
        else:
            # No evidence at all
            result = {
                'foods_to_avoid': [],
                'foods_to_separate': [],
                'foods_to_monitor': [],
                'all_foods_found': [],
                'no_significant_interactions': True,
                'evidence_summary': f'No published pharmacological food interactions found for {drug}. No specific dietary restrictions required.',
                'mechanism_explanation': 'No known food interactions documented',
                'pubmed_count': 0
            }
        
        # Add metadata to result
        if result:  # ← FIX: Check result exists before modifying
            result['pubmed_count'] = food_evidence.get('count', 0)
            result['pmids'] = food_evidence.get('pmids', [])
            result['evidence_tier_info'] = tier_info
            
            # Set confidence tier
            if food_evidence.get('count', 0) > 20:
                result['confidence_tier'] = 'high'
                result['evidence_quality'] = 'Well-established'
            elif food_evidence.get('count', 0) > 5:
                result['confidence_tier'] = 'medium'
                result['evidence_quality'] = 'Probable'
            elif food_evidence.get('count', 0) > 0:
                result['confidence_tier'] = 'low'
                result['evidence_quality'] = 'Limited research'
            else:
                result['confidence_tier'] = 'minimal'
                result['evidence_quality'] = 'No specific research'
        else:
            # Fallback if result is still None
            result = {
                'no_significant_interactions': True,
                'evidence_summary': 'Analysis unavailable',
                'pubmed_count': 0
            }
        
        return result
    
    def _build_evidence_text(self, pubmed_data: Dict, fda_data: Dict, drug1: str, drug2: str) -> str:
        """
        Build comprehensive evidence summary
        """
        
        text = ""
        
        # PubMed research
        pubmed_count = pubmed_data.get('count', 0)
        
        if pubmed_count > 0:
            text += f"PUBLISHED RESEARCH: {pubmed_count} papers found in PubMed\n\n"
            
            for i, abstract in enumerate(pubmed_data.get('abstracts', [])[:3], 1):
                text += f"Study {i} (PMID: {abstract['pmid']}):\n"
                text += f"{abstract['text']}\n\n"
        
        # FDA adverse events
        fda_reports = fda_data.get('total_reports', 0)
        
        if fda_reports > 0:
            text += f"FDA ADVERSE EVENT REPORTS:\n"
            text += f"Total reports: {fda_reports:,}\n"
            
            serious = fda_data.get('serious_reports', 0)
            if serious > 0:
                text += f"Serious adverse events: {serious:,}\n"
                severity_ratio = serious / fda_reports
                text += f"Severity ratio: {severity_ratio:.1%}\n"
            
            text += "\n"
        
        # If no evidence at all
        if pubmed_count == 0 and fda_reports == 0:
            text += f"NO PUBLISHED RESEARCH OR FDA REPORTS FOUND\n\n"
            text += f"Analysis will be based on:\n"
            text += f"- Pharmacological properties of {drug1} and {drug2}\n"
            text += f"- Drug class interactions (known class-based patterns)\n"
            text += f"- Mechanism of action considerations\n"
            text += f"- FDA-approved labeling knowledge\n"
            text += f"- Clinical pharmacology principles\n\n"
            text += f"NOTE: This represents AI medical knowledge, not specific published evidence.\n"
            text += f"Recommend pharmacist verification for clinical use.\n"
        
        return text
    
    def _call_gpt4o(self, prompt: str) -> Dict:
        """
        Call Azure OpenAI GPT-4o with error handling
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {
                        "role": "system",
                        "content": """You are a board-certified clinical pharmacologist with expertise in drug interactions, pharmacokinetics, and evidence-based medicine.

PRINCIPLES:
1. Base conclusions on available evidence
2. Be realistic about clinical practice (not overly cautious)
3. Distinguish between theoretical risk and clinical significance
4. Consider: "Is this commonly prescribed safely in practice?"
5. Only extract facts from research provided - don't add from general knowledge
6. When uncertain, recommend clinical review rather than contraindicate

SEVERITY GUIDELINES:
- SEVERE: True contraindications, documented serious harm
- MODERATE: Common in practice but needs monitoring
- MINOR: Theoretical or minimal clinical significance

Be honest about evidence quality and limitations."""
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=700,
                response_format={"type": "json_object"}
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            print(f"\n   ❌ GPT-4o Error: {e}")
            return {
                'severity': 'error',
                'confidence': 0.0,
                'error': str(e),
                'recommendation': 'System error - consult pharmacist'
            }