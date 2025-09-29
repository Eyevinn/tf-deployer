# Multi-stage build for OpenTofu Deployer
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    wget \
    unzip \
    nginx \
    supervisor \
    bash \
    ca-certificates

# Install OpenTofu manually
RUN TOFU_VERSION="1.6.0" && \
    wget -O tofu.zip "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_amd64.zip" && \
    unzip tofu.zip && \
    chmod +x tofu && \
    mv tofu /usr/local/bin/ && \
    rm tofu.zip

# Verify OpenTofu installation
RUN tofu version

# Create application user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories
RUN mkdir -p /app /usercontent /data /var/log/supervisor && \
    chown -R nodejs:nodejs /app /usercontent /data

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/src ./src

# Copy nginx configuration template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV TEMP_DIR=/usercontent
ENV DEPLOYMENTS_DIR=/data
ENV PORT=80

# Expose port
EXPOSE 80

# Define volumes
VOLUME ["/usercontent", "/data"]

# Switch to non-root user for security
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/deployments || exit 1

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]