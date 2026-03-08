import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const updated  = "March 7, 2026";
  const contact  = "vabgenrx@outlook.com";

  const Section = ({ number, title, children }) => (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: "1.05rem", fontWeight: 700,
        color: "#1a73e8", marginBottom: 10,
        paddingBottom: 6, borderBottom: "1px solid #e0e3ef"
      }}>
        {number}. {title.toUpperCase()}
      </h2>
      <div style={{ fontSize: "0.9rem", color: "#444", lineHeight: 1.85 }}>
        {children}
      </div>
    </div>
  );

  const P = ({ children, style }) => (
    <p style={{ marginBottom: 10, ...style }}>{children}</p>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fb", padding: "40px 24px" }}>
      <div style={{
        maxWidth: 800, margin: "0 auto",
        background: "#fff", borderRadius: 12,
        padding: "40px 52px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
      }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 36 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "none", border: "none",
              color: "#1a73e8", cursor: "pointer",
              fontSize: "0.85rem", fontWeight: 600,
              marginBottom: 20, padding: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            ← Back
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🩺</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1a1a2e" }}>
              VABGENRX — PRIVACY POLICY
            </span>
          </div>
          <p style={{ color: "#888", fontSize: "0.85rem", margin: 0 }}>
            Last updated: {updated} &nbsp;·&nbsp; HIPAA-compliant clinical decision support platform
          </p>
        </div>

        {/* ── 1. Introduction ── */}
        <Section number="1" title="Introduction">
          <P>
            VabGenRx is a clinical intelligence and medication safety analysis platform designed
            to support healthcare professionals in evaluating medication use, identifying potential
            safety concerns, and improving evidence-based clinical decision making. The platform
            provides analytical insights related to drug interactions, dosing considerations,
            medication safety risks, pharmacoeconomic prescription, and supporting medical evidence.
          </P>
          <P>
            VabGenRx is committed to protecting the privacy, confidentiality, and security of
            information that may be processed through the platform. The company recognizes the
            importance of safeguarding Protected Health Information (PHI) and implements
            administrative, technical, and organizational safeguards designed to align with
            recognized healthcare privacy and security standards. These practices are designed
            to support compliance with the Health Insurance Portability and Accountability Act
            (HIPAA), the Health Information Technology for Economic and Clinical Health (HITECH)
            Act, and other applicable United States healthcare data protection regulations.
          </P>
          <P>
            This Privacy Policy explains how VabGenRx collects, processes, uses, stores, protects,
            and discloses information when the platform is used by authorized users.
          </P>
        </Section>

        {/* ── 2. Scope ── */}
        <Section number="2" title="Scope of This Policy">
          <P>
            This Privacy Policy applies to the VabGenRx platform, associated software applications,
            digital services, and infrastructure used to operate or support the system. The policy
            governs the handling of clinical and operational information that may be processed when
            healthcare professionals, healthcare organizations, or authorized users utilize the
            platform as part of clinical workflows or medication safety evaluation activities.
          </P>
          <P>
            The policy applies to physicians, pharmacists, researchers, healthcare institutions,
            and other authorized users who access the system. VabGenRx functions as a clinical
            decision-support technology and processes healthcare information only to the extent
            necessary to support system functionality, clinical analysis, regulatory compliance,
            security monitoring, and platform operation.
          </P>
        </Section>

        {/* ── 3. Information Processed ── */}
        <Section number="3" title="Information Processed by the Platform">
          <P>
            VabGenRx may process limited categories of clinical information necessary to perform
            medication safety analysis and decision-support functions. This may include clinical
            characteristics relevant to medication use such as patient demographic attributes,
            laboratory values, medication lists, clinical diagnoses, and other contextual clinical
            information that may influence medication safety evaluation.
          </P>
          <P>
            The platform may also process operational information associated with authorized users,
            including professional identifiers, login credentials, system access records, timestamps,
            and technical system logs. These records support platform functionality, system
            monitoring, cybersecurity safeguards, and regulatory audit requirements.
          </P>
          <P>
            VabGenRx is designed using data minimization principles and generally does not require
            direct patient identifiers such as patient names, residential addresses, telephone
            numbers, Social Security numbers, insurance numbers, or financial data. Where identifiers
            may be required for internal operations or audit logging purposes, they may be
            pseudonymized, encrypted, or protected through cryptographic methods in accordance
            with security best practices.
          </P>
        </Section>

        {/* ── 4. Purpose of Data Processing ── */}
        <Section number="4" title="Purpose of Data Processing">
          <P>
            Information processed by the platform is used exclusively for legitimate healthcare,
            analytical, and operational purposes associated with the functioning of VabGenRx.
            The primary purpose of data processing is to support healthcare professionals in
            evaluating medication safety, identifying potential drug interactions, reviewing
            drug–disease contraindications, assessing laboratory-based dosing considerations,
            and reviewing evidence relevant to medication use.
          </P>
          <P>
            The platform may retrieve publicly available scientific or regulatory information
            from biomedical databases and regulatory sources to support clinical evidence retrieval
            and medication safety analysis. These processes allow the platform to generate structured
            insights intended to assist clinicians in reviewing potential medication risks and
            supporting evidence.
          </P>
          <P>
            Operational information may also be processed to maintain system reliability, monitor
            system performance, enforce security controls, maintain regulatory audit trails, and
            improve the safety and functionality of the platform.
          </P>
          <P>
            VabGenRx does not sell, rent, or license patient data and does not use healthcare
            information processed through the platform for advertising, marketing, behavioral
            profiling, or commercial resale.
          </P>
        </Section>

        {/* ── 5. Data Security ── */}
        <Section number="5" title="Data Security and Protection Measures">
          <P>
            VabGenRx implements administrative, technical, and organizational safeguards designed
            to protect the confidentiality, integrity, and availability of information processed
            through the platform. These safeguards are designed in alignment with healthcare data
            protection practices and cybersecurity standards commonly used within healthcare
            technology systems.
          </P>
          <P>
            Security protections may include encryption of data in transit and at rest, access
            control systems that limit access to authorized users, authentication mechanisms,
            system monitoring, and infrastructure segmentation. The platform architecture may
            include separate environments for operational databases, application services, and
            security audit logs to reduce the risk of unauthorized access.
          </P>
          <P>
            Infrastructure supporting the VabGenRx platform may be hosted on secure cloud
            environments maintained by enterprise infrastructure providers that implement
            healthcare-grade security practices and compliance programs. Continuous monitoring,
            vulnerability management, and security review processes may be implemented to detect
            and mitigate potential threats.
          </P>
        </Section>

        {/* ── 6. Data Retention ── */}
        <Section number="6" title="Data Retention and Data Lifecycle">
          <P>
            VabGenRx retains information only for the period necessary to support platform
            functionality, clinical analysis, system performance monitoring, regulatory compliance,
            and security operations. Operational data generated during medication analysis may be
            retained temporarily to enable system performance optimization, troubleshooting, or
            quality assurance.
          </P>
          <P>
            Security logs and system audit records related to access to Protected Health Information
            may be retained for longer periods when required to comply with healthcare regulatory
            requirements, including HIPAA audit logging requirements. When data retention periods
            expire, information may be securely deleted, anonymized, or overwritten in accordance
            with internal data management procedures and applicable regulatory standards.
          </P>
          {/* Retention table */}
          <div style={{ marginTop: 16, border: "1px solid #e0e3ef", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 100px 1fr",
              background: "#f0f5ff", padding: "8px 16px",
              fontSize: "0.78rem", fontWeight: 700, color: "#1a73e8",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <span>Data Category</span>
              <span>Retention</span>
              <span>Basis</span>
            </div>
            {[
              ["Drug interaction cache",  "30 days",  "Operational — re-synthesized from fresh evidence"],
              ["Drug counselling cache",  "30 days",  "Operational — re-generated after expiry"],
              ["Analysis session log",    "1 year",   "Operational review and quality assurance"],
              ["PHI access audit log",    "6 years",  "HIPAA Audit Log Rule — mandatory minimum"],
            ].map(([cat, period, basis], i) => (
              <div key={cat} style={{
                display: "grid", gridTemplateColumns: "1fr 100px 1fr",
                padding: "10px 16px", fontSize: "0.87rem",
                borderTop: i === 0 ? "none" : "1px solid #f0f0f8",
                background: i % 2 === 0 ? "#fff" : "#fafbff",
              }}>
                <span style={{ fontWeight: 600 }}>{cat}</span>
                <span style={{ color: "#1a73e8", fontWeight: 700 }}>{period}</span>
                <span style={{ color: "#666" }}>{basis}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 7. Third-Party Services ── */}
        <Section number="7" title="Third-Party Infrastructure and Services">
          <P>
            The VabGenRx platform may utilize trusted third-party infrastructure providers,
            biomedical research databases, and regulatory information sources to support system
            operation and clinical analysis. These services may include cloud infrastructure
            providers that support data storage, system hosting, and computing resources, as
            well as publicly available biomedical databases used for retrieving scientific
            literature and regulatory drug information.
          </P>
          <P>
            Where third-party providers process data on behalf of VabGenRx, appropriate
            contractual and security safeguards may be established to ensure that data protection
            standards are maintained. VabGenRx does not disclose or share patient information
            with third parties for advertising or commercial purposes.
          </P>
          {/* Third-party table */}
          <div style={{ marginTop: 12 }}>
            {[
              ["Azure OpenAI (GPT-4o)", "Drug interaction synthesis — medication names and diagnoses sent for clinical reasoning. Covered under Microsoft Azure HIPAA BAA."],
              ["PubMed / NCBI API",     "Generic drug names queried for published research evidence. No patient data sent."],
              ["FDA OpenAPI",           "Generic drug names queried for label data and adverse event reports. No patient data sent."],
              ["Azure SQL Database",    "Encrypted cache and audit storage. Covered under Microsoft Azure HIPAA BAA."],
            ].map(([svc, desc]) => (
              <div key={svc} style={{
                display: "flex", gap: 12, padding: "8px 0",
                borderBottom: "1px solid #f0f0f8", fontSize: "0.88rem",
              }}>
                <span style={{ color: "#1a73e8", fontWeight: 600, minWidth: 6 }}>•</span>
                <span><strong>{svc}:</strong> {desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 8. HIPAA Roles ── */}
        <Section number="8" title="HIPAA Roles and Responsibilities">
          <P>
            Healthcare providers and healthcare organizations that use the VabGenRx platform
            generally function as the HIPAA Covered Entities responsible for maintaining patient
            medical records and fulfilling patient rights under applicable healthcare regulations.
            VabGenRx may function as a technology service provider supporting clinical
            decision-support activities.
          </P>
          <P>
            Covered entities remain responsible for determining what information is entered into
            the platform and for responding to patient requests related to their medical records.
            VabGenRx may provide reasonable assistance to covered entities when required to
            support compliance with applicable regulatory obligations.
          </P>
        </Section>

        {/* ── 9. Patient Rights ── */}
        <Section number="9" title="Patient Rights and Data Access">
          <P>
            Individuals whose information may be processed by healthcare providers using VabGenRx
            have certain rights under applicable healthcare privacy regulations. These rights may
            include the ability to access their medical records, request corrections to inaccurate
            information, request restrictions on certain disclosures, and receive an accounting
            of disclosures of Protected Health Information.
          </P>
          <P>
            Requests related to patient medical records should be directed to the healthcare
            provider or healthcare organization responsible for the patient's care. VabGenRx does
            not independently maintain patient medical records and generally does not control the
            clinical data submitted by healthcare providers using the platform.
          </P>
        </Section>

        {/* ── 10. Breach Notification ── */}
        <Section number="10" title="Breach Notification">
          <P>
            In the event that VabGenRx becomes aware of a confirmed breach involving unsecured
            Protected Health Information, the company will comply with applicable breach
            notification requirements under HIPAA and other relevant laws. Where required,
            notifications will be provided to affected individuals, regulatory authorities,
            and other relevant parties within the timeframes required by law following the
            discovery of the breach.
          </P>
        </Section>

        {/* ── 11. Clinical Disclaimer ── */}
        <Section number="11" title="Clinical Decision Support Disclaimer">
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 8, padding: "14px 18px",
            fontSize: "0.88rem", color: "#92400e", lineHeight: 1.75,
          }}>
            VabGenRx is intended to provide analytical support to healthcare professionals and
            is <strong>not designed to replace clinical judgment</strong>, medical diagnosis, or
            treatment decisions made by qualified healthcare providers. The information generated
            by the platform should be reviewed and interpreted by licensed healthcare professionals
            within the context of their professional responsibilities and clinical expertise.
            Healthcare providers remain solely responsible for patient care decisions, including
            prescribing medications, determining appropriate treatment plans, and interpreting
            clinical data.
          </div>
        </Section>

        {/* ── 12. Acceptable Use ── */}
        <Section number="12" title="Acceptable Use and Platform Integrity">
          <P>
            Users of the VabGenRx platform are expected to access and use the system only for
            legitimate clinical, research, or healthcare operational purposes. Unauthorized access
            attempts, misuse of system functionality, attempts to extract sensitive system
            information, or use of the platform in violation of applicable laws or institutional
            policies may result in access restrictions, investigation, or other corrective actions.
          </P>
          <P>
            VabGenRx reserves the right to monitor system activity in order to maintain system
            security, ensure compliance with applicable regulations, and protect the integrity
            of the platform.
          </P>
        </Section>

        {/* ── 13. Limitation of Liability ── */}
        <Section number="13" title="Limitation of Liability">
          <P>
            While VabGenRx implements safeguards and quality assurance measures designed to
            support reliable system performance, the platform is provided as a clinical
            decision-support tool and does not guarantee the completeness, accuracy, or
            applicability of all generated outputs. To the extent permitted by applicable law,
            VabGenRx shall not be liable for clinical decisions made by healthcare professionals
            using the platform or for outcomes related to medical treatment decisions.
          </P>
        </Section>

        {/* ── 14. Policy Updates ── */}
        <Section number="14" title="Policy Updates">
          <P>
            VabGenRx may revise this Privacy Policy periodically in order to reflect changes in
            regulatory requirements, technology infrastructure, security practices, or platform
            functionality. Updated versions of the policy will be published with a revised
            effective date. Continued use of the platform following the publication of updates
            indicates acknowledgment of the revised policy.
          </P>
        </Section>

        {/* ── 15. Contact ── */}
        <Section number="15" title="Contact Information">
          <P>
            Questions regarding this Privacy Policy or the data protection practices of VabGenRx
            may be directed to the platform team.
          </P>
          <div style={{
            marginTop: 12, padding: "16px 20px",
            background: "#f0f5ff", borderRadius: 8,
            fontSize: "0.88rem", lineHeight: 2,
          }}>
            <strong>VabGenRx Team</strong><br />
            Email:{" "}
            <a href={`mailto:${contact}`} style={{ color: "#1a73e8" }}>
              {contact}
            </a><br />
            Platform:{" "}
            <span style={{ color: "#555" }}>
              VabGenRx Clinical Decision Support Platform — deployment URL available upon request
            </span>
          </div>
        </Section>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: "1px solid #e0e3ef",
          display: "flex", justifyContent: "space-between",
          alignItems: "center", fontSize: "0.8rem", color: "#aaa",
          flexWrap: "wrap", gap: 8,
        }}>
          <span>© 2026 VabGenRx — Clinical Decision Support Platform</span>
          <span>HIPAA-compliant · AES-256 encrypted · 6-year audit retention</span>
        </div>

      </div>
    </div>
  );
};

export default PrivacyPolicy;