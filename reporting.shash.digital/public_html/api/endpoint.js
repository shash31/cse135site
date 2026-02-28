// endpoint.js
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

// --- CORS setup ---
app.use(cors({
    origin: 'https://test.shash.digital',
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// --- MySQL connection ---
const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "analytics_user",
  password: "password123",
  database: "analytics"
});

db.connect(err => {
  if (err) {
    console.error('DB connection failed:', err);
    process.exit(1); // Stop app if DB is not available
  }
  console.log('Connected to DB');
});

// --- REST routes for /api/static ---
const router = express.Router();

// GET all entries
router.get('/', (req, res) => {
  db.query("SELECT * FROM logs", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// GET entry by ID
router.get('/:id', (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM logs WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.sendStatus(404);
    res.json(results[0]);
  });
});

// POST new entry
router.post('/', (req, res) => {
  const data = JSON.stringify(req.body);
  db.query("INSERT INTO logs (data) VALUES (?)", [data], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: results.insertId, data: req.body });
  });
});

// PUT update entry by ID
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const data = JSON.stringify(req.body);
  db.query("UPDATE logs SET data = ? WHERE id = ?", [data, id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.affectedRows === 0) return res.sendStatus(404);
    res.json({ id, data: req.body });
  });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM logs WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.affectedRows === 0) return res.sendStatus(404);
    res.sendStatus(204);
  });
});

app.use('/api/static', router);

app.options('/api/static', cors());

// Start server
app.listen(3001, () => {
  console.log("REST API listening on port 3001");
});