const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Post = require("../models/post.model");
const verifyToken = require('../middleware/authMiddleware');

// Crear un nuevo post (requiere autenticación)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, content, published, tags } = req.body;
    
    // El usuario que crea el post está disponible en req.user
    const author = req.user.id;

    const post = new Post({ title, content, published, author, tags });
    await post.save();

    res.status(201).json({ message: 'Post creado correctamente', post });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener todos los posts
router.get("/", verifyToken, async (req, res) => {
  try {
    const posts = await Post.find().populate("author", "name email");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un post especifico
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;

    // Verificar si el ID es un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "ID no válido" });
    }

    const posts = await Post.findById(postId).populate("author", "name email");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta para editar un post por ID
router.put("/:id", verifyToken, async (req, res) => {
  const postId = req.params.id;
  const { title, content, tags } = req.body; // Los campos que deseas actualizar

  try {
    // Buscar y actualizar el post por su ID
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { title, content, tags }, // Actualizar estos campos
      { new: true, runValidators: true } // Devolver el post actualizado y aplicar validadores de Mongoose
    );

    if (!updatedPost) {
      return res.status(404).json({ message: "Post no encontrado" });
    }

    res.status(200).json({
      message: "Post actualizado correctamente",
      post: updatedPost,
    });
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar el post", error });
  }
});

// Eliminar un post por ID
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;

    // Verificar si el ID es un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "ID no válido" });
    }

    // Buscar y eliminar el post por su ID
    const deletedPost = await Post.findByIdAndDelete(postId);

    // Verificar si el post existía
    if (!deletedPost) {
      return res.status(404).json({ message: "Post no encontrado" });
    }

    res.status(200).json({ message: "Post eliminado correctamente", post: deletedPost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
