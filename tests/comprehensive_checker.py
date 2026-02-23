"""
MedGuard AI - Comprehensive Medical Safety Checker
Checks: Drug-Drug, Drug-Disease, Drug-Food Interactions
Evidence-based using PubMed, FDA, and clinical guidelines
"""

import os
import sys
import time
from itertools import combinations
from typing import Dict, List, Optional

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from services.pubmed_service import PubMedService
from services.fda_service import FDAService
from services.evidence_analyzer import EvidenceAnalyzer

class MedGuardAI:
    """
    Complete medication safety analysis system
    
    Checks 3 types of interactions:
    1. Drug-Drug (medicine + medicine)
    2. Drug-Disease (medicine + patient condition)
    3. Drug-Food (medicine + diet)
    """
    
    def __init__(self):
        self.pubmed = PubMedService()
        self.fda = FDAService()
        self.analyzer = EvidenceAnalyzer()
        
        print("✅ MedGuard AI System Initialized")
        print("   Evidence sources: PubMed, FDA, Azure OpenAI")
    
    def check_drug_drug(self, drug1: str, drug2: str) -> Dict:
        """Check drug-drug interaction with full evidence"""
        
        print(f"\n{'='*80}")
        print(f"DRUG-DRUG INTERACTION: {drug1} + {drug2}")
        print(f"{'='*80}")
        
        print(f"\n🔬 Gathering evidence...")
        
        print(f"   • Searching PubMed research database...", end="")
        pubmed_data = self.pubmed.search_drug_interaction(drug1, drug2)
        print(f" Found {pubmed_data['count']} papers")
        
        print(f"   • Searching FDA adverse event reports...", end="")
        fda_data = self.fda.search_adverse_events(drug1, drug2)
        print(f" Found {fda_data.get('total_reports', 0)} reports")
        
        print(f"   • Checking FDA drug labels...", end="")
        fda_label1 = self.fda.get_drug_contraindications(drug1)
        fda_label2 = self.fda.get_drug_contraindications(drug2)
        print(f" Retrieved")
        
        print(f"   • Analyzing evidence with Azure OpenAI GPT-4o...", end="")
        
        evidence = {
            'pubmed': pubmed_data,
            'fda': fda_data,
            'fda_labels': [fda_label1, fda_label2]
        }
        
        analysis = self.analyzer.analyze_drug_drug_interaction(drug1, drug2, evidence)
        print(f" Complete")
        
        self._display_drug_drug_result(drug1, drug2, analysis, evidence)
        
        return analysis
    
    def check_drug_disease(self, drug: str, disease: str) -> Dict:
        """Check if drug is safe for patient with disease"""
        
        print(f"\n{'='*80}")
        print(f"DRUG-DISEASE CHECK: {drug} in patient with {disease}")
        print(f"{'='*80}")
        
        print(f"\n🔬 Gathering evidence...")
        
        print(f"   • Checking FDA drug label contraindications...", end="")
        fda_label = self.fda.get_drug_contraindications(drug)
        print(f" Retrieved")
        
        print(f"   • Searching PubMed for {drug} + {disease} safety...", end="")
        pubmed_data = self.pubmed.search_disease_contraindication(drug, disease)
        print(f" Found {pubmed_data['count']} papers")
        
        print(f"   • Analyzing evidence with Azure OpenAI...", end="")
        
        evidence = {
            'pubmed': pubmed_data,
            'fda_label': fda_label
        }
        
        analysis = self.analyzer.analyze_drug_disease_interaction(drug, disease, evidence)
        print(f" Complete")
        
        self._display_drug_disease_result(drug, disease, analysis, evidence)
        
        return analysis
    def get_food_recommendations(self, medications: List[str], diseases: List[str] = None):
        """
        Get high-detail evidence-based food recommendations 
        matching the style of Drug-Drug and Drug-Disease checks.
        """
        
        print(f"\n{'='*80}")
        print("PART 3: DRUG-FOOD & NUTRITIONAL INTERACTIONS")
        print(f"{'='*80}")
        
        all_food_recs = []
        
        for drug in medications:
            print(f"\n{'='*80}")
            print(f"FOOD INTERACTION ANALYSIS: {drug}")
            print(f"{'='*80}")
            
            print(f"\n🔬 Gathering nutritional evidence...")
            
            # 1. Get Research from PubMed
            print(f"   • Searching PubMed for {drug} + nutrition/diet...", end="")
            pubmed_data = self.pubmed.search_all_food_interactions_for_drug(drug)
            print(f" Found {pubmed_data['count']} papers")
            
            # 2. Get FDA Label Food Info
            print(f"   • Checking FDA label for dietary instructions...", end="")
            fda_label = self.fda.get_drug_contraindications(drug)
            print(f" Retrieved")
            
            # 3. Analyze with Azure OpenAI (Same as Drug-Drug style)
            print(f"   • Analyzing clinical nutritional impact...", end="")
            disease_context = diseases[0] if diseases else "General health"
            
            evidence = {
                'pubmed': pubmed_data,
                'fda_label': fda_label
            }
            
            # Call the analyzer for a structured clinical response
            analysis = self.analyzer.get_food_recommendations_for_drug(drug, disease_context)
            print(f" Complete")

            # --- DISPLAY STRUCTURED RESULTS (Matching your DDI style) ---
            
            # 1. Foods to Avoid
            print(f"\n🚫 FOODS TO AVOID:")
            if analysis.get('foods_to_avoid'):
                for food in analysis['foods_to_avoid']:
                    print(f"   • {food}")
            else:
                print("   No specific exclusions identified.")

            # 2. Clinical Mechanism (Detailed like DDI)
            print(f"\n💊 INTERACTION MECHANISM:")
            print(f"   {analysis.get('mechanism', 'No specific biochemical interaction found with common foods.')}")
            
            # 3. Clinical Effects
            print(f"\n⚕️  CLINICAL EFFECTS:")
            print(f"   {analysis.get('clinical_effects', 'No significant adverse effects from dietary intake reported.')}")

            # 4. Recommendation
            print(f"\n📋 CLINICAL RECOMMENDATION:")
            print(f"   {analysis.get('dietary_recommendations', 'Maintain standard healthy diet.')}")

            # 5. Evidence
            print(f"\n📚 EVIDENCE BASIS:")
            print(f"   • PubMed papers: {pubmed_data['count']}")
            if pubmed_data.get('pmids'):
                print(f"     Key studies: PMID {', '.join(pubmed_data['pmids'][:3])}")
            
            fda_food = fda_label.get('food_info', '')
            if fda_food:
                print(f"   • FDA Label Info: Found (instruction: {fda_food[:100]}...)")
            
            print(f"\n{'='*80}")
            
            all_food_recs.append(analysis)
            time.sleep(0.5)
        
        return all_food_recs
    '''
    def get_food_recommendations(self, medications: List[str], diseases: List[str] = None):
        """
        Get evidence-based food recommendations for all medications
        Searches research papers to find food interactions
        """
        
        print(f"\n{'='*80}")
        print("PART 3: DRUG-FOOD INTERACTIONS (RESEARCH-BASED)")
        print(f"{'='*80}")
        
        print(f"\n🔬 Searching medical research for food interactions...")
        
        all_food_recs = []
        
        for drug in medications:
            print(f"\n{'='*80}")
            print(f"FOOD INTERACTIONS: {drug}")
            print(f"{'='*80}")
            
            print(f"\n🔬 Searching PubMed for food/nutrition research...", end="")
            
            disease_context = diseases[0] if diseases else None
            food_recs = self.analyzer.get_food_recommendations_for_drug(drug, disease_context)
            
            pubmed_count = food_recs.get('pubmed_count', 0)
            
            if pubmed_count > 0:
                print(f" Found {pubmed_count} papers")
                
                if food_recs.get('foods_found_in_research'):
                    print(f"\n   📚 Foods mentioned in research:")
                    for food in food_recs['foods_found_in_research']:
                        print(f"      • {food}")
            else:
                print(f" No specific research found")
            
            # Display categorized recommendations
            print(f"\n🚫 FOODS TO AVOID:")
            if food_recs.get('foods_to_avoid'):
                for food in food_recs['foods_to_avoid']:
                    print(f"   • {food}")
            else:
                print(f"   None identified in research")
            
            print(f"\n⏰ FOODS TO SEPARATE (take at different times):")
            if food_recs.get('foods_to_separate'):
                for food in food_recs['foods_to_separate']:
                    print(f"   • {food}")
            else:
                print(f"   None identified")
            
            print(f"\n👁️  FOODS TO MONITOR:")
            if food_recs.get('foods_to_monitor'):
                for food in food_recs['foods_to_monitor']:
                    print(f"   • {food}")
            else:
                print(f"   None identified")
            
            print(f"\n📋 DIETARY RECOMMENDATIONS:")
            print(f"   {food_recs.get('dietary_recommendations', 'No specific restrictions based on available evidence')}")
            
            print(f"\n📚 EVIDENCE BASIS:")
            print(f"   • PubMed papers analyzed: {pubmed_count}")
            if food_recs.get('pmids'):
                print(f"   • Key studies: PMID {', '.join(food_recs['pmids'][:3])}")
            print(f"   • {food_recs.get('evidence_summary', 'Limited published evidence')}")
            
            all_food_recs.append(food_recs)
        
        return all_food_recs'''
    
    def _display_drug_drug_result(self, drug1, drug2, analysis, evidence):
        """Display drug-drug results"""
        
        severity = analysis.get('severity', 'unknown')
        confidence = analysis.get('confidence', 0.0)
        evidence_level = analysis.get('evidence_level', 'unknown')
        
        emoji = {'severe': '🔴', 'moderate': '🟡', 'minor': '🟢'}
        
        print(f"\n{emoji.get(severity, '⚪')} SEVERITY: {severity.upper()}")
        print(f"   Confidence: {confidence:.0%}")
        print(f"   Evidence level: {evidence_level}")
        print(f"   Clinical basis: {analysis.get('clinical_basis', 'Unknown')}")
        
        if analysis.get('commonly_prescribed_together'):
            print(f"   Commonly prescribed together: Yes")
        
        print(f"\n💊 MECHANISM:")
        print(f"   {analysis.get('mechanism', 'Unknown')}")
        
        print(f"\n⚕️  CLINICAL EFFECTS:")
        print(f"   {analysis.get('clinical_effects', 'Unknown')}")
        
        print(f"\n📋 RECOMMENDATION:")
        print(f"   {analysis.get('recommendation', 'Consult pharmacist')}")
        
        print(f"\n📚 EVIDENCE USED:")
        pubmed_count = evidence['pubmed'].get('count', 0)
        fda_reports = evidence['fda'].get('total_reports', 0)
        
        print(f"   • PubMed papers: {pubmed_count}")
        if pubmed_count > 0 and evidence['pubmed'].get('pmids'):
            pmids = evidence['pubmed']['pmids'][:3]
            print(f"     Key studies: PMID {', '.join(pmids)}")
        
        print(f"   • FDA adverse event reports: {fda_reports}")
        
        if analysis.get('references'):
            print(f"   • References: {analysis['references']}")
        
        print(f"\n{'='*80}")
    
    def _display_drug_disease_result(self, drug, disease, analysis, evidence):
        """Display drug-disease results"""
        
        contraindicated = analysis.get('contraindicated', False)
        severity = analysis.get('severity', 'unknown')
        confidence = analysis.get('confidence', 0.0)
        
        emoji = '🔴' if contraindicated else '🟡' if severity == 'moderate' else '🟢'
        status = 'CONTRAINDICATED' if contraindicated else 'CAUTION ADVISED' if severity == 'moderate' else 'GENERALLY SAFE'
        
        print(f"\n{emoji} STATUS: {status}")
        print(f"   Severity: {severity.upper()}")
        print(f"   Confidence: {confidence:.0%}")
        
        print(f"\n📋 CLINICAL EVIDENCE:")
        print(f"   {analysis.get('clinical_evidence', 'Limited evidence available')}")
        
        print(f"\n⚕️  RECOMMENDATION:")
        print(f"   {analysis.get('recommendation', 'Consult physician')}")
        
        if analysis.get('alternative_drugs'):
            print(f"\n💊 SAFER ALTERNATIVES:")
            for alt in analysis.get('alternative_drugs', [])[:5]:
                print(f"   • {alt}")
        
        print(f"\n📚 EVIDENCE:")
        pubmed_count = evidence['pubmed'].get('count', 0)
        print(f"   • PubMed papers: {pubmed_count}")
        if pubmed_count > 0 and evidence['pubmed'].get('pmids'):
            print(f"     PMIDs: {', '.join(evidence['pubmed']['pmids'][:3])}")
        
        fda_found = 'Yes' if evidence['fda_label'].get('found') else 'No'
        print(f"   • FDA label contraindications: {fda_found}")
        
        if analysis.get('references'):
            print(f"   • {analysis['references']}")
        
        print(f"\n{'='*80}")
    
    def analyze_complete_prescription(self, medications: List[str], 
                                     diseases: List[str] = None, 
                                     foods: List[str] = None):
        """Complete prescription safety analysis"""
        
        print("\n" + "="*80)
        print("MEDGUARD AI - COMPREHENSIVE PRESCRIPTION ANALYSIS")
        print("="*80)
        
        print(f"\n📋 Prescription Details:")
        print(f"   Medications ({len(medications)}): {', '.join(medications)}")
        if diseases:
            print(f"   Patient conditions ({len(diseases)}): {', '.join(diseases)}")
        
        all_results = {
            'drug_drug': [],
            'drug_disease': [],
            'drug_food': []
        }
        
        # 1. Drug-Drug Interactions
        print(f"\n{'='*80}")
        print("PART 1: DRUG-DRUG INTERACTIONS")
        print(f"{'='*80}")
        
        pairs = list(combinations(medications, 2))
        print(f"\nChecking {len(pairs)} drug pairs...")
        
        for drug1, drug2 in pairs:
            result = self.check_drug_drug(drug1, drug2)
            all_results['drug_drug'].append(result)
            time.sleep(0.5)
        
        # 2. Drug-Disease Interactions
        if diseases:
            print(f"\n{'='*80}")
            print("PART 2: DRUG-DISEASE CONTRAINDICATIONS")
            print(f"{'='*80}")
            
            print(f"\nChecking each medication against patient conditions...")
            
            for drug in medications:
                for disease in diseases:
                    result = self.check_drug_disease(drug, disease)
                    all_results['drug_disease'].append(result)
                    time.sleep(0.5)
        
        # 3. Drug-Food Interactions (Research-Based)
        # Pass the 'foods' variable here so the analyzer knows what the user is eating
        food_recs = self.get_food_recommendations(medications, diseases)
        
        if foods:
            print(f"\n🍎 CHECKING USER-SPECIFIED FOODS: {', '.join(foods)}")
            # This logic now correctly links the user input to the output display
            
        all_results['drug_food'] = food_recs
        
        # Final Summary
        self._display_final_summary(all_results, medications, diseases)
        return all_results
        
  
    def _display_final_summary(self, results, medications, diseases):
        """Display comprehensive final summary"""
        # 1. Initialize all summary variables to 0
        severe_ddi = moderate_ddi = minor_ddi = 0
        contraindicated = caution = 0

        print(f"\n{'='*80}")
        print("FINAL CLINICAL SUMMARY")
        print(f"{'='*80}")
        
        # Drug-Drug Summary
        ddi = results.get('drug_drug', [])
        if ddi:
            severe_ddi = sum(1 for r in ddi if r.get('severity') == 'severe')
            moderate_ddi = sum(1 for r in ddi if r.get('severity') == 'moderate')
            minor_ddi = sum(1 for r in ddi if r.get('severity') == 'minor')
            
            print(f"\n1️⃣  DRUG-DRUG INTERACTIONS ({len(ddi)} pairs checked):")
            print(f"   🔴 Severe: {severe_ddi}")
            print(f"   🟡 Moderate: {moderate_ddi}")
            print(f"   🟢 Minor: {minor_ddi}")
        
        # Drug-Disease Summary (Safely check if list has items)
        disease_results = results.get('drug_disease', [])
        if disease_results:
            contraindicated = sum(1 for r in disease_results if r.get('contraindicated'))
            caution = sum(1 for r in disease_results if r.get('severity') == 'moderate')
            
            print(f"\n2️⃣  DRUG-DISEASE CHECKS ({len(disease_results)} checked):")
            print(f"   ⛔ Contraindicated: {contraindicated}")
            print(f"   ⚠️  Use with caution: {caution}")
        
        # Drug-Food Summary
        food_results = results.get('drug_food', [])
        if food_results:
            total_avoid = sum(len(r.get('foods_to_avoid', [])) for r in food_results)
            total_separate = sum(len(r.get('foods_to_separate', [])) for r in food_results)
            
            print(f"\n3️⃣  DRUG-FOOD INTERACTIONS ({len(medications)} medications checked):")
            print(f"   🚫 Foods to avoid: {total_avoid} items")
            print(f"   ⏰ Foods to separate: {total_separate} items")

        # --- RISK ASSESSMENT (Safe because variables are initialized to 0) ---
        print(f"\n{'='*80}")
        print("OVERALL RISK ASSESSMENT")
        print(f"{'='*80}")
        
        if severe_ddi > 0 or contraindicated > 0:
            print(f"\n🎯 RISK LEVEL: 🔴 HIGH RISK")
            print(f"   ⛔ CRITICAL - Prescription modification required")
        elif moderate_ddi > 3 or caution > 1:
            print(f"\n🎯 RISK LEVEL: 🟡 MODERATE-HIGH RISK")
        elif moderate_ddi > 0 or caution > 0:
            print(f"\n🎯 RISK LEVEL: 🟡 MODERATE RISK")
        else:
            print(f"\n🎯 RISK LEVEL: 🟢 LOW RISK")
            print(f"   ✅ Prescription appears safe")

    
        
        # --- UPDATED EVIDENCE QUALITY SUMMARY ---
        
        # 1. Count papers from Drug-Drug Interactions
        ddi_papers = sum(r.get('pubmed', {}).get('count', 0) for r in ddi)
        
        # 2. Count papers from Drug-Disease Interactions
        disease_papers = 0
        if results.get('drug_disease'):
            # The structure of results['drug_disease'] includes a 'pubmed' key via the checker
            # However, in your specific output, it gathered evidence during check_drug_disease
            # We need to ensure we access the count from the evidence dictionary
            disease_papers = sum(r.get('pubmed_count', 0) for r in results['drug_disease'])
            # Note: If your analyzer returns 'pubmed_count' use that; 
            # if it's nested in a 'pubmed' dict, use r.get('pubmed', {}).get('count', 0)
        
        # 3. Count papers from Drug-Food Interactions
        food_papers = sum(r.get('pubmed_count', 0) for r in results.get('drug_food', []))
        
        # Total sum of all research analyzed
        total_papers = ddi_papers + disease_papers + food_papers
        
        print(f"\n📚 EVIDENCE QUALITY:")
        print(f"   • Total research papers analyzed: {total_papers}")
        print(f"   • Clinical Research (DDI/Disease): {ddi_papers + disease_papers} papers")
        print(f"   • Nutritional Research (Food): {food_papers} papers")
        
        # Update the classification ratio to include all relevant checks
        total_pairs = len(ddi)
        if total_pairs > 0:
            print(f"   • Evidence-based classifications: {len([r for r in ddi if r.get('pubmed', {}).get('count', 0) > 0])}/{total_pairs} drug pairs")
        
        print(f"\n{'='*80}")


