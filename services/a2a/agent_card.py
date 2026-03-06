"""
VabGenRx — A2A Agent Card
Describes VabGenRx capabilities to external agents.
Served at GET /.well-known/agent.json

EXTRACTED from a2a_service.py — zero logic changes.
Updated agent list to reflect new architecture.
"""

AGENT_CARD = {
    "schemaVersion": "0.2",
    "name":          "VabGenRx Clinical Intelligence Agent",
    "description": (
        "A multi-agent clinical pharmacology platform powered by "
        "Microsoft Agent Framework. "
        "Analyzes drug-drug interactions, drug-disease "
        "contraindications, FDA-based dosing adjustments, and "
        "generates patient counseling in 100+ languages. "
        "Features cross-agent compounding risk detection via "
        "Round 2 re-evaluation and a dedicated Orchestrator Agent "
        "for cross-domain clinical synthesis. "
        "Evidence sourced from PubMed (35M+ papers) and FDA "
        "adverse event database."
    ),
    "version": "3.0.0",
    "url":     "https://vabgenrx.azurewebsites.net",
    "provider": {
        "name":    "VabGenRx Team",
        "url":     "https://github.com/Aadarsh-Praveen/VabGen-Rx",
        "contact": "vabgenrx@team.com"
    },
    "capabilities": {
        "streaming":              False,
        "pushNotifications":      False,
        "stateTransitionHistory": True,
        "authentication":         True,
    },
    "authentication": {
        "schemes":     ["bearer"],
        "description": (
            "JWT bearer token — obtain from POST /api/signin"
        )
    },
    "agents": [
        {
            "name":        "VabGenRxSafetyAgent",
            "role":        "specialist",
            "description": (
                "Synthesizes drug-drug and drug-food interactions "
                "from pre-fetched PubMed and FDA evidence. "
                "Round 1 only — pure synthesis, no tool calls."
            )
        },
        {
            "name":        "VabGenRxDiseaseAgent",
            "role":        "specialist",
            "description": (
                "Synthesizes drug-disease contraindications. "
                "Supports Round 2 re-evaluation when compounding "
                "signals are detected by cross-agent analysis."
            )
        },
        {
            "name":        "VabGenRxDosingAgent",
            "role":        "specialist",
            "description": (
                "Generates FDA label-based dosing recommendations. "
                "Supports Round 2 re-evaluation with compounding "
                "context — may recommend beyond standard FDA tables "
                "when multiple risk signals converge."
            )
        },
        {
            "name":        "VabGenRxCounsellingAgent",
            "role":        "specialist",
            "description": (
                "Generates patient-specific drug and condition "
                "counseling. Compounding-context aware — counseling "
                "reflects confirmed interactions and contraindications."
            )
        },
        {
            "name":        "VabGenRxOrchestratorAgent",
            "role":        "orchestrator",
            "description": (
                "Cross-domain clinical reasoning agent. Receives "
                "all specialist results and produces unified "
                "clinical intelligence — compounding risk patterns, "
                "prioritized clinical actions, and clinical summary."
            )
        },
    ],
    "skills": [
        {
            "id":          "drug_interaction_analysis",
            "name":        "Drug Interaction Analysis",
            "description": (
                "Analyzes drug-drug interactions using PubMed "
                "research and FDA adverse event database. Returns "
                "severity, mechanism, clinical effects, confidence "
                "score, and evidence tier. Features compounding "
                "signal detection across drug-drug, drug-disease, "
                "and dosing domains."
            ),
            "tags":    [
                "pharmacology", "drug-safety",
                "clinical", "interactions"
            ],
            "examples": [
                "Check interactions between warfarin and aspirin "
                "for a 70yo patient",
                "Are metformin and lisinopril safe to combine "
                "for a CKD patient?",
                "Analyze all interactions for: aspirin, "
                "dexamethasone, enalapril"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type":     "object",
                "required": ["medications"],
                "properties": {
                    "medications": {
                        "type":  "array",
                        "items": {"type": "string"}
                    },
                    "diseases": {
                        "type":  "array",
                        "items": {"type": "string"}
                    },
                    "age": {"type": "integer"},
                    "sex": {
                        "type": "string",
                        "enum": ["male", "female", "unknown"]
                    }
                }
            }
        },
        {
            "id":          "dosing_recommendation",
            "name":        "FDA-Based Dosing Recommendation",
            "description": (
                "Generates patient-specific dosing adjustments "
                "based on FDA drug labels, matched against patient "
                "labs (eGFR, TSH, potassium, bilirubin, etc.). "
                "Supports compounding-aware dosing — when multiple "
                "risk signals converge, standard FDA tables may be "
                "supplemented with conservative adjustments. "
                "Always fresh — never cached."
            ),
            "tags": [
                "dosing", "fda", "renal",
                "hepatic", "pharmacokinetics"
            ],
            "examples": [
                "What dose of metformin for a patient with eGFR 38?",
                "Adjust enalapril dose for 65yo male with CKD",
                "FDA dosing for dexamethasone in elderly patient"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type":     "object",
                "required": ["medications", "age", "sex"],
                "properties": {
                    "medications": {
                        "type":  "array",
                        "items": {"type": "string"}
                    },
                    "age":      {"type": "integer"},
                    "sex":      {"type": "string"},
                    "dose_map": {"type": "object"},
                    "patient_labs": {
                        "type": "object",
                        "properties": {
                            "egfr":      {"type": "number"},
                            "potassium": {"type": "number"},
                            "tsh":       {"type": "number"},
                            "bilirubin": {"type": "number"}
                        }
                    }
                }
            }
        },
        {
            "id":          "patient_counseling",
            "name":        "Patient Counseling Generation",
            "description": (
                "Generates drug counseling (bleeding risk, timing, "
                "monitoring) and condition counseling (exercise, "
                "diet, lifestyle, safety) filtered by patient age, "
                "sex, and confirmed habits. Compounding-context "
                "aware — counseling reflects confirmed interactions. "
                "Translates to 100+ languages."
            ),
            "tags": [
                "counseling", "patient-education",
                "multilingual", "lifestyle"
            ],
            "examples": [
                "Generate diabetes counseling in Tamil for "
                "a 65yo female",
                "Drug counseling for warfarin for a male "
                "who drinks alcohol",
                "Exercise and diet advice for hypertension "
                "in Spanish"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
            "inputSchema": {
                "type":     "object",
                "required": ["age", "sex"],
                "properties": {
                    "medications": {
                        "type":  "array",
                        "items": {"type": "string"}
                    },
                    "diseases": {
                        "type":  "array",
                        "items": {"type": "string"}
                    },
                    "age":                {"type": "integer"},
                    "sex":                {"type": "string"},
                    "preferred_language": {"type": "string"},
                    "patient_profile": {
                        "type": "object",
                        "properties": {
                            "drinks_alcohol":     {"type": "boolean"},
                            "smokes":             {"type": "boolean"},
                            "has_kidney_disease": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        {
            "id":          "full_safety_analysis",
            "name":        "Full Safety Analysis",
            "description": (
                "Runs the complete VabGenRx multi-agent pipeline: "
                "evidence gathering → Round 1 specialist synthesis "
                "(Safety, Disease, Dosing agents in parallel) → "
                "cross-agent signal extraction → conditional Round 2 "
                "re-evaluation → Counselling → Orchestrator Agent "
                "cross-domain synthesis. "
                "Returns complete clinical intelligence report "
                "including compounding risk patterns and prioritized "
                "clinical actions."
            ),
            "tags": [
                "safety", "full-analysis",
                "multi-agent", "comprehensive"
            ],
            "examples": [
                "Complete safety analysis for aspirin, "
                "dexamethasone, enalapril in 65yo CKD patient",
                "Full clinical review for all medications "
                "with dosing and counseling"
            ],
            "inputModes":  ["application/json"],
            "outputModes": ["application/json"],
        }
    ],
    "defaultInputMode":  "application/json",
    "defaultOutputMode": "application/json",
}