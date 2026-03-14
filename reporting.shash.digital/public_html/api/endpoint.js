const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");
const wkhtmltopdf = require("wkhtmltopdf");
const UAParser = require("ua-parser-js");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3001);
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_USER = process.env.DB_USER || "analytics_user";
const DB_PASSWORD = process.env.DB_PASSWORD || "password123";
const DB_NAME = process.env.DB_NAME || "analytics";
const SESSION_SECRET = process.env.SESSION_SECRET || "change_me_session_secret";
const COLLECTOR_KEY = process.env.COLLECTOR_KEY || "change_me_collector_key";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://reporting.shash.digital";
const EXPORT_TOKEN_SECRET = process.env.EXPORT_TOKEN_SECRET || SESSION_SECRET;
const NODE_ENV = process.env.NODE_ENV || "development";
const MAX_LOG_ROWS = Number(process.env.MAX_LOG_ROWS || 500);

const allowedOrigins = new Set(
  ["https://reporting.shash.digital", "https://test.shash.digital"]
    .concat((process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean))
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Collector-Key"],
  })
);

app.use(express.json({ limit: "1mb" }));

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const sessionStore = new MySQLStore(
  {
    schema: {
      tableName: "sessions",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  },
  pool
);

app.use(
  session({
    name: "reporting_sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

const exportsDir = path.join(__dirname, "..", "exports");
fs.mkdirSync(exportsDir, { recursive: true });
app.use("/exports", express.static(exportsDir));

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function safeJsonParse(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function normalizeHash(hashValue) {
  if (hashValue && hashValue.startsWith("$2y$")) {
    return `$2b$${hashValue.slice(4)}`;
  }
  return hashValue;
}

function buildFilters(query) {
  const start = query.start ? new Date(query.start) : null;
  const end = query.end ? new Date(query.end) : null;
  const page = query.page ? String(query.page).trim() : "";
  const limit = Math.min(Number(query.limit || MAX_LOG_ROWS), MAX_LOG_ROWS);

  let startDate = start;
  let endDate = end;

  if (!startDate && !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
  }

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  return {
    start: startDate,
    end: endDate,
    page,
    limit,
  };
}

function serializeFilters(filters) {
  return {
    start: filters.start ? filters.start.toISOString().slice(0, 10) : null,
    end: filters.end ? filters.end.toISOString().slice(0, 10) : null,
    page: filters.page || null,
    limit: filters.limit,
  };
}

async function fetchLogs(filters) {
  let sql = "SELECT sessionID, data, created_at FROM logs WHERE 1=1";
  const params = [];
  if (filters.start) {
    sql += " AND created_at >= ?";
    params.push(filters.start);
  }
  if (filters.end) {
    sql += " AND created_at <= ?";
    params.push(filters.end);
  }
  sql += " ORDER BY created_at DESC";
  sql += " LIMIT ?";
  params.push(filters.limit);

  const [rows] = await pool.query(sql, params);
  const parsedRows = rows.map((row) => {
    const payload = safeJsonParse(row.data);
    return {
      sessionID: row.sessionID,
      createdAt: row.created_at,
      performanceData: payload.performanceData || {},
      staticData: payload.staticData || {},
      activity: payload.activity || {},
    };
  });

  if (filters.page) {
    return parsedRows.filter(
      (row) => row.activity && row.activity.page === filters.page
    );
  }

  return parsedRows;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function computePerformanceMetrics(rows) {
  const normalized = rows.map((row) => {
    const loadTime = Number(row.performanceData.totalLoadTime) || 0;
    return {
      sessionID: row.sessionID,
      page: row.activity.page || "(n/a)",
      loadTime,
      startLoad: Number(row.performanceData.startLoad) || 0,
      endLoad: Number(row.performanceData.endLoad) || 0,
      createdAt: row.createdAt,
    };
  });

  const loadTimes = normalized.map((row) => row.loadTime).filter((v) => v > 0);
  const avgLoad = loadTimes.length
    ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length)
    : 0;
  const p95 = Math.round(percentile(loadTimes, 95));

  const chartRows = normalized.slice(0, 20);
  return {
    summary: {
      sessions: normalized.length,
      averageLoadMs: avgLoad,
      p95LoadMs: p95,
    },
    charts: {
      loadTimeBySession: {
        labels: chartRows.map((row) => row.sessionID.slice(0, 8)),
        values: chartRows.map((row) => Math.max(1, row.loadTime)),
      },
    },
    table: normalized,
  };
}

function computeEngagementMetrics(rows) {
  const normalized = rows.map((row) => {
    const idleTimes = Array.isArray(row.activity.idleTimes)
      ? row.activity.idleTimes
      : [];
    const idleTotal = idleTimes.reduce(
      (sum, item) => sum + (Number(item.duration) || 0),
      0
    );
    const userExit = Number(row.activity.userExit) || 0;
    const userEntry = Number(row.activity.userEntry) || 0;
    const activeTotal = userExit > userEntry
      ? Math.max(0, userExit - userEntry - idleTotal)
      : 0;

    return {
      sessionID: row.sessionID,
      page: row.activity.page || "(n/a)",
      idleTotal,
      activeTotal,
      createdAt: row.createdAt,
    };
  });

  const totalIdle = normalized.reduce((sum, row) => sum + row.idleTotal, 0);
  const totalActive = normalized.reduce((sum, row) => sum + row.activeTotal, 0);

  return {
    summary: {
      sessions: normalized.length,
      totalIdleMs: Math.round(totalIdle),
      totalActiveMs: Math.round(totalActive),
    },
    charts: {
      idleVsActive: {
        labels: ["Idle", "Active"],
        values: [Math.round(totalIdle), Math.round(totalActive)],
      },
    },
    table: normalized,
  };
}

function computeTechMetrics(rows) {
  const parser = new UAParser();
  const browserCounts = {};
  const osCounts = {};

  const normalized = rows.map((row) => {
    const ua = row.staticData.userAgent || "";
    parser.setUA(ua);
    const result = parser.getResult();
    const browser = result.browser.name || "Unknown";
    const os = result.os.name || "Unknown";
    const device = result.device.type || "Desktop";

    browserCounts[browser] = (browserCounts[browser] || 0) + 1;
    osCounts[os] = (osCounts[os] || 0) + 1;

    return {
      sessionID: row.sessionID,
      page: row.activity.page || "(n/a)",
      browser,
      os,
      device,
      viewport: row.staticData.windowWidth && row.staticData.windowHeight
        ? `${row.staticData.windowWidth} x ${row.staticData.windowHeight}`
        : "(n/a)",
      network: row.staticData.networkConType || "(n/a)",
      createdAt: row.createdAt,
    };
  });

  const topBrowsers = Object.entries(browserCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return {
    summary: {
      sessions: normalized.length,
      uniqueBrowsers: Object.keys(browserCounts).length,
      uniqueOs: Object.keys(osCounts).length,
    },
    charts: {
      browserShare: {
        labels: topBrowsers.map(([name]) => name),
        values: topBrowsers.map(([, count]) => count),
      },
    },
    table: normalized,
  };
}

async function getUserSections(userId) {
  const [rows] = await pool.query(
    "SELECT s.name FROM sections s JOIN user_sections us ON us.section_id = s.id WHERE us.user_id = ?",
    [userId]
  );
  return rows.map((row) => row.name);
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    "SELECT id, username, role FROM users WHERE id = ?",
    [userId]
  );
  return rows[0];
}

async function getSectionIdByName(sectionName) {
  const [rows] = await pool.query("SELECT id FROM sections WHERE name = ?", [sectionName]);
  return rows[0] ? rows[0].id : null;
}

async function getReportById(reportId) {
  const [rows] = await pool.query(
    "SELECT r.*, s.name AS section_name, u.username AS created_by_name FROM reports r JOIN sections s ON r.section_id = s.id LEFT JOIN users u ON r.created_by = u.id WHERE r.id = ?",
    [reportId]
  );
  return rows[0];
}

function createExportToken(reportId, userId) {
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `${reportId}.${userId}.${expires}`;
  const sig = crypto.createHmac("sha256", EXPORT_TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyExportToken(token, reportId) {
  if (!token) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch (error) {
    return false;
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) return false;
  const [tokenReportId, userId, expires, sig] = parts;
  if (Number(tokenReportId) !== Number(reportId)) return false;
  if (Date.now() > Number(expires)) return false;
  const payload = `${tokenReportId}.${userId}.${expires}`;
  const expected = crypto.createHmac("sha256", EXPORT_TOKEN_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return jsonError(res, 401, "Authentication required");
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return jsonError(res, 401, "Authentication required");
    }
    if (!roles.includes(req.user.role)) {
      return jsonError(res, 403, "Forbidden");
    }
    return next();
  };
}

function requireSection(sectionName) {
  return (req, res, next) => {
    if (!req.user) {
      return jsonError(res, 401, "Authentication required");
    }
    if (req.user.role === "super_admin") return next();
    if (req.user.role === "analyst") {
      if (req.userSections.has(sectionName)) return next();
      return jsonError(res, 403, "Section access denied");
    }
    return jsonError(res, 403, "Forbidden");
  };
}

function canAccessReport(req, report) {
  if (!req.user) return false;
  if (req.user.role === "super_admin") return true;
  if (req.user.role === "analyst") {
    return req.userSections.has(report.section_name);
  }
  if (req.user.role === "viewer") {
    return true;
  }
  return false;
}

function requireCollectorKey(req, res, next) {
  const key = req.header("X-Collector-Key");
  if (!key || key !== COLLECTOR_KEY) {
    return jsonError(res, 401, "Collector key required");
  }
  return next();
}

const api = express.Router();

api.use(async (req, res, next) => {
  if (!req.session.userId) return next();
  const user = await getUserById(req.session.userId);
  if (!user) return next();
  req.user = user;
  const sections = await getUserSections(user.id);
  req.userSections = new Set(sections);
  req.userSectionList = sections;
  return next();
});

api.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return jsonError(res, 400, "Username and password required");
  }

  const [rows] = await pool.query(
    "SELECT id, username, role, password_hash FROM users WHERE username = ?",
    [username]
  );
  const user = rows[0];
  if (!user) {
    return jsonError(res, 401, "Invalid credentials");
  }

  const normalizedHash = normalizeHash(user.password_hash);
  const valid = await bcrypt.compare(password, normalizedHash);
  if (!valid) {
    return jsonError(res, 401, "Invalid credentials");
  }

  req.session.userId = user.id;
  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
  });
});

api.post("/auth/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

api.get("/auth/me", requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      sections: req.userSectionList,
    },
  });
});