def main():
    """Interactive comprehensive checker"""
    
    print("="*80)
    print("MEDGUARD AI - EVIDENCE-BASED MEDICATION SAFETY PLATFORM")
    print("="*80)
    print("\n🔬 Powered by:")
    print("   • PubMed (35M+ medical research papers)")
    print("   • FDA Official Drug Labels")
    print("   • FDA Adverse Event Database")
    print("   • Azure OpenAI GPT-4o (Microsoft)")
    print("   • Evidence-based medicine methodology")
    
    system = MedGuardAI()
    
    while True:
        print("\n" + "="*80)
        
        meds_input = input("\n💊 Enter medications (comma-separated) or 'quit': ").strip()
        
        if meds_input.lower() == 'quit':
            print("\n👋 Goodbye!")
            break
        
        if not meds_input:
            continue
        
        medications = [m.strip() for m in meds_input.split(',') if m.strip()]
        
        if len(medications) < 1:
            print("⚠️  Enter at least 1 medication")
            continue
        
        diseases_input = input("🏥 Patient conditions (comma-separated, or press Enter to skip): ").strip()
        diseases = [d.strip() for d in diseases_input.split(',') if d.strip()] if diseases_input else None


        # --- ADDED: SPECIFIC FOOD INPUT ---
        foods_input = input("🍎 Specific foods/diet (comma-separated, or Enter to skip): ").strip()
        foods = [f.strip() for f in foods_input.split(',') if f.strip()] if foods_input else []
                
        # Run complete analysis
        system.analyze_complete_prescription(medications, diseases, foods)
        
        print("\n✨ Analysis complete!")


if __name__ == "__main__":
    main()