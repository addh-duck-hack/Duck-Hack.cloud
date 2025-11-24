const express = require('express');
const router = express.Router();
const Category = require('../models/category.model');

// Obtener todas las categorías
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().select('_id name description path');
    res.status(200).json(categories);
  } catch (error) {
    console.error('Error obteniendo categorías', error);
    res.status(500).json({ message: 'Error obteniendo categorías' });
  }
});

// (Opcional) crear categoría — protegido podría añadirse más adelante
router.post('/', async (req, res) => {
  try {
    const { name, description, path } = req.body;
    if (!name) return res.status(400).json({ message: 'El nombre es requerido' });
    if (!path) return res.status(400).json({ message: 'El path es requerido' });
    const category = new Category({ name, description, path });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creando categoría', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El path ya existe para otra categoría' });
    }
    res.status(500).json({ message: 'Error creando categoría' });
  }
});

module.exports = router;
