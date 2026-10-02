// Categorías de productos y de servicios usan las mismas pantallas
// (CategoryList / CategoryForm) con distinto `kind`: la API es la misma
// (/api/categories?kind=…) y el backend decide el permiso según el kind
// (products o services, ver packages/core-api/modules/categories.js).
export const CATEGORY_KINDS = {
  product: {
    basePath: "/admin/categories",
    itemsLabel: "Productos",
    intro: "Agrupan los productos en la tienda. Solo se puede eliminar una categoría que ningún producto usa.",
    inUseTitle: "Tiene productos: cámbialos de categoría o desactívala",
  },
  service: {
    basePath: "/admin/service-categories",
    itemsLabel: "Servicios",
    intro: "Agrupan los servicios (Uñas, Pestañas, Cabello…). Solo se puede eliminar una categoría que ningún servicio usa.",
    inUseTitle: "Tiene servicios: cámbialos de categoría o desactívala",
  },
};
