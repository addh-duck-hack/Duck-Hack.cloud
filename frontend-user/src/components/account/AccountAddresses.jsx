// src/components/account/AccountAddresses.jsx — "Mis direcciones": libreta
// de direcciones (agregar, editar en línea, predeterminada, eliminar). Las
// mismas que se eligen en el checkout.
import React from 'react';
import { SHIPPING_ADDRESS_FIELDS } from '../../utils/address';

const AddressForm = ({ value, onChange, onSubmit, onCancel, isSaving, error, submitLabel, idPrefix }) => (
  <form className="acc-subform" onSubmit={onSubmit}>
    <div className="acc-grid">
      <label className="acc-field acc-field--wide" htmlFor={`${idPrefix}-label`}>
        <span>Nombre de la dirección (opcional)</span>
        <input id={`${idPrefix}-label`} name="label" value={value.label || ''} onChange={onChange} placeholder="Casa, Oficina…" maxLength={40} />
      </label>
      {SHIPPING_ADDRESS_FIELDS.map((field) => (
        <label key={field.name} className={`acc-field${field.wide ? ' acc-field--wide' : ''}`} htmlFor={`${idPrefix}-${field.name}`}>
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
          />
        </label>
      ))}
    </div>
    <label className="acc-check">
      <input type="checkbox" name="isDefault" checked={Boolean(value.isDefault)} onChange={onChange} />
      <span>Usar como dirección predeterminada</span>
    </label>
    {error ? (
      <p className="acc-alert acc-alert--error" role="alert">
        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
        <span>{error}</span>
      </p>
    ) : null}
    <div className="acc-actions">
      <button type="submit" className="acc-btn" disabled={isSaving}>
        {isSaving ? 'Guardando…' : submitLabel}
      </button>
      <button type="button" className="acc-btn acc-btn--ghost" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  </form>
);

const AccountAddresses = ({ account }) => {
  const { addresses } = account;

  return (
    <div className="acc-section">
      <div className="acc-card">
        <div className="acc-card-head">
          <h2>Mis direcciones</h2>
          {!addresses.showAddForm ? (
            <button type="button" className="acc-btn acc-btn--small" onClick={() => addresses.setShowAddForm(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Agregar
            </button>
          ) : null}
        </div>
        <p className="acc-muted">Las usamos para que tus compras sean más rápidas: las eliges en un clic al pagar.</p>

        {addresses.message ? (
          <p className="acc-alert acc-alert--success" role="status">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{addresses.message}</span>
          </p>
        ) : null}
        {addresses.error ? (
          <p className="acc-alert acc-alert--error" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{addresses.error}</span>
          </p>
        ) : null}

        {addresses.showAddForm ? (
          <AddressForm
            idPrefix="acc-new"
            value={addresses.newForm}
            onChange={addresses.onNewChange}
            onSubmit={addresses.add}
            onCancel={() => addresses.setShowAddForm(false)}
            isSaving={addresses.isAdding}
            submitLabel="Guardar dirección"
          />
        ) : null}

        {addresses.list.length === 0 && !addresses.showAddForm ? (
          <div className="acc-empty">
            <i className="fa-solid fa-map-location-dot" aria-hidden="true" />
            <p>Aún no tienes direcciones guardadas.</p>
          </div>
        ) : null}

        <ul className="acc-addresses">
          {addresses.list.map((address) =>
            addresses.editingId === address._id ? (
              <li key={address._id}>
                <AddressForm
                  idPrefix={`acc-edit-${address._id}`}
                  value={addresses.editForm}
                  onChange={addresses.onEditChange}
                  onSubmit={addresses.saveEdit}
                  onCancel={addresses.cancelEdit}
                  isSaving={addresses.isSavingEdit}
                  error={addresses.editError}
                  submitLabel="Guardar cambios"
                />
              </li>
            ) : (
              <li key={address._id} className="acc-address">
                <span className="acc-address-icon" aria-hidden="true">
                  <i className="fa-solid fa-house" />
                </span>
                <span className="acc-lines">
                  <strong>
                    {address.label || address.recipientName}
                    {address.isDefault ? <em className="acc-tag">Predeterminada</em> : null}
                  </strong>
                  <span>
                    {address.street} {address.exteriorNumber}
                    {address.interiorNumber ? `, int. ${address.interiorNumber}` : ''}, {address.neighborhood}
                  </span>
                  <span>
                    {address.city}, {address.state} · C.P. {address.zipCode}
                  </span>
                  <span className="acc-muted">
                    Recibe: {address.recipientName} · {address.phone}
                  </span>
                </span>
                <span className="acc-address-actions">
                  {!address.isDefault ? (
                    <button type="button" className="acc-link" onClick={() => addresses.setDefault(address._id)} disabled={addresses.actionId === address._id}>
                      Hacer predeterminada
                    </button>
                  ) : null}
                  <button type="button" className="acc-link" onClick={() => addresses.startEdit(address)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="acc-link acc-link--danger"
                    onClick={() => addresses.remove(address._id)}
                    disabled={addresses.actionId === address._id}
                  >
                    Eliminar
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
};

export default AccountAddresses;
