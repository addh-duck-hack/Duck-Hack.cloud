// src/utils/icons.js
//
// Íconos de Font Awesome capturados en el admin (commands, services...). Se
// usan como className, así que solo se aceptan clases tipo
// "fa-solid fa-mug-hot" (letras, números, espacios y guiones); cualquier otra
// cosa devuelve "" y el ícono no se pinta.
export const safeIconClass = (icon) => (/^[a-z0-9 -]+$/i.test(icon || '') ? icon.trim() : '');
