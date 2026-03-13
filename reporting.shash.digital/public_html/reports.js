const reports = {
  allReports: [],
  currentReportId: null,
  currentReportData: null,

  /**
   * Initialize reports page
   */
  async init() {
    try {
      await app.requireAuth();
      this.setupUIByRole();
      await this.loadReports();
      this.setupForm();
    } catch (error) {
      this.showMessage(error.message, 'error');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 2000);
    }
  },

  /**
   * Setup UI based on user role
   */
  setupUIByRole() {
    const isAnalyst = app.isAnalyst() || app.isSuperAdmin();

    if (isAnalyst) {
      document.getElementById('tabs').style.display = 'flex';
      document.getElementById('createBtn').style.display = 'block';
      document.getElementById('create-tab').style.display = 'none';
    } else {
      // Viewers only see saved reports
      document.getElementById('tabs').style.display = 'none';
      document.getElementById('createBtn').style.display = 'none';
    }
  },

  /**
   * Load all reports
   */
  async loadReports() {
    try {
      this.allReports = await app.getReports();
      this.renderReportsList();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Render reports list
   */
  renderReportsList() {
    const container = document.getElementById('reportsList');

    if (this.allReports.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No reports yet</h3>
          <p>${app.isAnalyst() || app.isSuperAdmin() ? 'Create your first report to get started!' : 'No reports have been created yet.'}</p>
        </div>
      `;
      return;
    }

    let html = '<div class="reports-grid">';

    this.allReports.forEach((report) => {
      const createdDate = new Date(report.createdAt).toLocaleDateString();
      const sectionIcon = {
        performance: '⚡',
        engagement: '👥',
        tech: '🛠️',
      }[report.section] || '📊';

      html += `
        <div class="report-card">
          <div class="report-card-title">${this.escapeHtml(report.name)}</div>
          <div class="report-card-section">${sectionIcon} ${report.section}</div>
          <div class="report-card-meta">
            Created ${createdDate} by ${report.createdByName || 'System'}
          </div>
          <div class="report-card-actions">
            <button onclick="reports.viewReport(${report.id})">View</button>
            ${app.isSuperAdmin() || (app.isAnalyst() && report.createdBy === app.user?.id)
              ? `<button onclick="reports.deleteReport(${report.id})">Delete</button>`
              : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  /**
   * View report
   */
  async viewReport(reportId) {
    try {
      const reportData = await app.getReportData(reportId);
      this.currentReportId = reportId;
      this.currentReportData = reportData;
      this.renderReportModal(reportData);
      document.getElementById('reportModal').classList.add('show');
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Render report modal
   */
  renderReportModal(reportData) {
    const { report, metrics, comments } = reportData;
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    title.textContent = this.escapeHtml(report.name);

    let html = '';

    // Section info
    html += `<p style="color: #6b7280; margin-bottom: 16px;">
      <strong>Section:</strong> ${report.section} | 
      <strong>Created:</strong> ${new Date(report.createdAt).toLocaleDateString()} by ${report.createdByName || 'System'}
    </p>`;

    // Metrics
    if (metrics) {
      html += this.renderMetricsInModal(report.section, metrics);
    }

    // Comments section
    html += `<div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <h3 style="margin-bottom: 12px;">Analyst Comments</h3>`;

    if (comments && comments.length > 0) {
      comments.forEach((comment) => {
        const commentDate = new Date(comment.createdAt).toLocaleDateString();
        html += `
          <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 8px;">
            <div style="font-weight: 600; color: #374151;">${this.escapeHtml(comment.author || 'Unknown')}</div>
            <div style="color: #6b7280; font-size: 0.85rem; margin-bottom: 6px;">${commentDate}</div>
            <div style="color: #1f2937; line-height: 1.5;">${this.escapeHtml(comment.comment)}</div>
          </div>
        `;
      });
    } else {
      html += '<p style="color: #6b7280;">No comments yet.</p>';
    }

    // Add comment (for analysts/admins)
    if (app.isAnalyst() || app.isSuperAdmin()) {
      html += `
        <div style="margin-top: 12px;">
          <textarea id="newComment" placeholder="Add a comment..." style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; min-height: 80px;"></textarea>
          <button onclick="reports.addComment()" style="margin-top: 8px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">Add Comment</button>
        </div>
      `;
    }

    html += '</div>';

    body.innerHTML = html;
  },

  /**
   * Render metrics in modal
   */
  renderMetricsInModal(section, metrics) {
    const { summary, charts, table } = metrics;
    let html = '';

    // Summary stats
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px;">';

    if (section === 'performance') {
      html += `
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Sessions</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.sessions}</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Avg Load Time</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.averageLoadMs}ms</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">P95 Load Time</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.p95LoadMs}ms</div>
        </div>
      `;
    } else if (section === 'engagement') {
      html += `
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Sessions</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.sessions}</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Total Idle</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${Math.round(summary.totalIdleMs / 1000)}s</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Total Active</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${Math.round(summary.totalActiveMs / 1000)}s</div>
        </div>
      `;
    } else if (section === 'tech') {
      html += `
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Sessions</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.sessions}</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">Browsers</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.uniqueBrowsers}</div>
        </div>
        <div style="background: #f0f9ff; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="color: #1e40af; font-size: 0.85rem; font-weight: 600;">OS Types</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #1e3a8a;">${summary.uniqueOs}</div>
        </div>
      `;
    }

    html += '</div>';

    // Table preview
    if (table && table.length > 0) {
      html += '<div style="margin-top: 16px;">';
      html += '<h4 style="margin-bottom: 8px;">Data Sample (first 5 rows)</h4>';
      html += '<div style="overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 6px;">';
      html += '<table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">';
      html += '<thead style="background: #f3f4f6;">';

      // Get table headers based on section
      const headers = section === 'performance' ? ['Session', 'Page', 'Load (ms)']
        : section === 'engagement' ? ['Session', 'Page', 'Idle (ms)', 'Active (ms)']
        : ['Session', 'Page', 'Browser', 'OS'];

      headers.forEach((h) => {
        html += `<th style="padding: 8px; text-align: left; border-bottom: 1px solid #d1d5db;">${h}</th>`;
      });
      html += '</thead><tbody>';

      table.slice(0, 5).forEach((row) => {
        html += '<tr style="border-bottom: 1px solid #e5e7eb;">';
        if (section === 'performance') {
          html += `<td style="padding: 8px;">${row.sessionID.slice(0, 8)}</td><td style="padding: 8px;">${row.page}</td><td style="padding: 8px;">${row.loadTime}</td>`;
        } else if (section === 'engagement') {
          html += `<td style="padding: 8px;">${row.sessionID.slice(0, 8)}</td><td style="padding: 8px;">${row.page}</td><td style="padding: 8px;">${row.idleTotal}</td><td style="padding: 8px;">${row.activeTotal}</td>`;
        } else {
          html += `<td style="padding: 8px;">${row.sessionID.slice(0, 8)}</td><td style="padding: 8px;">${row.page}</td><td style="padding: 8px;">${row.browser}</td><td style="padding: 8px;">${row.os}</td>`;
        }
        html += '</tr>';
      });

      html += '</tbody></table>';
      html += '</div>';
      html += '</div>';
    }

    return html;
  },

  /**
   * Add comment to report
   */
  async addComment() {
    const textarea = document.getElementById('newComment');
    const comment = textarea.value.trim();

    if (!comment) {
      this.showMessage('Please enter a comment', 'error');
      return;
    }

    try {
      await app.addReportComment(this.currentReportId, comment);
      textarea.value = '';
      this.showMessage('Comment added successfully', 'success');
      await this.viewReport(this.currentReportId);
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Export report to PDF
   */
  async exportReport() {
    if (!this.currentReportId) return;

    try {
      const btn = document.getElementById('exportBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Exporting...';

      const result = await app.exportReportPdf(this.currentReportId);
      
      // Open PDF in new tab
      window.open(result.url, '_blank');
      
      this.showMessage('Report exported successfully!', 'success');
      btn.disabled = false;
      btn.textContent = '📥 Export PDF';
    } catch (error) {
      this.showMessage(error.message, 'error');
      document.getElementById('exportBtn').disabled = false;
      document.getElementById('exportBtn').textContent = '📥 Export PDF';
    }
  },

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    const report = this.allReports.find((r) => r.id === reportId);
    if (!report) return;

    const confirmed = confirm(`Delete report "${report.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await app.deleteReport(reportId);
      this.showMessage('Report deleted successfully', 'success');
      await this.loadReports();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Close modal
   */
  closeModal() {
    document.getElementById('reportModal').classList.remove('show');
    this.currentReportId = null;
    this.currentReportData = null;
  },

  switchTab(tabName, eventTarget = null) {
    if (tabName === 'create' && !(app.isAnalyst() || app.isSuperAdmin())) {
      return;
    }

    // Update tabs
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.remove('active');
    });
    
    // Mark the clicked tab as active (if event target provided)
    if (eventTarget) {
      eventTarget.classList.add('active');
    } else {
      // When called programmatically, find and mark the corresponding tab
      document.querySelectorAll('.tab').forEach((tab) => {
        if (tab.getAttribute('data-tab') === tabName) {
          tab.classList.add('active');
        }
      });
    }

    // Update content
    document.querySelectorAll('.content').forEach((content) => {
      content.style.display = 'none';
    });
    const content = document.getElementById(`${tabName}-tab`);
    if (content) {
      content.style.display = 'block';
    }
  },

  /**
   * Setup create form
   */
  setupForm() {
    const form = document.getElementById('createReportForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createReport();
    });
  },

  /**
   * Create report
   */
  async createReport() {
    const name = document.getElementById('reportName').value.trim();
    const section = document.getElementById('reportSection').value;
    const start = document.getElementById('reportStart').value;
    const end = document.getElementById('reportEnd').value;

    if (!name || !section) {
      this.showMessage('Name and section are required', 'error');
      return;
    }

    try {
      const filters = {};
      if (start) filters.start = start;
      if (end) filters.end = end;

      await app.createReport(name, section, filters);
      this.showMessage('Report created successfully!', 'success');
      document.getElementById('createReportForm').reset();
      this.switchTab('saved');
      await this.loadReports();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Show message
   */
  showMessage(text, type = 'info') {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `message show ${type}`;
    setTimeout(() => {
      msg.classList.remove('show');
    }, 5000);
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};

// Close modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('reportModal');
  if (e.target === modal) {
    reports.closeModal();
  }
});

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
  reports.init();
});
