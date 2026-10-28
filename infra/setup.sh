#!/usr/bin/env bash
# Install or update the JCL Assistant on an Amazon Linux 2023 EC2 instance. From Session Manager:
#   curl -fsSLo /tmp/setup.sh https://raw.githubusercontent.com/capstone-insper/202602_APEX_SYSTEMS_JCL_Assistant/main/infra/setup.sh
#   sudo nohup env IBM_PDFS_S3=s3://<bucket>/ibm/ bash /tmp/setup.sh > /tmp/setup.log 2>&1 &
#   tail -f /tmp/setup.log      # ~10 min; nohup keeps it running if the browser session drops
# Safe to run again: it pulls the latest code, rebuilds the index and restarts the service.
# AWS access (Bedrock) comes from the instance role; no key is stored here.
set -euo pipefail

REPO="${REPO:-https://github.com/capstone-insper/202602_APEX_SYSTEMS_JCL_Assistant}"
BRANCH="${BRANCH:-main}"
APP=/opt/jcl-assistant
USER_NAME=jcl

dnf install -y -q git python3.11 nginx

id "$USER_NAME" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/jcl "$USER_NAME"
[ -d "$APP/.git" ] || rm -rf "$APP"  # a half-done first clone would block every re-run
if [ -d "$APP/.git" ]; then
  sudo -u "$USER_NAME" git -C "$APP" fetch -q origin "$BRANCH"
  sudo -u "$USER_NAME" git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  install -d -o "$USER_NAME" "$APP"
  sudo -u "$USER_NAME" git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi

cd "$APP"
sudo -u "$USER_NAME" python3.11 -m venv .venv
sudo -u "$USER_NAME" .venv/bin/pip install -q -r backend/requirements.txt  # pulls in rag-llm/requirements.txt

# The IBM PDFs: ibm.com refuses scripted downloads, so they live in a private S3 bucket,
# uploaded once by hand. Example: sudo IBM_PDFS_S3=s3://my-bucket/ibm/ bash setup.sh
if [ -n "${IBM_PDFS_S3:-}" ]; then
  sudo -u "$USER_NAME" mkdir -p rag-llm/data/raw/ibm
  sudo -u "$USER_NAME" aws s3 cp "$IBM_PDFS_S3" rag-llm/data/raw/ibm/ --recursive --exclude "*" --include "*.pdf" --only-show-errors
fi

# Corpus and index (~10 min the first time; the downloads are cached in rag-llm/data/raw).
# The rebuild deletes rag-llm/data/index, so the API is down until the end of the script.
systemctl stop jcl-assistant 2>/dev/null || true
for step in ingest.jcl ingest.ibm ingest.index; do
  sudo -u "$USER_NAME" bash -c "cd rag-llm && ../.venv/bin/python -m $step"
done

# Frontend: build it if it is in the repo, otherwise a placeholder that points to the API page.
if [ -f frontend/package.json ]; then
  dnf install -y -q nodejs npm  # ponytail: AL2023 default Node; pin nodejs20 if the Vite build needs it
  sudo -u "$USER_NAME" bash -c "cd frontend && npm ci --silent && npm run build --silent"
else
  install -d -o "$USER_NAME" frontend/dist
  echo '<!doctype html><title>JCL Assistant</title><p>UI not deployed yet. Try the API at <a href="/docs">/docs</a>.' > frontend/dist/index.html
fi

cat > /etc/systemd/system/jcl-assistant.service <<EOF
[Unit]
Description=JCL Assistant API
After=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$APP/backend
Environment=AWS_REGION=us-east-1
Environment=PYTHONPATH=$APP/rag-llm
ExecStart=$APP/.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/conf.d/jcl-assistant.conf <<EOF
# Each question costs a Bedrock call: cap it per client IP and in total.
limit_req_zone \$binary_remote_addr zone=ask:1m rate=10r/m;
limit_req_zone \$server_name zone=askall:1m rate=60r/m;
limit_req_status 429;

server {
    # default_server wins over the stock server in nginx.conf for requests by IP
    listen 80 default_server;
    listen [::]:80 default_server;
    root $APP/frontend/dist;

    location / { try_files \$uri /index.html; }

    location = /ask {
        limit_req zone=ask burst=5 nodelay;
        limit_req zone=askall burst=10 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 120s;
    }
    location ~ ^/(docs|openapi.json)$ { proxy_pass http://127.0.0.1:8000; }
}
EOF
chmod o+x /opt "$APP"  # nginx must reach frontend/dist

nginx -t
systemctl daemon-reload
systemctl enable jcl-assistant nginx
systemctl restart jcl-assistant nginx
echo "Done. Open http://<this machine's public IP>/docs"
