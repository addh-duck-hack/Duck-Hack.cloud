// src/pages/ProductDetail.jsx — ruta /tienda/:id. Pendiente de rediseño.
import React from 'react';
import { useParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useProductDetail } from '../hooks/useProductDetail';
import SectionPlaceholder from '../components/SectionPlaceholder';

const ProductDetail = () => {
  const { id } = useParams();
  const { product } = useProductDetail(id);
  usePageMeta(product ? product.name : 'Producto', product?.description || undefined);
  return (
    <SectionPlaceholder
      title={product ? product.name : 'Producto'}
      hooks="useProductDetail, useRandomProducts, RichText"
    />
  );
};

export default ProductDetail;
