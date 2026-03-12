// Global app singleton
const app = {
  user: null,
  apiBaseUrl: '/api',
  currentUser: null,

  /**
   * Initialize app - check if user is logged in
   */
  async init() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/me`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        this.user = data.user;
        this.currentUser = data.user;
        return data.user;
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
    return null;
  },

  /**
   * Login user
   */
  async login(username, password) {
    const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    this.user = data;
    this.currentUser = data;
    return { ok: true, user: data };
  },

  /**
   * Logout user
   */
  async logout() {
    await fetch(`${this.apiBaseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    this.user = null;
    this.currentUser = null;
    window.location.href = '/login.html';
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    if (this.user) return this.user;
    return this.init();
  },

  /**
   * Check if current user is super admin
   */
  isSuperAdmin() {
    return this.user?.role === 'super_admin';
  },

  /**
   * Check if current user is analyst
   */
  isAnalyst() {
    return this.user?.role === 'analyst';
  },

  /**
   * Check if current user is viewer
   */
  isViewer() {
    return this.user?.role === 'viewer';
  },

  /**
   * Check if user has access to section
   */
  hasAccessToSection(sectionName) {
    if (this.isSuperAdmin()) return true;
    if (this.isAnalyst()) {
      return this.user?.sections?.includes(sectionName) || false;
    }
    return false; // Viewers don't have direct section access
  },

  /**
   * Fetch data from API endpoint
   */
  async apiCall(method, endpoint, body = null) {
    const options = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);

    if (response.status === 401) {
      // Session expired
      this.user = null;
      window.location.href = '/login.html';
      throw new Error('Session expired. Please login again.');
    }

    if (response.status === 403) {
      throw new Error('Access denied');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  },

  /**
   * Get users (super admin only)
   */
  async getUsers() {
    return this.apiCall('GET', '/users');
  },

  /**
   * Create user (super admin only)
   */
  async createUser(username, password, role, sections = []) {
    return this.apiCall('POST', '/users', {
      username,
      password,
      role,
      sections,
    });
  },

  /**
   * Update user (super admin only)
   */
  async updateUser(userId, updates) {
    return this.apiCall('PUT', `/users/${userId}`, updates);
  },

  /**
   * Delete user (super admin only)
   */
  async deleteUser(userId) {
    return this.apiCall('DELETE', `/users/${userId}`);
  },

  /**
   * Update user sections (super admin only)
   */
  async updateUserSections(userId, sections) {
    return this.apiCall('PUT', `/users/${userId}/sections`, { sections });
  },

  /**
   * Get all sections
   */
  async getSections() {
    return this.apiCall('GET', '/sections');
  },

  /**
   * Get metrics for a section
   */
  async getMetrics(section, filters = {}) {
    const params = new URLSearchParams();
    if (filters.start) params.append('start', filters.start);
    if (filters.end) params.append('end', filters.end);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    const queryString = params.toString();
    const endpoint = `/metrics/${section}${queryString ? '?' + queryString : ''}`;
    return this.apiCall('GET', endpoint);
  },

  /**
   * Get all reports
   */
  async getReports() {
    return this.apiCall('GET', '/reports');
  },

  /**
   * Get single report
   */
  async getReport(reportId) {
    return this.apiCall('GET', `/reports/${reportId}`);
  },

  /**
   * Get report data (with metrics and comments)
   */
  async getReportData(reportId, exportToken = null) {
    const endpoint = exportToken
      ? `/reports/${reportId}/data?exportToken=${exportToken}`
      : `/reports/${reportId}/data`;
    return this.apiCall('GET', endpoint);
  },

  /**
   * Create report
   */
  async createReport(name, section, filters = {}) {
    return this.apiCall('POST', '/reports', {
      name,
      section,
      filters,
    });
  },

  /**
   * Update report
   */
  async updateReport(reportId, updates) {
    return this.apiCall('PUT', `/reports/${reportId}`, updates);
  },

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    return this.apiCall('DELETE', `/reports/${reportId}`);
  },

  /**
   * Get report comments
   */
  async getReportComments(reportId) {
    return this.apiCall('GET', `/reports/${reportId}/comments`);
  },

  /**
   * Add comment to report
   */
  async addReportComment(reportId, comment) {
    return this.apiCall('POST', `/reports/${reportId}/comments`, { comment });
  },

  /**
   * Export report to PDF
   */
  async exportReportPdf(reportId) {
    return this.apiCall('POST', `/reports/${reportId}/export`);
  },

  /**
   * Ensure user is authenticated
   */
  async requireAuth() {
    const user = await this.getCurrentUser();
    if (!user) {
      window.location.href = '/login.html';
      throw new Error('Not authenticated');
    }
    return user;
  },

  /**
   * Ensure user has required role
   */
  async requireRole(...roles) {
    const user = await this.requireAuth();
    if (!roles.includes(user.role)) {
      throw new Error('Insufficient permissions');
    }
    return user;
  },
};

// Auto-init on page load
document.addEventListener('DOMContentLoaded', async () => {
  await app.init();
});