api.get("/sections", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT id, name FROM sections ORDER BY id");
  res.json(rows);
});

api.get("/users", requireRole("super_admin"), async (req, res) => {
  const [rows] = await pool.query(
    "SELECT u.id, u.username, u.role, GROUP_CONCAT(s.name ORDER BY s.name) AS sections FROM users u LEFT JOIN user_sections us ON u.id = us.user_id LEFT JOIN sections s ON us.section_id = s.id GROUP BY u.id ORDER BY u.id"
  );
  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    sections: row.sections ? row.sections.split(",") : [],
  }));
  res.json(users);
});

api.post("/users", requireRole("super_admin"), async (req, res) => {
  const { username, password, role, sections } = req.body || {};
  if (!username || !password || !role) {
    return jsonError(res, 400, "username, password, role required");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    [username, passwordHash, role]
  );

  if (Array.isArray(sections)) {
    for (const sectionName of sections) {
      const sectionId = await getSectionIdByName(sectionName);
      if (sectionId) {
        await pool.query(
          "INSERT INTO user_sections (user_id, section_id) VALUES (?, ?)",
          [result.insertId, sectionId]
        );
      }
    }
  }

  res.status(201).json({ id: result.insertId });
});

api.put("/users/:id", requireRole("super_admin"), async (req, res) => {
  const userId = Number(req.params.id);
  const { username, password, role } = req.body || {};

  const updates = [];
  const params = [];

  if (username) {
    updates.push("username = ?");
    params.push(username);
  }
  if (role) {
    updates.push("role = ?");
    params.push(role);
  }
  if (password) {
    const passwordHash = await bcrypt.hash(password, 10);
    updates.push("password_hash = ?");
    params.push(passwordHash);
  }

  if (!updates.length) {
    return jsonError(res, 400, "No fields to update");
  }

  params.push(userId);
  await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

api.delete("/users/:id", requireRole("super_admin"), async (req, res) => {
  const userId = Number(req.params.id);
  await pool.query("DELETE FROM users WHERE id = ?", [userId]);
  res.json({ ok: true });
});

api.put("/users/:id/sections", requireRole("super_admin"), async (req, res) => {
  const userId = Number(req.params.id);
  const { sections } = req.body || {};
  if (!Array.isArray(sections)) {
    return jsonError(res, 400, "sections array required");
  }
  await pool.query("DELETE FROM user_sections WHERE user_id = ?", [userId]);
  for (const sectionName of sections) {
    const sectionId = await getSectionIdByName(sectionName);
    if (sectionId) {
      await pool.query(
        "INSERT INTO user_sections (user_id, section_id) VALUES (?, ?)",
        [userId, sectionId]
      );
    }
  }
  res.json({ ok: true });
});

api.get(
  "/metrics/performance",
  requireAuth,
  requireRole("super_admin", "analyst"),
  requireSection("performance"),
  async (req, res) => {
    const filters = buildFilters(req.query);
    const rows = await fetchLogs(filters);
    const metrics = computePerformanceMetrics(rows);
    res.json({
      section: "performance",
      filters: serializeFilters(filters),
      metrics,
    });
  }
);

api.get(
  "/metrics/engagement",
  requireAuth,
  requireRole("super_admin", "analyst"),
  requireSection("engagement"),
  async (req, res) => {
    const filters = buildFilters(req.query);
    const rows = await fetchLogs(filters);
    const metrics = computeEngagementMetrics(rows);
    res.json({
      section: "engagement",
      filters: serializeFilters(filters),
      metrics,
    });
  }
);

api.get(
  "/metrics/tech",
  requireAuth,
  requireRole("super_admin", "analyst"),
  requireSection("tech"),
  async (req, res) => {
    const filters = buildFilters(req.query);
    const rows = await fetchLogs(filters);
    const metrics = computeTechMetrics(rows);
    res.json({
      section: "tech",
      filters: serializeFilters(filters),
      metrics,
    });
  }
);

api.get("/reports", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT r.id, r.name, r.section_id, s.name AS section, r.filters_json, r.created_at, r.created_by, u.username AS created_by_name FROM reports r JOIN sections s ON r.section_id = s.id LEFT JOIN users u ON r.created_by = u.id ORDER BY r.created_at DESC"
  );
  const reports = rows.filter((row) => {
    if (req.user.role === "super_admin") return true;
    if (req.user.role === "analyst") return req.userSections.has(row.section);
    return true;
  }).map((row) => ({
    id: row.id,
    name: row.name,
    section: row.section,
    filters: safeJsonParse(row.filters_json),
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
  }));

  res.json(reports);
});

