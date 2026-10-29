# ═══════════════════════════════════════════════════════════════════════
# CarBook — Automated VPS Deployment Script (Oracle Cloud)
# Target: http://carbook.141.147.136.170.sslip.io
# Port: 3070
# ═══════════════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"
$VPS_HOST = "ubuntu@141.147.136.170"
$ORIG_KEY = "H:\Programming\Oracle_MK_CS\ssh-key-2026-08-24.key"
$TEMP_KEY = "$env:TEMP\oracle_carbook_deploy.key"
$TEMP_CODE = "$env:TEMP\carbook_code.tar.gz"

Write-Host "🔑 Setting up SSH key..." -ForegroundColor Cyan
Copy-Item $ORIG_KEY $TEMP_KEY -Force
& "$env:SystemRoot\System32\icacls.exe" $TEMP_KEY /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null

Write-Host "📦 Creating deployment archive..." -ForegroundColor Cyan
if (Test-Path $TEMP_CODE) { Remove-Item $TEMP_CODE -Force }
& "$env:SystemRoot\System32\tar.exe" -czf $TEMP_CODE .next public package.json pnpm-lock.yaml next.config.js car_maintenance.db

Write-Host "🚀 Uploading bundle to VPS ($VPS_HOST)..." -ForegroundColor Cyan
& "$env:SystemRoot\System32\OpenSSH\scp.exe" -i $TEMP_KEY -o StrictHostKeyChecking=no $TEMP_CODE "${VPS_HOST}:/tmp/carbook_code.tar.gz"

Write-Host "⚙️ Configuring VPS, Nginx, and Systemd Service..." -ForegroundColor Cyan
$remoteCommands = @'
set -e
sudo mkdir -p /var/www/carbook
sudo chown -R ubuntu:ubuntu /var/www/carbook

tar -xzf /tmp/carbook_code.tar.gz -C /var/www/carbook
rm -f /tmp/carbook_code.tar.gz

# Ensure pnpm is installed
if ! command -v pnpm &> /dev/null; then
    sudo npm install -g pnpm
fi

cd /var/www/carbook
pnpm install --prod --no-frozen-lockfile

# Setup Systemd Service
sudo bash -c 'cat > /etc/systemd/system/carbook.service << "EOF"
[Unit]
Description=CarBook Modern Automotive Followup
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/carbook
ExecStart=/usr/bin/node /var/www/carbook/node_modules/next/dist/bin/next start -p 3070
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3070

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable carbook.service
sudo systemctl restart carbook.service

# Setup Nginx VHost for CarBook
sudo bash -c 'cat > /etc/nginx/sites-available/carbook << "EOF"
server {
    listen 80;
    listen [::]:80;

    server_name carbook.141.147.136.170.sslip.io;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF'

sudo ln -sf /etc/nginx/sites-available/carbook /etc/nginx/sites-enabled/carbook
sudo nginx -t
sudo systemctl reload nginx

# Check status
sleep 3
sudo systemctl is-active carbook.service
curl -I -s http://127.0.0.1:3070 | head -n 5
'@

& "$env:SystemRoot\System32\OpenSSH\ssh.exe" -i $TEMP_KEY -o StrictHostKeyChecking=no $VPS_HOST $remoteCommands

Remove-Item $TEMP_CODE -Force -ErrorAction SilentlyContinue
Write-Host "🎉 CarBook is now live at: http://carbook.141.147.136.170.sslip.io" -ForegroundColor Green
