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
    process.exit(1);
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

// GET entry by sessionID
router.get('/:id', (req, res) => {
  const sessionID = req.params.id;
  db.query("SELECT * FROM logs WHERE sessionID = ?", [sessionID], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.sendStatus(404);
    res.json(results[0]);
  });
});

// POST new entry (no ID in route)
router.post('/', (req, res) => {
  const payload = req.body;
  const sessionID = payload.sessionID;
  if (!sessionID) return res.status(400).json({ error: "sessionID is required" });
  const data = JSON.stringify(payload);

  db.query(
    "INSERT INTO logs (sessionID, data) VALUES (?, ?)",
    [sessionID, data],
    (err, results) => {
      if (err) {
        // Handle duplicate sessionID (optional: use UPSERT)
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: "Entry with this sessionID already exists" });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ sessionID, data: payload });
    }
  );
});

// PUT update entry by sessionID
router.put('/:id', (req, res) => {
  const sessionID = req.params.id;
  const payload = req.body;
  const data = JSON.stringify(payload);

  db.query(
    "UPDATE logs SET data = ? WHERE sessionID = ?",
    [data, sessionID],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.affectedRows === 0) return res.sendStatus(404);
      res.json({ sessionID, data: payload });
    }
  );
});

// DELETE entry by sessionID
router.delete('/:id', (req, res) => {
  const sessionID = req.params.id;
  db.query("DELETE FROM logs WHERE sessionID = ?", [sessionID], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.affectedRows === 0) return res.sendStatus(404);
    res.sendStatus(204);
  });
});

// Mount router under /api/static
app.use('/api/static', router);

// Handle preflight for /api/static
app.options('/api/static', cors());

// Start server
app.listen(3001, () => {
  console.log("REST API listening on port 3001");
});