// src/components/pageFooter.jsx
const PageFooter = () => (
  <div style={{
    textAlign: 'center',
    padding: '12px 24px',
    fontSize: '11px',
    color: '#94a3b8',
    borderTop: '1px solid #e2e8f0',
    marginTop: '32px',
    letterSpacing: '0.02em',
  }}>
    © {new Date().getFullYear()} VabGen Rx. All rights reserved.
  </div>
);

export default PageFooter;