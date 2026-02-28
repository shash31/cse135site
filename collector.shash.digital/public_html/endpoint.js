const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors({
    // origin: 'https://test.shash.digital',
    origin: '*', 
    methods: ['POST'],
    allowedHeaders: ['Content-Type']
}));
// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type');
//   if (req.method === 'OPTIONS') {
//     return res.sendStatus(204);
//   }
//   next();
// });

app.use(express.json());

const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "analytics_user",
  password: "password123",
  database: "analytics"
});

db.connect(err => {
  if (err) {
    console.error('DB connection failed:', err);
    return;
  }
  console.log('Connected to DB');
});

app.options('/log', cors({ origin: '*' }));  // allow preflight

app.post("/log", (req, res) => {
  const data = JSON.stringify(req.body);

  db.query(
    "INSERT INTO logs (data) VALUES (?)",
    [data],
    () => res.sendStatus(200)
  );
});

app.listen(3000);