api.post("/reports", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const { name, section, filters } = req.body || {};
  if (!name || !section) {
    return jsonError(res, 400, "name and section required");
  }
  if (req.user.role === "analyst" && !req.userSections.has(section)) {
    return jsonError(res, 403, "Section access denied");
  }
  const sectionId = await getSectionIdByName(section);
  if (!sectionId) return jsonError(res, 400, "Unknown section");
  const [result] = await pool.query(
    "INSERT INTO reports (name, section_id, filters_json, created_by) VALUES (?, ?, ?, ?)",
    [name, sectionId, JSON.stringify(filters || {}), req.user.id]
  );
  res.status(201).json({ id: result.insertId });
});

api.put("/reports/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const reportId = Number(req.params.id);
  const { name, filters } = req.body || {};
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");

  if (req.user.role === "analyst") {
    if (!req.userSections.has(report.section_name)) return jsonError(res, 403, "Forbidden");
    if (report.created_by !== req.user.id) return jsonError(res, 403, "Only report owner can edit");
  }

  const updates = [];
  const params = [];
  if (name) {
    updates.push("name = ?");
    params.push(name);
  }
  if (filters) {
    updates.push("filters_json = ?");
    params.push(JSON.stringify(filters));
  }
  if (!updates.length) return jsonError(res, 400, "No fields to update");

  params.push(reportId);
  await pool.query(`UPDATE reports SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ ok: true });
});

api.delete("/reports/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const reportId = Number(req.params.id);
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");

  if (req.user.role === "analyst") {
    if (!req.userSections.has(report.section_name)) return jsonError(res, 403, "Forbidden");
    if (report.created_by !== req.user.id) return jsonError(res, 403, "Only report owner can delete");
  }

  await pool.query("DELETE FROM reports WHERE id = ?", [reportId]);
  res.json({ ok: true });
});

api.get("/reports/:id", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");
  if (!canAccessReport(req, report)) return jsonError(res, 403, "Forbidden");

  res.json({
    id: report.id,
    name: report.name,
    section: report.section_name,
    filters: safeJsonParse(report.filters_json),
    createdAt: report.created_at,
    createdBy: report.created_by,
    createdByName: report.created_by_name,
  });
});

api.get("/reports/:id/comments", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");
  if (!canAccessReport(req, report)) return jsonError(res, 403, "Forbidden");

  const [rows] = await pool.query(
    "SELECT c.id, c.comment_text, c.created_at, u.username AS author FROM report_comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.report_id = ? ORDER BY c.created_at DESC",
    [reportId]
  );

  res.json(rows.map((row) => ({
    id: row.id,
    comment: row.comment_text,
    createdAt: row.created_at,
    author: row.author,
  })));
});

api.post("/reports/:id/comments", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const reportId = Number(req.params.id);
  const { comment } = req.body || {};
  if (!comment) return jsonError(res, 400, "comment required");

  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");
  if (!canAccessReport(req, report)) return jsonError(res, 403, "Forbidden");

  await pool.query(
    "INSERT INTO report_comments (report_id, author_id, comment_text) VALUES (?, ?, ?)",
    [reportId, req.user.id, comment]
  );
  res.status(201).json({ ok: true });
});

api.get("/reports/:id/data", async (req, res) => {
  const reportId = Number(req.params.id);
  const exportToken = req.query.exportToken;
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");

  if (exportToken) {
    if (!verifyExportToken(exportToken, reportId)) {
      return jsonError(res, 403, "Invalid export token");
    }
  } else {
    if (!req.session.userId) return jsonError(res, 401, "Authentication required");
    req.user = req.user || (await getUserById(req.session.userId));
    if (!req.user) return jsonError(res, 401, "Authentication required");
    const sections = await getUserSections(req.user.id);
    req.userSections = new Set(sections);
    if (!canAccessReport(req, report)) return jsonError(res, 403, "Forbidden");
  }

  const filters = safeJsonParse(report.filters_json);
  const normalizedFilters = buildFilters(filters || {});
  const rows = await fetchLogs(normalizedFilters);

  let metrics = null;
  if (report.section_name === "performance") {
    metrics = computePerformanceMetrics(rows);
  } else if (report.section_name === "engagement") {
    metrics = computeEngagementMetrics(rows);
  } else if (report.section_name === "tech") {
    metrics = computeTechMetrics(rows);
  }

  const [comments] = await pool.query(
    "SELECT c.id, c.comment_text, c.created_at, u.username AS author FROM report_comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.report_id = ? ORDER BY c.created_at DESC",
    [reportId]
  );

  res.json({
    report: {
      id: report.id,
      name: report.name,
      section: report.section_name,
      filters: filters || {},
      createdAt: report.created_at,
      createdBy: report.created_by,
      createdByName: report.created_by_name,
    },
    metrics,
    comments: comments.map((row) => ({
      id: row.id,
      comment: row.comment_text,
      createdAt: row.created_at,
      author: row.author,
    })),
  });
});

api.post("/reports/:id/export", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const reportId = Number(req.params.id);
  const report = await getReportById(reportId);
  if (!report) return jsonError(res, 404, "Report not found");
  if (!canAccessReport(req, report)) return jsonError(res, 403, "Forbidden");

  try {
    console.log(`[PDF Export] Starting export for report ${reportId}`);
    
    const filters = safeJsonParse(report.filters_json);
    const normalizedFilters = buildFilters(filters || {});
    const rows = await fetchLogs(normalizedFilters);

    let metrics = null;
    if (report.section_name === "performance") {
      metrics = computePerformanceMetrics(rows);
    } else if (report.section_name === "engagement") {
      metrics = computeEngagementMetrics(rows);
    } else if (report.section_name === "tech") {
      metrics = computeTechMetrics(rows);
    }

    const [comments] = await pool.query(
      "SELECT c.id, c.comment_text, c.created_at, u.username AS author FROM report_comments c LEFT JOIN users u ON c.author_id = u.id WHERE c.report_id = ? ORDER BY c.created_at DESC",
      [reportId]
    );

    // Generate HTML with data pre-loaded
    const html = buildReportHTML(report, metrics, comments);

    const fileName = `report-${reportId}-${Date.now()}.pdf`;
    const filePath = path.join(exportsDir, fileName);

    console.log(`[PDF Export] Generating PDF with wkhtmltopdf`);
    console.log(html)
    
    wkhtmltopdf(html, {
      pageSize: 'A4',
      marginTop: 20,
      marginBottom: 20,
      marginLeft: 20,
      marginRight: 20,
    }, (err, stream) => {
      if (err) {
        console.error(`[PDF Export] Error generating PDF:`, err);
        return jsonError(res, 500, `Export failed: ${err.message}`);
      }

      const writeStream = fs.createWriteStream(filePath);
      stream.pipe(writeStream)
        .on('error', (err) => {
          console.error(`[PDF Export] Error writing file:`, err);
          return jsonError(res, 500, `Failed to write PDF file`);
        })
        .on('finish', async () => {
          try {
            console.log(`[PDF Export] PDF generated successfully at ${filePath}`);
            
            const publicPath = `/exports/${fileName}`;
            await pool.query(
              "INSERT INTO report_exports (report_id, file_path, created_by, status) VALUES (?, ?, ?, ?)",
              [reportId, publicPath, req.user.id, "ready"]
            );

            res.json({ url: `${APP_BASE_URL}${publicPath}` });
          } catch (err) {
            console.error(`[PDF Export] Database error:`, err);
            jsonError(res, 500, "Failed to save export record");
          }
        });
    });
  } catch (error) {
    console.error(`[PDF Export] Error for report ${reportId}:`, error);
    return jsonError(res, 500, `Export failed: ${error.message}`);
  }
});

function buildReportHTML(report, metrics, comments) {
  const { summary, charts, table } = metrics || {};

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; background: white; padding: 40px; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 6px; color: #111827; }
    h3 { font-size: 1.25rem; margin: 24px 0 12px 0; color: #1f2937; }
    .report-header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
    .report-meta { color: #6b7280; font-size: 0.95rem; }
    .report-meta-item { margin: 4px 0; }
    .section-label { display: inline-block; background: #ede9fe; color: #6d28d9; padding: 6px 12px; border-radius: 4px; font-size: 0.9rem; margin: 12px 0; }
    .summary { display: flex; gap: 16px; margin: 24px 0; flex-wrap: wrap; }
    .stat-box { flex: 1; min-width: 150px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-label { color: #6b7280; font-size: 0.9rem; margin-bottom: 8px; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table th { background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600; }
    table td { border: 1px solid #e5e7eb; padding: 10px 12px; }
    table tr:nth-child(even) { background: #f9fafb; }
    .comments-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .comment { background: #f9fafb; border-left: 3px solid #667eea; padding: 12px; margin: 12px 0; border-radius: 2px; }
    .comment-author { font-weight: 600; }
    .comment-date { color: #9ca3af; font-size: 0.9rem; margin-left: 8px; }
    .comment-text { margin-top: 8px; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 0.9rem; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${report.name}</h1>
    <div class="section-label">${report.section_name}</div>
    <div class="report-meta">
      <div class="report-meta-item"><strong>Report ID:</strong> ${report.id}</div>
      <div class="report-meta-item"><strong>Created:</strong> ${new Date(report.created_at).toLocaleString()}</div>
      <div class="report-meta-item"><strong>Created By:</strong> ${report.created_by_name || 'System'}</div>
      <div class="report-meta-item"><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
    </div>
  </div>`;

  // Summary stats
  if (summary) {
    html += '<div class="summary">';
    if (report.section_name === 'performance') {
      html += `
        <div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>
        <div class="stat-box"><div class="stat-label">Avg Load Time</div><div class="stat-value">${summary.averageLoadMs}ms</div></div>
        <div class="stat-box"><div class="stat-label">P95 Load Time</div><div class="stat-value">${summary.p95LoadMs}ms</div></div>
      `;
    } else if (report.section_name === 'engagement') {
      html += `
        <div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>
        <div class="stat-box"><div class="stat-label">Total Idle</div><div class="stat-value">${summary.totalIdleMs}ms</div></div>
        <div class="stat-box"><div class="stat-label">Total Active</div><div class="stat-value">${summary.totalActiveMs}ms</div></div>
      `;
    } else {
      html += `
        <div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>
        <div class="stat-box"><div class="stat-label">Unique Browsers</div><div class="stat-value">${summary.uniqueBrowsers}</div></div>
        <div class="stat-box"><div class="stat-label">Unique OS</div><div class="stat-value">${summary.uniqueOs}</div></div>
      `;
    }
    html += '</div>';
  }

  // Table data
  if (table && table.length > 0) {
    html += '<h3>Detailed Data</h3><table>';
    if (report.section_name === 'performance') {
      html += '<thead><tr><th>Session ID</th><th>Page</th><th>Load Time (ms)</th><th>Start Load</th><th>End Load</th><th>Date</th></tr></thead><tbody>';
      table.forEach(row => {
        html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.loadTime}</td><td>${row.startLoad}</td><td>${row.endLoad}</td><td>${new Date(row.createdAt).toLocaleDateString()}</td></tr>`;
      });
    } else if (report.section_name === 'engagement') {
      html += '<thead><tr><th>Session ID</th><th>Page</th><th>Idle (ms)</th><th>Active (ms)</th><th>Date</th></tr></thead><tbody>';
      table.forEach(row => {
        html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.idleTotal}</td><td>${row.activeTotal}</td><td>${new Date(row.createdAt).toLocaleDateString()}</td></tr>`;
      });
    } else {
      html += '<thead><tr><th>Session ID</th><th>Page</th><th>Browser</th><th>OS</th><th>Device</th><th>Viewport</th></tr></thead><tbody>';
      table.forEach(row => {
        html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.browser}</td><td>${row.os}</td><td>${row.device}</td><td>${row.viewport}</td></tr>`;
      });
    }
    html += '</tbody></table>';
  }

  // Comments
  if (comments && comments.length > 0) {
    html += '<div class="comments-section"><h3>Analyst Comments</h3>';
    comments.forEach(comment => {
      html += `
        <div class="comment">
          <div><span class="comment-author">${comment.author || 'Unknown'}</span>
          <span class="comment-date">${new Date(comment.created_at).toLocaleDateString()}</span></div>
          <div class="comment-text">${comment.comment_text}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  html += `
    <div class="footer">
      <p>Report generated on ${new Date().toLocaleString()}</p>
      <p>reporting.shash.digital</p>
    </div>
  </body>
</html>`;

  return html;
}

const staticRouter = express.Router();

staticRouter.get("/", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM logs ORDER BY created_at DESC LIMIT ?", [MAX_LOG_ROWS]);
  res.json(rows);
});

staticRouter.get("/:id", requireAuth, requireRole("super_admin", "analyst"), async (req, res) => {
  const sessionID = req.params.id;
  const [rows] = await pool.query("SELECT * FROM logs WHERE sessionID = ?", [sessionID]);
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

staticRouter.post("/", requireCollectorKey, async (req, res) => {
  const payload = req.body;
  const sessionID = payload.sessionID;
  if (!sessionID) return jsonError(res, 400, "sessionID is required");

  const data = JSON.stringify(payload);
  try {
    await pool.query(
      "INSERT INTO logs (sessionID, data) VALUES (?, ?)",
      [sessionID, data]
    );
    res.status(201).json({ sessionID, data: payload });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return jsonError(res, 409, "Entry with this sessionID already exists");
    }
    return jsonError(res, 500, err.message);
  }
});

staticRouter.put("/:id", requireCollectorKey, async (req, res) => {
  const sessionID = req.params.id;
  const newPayload = req.body;

  const [rows] = await pool.query("SELECT data FROM logs WHERE sessionID = ?", [sessionID]);
  if (!rows.length) return res.sendStatus(404);

  const existingData = safeJsonParse(rows[0].data);
  const mergedData = { ...existingData, activity: newPayload.activity };

  await pool.query("UPDATE logs SET data = ? WHERE sessionID = ?", [JSON.stringify(mergedData), sessionID]);
  res.json({ sessionID, data: mergedData });
});

staticRouter.delete("/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const sessionID = req.params.id;
  const [result] = await pool.query("DELETE FROM logs WHERE sessionID = ?", [sessionID]);
  if (result.affectedRows === 0) return res.sendStatus(404);
  res.sendStatus(204);
});

api.use("/static", staticRouter);

app.use("/api", api);

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return jsonError(res, 404, "Not found");
  }
  res.status(404).sendFile(path.join(__dirname, "..", "404.html"));
});

app.listen(PORT, () => {
  console.log(`REST API listening on port ${PORT}`);
});
