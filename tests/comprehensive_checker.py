import os
import sys
import time
import uuid
from itertools import combinations
from typing import Dict, List, Optional

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from services.pubmed_service import PubMedService
from services.fda_service import FDAService
from services.evidence_analyzer import EvidenceAnalyzer
from services.cache_service import AzureSQLCacheService


class MedGuardAI:
    """
    Complete medication safety analysis system

    Checks 3 types of interactions:
    1. Drug-Drug   (medicine + medicine)
    2. Drug-Disease(medicine + patient condition)
    3. Drug-Food   (medicine + diet)

    All results are cached in Supabase Postgres.
    Repeat queries are served from cache instantly.
    """

    def __init__(self):
        self.pubmed   = PubMedService()
        self.fda      = FDAService()
        self.analyzer = EvidenceAnalyzer()
        self.cache    = AzureSQLCacheService()

        print("✅ MedGuard AI System Initialized")
        print("   Evidence sources: PubMed, FDA, OpenAI, Supabase Postgres Cache")

    # ── Drug-Drug ─────────────────────────────────────────────────────────────

    def check_drug_drug(self, drug1: str, drug2: str) -> Dict:
        """Check drug-drug interaction — cache first, then live APIs."""

        print(f"\n{'='*80}")
        print(f"DRUG-DRUG INTERACTION: {drug1} + {drug2}")
        print(f"{'='*80}")

        # 1. Cache check
        cached = self.cache.get_drug_drug(drug1, drug2)
        if cached:
            print(f"   ✅ Loaded from Supabase cache (skipping API calls)")
            self._display_drug_drug_result(drug1, drug2, cached, {
                'pubmed': {'count': cached.get('pubmed_papers', 0), 'pmids': []},
                'fda':    {'total_reports': cached.get('fda_reports', 0)}
            })
            return cached

        # 2. Live evidence gathering
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

        print(f"   • Analyzing evidence with OpenAI GPT-4o...", end="")
        evidence = {
            'pubmed':     pubmed_data,
            'fda':        fda_data,
            'fda_labels': [fda_label1, fda_label2]
        }
        analysis = self.analyzer.analyze_drug_drug_interaction(drug1, drug2, evidence)
        print(f" Complete")

        # 3. Save to cache
        self.cache.save_drug_drug(drug1, drug2, analysis)

        self._display_drug_drug_result(drug1, drug2, analysis, evidence)
        return analysis

    # ── Drug-Disease ──────────────────────────────────────────────────────────

    def check_drug_disease(self, drug: str, disease: str) -> Dict:
        """Check drug safety for a patient condition — cache first, then live APIs."""

        print(f"\n{'='*80}")
        print(f"DRUG-DISEASE CHECK: {drug} in patient with {disease}")
        print(f"{'='*80}")

        # 1. Cache check
        cached = self.cache.get_drug_disease(drug, disease)
        if cached:
            print(f"   ✅ Loaded from Supabase cache (skipping API calls)")
            self._display_drug_disease_result(drug, disease, cached, {
                'pubmed':    {'count': cached.get('pubmed_count', 0), 'pmids': []},
                'fda_label': {'found': False}
            })
            return cached

        # 2. Live evidence gathering
        print(f"\n🔬 Gathering evidence...")

        print(f"   • Checking FDA drug label contraindications...", end="")
        fda_label = self.fda.get_drug_contraindications(drug)
        print(f" Retrieved")

        print(f"   • Searching PubMed for {drug} + {disease} safety...", end="")
        pubmed_data = self.pubmed.search_disease_contraindication(drug, disease)
        print(f" Found {pubmed_data['count']} papers")

        print(f"   • Analyzing evidence with OpenAI...", end="")
        evidence = {'pubmed': pubmed_data, 'fda_label': fda_label}
        analysis = self.analyzer.analyze_drug_disease_interaction(drug, disease, evidence)
        print(f" Complete")

        # 3. Save to cache
        self.cache.save_drug_disease(drug, disease, analysis)

        self._display_drug_disease_result(drug, disease, analysis, evidence)
        return analysis

    # ── Drug-Food ─────────────────────────────────────────────────────────────

    def get_food_recommendations(self, medications: List[str], diseases: List[str] = None):
        """Get evidence-based food recommendations — cache first, then live APIs."""

        print(f"\n{'='*80}")
        print("PART 3: DRUG-FOOD & NUTRITIONAL INTERACTIONS")
        print(f"{'='*80}")

        all_food_recs = []

        for drug in medications:
            print(f"\n{'='*80}")
            print(f"FOOD INTERACTION ANALYSIS: {drug}")
            print(f"{'='*80}")

            # 1. Cache check
            cached = self.cache.get_food(drug)
            if cached:
                print(f"   ✅ Loaded from Supabase cache (skipping API calls)")
                analysis   = cached
                pubmed_count = cached.get('pubmed_count', 0)
            else:
                # 2. Live evidence gathering
                print(f"\n🔬 Gathering nutritional evidence...")

                print(f"   • Searching PubMed for {drug} + nutrition/diet...", end="")
                pubmed_data = self.pubmed.search_all_food_interactions_for_drug(drug)
                print(f" Found {pubmed_data['count']} papers")

                print(f"   • Checking FDA label for dietary instructions...", end="")
                fda_label = self.fda.get_drug_contraindications(drug)
                print(f" Retrieved")

                print(f"   • Analyzing clinical nutritional impact...", end="")
                disease_context = diseases[0] if diseases else None
                analysis = self.analyzer.get_food_recommendations_for_drug(drug, disease_context)
                print(f" Complete")

                pubmed_count = analysis.get('pubmed_count', 0)

                # 3. Save to cache
                self.cache.save_food(drug, analysis)

            # Display results
            print(f"\n🚫 FOODS TO AVOID:")
            if analysis.get('foods_to_avoid'):
                for food in analysis['foods_to_avoid']:
                    print(f"   • {food}")
            else:
                print("   No specific exclusions identified.")

            print(f"\n⏰ FOODS TO SEPARATE (take at different times):")
            if analysis.get('foods_to_separate'):
                for food in analysis['foods_to_separate']:
                    print(f"   • {food}")
            else:
                print("   None identified.")

            print(f"\n👁️  FOODS TO MONITOR:")
            if analysis.get('foods_to_monitor'):
                for food in analysis['foods_to_monitor']:
                    print(f"   • {food}")
            else:
                print("   None identified.")

            print(f"\n💊 INTERACTION MECHANISM:")
            print(f"   {analysis.get('mechanism_explanation', 'No specific biochemical interaction found with common foods.')}")

            print(f"\n📚 EVIDENCE BASIS:")
            print(f"   • PubMed papers analyzed: {pubmed_count}")
            if analysis.get('pmids'):
                print(f"   • Key studies: PMID {', '.join(analysis['pmids'][:3])}")
            print(f"   • {analysis.get('evidence_summary', 'Limited published evidence')}")

            print(f"\n{'='*80}")

            all_food_recs.append(analysis)
            time.sleep(0.3)

        return all_food_recs

    # ── Complete Prescription Analysis ────────────────────────────────────────

    def analyze_complete_prescription(self, medications: List[str],
                                      diseases: List[str] = None,
                                      foods: List[str] = None):
        """Run full Drug-Drug, Drug-Disease, Drug-Food analysis."""

        print("\n" + "="*80)
        print("MEDGUARD AI - COMPREHENSIVE PRESCRIPTION ANALYSIS")
        print("="*80)

        print(f"\n📋 Prescription Details:")
        print(f"   Medications ({len(medications)}): {', '.join(medications)}")
        if diseases:
            print(f"   Patient conditions ({len(diseases)}): {', '.join(diseases)}")

        all_results = {
            'drug_drug':    [],
            'drug_disease': [],
            'drug_food':    []
        }

        # ── Part 1: Drug-Drug ─────────────────────────────────────────────────
        print(f"\n{'='*80}")
        print("PART 1: DRUG-DRUG INTERACTIONS")
        print(f"{'='*80}")

        pairs = list(combinations(medications, 2))
        if pairs:
            print(f"\nChecking {len(pairs)} drug pair(s)...")
            for drug1, drug2 in pairs:
                result = self.check_drug_drug(drug1, drug2)
                all_results['drug_drug'].append(result)
                time.sleep(0.3)
        else:
            print("\n   Only 1 medication entered — no pairs to check.")

        # ── Part 2: Drug-Disease ──────────────────────────────────────────────
        if diseases:
            print(f"\n{'='*80}")
            print("PART 2: DRUG-DISEASE CONTRAINDICATIONS")
            print(f"{'='*80}")
            print(f"\nChecking each medication against patient conditions...")

            for drug in medications:
                for disease in diseases:
                    result = self.check_drug_disease(drug, disease)
                    all_results['drug_disease'].append(result)
                    time.sleep(0.3)

        # ── Part 3: Drug-Food ─────────────────────────────────────────────────
        food_recs = self.get_food_recommendations(medications, diseases)

        if foods:
            print(f"\n🍎 USER-SPECIFIED FOODS: {', '.join(foods)}")

        all_results['drug_food'] = food_recs

        # ── Final Summary & Logging ───────────────────────────────────────────
        self._display_final_summary(all_results, medications, diseases)

        session_id = str(uuid.uuid4())[:8]
        self.cache.log_analysis(session_id, medications, diseases or [], all_results)

        return all_results

    # ── Display Helpers ───────────────────────────────────────────────────────

    def _display_drug_drug_result(self, drug1, drug2, analysis, evidence):
        severity       = analysis.get('severity', 'unknown')
        confidence     = analysis.get('confidence', 0.0)
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
        fda_reports  = evidence['fda'].get('total_reports', 0)

        print(f"   • PubMed papers: {pubmed_count}")
        if pubmed_count > 0 and evidence['pubmed'].get('pmids'):
            print(f"     Key studies: PMID {', '.join(evidence['pubmed']['pmids'][:3])}")

        print(f"   • FDA adverse event reports: {fda_reports}")

        if analysis.get('references'):
            print(f"   • References: {analysis['references']}")

        tier = analysis.get('evidence_tier_info', {})
        if tier:
            print(f"   • Evidence tier: {tier.get('icon', '')} {tier.get('tier_name', '')}")

        print(f"\n{'='*80}")

    def _display_drug_disease_result(self, drug, disease, analysis, evidence):
        contraindicated = analysis.get('contraindicated', False)
        severity        = analysis.get('severity', 'unknown')
        confidence      = analysis.get('confidence', 0.0)

        emoji  = '🔴' if contraindicated else '🟡' if severity == 'moderate' else '🟢'
        status = ('CONTRAINDICATED' if contraindicated
                  else 'CAUTION ADVISED' if severity == 'moderate'
                  else 'GENERALLY SAFE')

        print(f"\n{emoji} STATUS: {status}")
        print(f"   Severity: {severity.upper()}")
        print(f"   Confidence: {confidence:.0%}")

        print(f"\n📋 CLINICAL EVIDENCE:")
        print(f"   {analysis.get('clinical_evidence', 'Limited evidence available')}")

        print(f"\n⚕️  RECOMMENDATION:")
        print(f"   {analysis.get('recommendation', 'Consult physician')}")

        alts = analysis.get('alternative_drugs', [])
        if alts:
            print(f"\n💊 SAFER ALTERNATIVES:")
            for alt in alts[:5]:
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

        tier = analysis.get('evidence_tier_info', {})
        if tier:
            print(f"   • Evidence tier: {tier.get('icon', '')} {tier.get('tier_name', '')}")

        print(f"\n{'='*80}")

    def _display_final_summary(self, results, medications, diseases):
        """Display comprehensive final summary with risk assessment."""

        severe_ddi = moderate_ddi = minor_ddi = 0
        contraindicated_count = caution_count = 0

        print(f"\n{'='*80}")
        print("FINAL CLINICAL SUMMARY")
        print(f"{'='*80}")

        # Drug-Drug
        ddi = results.get('drug_drug', [])
        if ddi:
            severe_ddi   = sum(1 for r in ddi if r.get('severity') == 'severe')
            moderate_ddi = sum(1 for r in ddi if r.get('severity') == 'moderate')
            minor_ddi    = sum(1 for r in ddi if r.get('severity') == 'minor')

            print(f"\n1️⃣  DRUG-DRUG INTERACTIONS ({len(ddi)} pair(s) checked):")
            print(f"   🔴 Severe:   {severe_ddi}")
            print(f"   🟡 Moderate: {moderate_ddi}")
            print(f"   🟢 Minor:    {minor_ddi}")

        # Drug-Disease
        disease_results = results.get('drug_disease', [])
        if disease_results:
            contraindicated_count = sum(1 for r in disease_results if r.get('contraindicated'))
            caution_count         = sum(1 for r in disease_results if r.get('severity') == 'moderate')

            print(f"\n2️⃣  DRUG-DISEASE CHECKS ({len(disease_results)} checked):")
            print(f"   ⛔ Contraindicated:    {contraindicated_count}")
            print(f"   ⚠️  Use with caution:  {caution_count}")

        # Drug-Food
        food_results = results.get('drug_food', [])
        if food_results:
            total_avoid    = sum(len(r.get('foods_to_avoid', []))    for r in food_results)
            total_separate = sum(len(r.get('foods_to_separate', [])) for r in food_results)

            print(f"\n3️⃣  DRUG-FOOD INTERACTIONS ({len(medications)} medication(s) checked):")
            print(f"   🚫 Foods to avoid:    {total_avoid} item(s)")
            print(f"   ⏰ Foods to separate: {total_separate} item(s)")

        # Risk Assessment
        print(f"\n{'='*80}")
        print("OVERALL RISK ASSESSMENT")
        print(f"{'='*80}")

        if severe_ddi > 0 or contraindicated_count > 0:
            print(f"\n🎯 RISK LEVEL: 🔴 HIGH RISK")
            print(f"   ⛔ CRITICAL — Prescription modification required")
        elif moderate_ddi > 3 or caution_count > 1:
            print(f"\n🎯 RISK LEVEL: 🟡 MODERATE-HIGH RISK")
            print(f"   ⚠️  Multiple interactions require monitoring")
        elif moderate_ddi > 0 or caution_count > 0:
            print(f"\n🎯 RISK LEVEL: 🟡 MODERATE RISK")
            print(f"   ⚠️  Some interactions require monitoring")
        else:
            print(f"\n🎯 RISK LEVEL: 🟢 LOW RISK")
            print(f"   ✅ Prescription appears safe")

        # Evidence Quality
        ddi_papers     = sum(r.get('pubmed_papers', 0) for r in ddi)
        disease_papers = sum(r.get('pubmed_count', 0)  for r in disease_results)
        food_papers    = sum(r.get('pubmed_count', 0)  for r in food_results)
        total_papers   = ddi_papers + disease_papers + food_papers

        print(f"\n📚 EVIDENCE QUALITY:")
        print(f"   • Total research papers analyzed:       {total_papers}")
        print(f"   • Clinical research (DDI + Disease):    {ddi_papers + disease_papers} papers")
        print(f"   • Nutritional research (Food):          {food_papers} papers")

        if ddi:
            evidence_based = len([r for r in ddi if r.get('pubmed_papers', 0) > 0 or r.get('fda_reports', 0) > 0])
            print(f"   • Evidence-based DDI classifications:  {evidence_based}/{len(ddi)} pairs")

        # Cache Stats
        stats = self.cache.get_stats()
        if stats.get('drug_drug_cached') is not None:
            print(f"\n💾 SUPABASE POSTGRES CACHE:")
            print(f"   • Drug-drug pairs cached:   {stats.get('drug_drug_cached', 0)}")
            print(f"   • Drug-disease pairs cached:{stats.get('drug_disease_cached', 0)}")
            print(f"   • Food interactions cached: {stats.get('food_cached', 0)}")
            print(f"   • Total analyses logged:    {stats.get('total_analyses', 0)}")
            print(f"   • Total cache hits:         {stats.get('total_cache_hits', 0)}")

        print(f"\n{'='*80}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("="*80)
    print("MEDGUARD AI - EVIDENCE-BASED MEDICATION SAFETY PLATFORM")
    print("="*80)
    print("\n🔬 Powered by:")
    print("   • PubMed (35M+ medical research papers)")
    print("   • FDA Official Drug Labels")
    print("   • FDA Adverse Event Database")
    print("   • OpenAI GPT-4o")
    print("   • Supabase Postgres (persistent cache)")

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

        diseases_input = input("🏥 Patient conditions (comma-separated, or Enter to skip): ").strip()
        diseases = [d.strip() for d in diseases_input.split(',') if d.strip()] if diseases_input else None

        foods_input = input("🍎 Specific foods/diet (comma-separated, or Enter to skip): ").strip()
        foods = [f.strip() for f in foods_input.split(',') if f.strip()] if foods_input else []

        system.analyze_complete_prescription(medications, diseases, foods)

        print("\n✨ Analysis complete!")


if __name__ == "__main__":
    main()