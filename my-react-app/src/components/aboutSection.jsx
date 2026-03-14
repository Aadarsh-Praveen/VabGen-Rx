import { useEffect, useRef } from "react";
import "./styles/aboutSection.css";

const STATS = [
  { target: 100,   suffix: "%", label: "AI Evaluation Accuracy"                  },
  { target: 12000, suffix: "+", label: "Drug Interactions Analyzed"               },
  { target: 1,     suffix: "",  label: "Multi-Agent AI Clinical Reasoning System" },
  { target: 2,     suffix: "",  label: "Evidence-Based PubMed + FDA Data"         },
];

const FEATURES = [
  {
    icon: "🛡️", color: "blue", title: "Drug Interaction Intelligence",
    body: "Automatically detects dangerous drug-drug interactions by analyzing scientific literature and FDA safety reports. Each interaction is classified by severity, mechanism and clinical recommendation.",
  },
  {
    icon: "⚡", color: "teal", title: "Real-Time Clinical Alerts",
    body: "Identifies contraindications, adverse interactions and dosing risks in seconds. Alerts are prioritized by severity and include actionable clinical recommendations.",
  },
  {
    icon: "🔒", color: "purple", title: "Physician-Verified Access",
    body: "Designed exclusively for healthcare professionals. Role-based access ensures that sensitive clinical intelligence tools remain restricted to verified medical practitioners.",
  },
  {
    icon: "💊", color: "rose", title: "Smart Dosing Intelligence",
    body: "Personalized dosing recommendations generated using patient-specific factors such as age, renal function, liver function and comorbidities. Helps physicians avoid dosing errors in complex clinical cases.",
  },
  {
    icon: "🔑", color: "amber", title: "Enterprise-Grade Security",
    body: "Built with healthcare-grade security architecture including AES-256 encryption, secure authentication and strict data access policies designed to support HIPAA-aligned environments.",
  },
  {
    icon: "📊", color: "green", title: "Audit & Compliance",
    body: "Comprehensive audit logging tracks every clinical analysis request and decision pathway, supporting transparency, traceability and regulatory compliance requirements.",
  },
];

const WHY_ITEMS = [
  {
    num: "01", title: "Clinician-First Design",
    body: "Designed around real prescribing workflows. Physicians receive clear, prioritized alerts with concise clinical explanations instead of overwhelming data.",
  },
  {
    num: "02", title: "Continuously Updated Evidence",
    body: "Drug interaction insights are derived from the latest PubMed research publications and FDA safety reports, ensuring recommendations remain scientifically grounded and current.",
  },
  {
    num: "03", title: "Privacy by Architecture",
    body: "Patient identifiers are never stored in raw form. Data minimization and secure processing ensure that clinical analysis protects patient privacy by design.",
  },
  {
    num: "04", title: "Lightweight Integration",
    body: "VabGen Rx integrates with existing healthcare systems through a clean API layer, allowing hospitals and telemedicine platforms to deploy medication safety intelligence without complex infrastructure changes.",
  },
  {
    num: "05", title: "Explainable AI Alerts",
    body: "Every alert includes the underlying clinical mechanism, supporting evidence sources and recommended actions, giving physicians full transparency and control over their prescribing decisions.",
  },
];

const TECH_PILLS = [
  "React", "Redux Toolkit", "FastAPI", "Azure AI Foundry", "Azure OpenAI GPT-4o",
  "Azure SQL Database", "Azure Key Vault", "Azure Application Insights",
  "REST APIs", "Role-Based Access Control", "HIPAA-Aligned Security", "Python",
];

