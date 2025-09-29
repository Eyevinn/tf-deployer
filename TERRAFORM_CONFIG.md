# Terraform Backend and State Management Configuration

This document explains how to configure Terraform state management and resolve state locking issues when using the Terraform UI Deployer.

## State Locking Issues

If you encounter state locking errors like:
```
Error acquiring the state lock
```

You can resolve this by setting the appropriate environment variables before starting the server.

## Environment Variables for Backend Configuration

### Basic State Management
```bash
# Set a custom directory for Terraform state files
export TF_DATA_DIR="/path/to/terraform/state"

# Disable state locking if not needed (not recommended for production)
export TF_STATE_LOCK=false

# Set state lock timeout (in seconds)
export TF_STATE_LOCK_TIMEOUT=10

# For automation mode (automatically set by the UI)
export TF_IN_AUTOMATION=true
export TF_INPUT=false
```

### Cloud Backend Configuration

#### Terraform Cloud
```bash
export TF_CLOUD_ORGANIZATION="your-org"
export TF_TOKEN="your-terraform-cloud-token"
```

#### AWS S3 Backend
```bash
export AWS_PROFILE="your-profile"
export AWS_REGION="us-west-2"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
```

#### Azure Backend
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
export AZURE_TENANT_ID="your-tenant-id"
```

#### Google Cloud Backend
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GOOGLE_PROJECT="your-project-id"
export GOOGLE_REGION="us-central1"
```

## Usage Examples

### Example 1: Local State with Custom Directory
```bash
export TF_DATA_DIR="/tmp/terraform-states"
npm run server
```

### Example 2: AWS S3 Backend
```bash
export AWS_PROFILE="production"
export AWS_REGION="us-east-1"
npm run server
```

### Example 3: Disable State Locking (for development)
```bash
export TF_STATE_LOCK=false
npm run server
```

## How It Works

1. The UI Deployer automatically detects these environment variables
2. If `TF_DATA_DIR` is set, it creates a local backend configuration
3. All detected environment variables are passed to the Terraform/OpenTofu process
4. The deployment logs will show which variables are being used

## Supported Environment Variables

The following Terraform environment variables are automatically detected and passed through:

- `TF_DATA_DIR` - Custom data directory
- `TF_WORKSPACE` - Terraform workspace
- `TF_STATE_LOCK` - Enable/disable state locking  
- `TF_STATE_LOCK_TIMEOUT` - State lock timeout
- `TF_CLOUD_ORGANIZATION` - Terraform Cloud org
- `TF_TOKEN` - Terraform Cloud token
- All AWS, Azure, and Google Cloud provider variables
- Consul and etcd backend variables

## Troubleshooting

### State Lock Timeout
If deployments fail with state lock timeouts:
```bash
export TF_STATE_LOCK_TIMEOUT=30  # Increase timeout to 30 seconds
```

### Force Local Backend
To force using local backend regardless of configuration:
```bash
export TF_FORCE_LOCAL_BACKEND=true
```

### Debug Backend Issues
Enable verbose logging:
```bash
export TF_LOG=DEBUG
```

## Security Notes

- Never commit sensitive tokens or credentials to version control
- Use secure methods to set environment variables in production
- Consider using cloud provider managed identity when possible
- The UI logs which environment variables are used (but not their values)