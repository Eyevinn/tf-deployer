# Terraform UI Deployer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![OpenTofu](https://img.shields.io/badge/OpenTofu-Compatible-blue)](https://opentofu.org/)

A web application for deploying Terraform scripts from GitHub repositories using OpenTofu with real-time progress monitoring.

**Developed by [Eyevinn Technology AB](https://www.eyevinn.se/)**

## Features

- **GitHub Integration**: Parse GitHub repository URLs to extract Terraform configurations
- **Terraform Variable Parsing**: Extract variable definitions directly from `.tf` files with full type information
- **README Parsing**: Automatically extract variable information from README files
- **Smart Variable Merging**: Combine variables from Terraform files, `.tfvars` files, and README documentation
- **Rich Variable Information**: Display types, descriptions, defaults, sensitivity, and requirements
- **Dynamic Form Generation**: Automatically generate forms with proper validation and type hints
- **Real-time Deployment**: Monitor OpenTofu deployment progress with live logs
- **WebSocket Communication**: Real-time updates during deployment process
- **Responsive Design**: Clean, modern interface built with React and Tailwind CSS

## Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v16 or higher)
2. **OpenTofu** installed and available in your PATH
   ```bash
   # Install OpenTofu (example for macOS)
   brew install opentofu
   ```

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start both the frontend and backend:
   ```bash
   npm start
   ```
   This will start:
   - Backend server on `http://localhost:3001`
   - Frontend development server on `http://localhost:5173`

2. Open your browser and navigate to `http://localhost:5173`

3. Enter a GitHub repository URL containing Terraform scripts, for example:
   ```
   https://github.com/EyevinnOSC/terraform-examples/tree/main/examples/intercom
   ```

4. The application will parse the repository and extract variables from the `.tfvars` file

5. Fill in the configuration values in the generated form

6. Click "Deploy with OpenTofu" to start the deployment

7. Monitor the real-time progress in the deployment logs

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

- `POST /api/parse-github-url` - Parse a GitHub repository URL and extract variables
- `POST /api/deploy` - Start a deployment with the provided configuration
- WebSocket events for real-time deployment updates

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

## Security Considerations

- The application executes OpenTofu commands on the server
- Repository contents are temporarily downloaded to the server
- Ensure proper access controls in production environments
- Consider sandboxing deployment executions

## Troubleshooting

### OpenTofu Not Found
If you get an error about OpenTofu not being found:
1. Make sure OpenTofu is installed: `tofu --version`
2. Ensure it's in your system PATH
3. Restart the server after installation

### GitHub API Rate Limits
The application uses the GitHub API without authentication, which has rate limits:
- Consider adding GitHub token authentication for higher limits
- The current implementation supports public repositories only

### Port Conflicts
If ports 3001 or 5173 are already in use:
- Change the PORT environment variable for the backend
- Modify the Vite configuration for the frontend

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