function animateCounter(el) {
  const target   = +el.dataset.target;
  const suffix   = el.dataset.suffix || "";
  const duration = 1800;
  const start    = performance.now();
  function step(now) {
    const p    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    el.textContent = Math.round(ease * target).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const AboutSection = () => {
  const sectionRef = useRef(null);

  useEffect(() => {
    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );

    const statObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animateCounter(e.target);
            statObs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const root = sectionRef.current;
    if (!root) return;

    root.querySelectorAll(".reveal").forEach((el) => revealObs.observe(el));

    setTimeout(() => {
      root.querySelectorAll(".about-stat-num[data-target]").forEach((el) => statObs.observe(el));
    }, 300);

    return () => { revealObs.disconnect(); statObs.disconnect(); };
  }, []);

  return (
    <div ref={sectionRef} className="about-section-wrapper">

      <div
        className="about-scroll-cta"
        onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}
      >
        <span>Discover VabGen Rx</span>
        <div className="about-scroll-arrow" />
      </div>

      <div className="about-section" id="about">

        <div className="about-stats-ribbon">
          {STATS.map((s, i) => (
            <div key={s.label} className={`about-stat-item reveal reveal-delay-${i}`}>
              <div className="about-stat-num" data-target={s.target} data-suffix={s.suffix}>0</div>
              <div className="about-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="about-cards-section">
          <p className="about-section-label reveal">Core Features</p>
          <h2 className="about-section-title reveal reveal-delay-1">Everything you need, built for clinicians</h2>
          <div className="about-cards-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`about-feature-card reveal reveal-delay-${i % 3}`}>
                <div className={`about-card-icon about-icon-${f.color}`}>{f.icon}</div>
                <h3 className="about-card-title">{f.title}</h3>
                <p className="about-card-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="about-mv-section">
          <div className="about-mv-card about-mv-mission reveal">
            <p className="about-mv-tag">Our Mission</p>
            <h3 className="about-mv-title">Eliminate Preventable Medication Errors</h3>
            <p className="about-mv-body">
              Medication errors remain one of the most preventable causes of patient harm worldwide.
              VabGen Rx was created to provide physicians with an intelligent second layer of clinical safety.
              By combining multi-agent AI reasoning with scientific evidence, our platform helps clinicians
              detect risks early, make safer prescribing decisions and ultimately protect patients at every prescription.
            </p>
          </div>
          <div className="about-mv-card about-mv-vision reveal reveal-delay-1">
            <p className="about-mv-tag">Our Vision</p>
            <h3 className="about-mv-title">The Future of Prescribing is Intelligent</h3>
            <p className="about-mv-body">
              We envision a healthcare ecosystem where every prescription is supported by real-time clinical intelligence.
              By integrating AI-driven evidence analysis, drug safety data and patient-specific insights,
              VabGen Rx enables physicians to prescribe with confidence while reducing the cognitive burden
              of complex medication decisions.
            </p>
          </div>
        </div>

        <div className="about-why-section">
          <p className="about-section-label reveal">Why VabGen Rx</p>
          <h2 className="about-section-title reveal reveal-delay-1">Built differently. For a reason.</h2>
          <div className="about-timeline">
            {WHY_ITEMS.map((item, i) => (
              <div key={item.num} className={`about-tl-item reveal reveal-delay-${i % 3}`}>
                <div className="about-tl-dot" />
                <p className="about-tl-num">{item.num}</p>
                <h4 className="about-tl-title">{item.title}</h4>
                <p className="about-tl-body">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="about-tech-section">
          <p className="about-section-label reveal">Technology</p>
          <h2 className="about-section-title reveal reveal-delay-1">Built on a modern, reliable stack</h2>
          <div className="about-pills reveal reveal-delay-2">
            {TECH_PILLS.map((pill) => (
              <span key={pill} className="about-pill">{pill}</span>
            ))}
          </div>
        </div>

        <div className="about-footer reveal">
          <p className="about-footer-brand">
            VabGen <span className="about-rx-r">R</span><span className="about-rx-x">x</span>
          </p>
          <p className="about-footer-note">
            AI-Powered Medication Safety Platform · Built with Azure AI to advance clinical decision support
            and protect patients through intelligent prescribing. · © {new Date().getFullYear()} VabGen Rx. All rights reserved.
          </p>
        </div>

      </div>
    </div>
  );
};

export default AboutSection;