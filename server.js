import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIo } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import our extracted modules
import { parseGitHubRepository, downloadRepository } from './src/services/github-service.js';
import { 
  extractSensitiveEnvVars, 
  createBackendConfig, 
  generateTfvarsContent, 
  startTerraformApply 
} from './src/services/deployment-service.js';
import { ensureDirectories, getDeploymentDir } from './src/utils/file-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// API Routes

/**
 * Parse GitHub repository URL and extract Terraform variables
 */
app.post('/api/parse-github-url', async (req, res) => {
  try {
    const { repoUrl } = req.body;
    const result = await parseGitHubRepository(repoUrl);
    res.json(result);
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    res.status(500).json({ error: 'Failed to parse GitHub repository' });
  }
});

/**
 * Deploy Terraform infrastructure
 */
app.post('/api/deploy', async (req, res) => {
  try {
    const { repoData, variables, deploymentId } = req.body;
    
    if (!deploymentId) {
      return res.status(400).json({ error: 'Deployment ID is required' });
    }
    
    const deploymentDir = getDeploymentDir(deploymentId);
    await fs.mkdir(deploymentDir, { recursive: true });
    
    console.log('Debug: Processing deployment request...');
    console.log('Debug: Variables received:', Object.keys(variables || {}));
    console.log('Debug: Terraform variables available:', Object.keys(repoData.terraformVariables || {}));
    
    // Extract sensitive environment variables
    const terraformVariables = repoData.terraformVariables || {};
    const envVars = extractSensitiveEnvVars(variables, terraformVariables);
    
    console.log('Debug: Environment variables set:', Object.keys(envVars).filter(k => k.startsWith('TF_VAR_')));
    
    // Generate tfvars file content (excluding sensitive variables)
    const tfvarsContent = generateTfvarsContent(variables);
    
    console.log('Debug: tfvars content length:', tfvarsContent.length);
    console.log('Debug: tfvars preview:', tfvarsContent.substring(0, 200));
    
    // Write tfvars file
    const tfvarsPath = path.join(deploymentDir, 'terraform.tfvars');
    await fs.writeFile(tfvarsPath, tfvarsContent);
    
    // Create backend configuration if needed
    const socket = io.to(deploymentId);
    const backendCreated = await createBackendConfig(deploymentDir, envVars);
    
    if (backendCreated) {
      socket.emit('deployment-log', { 
        message: 'Backend configuration created', 
        timestamp: new Date().toISOString() 
      });
    }
    
    socket.emit('deployment-log', { 
      message: 'Downloading repository files...', 
      timestamp: new Date().toISOString() 
    });
    
    // Download repository files
    await downloadRepository(repoData, deploymentDir);
    
    socket.emit('deployment-log', { 
      message: 'Repository files downloaded', 
      timestamp: new Date().toISOString() 
    });
    
    socket.emit('deployment-log', { 
      message: 'Starting Terraform initialization...', 
      timestamp: new Date().toISOString() 
    });
    
    // Combine environment variables
    const tofuEnv = {
      ...process.env,
      ...envVars
    };
    
    console.log('Debug: Full environment variables for tofu:');
    Object.keys(tofuEnv).forEach(key => {
      if (key.startsWith('TF_')) {
        const value = key.includes('TOKEN') || key.includes('SECRET') || key.includes('KEY') 
          ? '[REDACTED]' 
          : tofuEnv[key];
        console.log(`  ${key}=${value}`);
      }
    });
    
    // Start the deployment process
    startTerraformApply(deploymentDir, socket, tofuEnv);
    
    res.json({ success: true, deploymentId });
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-deployment', (deploymentId) => {
    socket.join(deploymentId);
    console.log(`Socket ${socket.id} joined deployment ${deploymentId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;

ensureDirectories().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});