import React from "react";
import { Link } from "react-router-dom";
import MediaField from "./MediaField";
import {
  LINK_TYPE_OPTIONS,
  MAX_CAROUSEL_PRODUCTS,
  NOTICE_STYLE_OPTIONS,
  PRODUCT_SOURCE_OPTIONS,
  STORE_SECTION_TYPES,
  countActiveStoreItems,
} from "../utils/appHomeSections";

const Field = ({ label, children, hint }) => (
  <label className="app-home-field">
    <span>{label}</span>
    {children}
    {hint ? <small>{hint}</small> : null}
  </label>
);

// `categories` = categorías del catálogo (/api/categories); se guarda el slug.
const CategorySelect = ({ value, onChange, categories }) => (
  <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
    <option value="">— Elige una categoría —</option>
    {categories.map((category) => (
      <option key={category._id} value={category.slug}>
        {category.name}
        {category.isActive === false ? " (inactiva)" : ""}
      </option>
    ))}
    {value && !categories.some((c) => c.slug === value) ? <option value={value}>{value} (ya no existe)</option> : null}
  </select>
);

const ProductSelect = ({ value, onChange, products, placeholder = "— Elige un producto —" }) => (
  <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {products.map((product) => (
      <option key={product._id} value={product._id}>
        {product.name}
        {product.isActive === false ? " (inactivo)" : ""}
      </option>
    ))}
  </select>
);

// Enlace opcional de un banner o aviso: a un producto, una categoría o una URL.
const LinkField = ({ value, onChange, products, categories }) => {
  const type = value?.type || "none";
  const setType = (nextType) => onChange(nextType === "none" ? undefined : { type: nextType, value: "" });
  const setValue = (nextValue) => onChange({ type, value: nextValue });

  return (
    <div className="app-home-row">
      <Field label="Al tocar, abre">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {LINK_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      {type === "product" ? (
        <Field label="Producto">
          <ProductSelect value={value.value} onChange={setValue} products={products} />
        </Field>
      ) : null}
      {type === "category" ? (
        <Field label="Categoría">
          <CategorySelect value={value.value} onChange={setValue} categories={categories} />
        </Field>
      ) : null}
      {type === "url" ? (
        <Field label="URL">
          <input type="url" value={value.value || ""} maxLength={500} placeholder="https://..." onChange={(e) => setValue(e.target.value)} />
        </Field>
      ) : null}
    </div>
  );
};

// Lista de elementos (imágenes de un banner, categorías de la cuadrícula):
// agregar, quitar y reordenar.
const ItemList = ({ items, onChange, max, createItem, addLabel, renderItem }) => {
  const update = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index) => onChange(items.filter((_, i) => i !== index));
  const move = (index, delta) => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };

  return (
    <div className="app-home-items">
      {items.map((item, index) => (
        <div key={index} className="app-home-item">
          <div className="app-home-item-head">
            <strong>#{index + 1}</strong>
            <div className="app-home-actions">
              <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => move(index, -1)} title="Subir">
                <i className="fas fa-arrow-up" aria-hidden="true" />
              </button>
              <button type="button" className="btn-secondary" disabled={index === items.length - 1} onClick={() => move(index, 1)} title="Bajar">
                <i className="fas fa-arrow-down" aria-hidden="true" />
              </button>
              <button type="button" className="btn-danger" disabled={items.length === 1} onClick={() => remove(index)} title="Quitar">
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </div>
          </div>
          {renderItem(item, (patch) => update(index, patch))}
        </div>
      ))}
      {items.length < max ? (
        <button type="button" className="btn-secondary" onClick={() => onChange([...items, createItem()])}>
          <i className="fas fa-plus" aria-hidden="true" /> {addLabel}
        </button>
      ) : null}
    </div>
  );
};

const BannerForm = ({ section, onChange, products, categories }) => (
  <ItemList
    items={section.items || []}
    onChange={(items) => onChange({ items })}
    max={10}
    createItem={() => ({ image: "", title: "", subtitle: "" })}
    addLabel="Agregar imagen"
    renderItem={(item, update) => (
      <>
        <MediaField label="Imagen *" value={item.image} onChange={(image) => update({ image })} kinds={["image", "gif"]} />
        <div className="app-home-row">
          <Field label="Título">
            <input type="text" value={item.title || ""} maxLength={120} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Subtítulo">
            <input type="text" value={item.subtitle || ""} maxLength={200} onChange={(e) => update({ subtitle: e.target.value })} />
          </Field>
        </div>
        <LinkField value={item.link} onChange={(link) => update({ link })} products={products} categories={categories} />
      </>
    )}
  />
);

