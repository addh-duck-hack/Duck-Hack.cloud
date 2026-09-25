// src/components/AboutIntro.jsx
//
// Primer bloque de /nosotros: a la izquierda el título en dos tiempos (el
// segundo en cursiva y color acento), a la derecha la historia de la familia
// y el botón a la tienda. Texto fijo: el admin no tiene un campo para este
// bloque.
import React from 'react';
import { Link } from 'react-router-dom';
import './AboutIntro.css';

const AboutIntro = () => (
  <section className="about-intro" aria-labelledby="about-intro-title">
    <div className="about-intro-heading">
      <h1 id="about-intro-title" className="about-intro-title">
        Una historia que comienza en 1973
        <em>Más de 50 años cultivando una tradición</em>
      </h1>
    </div>

    <div className="about-intro-body">
      <p className="text-justify">
        Somos una familia cafetera con raíces en Xicotepec, Puebla, dedicada al café desde 1973. Durante varias
        generaciones hemos cultivado, seleccionado, procesado y comercializado café de manera artesanal,
        conservando los conocimientos y las prácticas que hemos aprendido de quienes nos precedieron.
      </p>
      <p className="text-justify">
        Nuestra historia comenzó en el campo, entre las montañas y cafetales de nuestra región, y con el paso de
        los años hemos llevado nuestro café más allá de su lugar de origen. Hoy trabajamos con minoristas,
        mayoristas, cafeterías y otros negocios que buscan un café de calidad, con identidad y un origen que
        pueda conocerse.
      </p>
      <p className="text-justify">
        A lo largo de este camino hemos mantenido una filosofía sencilla: respetar el café desde su origen hasta
        la taza. Cada etapa, desde el cultivo y la selección del grano hasta su procesamiento, tueste y entrega,
        forma parte de un proceso que combina la experiencia de varias generaciones con nuestra visión de seguir
        creciendo.
      </p>
      <p className="text-justify">
        Actualmente llevamos nuestro café a clientes en Puebla, Veracruz, Hidalgo y Tlaxcala, construyendo
        relaciones que van más allá de una venta. Porque para nosotros, cada cliente forma parte de una historia
        que comenzó hace más de cinco décadas y que seguimos escribiendo con el mismo respeto por la tierra, el
        café y nuestro trabajo.
      </p>

      <Link to="/tienda" className="about-intro-cta">
        Visita nuestra tienda
      </Link>
    </div>
  </section>
);

export default AboutIntro;
