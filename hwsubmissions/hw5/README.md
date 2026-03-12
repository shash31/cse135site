# CSE 135 HW 5 Final Project

## [Link to site that collects data (test.shash.digital)](https://test.shash.digital)

## [Link to analytics site (reporting.shash.digital )](https://reporting.shash.digital)

## [Link to repo](https://github.com/shash31/cse135site)

## Technology used
The web analytics platform is built with Node.js, Express, MySQL, and Chart.js. 

## Progress overview 
1. **Authentication and auth roles:**
   
   Firstly, I changed authentication from the previous checkpoint from basic authentication to cookie sessions. Used bcrypt for password hashing. After implementing and testing that, I started planning and thinking about the roles and how they would look like and work. 

2. **Dashboard, Login pages and Data visualization:**
   
   Refactored and improved the dashboard page and added a login page for the new auth system and new auth roles. Started figuring out and implementing how to restrict access/permissions for logged in role. Added separate admin panel

3. **Improved endpoint and changed data logging:**
   
   Fixed performance logging issue from previous HW. Changed format of data logging into the SQL table from previous format. Added separate tables for more information. 

4. **Report creation and comments:**

   Worked on CRUD operations like creating reports and saving them. Added features like filtering and comments 

5. **PDF Export:**
   
   Used Puppeteer for PDF generation. 

## Concerns

- The collector script is only geared towards my test site and my endpoint. Could be made more versatile so it could be used by me on other sites or anyone.

- The DigitalOcean server sometimes restarts or reloads and some process/feature in the endpoint malfunctions sometimes. Used PM2 for keeping back end server running and restart on any crash, etc. but there could still be issues sometimes. Should be made more resistant to bugs/crashes


## Potential improvements

- The collector script could be changed or updated to collect more kinds of data. It could also be made more robust so it could be utilized more as a plug in collector script on any site. Options to collect certain data or not collect certain data could be added for website owners. 

- Entering in data doesn't keep track of what website it is. If the analytics endpoint wanted to be used by multiple websites, a lot of changes would have to be made(Separate tables and accounts, allowing CORS requests from those sites, API Keys, etc.)

- Comparative analytics/filtering could be implemented on the platform. If a user wanted to compare data from week to week or month to month, more tools could be added for that. 


## AI Usage Notes

Claude 3+ was used for:
- Initial project structure and planning
- Backend API decisions and live docs
- Chart.js live docs

AI was valuable for the scaffolding and boilerplate code. All of it was manually reviewed and tested and major architectural decisions were taken by me.
