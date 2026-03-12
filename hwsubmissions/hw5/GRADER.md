# Grader credentials

## Super Admin Login:
- **Username**: `admin`
- **Password**:`admin`
- **Permissions**: Full access

## Analyst Login:
- **Username**: `analyst`
- **Password**: `analyst`
- **Permissions**: All sections (performance, engagement, tech), create/edit reports, add comments

## Viewer Login:
- **Username**: `viewer`
- **Password**: `viewer`
- **Permissions**: View-only access to saved reports, cannot create or edit

## Written Scenario:

### Authentication & Authorization

1. **Super Admin Access**
   - Login as `admin` / `admin`
   - Click "Admin Panel"
   - Try creating a new user with role "analyst"
   - Assign the new user to "performance" section only

1. **Analyst Access**
   - Login as `analyst` / `analyst`
   - Verify "Saved Reports" and "Admin" are not in navigation
   - Verify no admin functions accessible (/admin.html → 403 page expected)

2. **Viewer Access**
   - Login as `viewer` / `viewer`
   - Verify "Saved Reports" link appears
   - Verify no "Admin" link
   - Try accessing /admin.html → should show 403 error
   - Try accessing /dashboard.html → should show 403 error
   - Logout

### Reports & Comments

1. **Data Collection**
   - Open https://test.shash.digital/
   - Move mouse, scroll, click buttons, browse site, etc.

2. **Creating Report**
   - Click "Saved Reports" in navigation
   - Click "Create New" button
   - Switch to "Create New" tab:
     - **Example**: 
     - Name: "Weekly Performance Report"
     - Section: "performance"
     - Start Date: (7 days ago)
     - End Date: (today)
   - Click "Create Report"
   - Verify success message
   - Report should appear in Saved Reports list

3. **Adding Comments**
   - Click "View" on the newly created report
   - Look at report data containing metrics and table data
   - Scroll to "Analyst Comments" section
   - Type comment 
     - **Example comment**: "Normal traffic patterns. Load time average is 350ms; Should be improved"
   - Click "Add Comment"
   - Comment should appear with timestamp and your username

4. **Export to PDF**
   - Click "Export PDF" button
   - Wait for success message (5-10 seconds)
   - PDF should open in new tab and contain:
     - Report title and metadata
     - Summary statistics in boxes
     - Chart visualization
     - Data table (first 10 rows)
     - Your analyst comment at bottom
