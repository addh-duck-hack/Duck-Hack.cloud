// src/components/Loader.js
import React from 'react';
import logo from '../assets/logo.png';
import './Loader.css';

const Loader = () => {
  return (
    <div className="loader-container">
      <img src={logo} alt="Duck-Hack Logo" className="loader-logo" />
    </div>
  );
};

export default Loader;