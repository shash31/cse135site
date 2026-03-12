const admin = {
  users: [],
  sections: [],
  currentEditingUserId: null,

  /**
   * Initialize admin panel
   */
  async init() {
    try {
      await app.requireRole('super_admin');
      await this.loadUsers();
      await this.loadSections();
      this.setupModal();
    } catch (error) {
      this.showMessage(error.message, 'error');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 2000);
    }
  },

  /**
   * Load users
   */
  async loadUsers() {
    try {
      this.users = await app.getUsers();
      this.renderUsersList();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Load sections
   */
  async loadSections() {
    try {
      this.sections = await app.getSections();
      this.renderSectionsList();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Render users list
   */
  renderUsersList() {
    const container = document.getElementById('usersList');

    if (this.users.length === 0) {
      container.innerHTML = '<p style="color: #6b7280; padding: 20px;">No users yet. Create one to get started.</p>';
      return;
    }

    let html = '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Username</th><th>Role</th><th>Sections</th><th>Actions</th></tr></thead>';
    html += '<tbody>';

    this.users.forEach((user) => {
      const roleLabel = {
        super_admin: '👑 Super Admin',
        analyst: '👨‍💼 Analyst',
        viewer: '👁️ Viewer',
      }[user.role] || user.role;

      const sections = user.sections && user.sections.length > 0 
        ? user.sections.join(', ')
        : '—';

      html += `<tr>
        <td><strong>${user.username}</strong></td>
        <td>${roleLabel}</td>
        <td>${sections}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-edit" onclick="admin.openEditUserModal(${user.id})">Edit</button>
            <button class="btn-delete" onclick="admin.deleteUser(${user.id})">Delete</button>
          </div>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  /**
   * Render sections list
   */
  renderSectionsList() {
    const container = document.getElementById('sectionsList');

    if (this.sections.length === 0) {
      container.innerHTML = '<p style="color: #6b7280; padding: 20px;">No sections available.</p>';
      return;
    }

    let html = '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Section Name</th><th>Description</th></tr></thead>';
    html += '<tbody>';

    const descriptions = {
      performance: 'Website performance metrics and load times',
      engagement: 'User engagement and activity metrics',
      tech: 'Technology and device information',
    };

    this.sections.forEach((section) => {
      html += `<tr>
        <td><strong>${section.name}</strong></td>
        <td>${descriptions[section.name] || '—'}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  /**
   * Switch tab
   */
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update content
    document.querySelectorAll('.content').forEach((content) => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
  },

  /**
   * Setup modal form
   */
  setupModal() {
    const form = document.getElementById('userForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveUser();
    });
  },

  /**
   * Open create user modal
   */
  openCreateUserModal() {
    this.currentEditingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Create User';
    document.getElementById('userForm').reset();
    document.getElementById('modalPassword').required = true;
    this.populateSectionCheckboxes([]);
    document.getElementById('userModal').classList.add('show');
  },

  /**
   * Open edit user modal
   */
  async openEditUserModal(userId) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return;

    this.currentEditingUserId = userId;
    document.getElementById('userModalTitle').textContent = `Edit User: ${user.username}`;
    document.getElementById('modalUsername').value = user.username;
    document.getElementById('modalPassword').value = '';
    document.getElementById('modalPassword').required = false;
    document.getElementById('modalRole').value = user.role;

    this.populateSectionCheckboxes(user.sections || []);
    document.getElementById('userModal').classList.add('show');
  },

  /**
   * Populate section checkboxes
   */
  populateSectionCheckboxes(assignedSections) {
    const container = document.getElementById('modalSections');
    container.innerHTML = '';

    this.sections.forEach((section) => {
      const id = `section-${section.id}`;
      const isChecked = assignedSections.includes(section.name);

      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.innerHTML = `
        <input type="checkbox" id="${id}" name="sections" value="${section.name}" ${isChecked ? 'checked' : ''} />
        <label for="${id}" class="checkbox-label">${section.name}</label>
      `;
      container.appendChild(div);
    });
  },

  /**
   * Save user
   */
  async saveUser() {
    const username = document.getElementById('modalUsername').value;
    const password = document.getElementById('modalPassword').value;
    const role = document.getElementById('modalRole').value;
    const selectedSections = Array.from(document.querySelectorAll('#modalSections input[name="sections"]:checked')).map(
      (checkbox) => checkbox.value
    );

    if (!username || !role) {
      this.showMessage('Username and role are required', 'error');
      return;
    }

    if (this.currentEditingUserId === null && !password) {
      this.showMessage('Password is required for new users', 'error');
      return;
    }

    try {
      if (this.currentEditingUserId === null) {
        // Create new user
        await app.createUser(username, password, role, selectedSections);
        this.showMessage('User created successfully', 'success');
      } else {
        // Update existing user
        const updates = { username, role };
        if (password) updates.password = password;
        await app.updateUser(this.currentEditingUserId, updates);

        // Update sections
        await app.updateUserSections(this.currentEditingUserId, selectedSections);

        this.showMessage('User updated successfully', 'success');
      }

      this.closeModal();
      await this.loadUsers();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Delete user
   */
  async deleteUser(userId) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return;

    const confirmed = confirm(`Are you sure you want to delete user "${user.username}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await app.deleteUser(userId);
      this.showMessage('User deleted successfully', 'success');
      await this.loadUsers();
    } catch (error) {
      this.showMessage(error.message, 'error');
    }
  },

  /**
   * Close modal
   */
  closeModal() {
    document.getElementById('userModal').classList.remove('show');
    this.currentEditingUserId = null;
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
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('userModal');
  if (e.target === modal) {
    admin.closeModal();
  }
});

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
  admin.init();
});
