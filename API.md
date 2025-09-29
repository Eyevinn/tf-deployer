# Terraform UI Deployer API Documentation

## Overview

The Terraform UI Deployer provides a REST API for deploying Terraform scripts from GitHub repositories using OpenTofu with real-time progress monitoring via WebSocket connections.

**Base URL**: `http://localhost:3001`

## API Endpoints

### 1. Parse GitHub Repository

**Endpoint**: `POST /api/parse-github-url`

Parse a GitHub repository URL to extract Terraform variables, README documentation, and repository metadata.

#### Request Body
```json
{
  "repoUrl": "https://github.com/owner/repo/tree/branch/path"
}
```

#### Response (200 OK)
```json
{
  "owner": "EyevinnOSC",
  "repo": "terraform-examples", 
  "branch": "main",
  "path": "aws-ec2",
  "terraformFiles": ["main.tf", "variables.tf", "outputs.tf"],
  "tfvarsFile": null,
  "readmeFile": "README.md",
  "variables": {
    "region": {
      "value": "us-west-2",
      "type": "string",
      "original": "us-west-2",
      "description": "AWS region",
      "source": "terraform",
      "sources": ["terraform"],
      "file": "variables.tf",
      "terraformType": "string",
      "sensitive": false,
      "nullable": true,
      "required": false
    }
  },
  "terraformVariables": {},
  "tfvarsVariables": {},
  "readmeVariables": {},
  "readmeContent": "# AWS EC2 Example...",
  "allFiles": [
    { "name": "main.tf", "type": "file" },
    { "name": "README.md", "type": "file" }
  ]
}
```

#### Error Responses
- **400 Bad Request**: `{"error": "Invalid GitHub URL format"}`
- **404 Not Found**: `{"error": "No .tf files found in the repository"}`
- **500 Internal Server Error**: `{"error": "Failed to parse GitHub repository"}`

### 2. Deploy Infrastructure

**Endpoint**: `POST /api/deploy`

Deploy Terraform infrastructure using parsed repository data and user-provided variables. File permissions from the source repository are preserved during download, ensuring executable scripts maintain their execution permissions.

#### Request Body
```json
{
  "repoData": {
    "owner": "EyevinnOSC",
    "repo": "terraform-examples",
    "branch": "main", 
    "path": "aws-ec2",
    "terraformVariables": {}
  },
  "variables": {
    "region": "us-west-2",
    "instance_type": "t3.micro",
    "enable_monitoring": true
  },
  "deploymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "deploymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Error Responses
- **400 Bad Request**: `{"error": "Deployment ID is required"}`
- **500 Internal Server Error**: `{"error": "Deployment failed"}`

## WebSocket API

The WebSocket API provides real-time deployment progress updates using Socket.IO.

**Connection URL**: `ws://localhost:3001/socket.io/`

### Client Events (Send to Server)

#### `join-deployment`
Join a deployment room to receive updates for a specific deployment.
```javascript
socket.emit('join-deployment', deploymentId);
```

### Server Events (Receive from Server)

#### `deployment-log`
Regular deployment progress logs.
```json
{
  "message": "Repository files downloaded",
  "timestamp": "2023-12-07T10:30:45.123Z"
}
```

#### `deployment-error`
Error messages during deployment.
```json
{
  "message": "Failed to initialize Terraform",
  "timestamp": "2023-12-07T10:30:45.123Z"
}
```

#### `deployment-complete`
Final deployment result.
```json
{
  "success": true,
  "message": "Deployment completed successfully",
  "timestamp": "2023-12-07T10:30:45.123Z"
}
```

### Example WebSocket Usage

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// Join deployment room
socket.emit('join-deployment', deploymentId);

// Listen for updates
socket.on('deployment-log', (data) => {
  console.log(`[${data.timestamp}] ${data.message}`);
});

socket.on('deployment-error', (data) => {
  console.error(`[${data.timestamp}] ERROR: ${data.message}`);
});

socket.on('deployment-complete', (data) => {
  console.log(`Deployment ${data.success ? 'succeeded' : 'failed'}: ${data.message}`);
});
```

## Data Types

### Variable Object
Represents a Terraform variable with UI-friendly structure:

```typescript
interface Variable {
  value: any;                    // Current/default value
  type: string;                  // Display type: "string" | "number" | "boolean" | "array" | "object"
  original: any;                 // Original default value
  description?: string;          // Variable description
  source: string;               // Primary source: "terraform" | "readme" | "tfvars"
  sources?: string[];           // All sources where found
  file?: string;                // Source file name
  terraformType?: string;       // Original Terraform type
  sensitive?: boolean;          // Contains sensitive data
  nullable?: boolean;           // Can be null
  required?: boolean;           // Required (no default and not nullable)
}
```

### Repository Data
Repository information required for deployment:

```typescript
interface RepositoryData {
  owner: string;                // GitHub owner
  repo: string;                 // Repository name
  branch: string;               // Git branch
  path: string;                 // Path within repo
  terraformVariables: Record<string, TerraformVariable>;
}
```

## Environment Variables

The API supports various Terraform and cloud provider environment variables:

### Terraform Configuration
- `TF_DATA_DIR` - Custom directory for Terraform state files
- `TF_WORKSPACE` - Terraform workspace
- `TF_STATE_LOCK` - Enable/disable state locking
- `TF_STATE_LOCK_TIMEOUT` - State lock timeout in seconds
- `TF_CLOUD_ORGANIZATION` - Terraform Cloud organization
- `TF_TOKEN` - Terraform Cloud token

### Cloud Providers
- **AWS**: `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Azure**: `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- **GCP**: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT`, `GOOGLE_REGION`

See [TERRAFORM_CONFIG.md](./TERRAFORM_CONFIG.md) for detailed configuration examples.

## File Permissions

The API preserves file permissions when downloading repository files:

1. **Executable Files**: Files marked as executable (mode `100755`) in GitHub maintain their executable permissions
2. **Script Auto-Detection**: Script files (`.sh`, `.bash`, `.zsh`, `.py`, `.pl`, `.rb`, `.js`, `.ts`) are automatically made executable even if not marked as such in the repository
3. **Regular Files**: Standard files (mode `100644`) maintain read/write permissions for owner and read permissions for group/others
4. **Cross-Platform**: Permission setting gracefully handles platforms that don't support chmod operations

## Security Considerations

1. **Sensitive Variables**: Variables marked as `sensitive: true` in Terraform are automatically passed as environment variables (`TF_VAR_*`) instead of being written to tfvars files.

2. **Environment Variables**: The API respects existing Terraform environment variables and passes them to the OpenTofu process.

3. **State Management**: Supports various backend configurations through environment variables for secure state storage.

4. **File Permissions**: Downloaded files maintain their original permissions, ensuring executable scripts can run while preventing unintended execution of non-executable files.

5. **CORS**: Configured to accept requests from `http://localhost:5173` for development.

## Error Handling

All API endpoints return standardized error responses:

```json
{
  "error": "Human-readable error message"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid input)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (unexpected failure)

## Rate Limiting

Currently no rate limiting is implemented. In production deployments, consider implementing rate limiting to prevent abuse.