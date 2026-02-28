const express = require('express');
const router = express.Router();

// In-memory storage example
let data = [];
let nextId = 1;

// GET all
router.get('/', (req, res) => res.json(data));

// GET by ID
router.get('/:id', (req, res) => {
  const item = data.find(d => d.id === +req.params.id);
  if (!item) return res.sendStatus(404);
  res.json(item);
});

// POST new
router.post('/', (req, res) => {
  const item = { id: nextId++, ...req.body };
  data.push(item);
  res.status(201).json(item);
});

// PUT update
router.put('/:id', (req, res) => {
  const index = data.findIndex(d => d.id === +req.params.id);
  if (index === -1) return res.sendStatus(404);
  data[index] = { id: +req.params.id, ...req.body };
  res.json(data[index]);
});

// DELETE
router.delete('/:id', (req, res) => {
  const index = data.findIndex(d => d.id === +req.params.id);
  if (index === -1) return res.sendStatus(404);
  data.splice(index, 1);
  res.sendStatus(204);
});

module.exports = router;