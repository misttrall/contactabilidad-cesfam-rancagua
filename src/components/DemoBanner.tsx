import './DemoBanner.css';

const DemoBanner = () => (
  <div className="demo-banner" role="status">
    <strong>Datos ficticios</strong>
    <span aria-hidden="true"> · </span>
    <span>Proyecto conceptual</span>
    <span aria-hidden="true"> · </span>
    <span>No es un sistema oficial del CESFAM</span>
  </div>
);

export default DemoBanner;
