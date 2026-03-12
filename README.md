<p align="center">
  <img src="./vabgen_logo.png" alt="Vab Gen Rx Logo" width="250"/>
</p>

# VabGen-Rx
### AI-Powered Clinical Drug Safety & Decision Support System

![React](https://img.shields.io/badge/Frontend-React-blue)
![Node](https://img.shields.io/badge/Backend-Node.js-green)
![FastAPI](https://img.shields.io/badge/AI%20Service-FastAPI-teal)
![Azure](https://img.shields.io/badge/Cloud-Azure-blue)
![Python](https://img.shields.io/badge/AI-Python-yellow)
![License](https://img.shields.io/badge/License-Research-lightgrey)

---

## Overview

VabGen-Rx is an **AI-powered clinical decision support platform** that helps healthcare professionals analyze **drug safety, interactions, dosing risks, and patient-specific contraindications**.

The system uses **multi-agent AI orchestration** powered by **Azure AI Agents, Azure OpenAI, FDA safety data, and PubMed research evidence** to generate **evidence-backed medication safety insights**.

The platform integrates:

- Hospital workflow systems
- AI-powered safety analysis
- Regulatory drug evidence
- Clinical reasoning agents

to support **safe and informed prescribing decisions**.

---

# Table of Contents

- Overview
- System Architecture
- Core Features
- AI Agent Architecture
- AI Analysis Pipeline
- Technology Stack
- Project Structure
- Installation
- Environment Variables
- Running the Application
- API Documentation
- Evidence Sources
- Security & Compliance
- Database Design
- Monitoring
- Future Improvements
- License

---

# System Architecture

The system follows a **three-tier architecture**:
Frontend (React)
│
│ REST APIs
▼
Operational Backend (Node.js)
│
│ Patient Records / Workflow
▼
Azure SQL Databases
│
│ AI Requests
▼
AI Backend (FastAPI)
│
│ Multi-Agent Orchestration
▼
Azure AI Agents + Azure OpenAI
│
│ Evidence Retrieval
▼
PubMed + FDA OpenFDA


---

# Core Features

## Drug Interaction Detection

Analyzes potential **drug-drug interactions** using:

- FDA safety labels
- PubMed clinical studies
- AI reasoning

---

## Drug-Disease Contraindication Detection

Identifies medication risks based on:

- patient conditions
- comorbidities
- clinical safety rules

---

## AI Dosing Recommendations

Provides dosage guidance based on:

- pharmacology
- patient condition
- clinical evidence

---

## Patient Counseling Generation

Automatically generates patient guidance including:

- medication usage
- safety precautions
- side effects
- lifestyle considerations

---

## Evidence-Based AI Explanation

Every AI analysis is supported with:

- research-based evidence
- clinical reasoning summaries

---

# AI Agent Architecture

The AI engine is composed of specialized agents.

### Safety Agent

Detects:

- drug-drug interactions
- toxicity risks
- food interactions

Uses:

- FDA drug safety data
- pharmacology knowledge

---

### Disease Agent

Analyzes:

- drug-disease conflicts
- comorbidities
- contraindications

---

### Dosing Agent

Evaluates:

- dose safety
- maximum safe dosage
- medication dosage guidelines

---

### Counseling Agent

Generates patient instructions for:

- medication usage
- side effects
- lifestyle considerations

---

### Orchestrator Agent

Coordinates all agents and produces final output.

Responsibilities:

- evidence aggregation
- conflict resolution
- final clinical reasoning

---

# AI Analysis Pipeline

The AI engine operates in **six phases**.

## Phase 1 — Evidence Gathering

Retrieves information from:

- PubMed
- FDA OpenFDA
- evidence services

---

## Phase 2 — Specialist Analysis

Each AI agent independently analyzes:

- drug safety
- disease risk
- dosage safety

---

## Phase 3 — Signal Extraction

Identifies patterns such as:

- multi-drug toxicity
- overlapping adverse effects
- compound safety risks

---

## Phase 4 — Secondary Evaluation

Agents perform deeper analysis if risk signals are detected.

---

## Phase 5 — Patient Counseling

Generates patient-facing safety instructions.

---

## Phase 6 — Final Orchestration

The orchestrator produces a final clinical summary.

---

# Technology Stack

## Frontend

- React
- Vite
- Redux
- Axios

---

## Backend

- Node.js
- Express
- JWT authentication
- Nodemailer

---

## AI Backend

- Python
- FastAPI
- Azure AI Agents
- Azure OpenAI

---

## Database

- Azure SQL Database

---

## Cloud Services

- Azure Key Vault
- Azure Application Insights
- Azure Blob Storage

---

## External APIs

- PubMed API
- FDA OpenFDA API

---

## High-Level Architecture

VabGen-Rx follows a multi-layer architecture that separates the user interface, operational healthcare workflows, and AI-powered clinical reasoning.

```text
┌───────────────────────────────────────────────┐
│                 Frontend Layer                │
│               React + Vite UI                 │
│  - Login / Dashboard / Patients / Settings   │
│  - Medication review and AI result display   │
└───────────────────────────────────────────────┘
                      │
                      │ REST API calls
                      ▼
┌───────────────────────────────────────────────┐
│          Operational Backend Layer            │
│             Node.js + Express API             │
│  - Authentication & JWT                       │
│  - User / Patient / Prescription workflows    │
│  - OTP / password reset / image upload        │
└───────────────────────────────────────────────┘
                      │
                      │ Database operations
                      ▼
┌───────────────────────────────────────────────┐
│              Azure SQL Databases              │
│  - Credentials DB                             │
│  - Patients DB                                │
│  - Prescriptions / notes / referrals          │
└───────────────────────────────────────────────┘

Frontend also communicates directly with the AI backend for advanced medication analysis.

┌───────────────────────────────────────────────┐
│               AI Backend Layer                │
│                FastAPI Service                │
│  - Drug validation                            │
│  - Drug-pair checks                           │
│  - Full AI medication analysis                │
│  - Phase-based agent workflow                 │
└───────────────────────────────────────────────┘
                      │
                      │ Multi-agent orchestration
                      ▼
┌───────────────────────────────────────────────┐
│          Azure AI Agents + Azure OpenAI       │
│  - Safety Agent                               │
│  - Disease Agent                              │
│  - Dosing Agent                               │
│  - Counselling Agent                          │
│  - Orchestrator Agent                         │
└───────────────────────────────────────────────┘
                      │
                      │ Evidence retrieval
                      ▼
┌───────────────────────────────────────────────┐
│         External Clinical Evidence Sources    │
│  - PubMed                                     │
│  - FDA OpenFDA                                │
└───────────────────────────────────────────────┘

# Evidence Sources

## PubMed

Provides biomedical research used for:

- drug safety
- adverse effects
- pharmacology

---

## FDA OpenFDA

Provides:

- drug labels
- safety alerts
- adverse event reports

---

# Security & Compliance

Healthcare data protection includes:

- PHI audit logging
- role-based access control
- encrypted secrets via Azure Key Vault
- secure authentication
- audit log retention policies

---

# Database Design

## Credentials Database

Stores:

- users
- authentication records
- roles

---

## Patients Database

Stores:

- patient records
- prescriptions
- referrals
- clinical notes

---

## AI Cache Database

Stores:

- interaction analysis
- evidence summaries
- AI output caching

---

## Audit Database

Stores:

- PHI access logs
- AI analysis records

---

# Monitoring

System monitoring includes:

- Azure Application Insights
- request tracing
- performance monitoring
- error tracking

---

# Future Improvements

Planned enhancements include:

- FHIR healthcare interoperability
- EHR system integration
- real-time medication alerts
- improved explainable AI
- clinical guideline integration

---

# License

This project is intended for **research and demonstration purposes**.

It is **not a certified clinical decision system** and should not replace professiona
