# OpenTofu Deployer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-Compatible-blue)](https://opentofu.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)](https://www.docker.com/)

A web application for deploying Terraform scripts from GitHub repositories using OpenTofu with real-time progress monitoring and deployment management.

**Developed by [Eyevinn Technology AB](https://www.eyevinn.se/)**

---
<div align="center">

## Quick Demo: Open Source Cloud

Run this service in the cloud with a single click.

[![Badge OSC](https://img.shields.io/badge/Try%20it%20out!-1E3A8A?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTIiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8yODIxXzMxNjcyKSIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI3IiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhcl8yODIxXzMxNjcyIiB4MT0iMTIiIHkxPSIwIiB4Mj0iMTIiIHkyPSIyNCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjQzE4M0ZGIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzREQzlGRiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=)](https://app.osaas.io/browse/eyevinn-tf-deployer)

</div>

---

## Screenshots

### Main Interface with Repository Parsing and Variable Configuration
![Screenshot 1](screenshot1.png)

### Deployment History and Management
![Screenshot 2](screenshot2.png)

## Features

- **GitHub Integration**: Parse GitHub repository URLs to extract Terraform configurations
- **Terraform Variable Parsing**: Extract variable definitions directly from `.tf` files with full type information
- **README Parsing**: Automatically extract variable information from README files
- **Smart Variable Merging**: Combine variables from Terraform files, `.tfvars` files, and README documentation
- **Rich Variable Information**: Display types, descriptions, defaults, sensitivity, and requirements
- **Dynamic Form Generation**: Automatically generate forms with proper validation and type hints
- **Real-time Deployment**: Monitor OpenTofu deployment progress with live logs
- **Deployment History**: View and manage all past deployments with metadata tracking
- **Infrastructure Destruction**: Safely destroy deployed infrastructure with real-time feedback
- **File Permission Management**: Automatically set execution permissions for downloaded scripts
- **WebSocket Communication**: Real-time updates during deployment and destruction processes
- **Docker Ready**: Complete containerization with OpenTofu pre-installed
- **Production Deployment**: Built-in nginx reverse proxy and process management
- **Configurable Storage**: Environment-configurable directories for user content and deployments
- **Responsive Design**: Clean, modern interface built with React and Tailwind CSS

## Prerequisites

Choose one of the following deployment methods:

### Option 1: Docker Deployment (Recommended)
- **Docker** and **Docker Compose** installed
- No other dependencies needed - OpenTofu is included in the container

### Option 2: Local Development
1. **Node.js** (v16 or higher)
2. **OpenTofu** installed and available in your PATH
   ```bash
   # Install OpenTofu (example for macOS)
   brew install opentofu
   ```

## Installation & Usage

### Option 1: Docker Deployment (Production)

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd opentofu-deployer
   ```

2. Deploy with Docker Compose:
   ```bash
   # Default deployment on port 8080
   docker-compose up -d
   
   # Custom port deployment
   PORT=3000 docker-compose up -d
   ```

3. Access the application at `http://localhost:8080` (or your custom port)

#### Alternative Docker Commands

```bash
# Build the image
docker build -t opentofu-deployer .

# Run with default settings (port 80 inside container, mapped to 8080)
docker run -d -p 8080:80 \
  -v opentofu-data:/data \
  -v opentofu-temp:/usercontent \
  opentofu-deployer

# Run with custom port and environment variables
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e TEMP_DIR=/usercontent \
  -e DEPLOYMENTS_DIR=/data \
  -v $(pwd)/data:/data \
  -v $(pwd)/temp:/usercontent \
  opentofu-deployer
```

### Option 2: Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone <repository-url>
   cd opentofu-deployer
   npm install
   ```

2. Start both the frontend and backend:
   ```bash
   npm start
   ```
   This will start:
   - Backend server on `http://localhost:3001`
   - Frontend development server on `http://localhost:5173`

3. Open your browser and navigate to `http://localhost:5173`

## How to Use

1. **Enter Repository URL**: Paste a GitHub repository URL containing Terraform scripts, for example:
   ```
   https://github.com/EyevinnOSC/terraform-examples/tree/main/examples/intercom
   ```

2. **Configure Variables**: The application will parse the repository and extract variables from Terraform files, `.tfvars` files, and README documentation. Fill in the configuration values in the generated form.

3. **Deploy Infrastructure**: Click "Deploy with OpenTofu" to start the deployment and monitor real-time progress in the deployment logs.

4. **Manage Deployments**: Use the deployment history section to:
   - View all past deployments with metadata
   - Monitor deployment status (Active, Initialized, Error)
   - Destroy infrastructure safely with real-time feedback
   - Delete deployment files and cleanup resources

## Supported Repository Structure

The application expects GitHub repositories with the following structure:
- **Required**: Contains Terraform files (`.tf`) with variable definitions
- **Optional**: Contains a variables file (`.tfvars` or `.tfvars.example`) with default values
- **Optional**: Contains a README file (`README.md` or `README.txt`) with variable documentation
- All files should be in the same directory

### Variable Parsing Priority

The application intelligently merges variable information from multiple sources:

1. **Terraform Files (.tf)** - Primary source with authoritative type definitions, descriptions, and constraints
2. **tfvars Files** - Provides default values and overrides
3. **README Files** - Adds additional documentation and descriptions

### Terraform Variable Support

The parser supports full Terraform variable syntax including:

```hcl
variable "app_name" {
  type        = string
  description = "Name of the application"
  default     = "my-app"
  sensitive   = false
  nullable    = false
  
  validation {
    condition     = length(var.app_name) > 0
    error_message = "App name cannot be empty."
  }
}
```

**Supported Features:**
- All Terraform types: `string`, `number`, `bool`, `list()`, `map()`, `object()`, etc.
- Variable descriptions and default values
- Sensitive variables (marked with shield icon)
- Required vs optional variables
- Nullable constraints
- File source tracking

### README Variable Parsing

The application can automatically extract variable information from README files using these patterns:

1. **Markdown Tables**:
   ```markdown
   | Variable | Description | Type | Default |
   |----------|-------------|------|---------|
   | app_name | Application name | string | myapp |
   ```

2. **Bullet Points**:
   ```markdown
   - `variable_name` - Description of the variable (default: value)
   ```

3. **Colon Format**:
   ```markdown
   variable_name: Description of the variable (Default: value)
   ```

## API Endpoints

### Core Functionality
- `POST /api/parse-github-url` - Parse a GitHub repository URL and extract variables
- `POST /api/deploy` - Start a deployment with the provided configuration

### Deployment Management  
- `GET /api/deployments` - Get deployment history with metadata
- `GET /api/deployments/:id` - Get specific deployment information
- `POST /api/deployments/:id/destroy` - Destroy infrastructure for a deployment
- `DELETE /api/deployments/:id` - Delete deployment files and cleanup

### Real-time Communication
- WebSocket events for real-time deployment and destruction updates
- Live progress monitoring during OpenTofu operations

### Environment Configuration
- `TEMP_DIR` - Directory for temporary files (default: `./temp`)
- `DEPLOYMENTS_DIR` - Directory for deployment storage (default: `./deployments`)
- `PORT` - Server port (default: 3001 for development, 80 for Docker)

## Development

### Frontend Only
```bash
npm run dev
```

### Backend Only
```bash
npm run server
```

### Build for Production
```bash
npm run build
```

## Architecture

- **Frontend**: React with TypeScript, Tailwind CSS, and Lucide React icons
- **Backend**: Node.js with Express, Socket.IO for real-time communication
- **Deployment**: OpenTofu (Terraform alternative) for infrastructure deployment
- **Communication**: RESTful API + WebSocket for real-time updates
- **Containerization**: Docker with multi-stage builds, nginx reverse proxy
- **Process Management**: Supervisor for managing nginx and Node.js processes
- **Storage**: Persistent volumes for user content and deployment data

## Docker Configuration

The application includes complete Docker containerization with:

### Container Features
- **OpenTofu 1.6.0** pre-installed and ready to use
- **Nginx reverse proxy** for production-grade static file serving
- **Multi-stage build** for optimized image size
- **Non-root user** for security hardening
- **Health checks** for container monitoring
- **Supervisor** for process management

### Volume Mounts
- `/usercontent` - Temporary files and user content (maps to `TEMP_DIR`)
- `/data` - Persistent deployment storage (maps to `DEPLOYMENTS_DIR`)

### Environment Variables
- `PORT` - Configure the listening port (default: 80)
- `TEMP_DIR` - Temporary files directory (default: `/usercontent`)
- `DEPLOYMENTS_DIR` - Deployment storage directory (default: `/data`)

### Health Check
The container includes a health check endpoint at `/health` that verifies:
- Application responsiveness
- API endpoint availability
- Service health status

## Security Considerations

- The application executes OpenTofu commands on the server
- Repository contents are temporarily downloaded to the server
- **Docker Security**: Application runs as non-root user in container
- **Volume Security**: Ensure proper permissions on mounted volumes
- **Network Security**: Use nginx reverse proxy for production deployments
- Ensure proper access controls in production environments
- Consider sandboxing deployment executions
- **Environment Variables**: Sensitive data is handled via environment variables
- **File Permissions**: Scripts automatically receive proper execution permissions

## Troubleshooting

### Docker Issues

#### Container Build Failures
```bash
# Clean build without cache
docker build --no-cache -t opentofu-deployer .

# Check build logs for specific errors
docker build -t opentofu-deployer . 2>&1 | tee build.log
```

#### Container Won't Start
```bash
# Check container logs
docker logs <container-name>

# Inspect container configuration
docker inspect <container-name>

# Check if port is already in use
lsof -i :8080
```

#### Volume Permission Issues
```bash
# Fix volume permissions (Linux/macOS)
sudo chown -R 1001:1001 ./data ./temp

# Or use Docker to fix permissions
docker run --rm -v $(pwd)/data:/data -v $(pwd)/temp:/temp alpine chown -R 1001:1001 /data /temp
```

### Local Development Issues

#### OpenTofu Not Found
If you get an error about OpenTofu not being found:
1. Make sure OpenTofu is installed: `tofu --version`
2. Ensure it's in your system PATH
3. Restart the server after installation

#### GitHub API Rate Limits
The application uses the GitHub API without authentication, which has rate limits:
- Consider adding GitHub token authentication for higher limits
- The current implementation supports public repositories only

#### Port Conflicts
If ports 3001 or 5173 are already in use:
- Change the PORT environment variable for the backend
- Modify the Vite configuration for the frontend

### Deployment Issues

#### Destroy Button Not Working
1. Check browser console for JavaScript errors
2. Verify WebSocket connection is established
3. Check server logs for API errors
4. Ensure deployment has active state file

#### File Permission Errors
The application automatically sets permissions, but if issues persist:
- Check that the container user has access to volume mounts
- Verify that downloaded scripts have executable permissions
- Review server logs for permission-related errors

## Contributing

We welcome contributions! Please feel free to submit issues and enhancement requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## About Eyevinn Technology

Eyevinn Technology is an independent consultant firm specialized in video and streaming. Independent in a way that we are not commercially tied to any platform or technology vendor. As our way to innovate and push the industry forward we develop proof-of-concepts and tools. The things we learn and the code we write we share with the industry in blogs and by open sourcing the code we have written.

Want to know more about Eyevinn and how it is to work here. Contact us at work@eyevinn.se!
