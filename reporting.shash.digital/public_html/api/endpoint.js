const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

const corsOptions = {
  origin: 'https://test.shash.digital',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type']
};

app.use(cors(corsOptions));
app.use(express.json());

// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'POST, OPTIONS, PUT');
//   res.header('Access-Control-Allow-Headers', 'Content-Type');
//   if (req.method === 'OPTIONS') {
//     return res.sendStatus(204);
//   }
//   next();
// });


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
  console.log('GET Request for all entries')

  db.query("SELECT * FROM logs", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.get('/:id', (req, res) => {
  const sessionID = req.params.id;

  console.log(`GET request for sessionID:${sessionID}`)

  db.query("SELECT * FROM logs WHERE sessionID = ?", [sessionID], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.sendStatus(404);
    res.json(results[0]);
  });
});

router.post('/', (req, res) => {
  const payload = req.body;
  const sessionID = payload.sessionID;
  if (!sessionID) return res.status(400).json({ error: "sessionID is required" });

  const data = JSON.stringify(payload);

  console.log(`POST request for sessionID:${sessionID}`)

  db.query(
    "INSERT INTO logs (sessionID, data) VALUES (?, ?)",
    [sessionID, data],
    (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: "Entry with this sessionID already exists" });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ sessionID, data: payload });
    }
  );
});

router.put('/:id', (req, res) => {
  const sessionID = req.params.id;
  const newPayload = req.body;

  console.log(`PUT request for sessionID:${sessionID}`)

  db.query("SELECT data FROM logs WHERE sessionID = ?", [sessionID], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.sendStatus(404);

    const existingData = results[0].data;

    // Merge activity payload into existing session row
    const mergedData = { ...existingData, activity: newPayload.activity };

    db.query(
      "UPDATE logs SET data = ? WHERE sessionID = ?",
      [JSON.stringify(mergedData), sessionID],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ sessionID, data: mergedData });
      }
    );
  });
});

router.delete('/:id', (req, res) => {
  const sessionID = req.params.id;

  console.log(`DELETE request for sessionID:${sessionID}`)

  db.query("DELETE FROM logs WHERE sessionID = ?", [sessionID], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.affectedRows === 0) return res.sendStatus(404);
    res.sendStatus(204);
  });
});

app.use('/api/static', router);
app.options('*', cors(corsOptions));

app.listen(3001, () => {
  console.log("REST API listening on port 3001");
});