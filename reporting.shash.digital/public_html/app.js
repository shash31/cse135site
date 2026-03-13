const app = {
  user: null,
  apiBaseUrl: '/api',
  currentUser: null,

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

  async logout() {
    await fetch(`${this.apiBaseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    this.user = null;
    this.currentUser = null;
    window.location.href = '/login.html';
  },

  async getCurrentUser() {
    if (this.user) return this.user;
    return this.init();
  },

  isSuperAdmin() {
    return this.user?.role === 'super_admin';
  },

  isAnalyst() {
    return this.user?.role === 'analyst';
  },

  isViewer() {
    return this.user?.role === 'viewer';
  },

  hasAccessToSection(sectionName) {
    if (this.isSuperAdmin()) return true;
    if (this.isAnalyst()) {
      return this.user?.sections?.includes(sectionName) || false;
    }
    return false; // Viewers don't have direct section access
  },

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

  async getUsers() {
    return this.apiCall('GET', '/users');
  },

  async createUser(username, password, role, sections = []) {
    return this.apiCall('POST', '/users', {
      username,
      password,
      role,
      sections,
    });
  },

  async updateUser(userId, updates) {
    return this.apiCall('PUT', `/users/${userId}`, updates);
  },

  async deleteUser(userId) {
    return this.apiCall('DELETE', `/users/${userId}`);
  },

  async updateUserSections(userId, sections) {
    return this.apiCall('PUT', `/users/${userId}/sections`, { sections });
  },

  async getSections() {
    return this.apiCall('GET', '/sections');
  },

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

  async getReports() {
    return this.apiCall('GET', '/reports');
  },

  async getReport(reportId) {
    return this.apiCall('GET', `/reports/${reportId}`);
  },

  async getReportData(reportId, exportToken = null) {
    const endpoint = exportToken
      ? `/reports/${reportId}/data?exportToken=${exportToken}`
      : `/reports/${reportId}/data`;
    return this.apiCall('GET', endpoint);
  },

  async createReport(name, section, filters = {}) {
    return this.apiCall('POST', '/reports', {
      name,
      section,
      filters,
    });
  },

  async updateReport(reportId, updates) {
    return this.apiCall('PUT', `/reports/${reportId}`, updates);
  },

  async deleteReport(reportId) {
    return this.apiCall('DELETE', `/reports/${reportId}`);
  },

  async getReportComments(reportId) {
    return this.apiCall('GET', `/reports/${reportId}/comments`);
  },

  async addReportComment(reportId, comment) {
    return this.apiCall('POST', `/reports/${reportId}/comments`, { comment });
  },

  async exportReportPdf(reportId) {
    return this.apiCall('POST', `/reports/${reportId}/export`);
  },

  async requireAuth() {
    const user = await this.getCurrentUser();
    if (!user) {
      window.location.href = '/login.html';
      throw new Error('Not authenticated');
    }
    return user;
  },

  async requireRole(...roles) {
    const user = await this.requireAuth();
    if (!roles.includes(user.role)) {
      throw new Error('Insufficient permissions');
    }
    return user;
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await app.init();
});
