#!/bin/sh
set -e

# Default port if not set
PORT=${PORT:-80}

echo "Starting OpenTofu Deployer on port $PORT"

# Substitute environment variables in nginx configuration
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Ensure log directories exist
mkdir -p /var/log/nginx /var/log/supervisor

# Ensure volume directories exist and have correct permissions
mkdir -p /usercontent /data
chown -R nodejs:nodejs /usercontent /data

# Start supervisord which manages both nginx and nodejs
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf