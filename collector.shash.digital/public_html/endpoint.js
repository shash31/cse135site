const express = require("express");
const mysql = require("mysql2");

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

const db = mysql.createConnection({
  host: "localhost",
  user: "analytics_user",
  password: "password123",
  database: "analytics"
});

app.post("/log", (req, res) => {
  const data = JSON.stringify(req.body);

  db.query(
    "INSERT INTO logs (data) VALUES (?)",
    [data],
    () => res.sendStatus(200)
  );
});

app.listen(3000);