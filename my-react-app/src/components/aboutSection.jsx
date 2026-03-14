import { useEffect, useRef } from "react";
import "./styles/aboutSection.css";

const STATS = [
  { target: 98,    suffix: "%",  label: "Accuracy Rate"            },
  { target: 12000, suffix: "+",  label: "Drug Interactions Mapped" },
  { target: 500,   suffix: "+",  label: "Verified Physicians"      },
  { target: 24,    suffix: "hr", label: "Alert Coverage"           },
];

const FEATURES = [
  {
    icon: "🛡️", color: "blue", title: "Drug Interaction Guard",
    body: "Real-time cross-checking of prescribed medications against a curated database of 12,000+ known interactions — flagging risks before they reach the patient.",
  },
  {
    icon: "⚡", color: "teal", title: "Instant Alerts",
    body: "Severity-graded notifications for contraindications, dosage anomalies, and allergy conflicts — delivered in milliseconds, not seconds.",
  },
  {
    icon: "🔒", color: "purple", title: "Physician-Only Access",
    body: "No self-signup. Every account is manually verified, ensuring only licensed and credentialed practitioners access sensitive clinical tools.",
  },
  {
    icon: "💊", color: "rose", title: "Smart Dosage Engine",
    body: "Adapts recommendations based on patient weight, renal function, age, and comorbidities — providing personalised safe-dose ranges at the point of care.",
  },
  {
    icon: "🔑", color: "amber", title: "Enterprise-Grade Security",
    body: "Password expiry policies, account lockout protection, and end-to-end encryption keep patient data and clinical records safe at every layer.",
  },
  {
    icon: "📊", color: "green", title: "Audit & Compliance",
    body: "Full activity logging and exportable audit trails designed to meet HIPAA and regional healthcare data compliance requirements without extra effort.",
  },
];

const WHY_ITEMS = [
  {
    num: "01", title: "Clinician-First Design",
    body: "Every workflow, screen, and alert was shaped around how doctors actually prescribe — not how software engineers imagined they might. Rapid, no-friction access to the information that matters most.",
  },
  {
    num: "02", title: "Continuously Updated Drug Database",
    body: "Our curated interaction library is reviewed and updated regularly against the latest pharmacological research, FDA safety advisories, and clinical trial data — so the guidance is always current.",
  },
  {
    num: "03", title: "Privacy by Architecture",
    body: "Patient data never leaves your institution's context. Our architecture is designed with data minimisation at its core — we see what we need to protect patients, nothing more.",
  },
  {
    num: "04", title: "Lightweight Integration",
    body: "No months-long EHR implementations. VabGen Rx connects to existing hospital systems through a clean API layer — up and running in days, not quarters.",
  },
  {
    num: "05", title: "Transparent, Explainable Alerts",
    body: "We never just say 'caution.' Every alert links to its clinical evidence source, severity rationale, and alternative suggestion — putting the physician back in control of the final call.",
  },
];

const TECH_PILLS = [
  "React", "Redux Toolkit", "Node.js", "Express", "PostgreSQL",
  "REST API", "JWT Auth", "HIPAA Aligned", "AES-256 Encryption",
  "Vite", "Real-time Alerts", "Role-Based Access",
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
      { threshold: 0.12 }
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

        {/* Hero block removed — now lives in the login left panel */}

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
              <div key={f.title} className={`about-feature-card reveal reveal-delay-${i}`}>
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
            <h3 className="about-mv-title">Zero Preventable Medication Errors</h3>
            <p className="about-mv-body">
              We believe no patient should be harmed by a prescription that could have been caught.
              VabGen Rx exists to give physicians an intelligent second set of eyes — one that never
              tires, never misses a contraindication, and scales across every ward, every shift, every
              system. Our mission is to make medication errors an artifact of the past, not a risk of
              the present.
            </p>
          </div>
          <div className="about-mv-card about-mv-vision reveal reveal-delay-1">
            <p className="about-mv-tag">Our Vision</p>
            <h3 className="about-mv-title">The Future of Prescribing is Intelligent</h3>
            <p className="about-mv-body">
              We envision a world where every prescribing decision is augmented by real-time clinical
              intelligence — where pharmacogenomics, patient history, and global drug safety data
              converge at the point of care. VabGen Rx is building the infrastructure for that future:
              one trusted prescription at a time.
            </p>
          </div>
        </div>

        <div className="about-why-section">
          <p className="about-section-label reveal">Why VabGen Rx</p>
          <h2 className="about-section-title reveal reveal-delay-1">Built differently. For a reason.</h2>
          <div className="about-timeline reveal reveal-delay-2">
            {WHY_ITEMS.map((item) => (
              <div key={item.num} className="about-tl-item">
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

        <div className="about-footer">
          <p className="about-footer-brand">
            VabGen <span className="about-rx-r">R</span><span className="about-rx-x">x</span>
          </p>
          <p className="about-footer-note">
            Authorized access only · Built for patient safety · © {new Date().getFullYear()} VabGen Rx. All rights reserved.
          </p>
        </div>

      </div>
    </div>
  );
};

export default AboutSection;