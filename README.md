# 📦 BELTON IPQC Web Application

Welcome to the **BELTON IPQC Web Application** repository. This is a comprehensive Quality Control (QC) system designed to manage and track inspection data across multiple production modules including Dispensing, Laser, Push Out Force (POF), and Damper Install.

This system utilizes a Client-Server Architecture featuring a vanilla HTML/JS frontend and a Node.js/Express backend communicating with a MySQL database.

---

## 🛠️ Tech Stack & Version Information

Below is the detailed list of software, libraries, and frameworks used in this project, along with their exact or recommended versions.

### 1. Server Environment (XAMPP & Database)
We use XAMPP as the primary web hosting environment for the frontend and the database server.
*   **XAMPP Control Panel**: v3.3.0 (or newer)
*   **MySQL / MariaDB**: `10.4.32-MariaDB`
*   **phpMyAdmin**: `5.2.1`
*   **PHP Version**: `8.2.12` (Used by phpMyAdmin)

### 2. Backend API (Node.js)
The backend API is responsible for processing data from the frontend and saving it to the database.
*   **Node.js**: Recommended `v18.x LTS` or `v20.x LTS`
*   **Express.js**: `^4.19.2` (Web Framework)
*   **mysql2**: `^3.9.7` (MySQL Database Connector)
*   **cors**: `^2.8.5` (Cross-Origin Resource Sharing)
*   **dotenv**: `^16.4.5` (Environment Variable Management)
*   **compression**: `^1.8.1` (Gzip Response Compression)
*   **nodemailer**: `^8.0.11` (Email Alert System)

### 3. Frontend Libraries
The frontend is built using Vanilla HTML5, CSS3, and JavaScript (ES6+), minimizing external dependencies.
*   **Chart.js**: `v4.4.1` (Used for rendering SPC charts and Histograms)
*   **SheetJS (xlsx)**: `v0.18.5` (Used for exporting data to Excel formats)

---

## 🚀 Installation & Setup

### Quick Start:
1.  **Database Setup:**
    *   Start **Apache** and **MySQL** via XAMPP.
    *   Open phpMyAdmin (`http://localhost/phpmyadmin`).
    *   Create a database named `belton_ipqc` (utf8mb4_general_ci).
    *   Import the `belton_ipqc.sql` file provided in this repository.
    *   **(For Damper Module):** Import the `damper_buyoff_config.sql` file to populate standard Spec Limits for all 22 Buy-off Damper products.

2.  **Backend Setup:**
    *   Ensure Node.js is installed.
    *   Open a terminal in the root directory.
    *   Run `npm install` to install all backend dependencies (express, mysql2, etc.).
    *   Configure your database connection in `.env` (if applicable) or inside `backend/server.js`.
    *   Run `npm start` or execute `start.bat` to launch the API server.

3.  **Frontend Setup:**
    *   Place all project files into your XAMPP `htdocs` directory (e.g., `C:\xampp\htdocs\ipqc`).
    *   Access the system via your browser at `http://localhost/ipqc`.

---

## 📂 Project Structure
*   `*.html`, `*.css`, `*.js`: Frontend UI files for each module.
*   `backend/`: Node.js server files (`server.js`, API routes).
*   `belton_ipqc.sql`: Database schema and structure for MySQL.
*   `package.json`: Node.js dependency configuration.

## 🤝 Maintainers
Developed for the IPQC Line by Belton Engineering/QA Team.
