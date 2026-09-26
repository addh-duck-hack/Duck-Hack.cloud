// src/components/checkout/AddressFields.jsx
//
// Campos de una dirección de entrega (utils/address.js#SHIPPING_ADDRESS_FIELDS),
// en rejilla de 2 columnas; los `wide` ocupan la fila completa.
import React from 'react';
import { SHIPPING_ADDRESS_FIELDS } from '../../utils/address';

const AUTOCOMPLETE = {
  recipientName: 'shipping name',
  phone: 'shipping tel',
  street: 'shipping address-line1',
  interiorNumber: 'shipping address-line2',
  zipCode: 'shipping postal-code',
  city: 'shipping address-level2',
  state: 'shipping address-level1',
};

const AddressFields = ({ value, onChange, idPrefix }) => (
  <div className="co-grid">
    {SHIPPING_ADDRESS_FIELDS.map((field) => (
      <label key={field.name} className={`co-field${field.wide ? ' co-field--wide' : ''}`} htmlFor={`${idPrefix}-${field.name}`}>
        <span>{field.label}</span>
        <input
          id={`${idPrefix}-${field.name}`}
          name={field.name}
          value={value[field.name] || ''}
          onChange={onChange}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          required={field.required}
          type={field.name === 'phone' ? 'tel' : 'text'}
          inputMode={field.name === 'phone' || field.name === 'zipCode' ? 'numeric' : undefined}
          autoComplete={AUTOCOMPLETE[field.name]}
        />
      </label>
    ))}
  </div>
);

export default AddressFields;
