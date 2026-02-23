"""
Evidence Analyzer
Uses Azure OpenAI to analyze medical evidence from multiple sources
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
        Smart food interaction detection using GPT-4o text analysis
        Finds ALL foods mentioned in research, not just predefined keywords
        """
        
        from services.pubmed_service import PubMedService
        from services.fda_service import FDAService
        
        pubmed = PubMedService()
        fda = FDAService()
        
        # Search broadly for food/nutrition research
        food_evidence = pubmed.search_all_food_interactions_for_drug(drug, max_results=10)
        fda_label = fda.get_drug_contraindications(drug)
        
        # If we have research abstracts
        if food_evidence.get('abstracts'):
            
            # Combine all abstract texts
            all_research_text = "\n\n---\n\n".join([
                f"Study (PMID: {a['pmid']}):\n{a['text']}"
                for a in food_evidence['abstracts']
            ])
            
            prompt = f"""
    You are analyzing medical research about {drug} and food/diet interactions.

    READ THESE {len(food_evidence['abstracts'])} RESEARCH ABSTRACTS CAREFULLY:

    {all_research_text}

    TASK: Extract ALL foods, beverages, nutrients, or dietary items mentioned in these abstracts that affect {drug}.

    Look for:
    - Specific foods (grapefruit, spinach, cheese, etc.)
    - Beverages (alcohol, juice, milk, etc.)
    - Nutrients (vitamin K, calcium, iron, etc.)
    - Food categories (high-fat meals, dairy, etc.)
    - Herbal supplements (St. John's Wort, garlic, etc.)

    For EACH food you find, determine:
    - Should it be AVOIDED completely?
    - Should it be SEPARATED in timing from drug?
    - Should it just be MONITORED?

    Return JSON:
    {{
    "foods_to_avoid": ["foods explicitly contraindicated in research"],
    "foods_to_separate": ["foods requiring timing separation"],
    "foods_to_monitor": ["foods with minor interactions"],
    "all_foods_found": ["complete list of ALL foods mentioned"],
    "evidence_summary": "summary of what research says about food interactions",
    "specific_recommendations": {{
        "food_name": "specific guidance from research"
    }}
    }}

    CRITICAL: Only include foods ACTUALLY MENTIONED in the research text above.
    If no foods mentioned, return empty lists.
    Do not add foods from general knowledge - only from the research provided.
    """
            
            result = self._call_gpt4o(prompt)
            result['pubmed_count'] = food_evidence['count']
            result['research_papers'] = len(food_evidence['abstracts'])
            result['pmids'] = food_evidence.get('pmids', [])
            
            return result
        
        else:
            # No research found - check FDA label only
            fda_info = fda_label.get('food_info', '') if fda_label.get('found') else ''
            
            if fda_info:
                prompt = f"""
    Extract food interactions from FDA drug label for {drug}.

    FDA LABEL TEXT:
    {fda_info}

    Extract any foods, beverages, or dietary items mentioned.

    Return JSON with same structure as before.
    Only include items mentioned in FDA label text above.
    """
                
                result = self._call_gpt4o(prompt)
                result['pubmed_count'] = 0
                result['source'] = 'FDA label only'
            else:
                result = {
                    'foods_to_avoid': [],
                    'foods_to_separate': [],
                    'foods_to_monitor': [],
                    'all_foods_found': [],
                    'evidence_summary': f'No published research or FDA food interaction information found for {drug}.',
                    'pubmed_count': 0
                }
            
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
            }