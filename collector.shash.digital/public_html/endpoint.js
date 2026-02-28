const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3005;
const LOG_FILE = path.join(__dirname, 'analytics.jsonl');