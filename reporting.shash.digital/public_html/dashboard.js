const dashboard = {
  currentSection: null,
  metrics: {},
  charts: {},
  filters: {},

  async init() {
    try {
      await app.requireAuth();
      this.setupUserInfo();
      this.setupNavigation();
      await this.setupSections();
      await this.loadAllMetrics();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  setupUserInfo() {
    const userInfo = document.getElementById('userInfo');
    const roleLabel = {
      super_admin: 'Super Admin',
      analyst: 'Analyst',
      viewer: 'Viewer',
    };
    userInfo.textContent = `${app.user.username} (${roleLabel[app.user.role]})`;
  },

  /**
   * Setup navigation links based on role
   */
  setupNavigation() {
    const navLinks = document.getElementById('navLinks');
    navLinks.innerHTML = '';

    // Saved Reports link (for analysts and viewers)
    if (app.isAnalyst() || app.isViewer() || app.isSuperAdmin()) {
      const reportsLink = document.createElement('a');
      reportsLink.href = '/reports.html';
      reportsLink.textContent = 'Saved Reports';
      navLinks.appendChild(reportsLink);
    }

    // Admin link (super admin only)
    if (app.isSuperAdmin()) {
      const adminLink = document.createElement('a');
      adminLink.href = '/admin.html';
      adminLink.textContent = 'Admin Panel';
      navLinks.appendChild(adminLink);
    }
  },

  /**
   * Setup section tabs based on user's access
   */
  async setupSections() {
    const sections = await app.getSections();
    const userSections = app.user.sections || [];
    const tabsDiv = document.getElementById('sectionTabs');
    const contentArea = document.getElementById('contentArea');

    tabsDiv.innerHTML = '';
    contentArea.innerHTML = '';

    let accessibleSections = sections;
    if (app.isAnalyst()) {
      accessibleSections = sections.filter((s) => userSections.includes(s.name));
    } else if (app.isViewer()) {
      accessibleSections = sections;
    } else if (app.isSuperAdmin()) {
      accessibleSections = sections;
    }

    if (!accessibleSections.length) {
      const msg = app.isAnalyst() 
        ? 'You do not have access to any sections. Contact your administrator.'
        : 'No sections available.';
      this.showMessage(msg, 'info');
      return;
    }

    // Create tabs
    accessibleSections.forEach((section, idx) => {
      const tab = document.createElement('button');
      tab.className = 'tab' + (idx === 0 ? ' active' : '');
      tab.textContent = section.name.charAt(0).toUpperCase() + section.name.slice(1);;
      tab.onclick = () => this.switchSection(section.name);
      tabsDiv.appendChild(tab);

      const content = document.createElement('div');
      content.className = 'section-content' + (idx === 0 ? ' active' : '');
      content.id = `section-${section.name}`;
      content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading metrics...</p></div>';
      contentArea.appendChild(content);
    });

    this.currentSection = accessibleSections[0].name;
  },

  async switchSection(sectionName) {
    if (this.currentSection === sectionName) return;

    // Update tabs
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.remove('active');
    });
    event.target.closest('.tab').classList.add('active');

    // Update content
    document.querySelectorAll('.section-content').forEach((content) => {
      content.classList.remove('active');
    });
    const sectionDiv = document.getElementById(`section-${sectionName}`);
    sectionDiv.classList.add('active');

    this.currentSection = sectionName;
    await this.loadMetricsForSection(sectionName);
  },

  async loadAllMetrics() {
    const sections = document.querySelectorAll('.section-content');
    for (const section of sections) {
      const sectionName = section.id.replace('section-', '');
      await this.loadMetricsForSection(sectionName);
    }
  },

  async loadMetricsForSection(sectionName) {
    try {
      const filters = this.buildFilters();
      const data = await app.getMetrics(sectionName, filters);
      this.metrics[sectionName] = data;

      const sectionDiv = document.getElementById(`section-${sectionName}`);
      sectionDiv.innerHTML = this.renderSectionContent(sectionName, data);

      this.initializeSectionCharts(sectionName, data);

      // Update timestamp
      document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    } catch (error) {
      const sectionDiv = document.getElementById(`section-${sectionName}`);
      sectionDiv.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${error.message}</p></div>`;
    }
  },

  buildFilters() {
    const start = document.getElementById('filterStart')?.value;
    const end = document.getElementById('filterEnd')?.value;
    return {
      ...(start && { start }),
      ...(end && { end }),
    };
  },

  resetFilters() {
    document.getElementById('filterStart').value = '';
    document.getElementById('filterEnd').value = '';
    this.loadAllMetrics();
  },

  renderSectionContent(sectionName, data) {
    const { metrics } = data;
    if (!metrics) {
      return '<div class="empty-state"><h3>No data available</h3></div>';
    }

    const sections = {
      performance: this.renderPerformanceSection.bind(this),
      engagement: this.renderEngagementSection.bind(this),
      tech: this.renderTechSection.bind(this),
    };

    const renderer = sections[sectionName];
    return renderer ? renderer(metrics) : '<div class="empty-state"><h3>Unknown section</h3></div>';
  },

  renderPerformanceSection(metrics) {
    const { summary, charts, table } = metrics;
    let html = '<div class="panel">';
    html += '<h2>Performance Metrics</h2>';

    // Summary stats
    html += '<div class="summary">';
    html += `<div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">Avg Load Time</div><div class="stat-value">${summary.averageLoadMs}ms</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">P95 Load Time</div><div class="stat-value">${summary.p95LoadMs}ms</div></div>`;
    html += '</div>';

    // Charts
    html += '<div class="charts-grid">';
    html += '<div class="chart-box"><h3>Load Time by Session</h3><canvas id="chart-performance-loadtime"></canvas></div>';
    html += '</div>';

    // Table
    html += '<h3 style="margin-top: 24px; margin-bottom: 12px;">Details</h3>';
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th>Session ID</th><th>Page</th><th>Load Time (ms)</th><th>Start Load</th><th>End Load</th><th>Created At</th></tr></thead>';
    html += '<tbody>';
    table.slice(0, 10).forEach((row) => {
      html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.loadTime}</td><td>${row.startLoad}</td><td>${row.endLoad}</td><td>${new Date(row.createdAt).toLocaleString()}</td></tr>`;
    });
    html += '</tbody></table>';
    html += '</div>';

    html += '</div>';
    return html;
  },

  renderEngagementSection(metrics) {
    const { summary, charts, table } = metrics;
    let html = '<div class="panel">';
    html += '<h2>Engagement Metrics</h2>';

    // Summary stats
    html += '<div class="summary">';
    html += `<div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">Total Idle Time</div><div class="stat-value">${Math.round(summary.totalIdleMs / 1000)}s</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">Total Active Time</div><div class="stat-value">${Math.round(summary.totalActiveMs / 1000)}s</div></div>`;
    html += '</div>';

    // Charts
    html += '<div class="charts-grid">';
    html += '<div class="chart-box"><h3>Idle vs Active Time</h3><canvas id="chart-engagement-idlevactive"></canvas></div>';
    html += '</div>';

    // Table
    html += '<h3 style="margin-top: 24px; margin-bottom: 12px;">Details</h3>';
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th>Session ID</th><th>Page</th><th>Idle Time (ms)</th><th>Active Time (ms)</th><th>Created At</th></tr></thead>';
    html += '<tbody>';
    table.slice(0, 10).forEach((row) => {
      html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.idleTotal}</td><td>${row.activeTotal}</td><td>${new Date(row.createdAt).toLocaleString()}</td></tr>`;
    });
    html += '</tbody></table>';
    html += '</div>';

    html += '</div>';
    return html;
  },

  renderTechSection(metrics) {
    const { summary, charts, table } = metrics;
    let html = '<div class="panel">';
    html += '<h2>Technology Metrics</h2>';

    // Summary stats
    html += '<div class="summary">';
    html += `<div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${summary.sessions}</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">Unique Browsers</div><div class="stat-value">${summary.uniqueBrowsers}</div></div>`;
    html += `<div class="stat-box"><div class="stat-label">Unique OS</div><div class="stat-value">${summary.uniqueOs}</div></div>`;
    html += '</div>';

    // Charts
    html += '<div class="charts-grid">';
    html += '<div class="chart-box"><h3>Browser Share</h3><canvas id="chart-tech-browsers"></canvas></div>';
    html += '</div>';

    // Table
    html += '<h3 style="margin-top: 24px; margin-bottom: 12px;">Details</h3>';
    html += '<div class="table-wrap">';
    html += '<table>';
    html += '<thead><tr><th>Session ID</th><th>Page</th><th>Browser</th><th>OS</th><th>Device</th><th>Viewport</th><th>Network</th></tr></thead>';
    html += '<tbody>';
    table.slice(0, 10).forEach((row) => {
      html += `<tr><td>${row.sessionID.slice(0, 8)}</td><td>${row.page}</td><td>${row.browser}</td><td>${row.os}</td><td>${row.device}</td><td>${row.viewport}</td><td>${row.network}</td></tr>`;
    });
    html += '</tbody></table>';
    html += '</div>';

    html += '</div>';
    return html;
  },

  initializeSectionCharts(sectionName, data) {
    const { metrics } = data;
    if (!metrics || !metrics.charts) return;

    // Destroy existing charts
    Object.values(this.charts[sectionName] || {}).forEach((chart) => {
      if (chart) chart.destroy();
    });
    this.charts[sectionName] = {};

    const { charts } = metrics;

    if (sectionName === 'performance' && charts.loadTimeBySession) {
      this.createChart(sectionName, 'loadtime', charts.loadTimeBySession, 'bar', 'Load Time by Session');
    } else if (sectionName === 'engagement' && charts.idleVsActive) {
      this.createChart(sectionName, 'idlevactive', charts.idleVsActive, 'doughnut', 'Idle vs Active');
    } else if (sectionName === 'tech' && charts.browserShare) {
      this.createChart(sectionName, 'browsers', charts.browserShare, 'bar', 'Browser Share');
    }
  },

  createChart(sectionName, chartId, chartData, chartType, chartLabel) {
    const canvasId = `chart-${sectionName}-${chartId}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const chartConfig = {
      type: chartType,
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: chartLabel,
            data: chartData.values,
            backgroundColor: chartType === 'doughnut' 
              ? ['#667eea', '#764ba2', '#f97316', '#10b981', '#f59e0b', '#ef4444']
              : '#667eea',
            borderColor: '#fff',
            borderWidth: 2,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    };

    if (chartType === 'bar') {
      chartConfig.options.scales = {
        y: { beginAtZero: true },
      };
    }

    this.charts[sectionName] = this.charts[sectionName] || {};
    this.charts[sectionName][chartId] = new Chart(ctx, chartConfig);
  },

  showMessage(text, type = 'info') {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `message show ${type}`;
    setTimeout(() => {
      msg.classList.remove('show');
    }, 5000);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  dashboard.init();
});
