// const express = require("express");
// const mysql = require("mysql2");
// const cors = require("cors");

// const app = express();

// app.use(cors({
//     origin: 'https://test.shash.digital',
//     methods: ['POST', 'GET', 'OPTIONS'],
//     allowedHeaders: ['Content-Type']
// }));

// app.use(express.json());

// const db = mysql.createConnection({
//   host: "127.0.0.1",
//   user: "analytics_user",
//   password: "password123",
//   database: "analytics"
// });

// db.connect(err => {
//   if (err) {
//     console.error('DB connection failed:', err);
//     return;
//   }
//   console.log('Connected to DB');
// });

// app.options('/log', cors({ origin: 'https://test.shash.digital/' }));  // allow preflight

// app.post("/log", (req, res) => {
//   const data = JSON.stringify(req.body);

//   db.query(
//     "INSERT INTO logs (data) VALUES (?)",
//     [data],
//     () => res.sendStatus(200)
//   );
// });

// app.listen(3000);

const express = require('express');
const cors = require('cors');
const staticRoutes = require('./routes/static');

const app = express();
app.use(cors());
app.use(express.json());

// mount all API routes under /api
app.use('/api/static', staticRoutes);

app.listen(3001, () => console.log('REST API listening on port 3001'));