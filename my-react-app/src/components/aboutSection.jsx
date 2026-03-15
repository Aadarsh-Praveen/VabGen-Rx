import { useEffect, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import "./styles/aboutSection.css";

import drugInteractionIcon from "../assets/drug_interaction.png";
import smartDosingIcon     from "../assets/smart_dosing.png";
import counsellingIcon     from "../assets/counselling.png";
import clinicalAlertsIcon  from "../assets/clinical_alerts.png";
import dataSecurityIcon    from "../assets/data-security.png";
import auditIcon           from "../assets/audit.png";

const EMAILJS_SERVICE_ID  = "service_97qx5xd";
const EMAILJS_TEMPLATE_ID = "template_try3ahp";
const EMAILJS_PUBLIC_KEY  = "rO528XfcHEen6uDon";

const STATS = [
  { target: 95,    suffix: "%",  prefix: "> ", label: "AI Evaluation Accuracy"                  },
  { target: 12000, suffix: "+",  prefix: "",   label: "Drug Interactions Analyzed"               },
  { target: 50000, suffix: "+",  prefix: "",   label: "Evidence-Based PubMed + FDA Data"         },
  { target: 6,     suffix: "",   prefix: "",   label: "Multi-Agent AI Clinical Reasoning System" },
];

const FEATURES = [
  {
    img: drugInteractionIcon, color: "blue", title: "Drug Interaction Intelligence",
    body: "Automatically detects dangerous drug-drug interactions by analyzing scientific literature and FDA safety reports. Each interaction is classified by severity, mechanism and clinical recommendation.",
  },
  {
    img: smartDosingIcon, color: "rose", title: "Smart Dosing Intelligence",
    body: "Personalized dosing recommendations generated using patient-specific factors such as age, renal function, liver function and comorbidities. Helps physicians avoid dosing errors in complex clinical cases.",
  },
  {
    img: counsellingIcon, color: "purple", title: "Counselling & Multilingual Support",
    body: "Clear communication is as critical as the prescription itself. Counselling summaries are automatically generated in the patient's preferred language ensuring medication instructions.",
  },
  {
    img: clinicalAlertsIcon, color: "teal", title: "Real-Time Clinical Alerts",
    body: "Identifies contraindications, adverse interactions and dosing risks in seconds. Alerts are prioritized by severity and include actionable clinical recommendations.",
  },
  {
    img: dataSecurityIcon, color: "amber", title: "Enterprise-Grade Security",
    body: "Built with healthcare-grade security architecture including AES-256 encryption, secure authentication and strict data access policies designed to support HIPAA-aligned environments.",
  },
  {
    img: auditIcon, color: "green", title: "Audit & Compliance",
    body: "Comprehensive audit logging tracks every clinical analysis request and decision pathway, supporting transparency, traceability and regulatory compliance requirements.",
  },
];

const WHY_ITEMS = [
  {
    num: "01",
    accent: "#0e7490",
    accentBg: "rgba(14,116,144,0.08)",
    accentBorder: "rgba(14,116,144,0.2)",
    tag: "Evidence",
    title: "Continuously Updated Evidence",
    body: "Drug interaction insights are derived from the latest PubMed research publications and FDA safety reports, ensuring recommendations remain scientifically grounded and current.",
  },
  {
    num: "02",
    accent: "#7c3aed",
    accentBg: "rgba(124,58,237,0.08)",
    accentBorder: "rgba(124,58,237,0.2)",
    tag: "Privacy",
    title: "Privacy by Architecture",
    body: "Patient identifiers are never stored in raw form. Data minimization and secure processing ensure that clinical analysis protects patient privacy by design.",
  },
  {
    num: "03",
    accent: "#0f766e",
    accentBg: "rgba(15,118,110,0.08)",
    accentBorder: "rgba(15,118,110,0.2)",
    tag: "Transparency",
    title: "Explainable AI Alerts",
    body: "Every alert includes the underlying clinical mechanism, supporting evidence sources and recommended actions, giving physicians full transparency and control over their prescribing decisions.",
  },
];

function animateCounter(el) {
  const target   = +el.dataset.target;
  const suffix   = el.dataset.suffix || "";
  const prefix   = el.dataset.prefix || "";
  const duration = 1800;
  const start    = performance.now();
  function step(now) {
    const p    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    el.textContent = prefix + Math.round(ease * target).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Contact Form ── */
const ContactSection = () => {
  const [form,    setForm]    = useState({ firstName: "", lastName: "", email: "", message: "" });
  const [status,  setStatus]  = useState(null);
  const [touched, setTouched] = useState({});

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleBlur = (e) => {
    setTouched(prev => ({ ...prev, [e.target.name]: true }));
  };

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const errors = {
    firstName: !form.firstName.trim()      ? "First name is required."      : null,
    lastName:  !form.lastName.trim()       ? "Last name is required."       : null,
    email:     !form.email.trim()          ? "Email is required."
               : !isValidEmail(form.email) ? "Enter a valid email address." : null,
    message:   !form.message.trim()        ? "Message is required."         : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ firstName: true, lastName: true, email: true, message: true });
    if (hasErrors) return;

    setStatus("sending");
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          from_name:  `${form.firstName} ${form.lastName}`,
          name:       `${form.firstName} ${form.lastName}`,
          first_name: form.firstName,
          last_name:  form.lastName,
          reply_to:   form.email,
          from_email: form.email,
          message:    form.message,
          to_email:   "vabgenrxsupport@gmail.com",
        },
        EMAILJS_PUBLIC_KEY
      );
      setStatus("success");
      setForm({ firstName: "", lastName: "", email: "", message: "" });
      setTouched({});
    } catch (err) {
      console.error("EmailJS error:", err);
      setStatus("error");
    }
  };

  return (
    <div className="about-contact-section reveal" id="contact">
      <p className="about-section-label reveal">Contact Us</p>

      <div className="about-contact-inner">

        {/* ── Left: info panel ── */}
        <div className="about-contact-left">
          <h2 className="about-contact-title">Get in touch with our team</h2>
          <p className="about-contact-subtitle">
            Have a question, partnership inquiry, or need support?
            Our team is here to help. We respond within one business day.
          </p>

          <div className="about-contact-info-list">
            <div className="about-contact-info-item">
              <div className="about-contact-info-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div>
                <p className="about-contact-info-label">Email</p>
                <p className="about-contact-info-value">vabgenrxsupport@gmail.com</p>
              </div>
            </div>
            <div className="about-contact-info-item">
              <div className="about-contact-info-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <p className="about-contact-info-label">Response Time</p>
                <p className="about-contact-info-value">Within 24 hours</p>
              </div>
            </div>
          
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="about-contact-right">
          <div className="about-contact-card">
            {status === "success" ? (
              <div className="about-contact-success">
                <div className="about-contact-success-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0e7490" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <h3 className="about-contact-success-title">Message Sent!</h3>
                <p className="about-contact-success-body">
                  Thank you for reaching out. Our team will get back to you within one business day.
                </p>
                <button className="about-contact-reset-btn" onClick={() => setStatus(null)}>
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="about-contact-form-grid">
                  <div className="about-contact-field">
                    <label>First Name <span className="about-contact-req">*</span></label>
                    <input
                      type="text" name="firstName" value={form.firstName}
                      onChange={handleChange} onBlur={handleBlur}
                      placeholder="John"
                      className={touched.firstName && errors.firstName ? "error" : ""}
                    />
                    {touched.firstName && errors.firstName && (
                      <span className="about-contact-error">{errors.firstName}</span>
                    )}
                  </div>
                  <div className="about-contact-field">
                    <label>Last Name <span className="about-contact-req">*</span></label>
                    <input
                      type="text" name="lastName" value={form.lastName}
                      onChange={handleChange} onBlur={handleBlur}
                      placeholder="Smith"
                      className={touched.lastName && errors.lastName ? "error" : ""}
                    />
                    {touched.lastName && errors.lastName && (
                      <span className="about-contact-error">{errors.lastName}</span>
                    )}
                  </div>
                </div>

                <div className="about-contact-field">
                  <label>Email Address <span className="about-contact-req">*</span></label>
                  <input
                    type="email" name="email" value={form.email}
                    onChange={handleChange} onBlur={handleBlur}
                    placeholder="you@hospital.com"
                    className={touched.email && errors.email ? "error" : ""}
                  />
                  {touched.email && errors.email && (
                    <span className="about-contact-error">{errors.email}</span>
                  )}
                </div>

                <div className="about-contact-field">
                  <label>Message <span className="about-contact-req">*</span></label>
                  <textarea
                    name="message" value={form.message} rows={5}
                    onChange={handleChange} onBlur={handleBlur}
                    placeholder="Tell us how we can help..."
                    className={touched.message && errors.message ? "error" : ""}
                  />
                  {touched.message && errors.message && (
                    <span className="about-contact-error">{errors.message}</span>
                  )}
                </div>

                {status === "error" && (
                  <div className="about-contact-err-banner">
                    Something went wrong. Please try again or email us directly at vabgenrxsupport@gmail.com
                  </div>
                )}

                <button
                  type="submit"
                  className="about-contact-submit"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? (
                    <><span className="about-contact-spinner" />Sending...</>
                  ) : (
                    <>
                      Send Message
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

/* ── Main Component ── */
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
          if (e.isIntersecting) { animateCounter(e.target); statObs.unobserve(e.target); }
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

        {/* ── Stats ── */}
        <div className="about-stats-ribbon">
          {STATS.map((s, i) => (
            <div key={s.label} className={`about-stat-item reveal reveal-delay-${i}`}>
              <div className="about-stat-num" data-target={s.target} data-suffix={s.suffix} data-prefix={s.prefix}>0</div>
              <div className="about-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Core Features ── */}
        <div className="about-cards-section">
          <p className="about-section-label reveal">Core Features</p>
          <h2 className="about-section-title reveal reveal-delay-1">Everything you need, built for clinicians</h2>
          <div className="about-cards-grid">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`about-feature-card reveal reveal-delay-${i % 3}`}>
                <div className={`about-card-icon about-icon-${f.color}`}>
                  <img src={f.img} alt={f.title} className="about-card-icon-img" />
                </div>
                <h3 className="about-card-title">{f.title}</h3>
                <p className="about-card-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Mission / Vision ── */}
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

        {/* ── Why VabGen Rx ── */}
        <div className="about-why-section">
          <p className="about-section-label reveal">Why VabGen Rx</p>
          <h2 className="about-section-title reveal reveal-delay-1">Built differently. For a reason.</h2>
          <div className="about-why-grid">
            {WHY_ITEMS.map((item, i) => (
              <div
                key={item.num}
                className={`about-why-card reveal reveal-delay-${i}`}
                style={{ "--why-accent": item.accent, "--why-accent-bg": item.accentBg, "--why-accent-border": item.accentBorder }}
              >
                <div className="about-why-card-header">
                  <span className="about-why-tag">{item.tag}</span>
                </div>
                <h4 className="about-why-card-title">{item.title}</h4>
                <p className="about-why-card-body">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact Us ── */}
        <ContactSection />

        {/* ── Footer ── */}
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