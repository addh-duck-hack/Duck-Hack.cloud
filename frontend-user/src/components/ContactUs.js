// src/components/ContactUs.js
import React, { useState } from 'react';
import './ContactUs.css';
import backgroundMap from '../assets/background_map.png'; // Importa la imagen de fondo

const ContactUs = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    service: '',
    message: '',
  });
  const [formSubmitted, setFormSubmitted] = useState(false); // Estado para controlar la visibilidad del formulario

  const services = [
    'Diseño web',
    'Desarrollo web',
    'Aplicaciones nativas',
    'Hosting',
    'Imagen corporativa',
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.REACT_APP_HOST_SERVICES_URL}/api/mail/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormSubmitted(true);
      } else {
        alert('Error enviando el mensaje');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };  

  return (
    <section
      id="contact-us"
      className="contact-us"
      style={{ backgroundImage: `url(${backgroundMap})` }}
    >
      <h2 className="contact-us-title">CONTACTANOS</h2>
      <div className="overlay">
        <div className="contact-form-container">
          {!formSubmitted ? ( // Condicional para mostrar el formulario o el mensaje de agradecimiento
            <>
              <form className="contact-form" onSubmit={handleSubmit}>
                <input
                  type="text"
                  name="fullName"
                  placeholder="Nombre completo"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Correo electrónico"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <input
                  type="tel"
                  name="phone"
                  placeholder="Teléfono"
                  value={formData.phone}
                  onChange={handleChange}
                />
                <select
                  name="service"
                  value={formData.service}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccione un servicio</option>
                  {services.map((service, index) => (
                    <option key={index} value={service}>{service}</option>
                  ))}
                </select>
                <textarea
                  name="message"
                  placeholder="Escribe tu mensaje"
                  value={formData.message}
                  onChange={handleChange}
                  required
                />
                <div className="button-container">
                  <button type="submit" className="submit-button">Contactarnos</button>
                </div>
              </form>
            </>
          ) : (
            <div className="thank-you-message">
              <h2>¡Gracias por contactarnos!</h2>
              <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ContactUs;