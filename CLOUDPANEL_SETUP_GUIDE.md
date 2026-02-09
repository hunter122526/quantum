# CloudPanel Complete Setup Guide

Complete step-by-step guide to deploy your Quantum Alpha (Copy Trading) app on CloudPanel.

---

## **Phase 1: CloudPanel Prerequisites**

### Step 1.1: Create Application in CloudPanel UI

1. **Log in to CloudPanel** → https://your-cloudpanel-ip:8443/
2. Go to **Applications** tab
3. Click **Create Application**
4. Fill in details:
   - **Domain**: `quantumalphaindia.com` (or your domain)
   - **Language**: `Node.js 20` (or latest LTS)
   - **SSL**: Enable (free Let's Encrypt)
   - **Root Path**: `/public` 
5. Click **Create** and wait for CloudPanel to provision

### Step 1.2: Create Database in CloudPanel UI

1. Go to **Databases** tab
2. Click **Create Database**
3. Fill in:
   - **Database Name**: `quantum_db`
   - **Database User**: `quantum_user`
   - **Password**: Strong password (save this!)
   - **host**: `localhost` (or your DB server)
4. Click **Create**
5. **Note the credentials** - you'll need them later

---

## **Phase 2: SSH Setup & Application Files**

### Step 2.1: SSH into Your CloudPanel Server

```bash
ssh root@your_cloudpanel_ip
# Or use CloudPanel's SSH terminal
```

### Step 2.2: Navigate to Application Directory

```bash
cd ~/htdocs/quantumalphaindia.com
# Verify you're in the app directory
pwd
ls -la
```

### Step 2.3: Upload Application Files

**From your local machine:**

```bash
# Option 1: Using SCP (copy all files)
scp -r ./* root@your_cloudpanel_ip:~/htdocs/quantumalphaindia.com/

# Option 2: Using Git (recommended)
git clone https://github.com/Tejasajja2025/qutnm.git
cd qutnm
# Copy files to CloudPanel directory
```

---

## **Phase 3: Environment Configuration**

### Step 3.1: Create .env.local File on CloudPanel

```bash
cd ~/htdocs/quantumalphaindia.com
nano .env.local
```

**Paste the following (update with your values):**

```env
# Database Configuration
DB_HOST=localhost
DB_USER=quantum_user
DB_PASSWORD=your_strong_password_here
DB_NAME=quantum_db
DB_PORT=3306

# Alice Blue OAuth Configuration
ALICE_APP_CODE=your_alice_blue_app_code
ALICE_API_SECRET=your_alice_blue_api_secret
ALICE_APP_ORIGIN=https://quantumalphaindia.com

# Encryption Key (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your_32_byte_hex_key_here

# Application Settings
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://quantumalphaindia.com

# Optional: Custom File Paths
QUANTUM_MASTER_ACCOUNT_FILE=.master.account
ALICE_OAUTH_TOKENS_FILE=.alice.tokens.json
QUANTUM_MASTER_PUSHED_FILE=.master.pushed.json

# Replication Engine
QUANTUM_ALPHA_SECRET=your_secret_key_for_replicate_endpoint
```

**Save file**: Press `Ctrl + X`, then `Y`, then `Enter`

### Step 3.2: Generate Encryption Key

```bash
openssl rand -hex 32
```

Copy the output and update `ENCRYPTION_KEY` in .env.local

---

## **Phase 4: Database Setup**

### Step 4.1: Apply Full Database Schema

```bash
cd ~/htdocs/quantumalphaindia.com

# Run the full schema (creates all tables)
mysql -u quantum_user -p quantum_db < database/quantum_schema.sql
# When prompted, enter your DB password
```

### Step 4.2: Verify Database Tables

```bash
# Check all tables were created
mysql -u quantum_user -p quantum_db -e "SHOW TABLES;"
```

**Expected output (should see all these):**
```
followers
follower_credentials
follower_consents
follower_risk_config
order_mappings
trade_events
trades
logs
master_settings
```

### Step 4.3: Verify Sample Data

```bash
# Check sample followers
mysql -u quantum_user -p quantum_db -e "SELECT * FROM followers;"

# Check sample trades
mysql -u quantum_user -p quantum_db -e "SELECT * FROM trades LIMIT 5;"
```

---

## **Phase 5: Install Dependencies**

### Step 5.1: Install Node Modules

```bash
cd ~/htdocs/quantumalphaindia.com

# Clear existing node_modules (if any)
rm -rf node_modules package-lock.json

# Install fresh dependencies
npm install --legacy-peer-deps
```

**This will take 2-5 minutes depending on server speed.**

---

## **Phase 6: Build Application**

### Step 6.1: Build Next.js

```bash
cd ~/htdocs/quantumalphaindia.com

# Set production environment
export NODE_ENV=production

# Build the application
npm run build
```

**Build output should show:**
```
✓ Creating optimized production build
✓ Compiled successfully
```

If you see errors, check:
- `.env.local` is correctly configured
- Database connection works
- All required dependencies installed

---

## **Phase 7: Start Application**

### Option A: Using PM2 (Recommended - Auto-restart on crash)

```bash
# Install PM2 globally
npm install -g pm2

# Start the app with PM2
cd ~/htdocs/quantumalphaindia.com
pm2 start "npm start" --name "quantum-alpha"

# Auto-start on server reboot
pm2 startup
pm2 save

# View logs
pm2 logs quantum-alpha
```

### Option B: Using systemd Service (Production-grade)

```bash
# Create service file
sudo nano /etc/systemd/system/quantum-alpha.service
```

**Paste:**
```ini
[Unit]
Description=Quantum Alpha Copy Trading App
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/htdocs/quantumalphaindia.com
EnvironmentFile=/root/htdocs/quantumalphaindia.com/.env.local
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl enable quantum-alpha
sudo systemctl start quantum-alpha

# Check status
sudo systemctl status quantum-alpha

# View logs
sudo journalctl -u quantum-alpha -f
```

### Option C: Using CloudPanel's Built-in Node Manager

1. Go to CloudPanel UI → **Applications**
2. Select your app
3. Go to **Node.js Manager**
4. Click **Install Dependencies** → **Build** → **Start**

---

## **Phase 8: Configure Reverse Proxy (Nginx)**

CloudPanel should automatically configure this, but verify:

```bash
# Check Nginx configuration
nano /etc/nginx/sites-available/quantumalphaindia.com.conf
```

**Should contain:**
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Test & reload:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## **Phase 9: Verify Everything Works**

### Test 1: Application Running

```bash
# Check if app is responding
curl -I https://quantumalphaindia.com

# Should return: HTTP/1.1 200 OK
```

### Test 2: Database Connection

```bash
# Check database connectivity
curl -X GET https://quantumalphaindia.com/api/master/status

# Should return: {"ok":true,"master":...}
```

### Test 3: Check Logs

```bash
# PM2 logs
pm2 logs quantum-alpha

# Or systemd logs
sudo journalctl -u quantum-alpha -f

# Or check CloudPanel logs
tail -f /var/log/cloudpanel/quantum-alpha.log
```

---

## **Phase 10: Post-Deployment Configuration**

### Step 10.1: Set Master Account (First Time)

1. Open https://quantumalphaindia.com in browser
2. Click **Connect to Alice Blue** on dashboard
3. Login with your Alice Blue account
4. OAuth callback will save master account ID

### Step 10.2: Add Follower Accounts

1. Go to Configuration → Add New Account
2. Fill in follower details:
   - Account ID: `ZERODHA-001`
   - Account Name: `My Follower 1`
   - Client ID: From broker
   - API Key: From broker
3. Check consent checkbox
4. Click **Add Account**

### Step 10.3: Start Copy Trading

1. Go to Dashboard
2. On each follower card, click **Start Copy Trading**
3. When you place trades as master, followers will auto-receive them

---

## **Phase 11: Monitoring & Maintenance**

### Daily Checks

```bash
# Check application status
pm2 status
# or
sudo systemctl status quantum-alpha

# Monitor real-time logs
pm2 logs quantum-alpha -f
```

### Database Backups

```bash
# Daily backup
mysqldump -u quantum_user -p quantum_db > /backup/quantum_$(date +%Y%m%d).sql

# Automated backup (cron job)
crontab -e
# Add: 0 2 * * * mysqldump -u quantum_user -pYOUR_PASSWORD quantum_db > /backup/quantum_$(date +\%Y\%m\%d).sql
```

### SSL Certificate Renewal

CloudPanel auto-renews Let's Encrypt certificates. Verify:

```bash
# Check certificate expiry
openssl s_client -connect quantumalphaindia.com:443 -showcerts  < /dev/null | grep -A 1 "Not After"
```

---

## **Troubleshooting**

### Issue: App Won't Start

```bash
# Check error logs
pm2 logs quantum-alpha
sudo journalctl -u quantum-alpha -n 50

# Common causes:
# 1. .env.local missing → Create it with Phase 3
# 2. Database not running → sudo systemctl restart mysql
# 3. Port already in use → pm2 kill all && sleep 2 && npm start
```

### Issue: Database Connection Error

```bash
# Test MySQL connection
mysql -u quantum_user -p quantum_db -e "SELECT 1;"

# If fails, check:
# 1. MySQL running: sudo systemctl status mysql
# 2. User/password correct
# 3. Database exists: mysql -u quantum_user -p -e "SHOW DATABASES;"
```

### Issue: OAuth Callback Fails

```bash
# Check ALICE_APP_ORIGIN in .env.local
# It should match your domain exactly
# If changed, restart app:
pm2 restart quantum-alpha
```

### Issue: 502 Bad Gateway

```bash
# App crashed. Check logs:
pm2 logs quantum-alpha
tail -f /var/log/nginx/error.log

# Restart:
pm2 restart quantum-alpha
```

---

## **Quick Reference Commands**

```bash
# Navigate to app
cd ~/htdocs/quantumalphaindia.com

# View logs
pm2 logs quantum-alpha -f

# Restart app
pm2 restart quantum-alpha

# Stop app
pm2 stop quantum-alpha

# Start app
pm2 start "npm start" --name "quantum-alpha"

# Check database
mysql -u quantum_user -p quantum_db -e "SELECT COUNT(*) as followers FROM followers;"

# View environment
cat .env.local
```

---

## **Success Indicators**

✅ **You're done when:**
- [ ] `npm install` completes without errors
- [ ] `npm run build` succeeds
- [ ] `https://quantumalphaindia.com` loads (shows login page)
- [ ] Can login and see dashboard
- [ ] Can connect master account via OAuth
- [ ] Can add follower accounts
- [ ] Can see "Master Account Connected" status

---

## **Support**

If issues persist:
1. Check `.env.local` configuration
2. Review error logs: `pm2 logs quantum-alpha`
3. Verify database: `mysql -u quantum_user -p quantum_db -e "SHOW TABLES;"`
4. Restart everything: `pm2 kill all && npm install && npm run build && pm2 start "npm start"`
