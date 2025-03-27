// src/components/Services.js
import React from 'react';
import './Services.css';

const services = [
  {
    name: 'Basic',
    description: 'Excelente para un negocio pequeño, una pagina personal o un blog personal.',
    storage: '10 GB',
    emailAccounts: '15',
    bandwidth: '100 GB',
    ssl: 'Costo preferencial',
    price: '$250.00 MXN',
  },
  {
    name: 'Medium',
    description: 'Quieres un poco más, aquí podrás alojar un sitio más especializado como un blog con múltiples colaboradores.',
    storage: '15 GB',
    emailAccounts: '30',
    bandwidth: '150 GB',
    ssl: 'Incluido',
    price: '$500.00 MXN',
  },
  {
    name: 'Advanced',
    description: 'Para usuarios avanzados que necesitan el máximo desempeño, velocidad y seguridad para sus proyectos.',
    storage: '30 GB',
    emailAccounts: '100',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    price: '$750.00 MXN',
  },
  {
    name: 'Pro',
    description: 'Aún necesitas más, podemos ajustarnos a la medida de tus necesidades, el límite es tu imaginación.',
    storage: '100 GB',
    emailAccounts: 'Ilimitadas',
    bandwidth: 'Ilimitado',
    ssl: 'Incluido',
    price: '$1,150.00 MXN',
  },
];

const Services = () => {
  return (
    <section className="services">

      {/* Vista para PC */}
      <div className="services-grid">
        {services.map((service, index) => (
          <div className="service-card" key={index}>
            <div className="service-header">
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <h4>{service.price}</h4>
              <h5>*Precio mensual</h5>
            </div>
            <div className="service-body">
              <div className="service-feature">
                <i className="fas fa-hdd icon"></i>
                <p>Almacenamiento: {service.storage}</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-envelope icon"></i>
                <p>Cuentas de correo: {service.emailAccounts}</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-wifi icon"></i>
                <p>Ancho de banda: {service.bandwidth}</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-lock icon"></i>
                <p>Certificado SSL: {service.ssl}</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-check icon"></i>
                <p>Soporte técnico y en español</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-check icon"></i>
                <p>Disponibilidad del 99.9%</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-check icon"></i>
                <p>Se puede escalar o disminuir el plan sin penalización</p>
              </div>
              <div className="service-feature">
                <i className="fas fa-check icon"></i>
                <p>Política de devolución de 30 días</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Services;