const ProductCarouselForm = ({ section, onChange, products, productsById, categories }) => {
  const productIds = section.productIds || [];
  const setIds = (ids) => onChange({ productIds: ids });
  const move = (index, delta) => {
    const next = [...productIds];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setIds(next);
  };
  const available = products.filter((product) => !productIds.includes(product._id));

  return (
    <>
      <div className="app-home-row">
        <Field label="Productos a mostrar">
          <select
            value={section.source || "latest"}
            onChange={(e) => onChange({ source: e.target.value, productIds: undefined, category: undefined })}
          >
            {PRODUCT_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Máximo de productos" hint={`1 a ${MAX_CAROUSEL_PRODUCTS}`}>
          <input
            type="number"
            min={1}
            max={MAX_CAROUSEL_PRODUCTS}
            value={section.limit ?? 10}
            onChange={(e) => onChange({ limit: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </Field>
        {section.source === "category" ? (
          <Field label="Categoría *">
            <CategorySelect value={section.category} onChange={(category) => onChange({ category })} categories={categories} />
          </Field>
        ) : null}
      </div>

      {section.source === "manual" ? (
        <div className="app-home-items">
          {productIds.map((id, index) => (
            <div key={id} className="app-home-chip-row">
              <span>
                {index + 1}. {productsById.get(id)?.name || <em>Producto eliminado ({id})</em>}
              </span>
              <div className="app-home-actions">
                <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => move(index, -1)} title="Subir">
                  <i className="fas fa-arrow-up" aria-hidden="true" />
                </button>
                <button type="button" className="btn-secondary" disabled={index === productIds.length - 1} onClick={() => move(index, 1)} title="Bajar">
                  <i className="fas fa-arrow-down" aria-hidden="true" />
                </button>
                <button type="button" className="btn-danger" onClick={() => setIds(productIds.filter((x) => x !== id))} title="Quitar">
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {productIds.length < MAX_CAROUSEL_PRODUCTS ? (
            <ProductSelect
              value=""
              onChange={(id) => id && setIds([...productIds, id])}
              products={available}
              placeholder="+ Agregar producto..."
            />
          ) : null}
          <small className="app-home-hint">
            En la app solo se muestran los que estén activos y con existencias, en este orden.
          </small>
        </div>
      ) : (
        <small className="app-home-hint">Solo se muestran productos activos y con existencias; si no hay ninguno, la sección no aparece en la app.</small>
      )}
    </>
  );
};

const CategoryGridForm = ({ section, onChange, categories }) => (
  <ItemList
    items={section.items || []}
    onChange={(items) => onChange({ items })}
    max={12}
    createItem={() => ({ category: "", label: "", image: "" })}
    addLabel="Agregar categoría"
    renderItem={(item, update) => (
      <>
        <div className="app-home-row">
          <Field label="Categoría *">
            <CategorySelect value={item.category} onChange={(category) => update({ category })} categories={categories} />
          </Field>
          <Field label="Texto a mostrar" hint="Vacío = nombre de la categoría">
            <input type="text" value={item.label || ""} maxLength={60} onChange={(e) => update({ label: e.target.value })} />
          </Field>
        </div>
        <MediaField label="Imagen" value={item.image} onChange={(image) => update({ image })} kinds={["image"]} />
      </>
    )}
  />
);

const NoticeForm = ({ section, onChange, products, categories }) => (
  <>
    <Field label="Texto *">
      <textarea rows={3} maxLength={1000} value={section.body || ""} onChange={(e) => onChange({ body: e.target.value })} />
    </Field>
    <div className="app-home-row">
      <Field label="Estilo">
        <select value={section.style || "info"} onChange={(e) => onChange({ style: e.target.value })}>
          {NOTICE_STYLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
    <LinkField value={section.link} onChange={(link) => onChange({ link })} products={products} categories={categories} />
  </>
);

// Secciones de tienda: el contenido no se edita aquí, se reutiliza el de
// "Configurar tienda" (mismo contenido en web y app).
const StoreSectionInfo = ({ section, storeConfig }) => {
  const def = STORE_SECTION_TYPES[section.type];
  const count = countActiveStoreItems(storeConfig, section.type);
  return (
    <div className="app-home-store-info">
      <i className="fas fa-link" aria-hidden="true" />
      <div>
        Muestra el contenido de la tienda: <b>{count}</b> elemento(s) activo(s).
        {count === 0 ? " Mientras no haya ninguno activo, la sección no aparece en la app." : ""}
        <br />
        Se edita en <Link to={def.tab.path}>{def.tab.label}</Link> y los cambios salen igual en el sitio web y en la app.
      </div>
    </div>
  );
};

const FORMS = {
  banner: BannerForm,
  productCarousel: ProductCarouselForm,
  categoryGrid: CategoryGridForm,
  notice: NoticeForm,
};

// Formulario de una sección: campos comunes (título) + los de su tipo.
// `onChange(patch)` mezcla el patch en la sección.
const AppHomeSectionForm = ({ section, onChange, products, productsById, categories, storeConfig }) => {
  const TypeForm = FORMS[section.type];
  const isStoreSection = Boolean(STORE_SECTION_TYPES[section.type]);
  return (
    <div className="app-home-form">
      <Field label="Título de la sección" hint="Opcional — se muestra arriba de la sección en la app">
        <input type="text" value={section.title || ""} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      {isStoreSection ? (
        <StoreSectionInfo section={section} storeConfig={storeConfig} />
      ) : TypeForm ? (
        <TypeForm section={section} onChange={onChange} products={products} productsById={productsById} categories={categories} />
      ) : (
        <small className="app-home-hint">Este tipo solo se puede editar desde la pestaña JSON.</small>
      )}
    </div>
  );
};

export default AppHomeSectionForm;
