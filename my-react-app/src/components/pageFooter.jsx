import "../components/styles/pageFooter.css";

const PageFooter = () => (
  <div className="page-footer">
    © {new Date().getFullYear()} VabGen Rx. All rights reserved.
  </div>
);

export default PageFooter;