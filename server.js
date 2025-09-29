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
import { 
  getDeploymentHistory, 
  getDeploymentMetadata, 
  destroyDeployment, 
  deleteDeploymentDirectory 
} from './src/services/deployment-history-service.js';
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

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

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
    
    const socket = io.to(deploymentId);
    
    socket.emit('deployment-log', { 
      message: 'Downloading repository files...', 
      timestamp: new Date().toISOString() 
    });
    
    // Download repository files FIRST
    await downloadRepository(repoData, deploymentDir);
    
    socket.emit('deployment-log', { 
      message: 'Repository files downloaded', 
      timestamp: new Date().toISOString() 
    });
    
    // Extract sensitive environment variables
    const terraformVariables = repoData.terraformVariables || {};
    const envVars = extractSensitiveEnvVars(variables, terraformVariables);
    
    // Generate tfvars file content (excluding sensitive variables) AFTER download
    const tfvarsContent = generateTfvarsContent(variables);
    
    // Write tfvars file (this will overwrite any existing tfvars from repo)
    const tfvarsPath = path.join(deploymentDir, 'terraform.tfvars');
    await fs.writeFile(tfvarsPath, tfvarsContent);
    
    socket.emit('deployment-log', { 
      message: 'User variables configured', 
      timestamp: new Date().toISOString() 
    });
    
    // Create backend configuration if needed
    const backendCreated = await createBackendConfig(deploymentDir, envVars);
    
    if (backendCreated) {
      socket.emit('deployment-log', { 
        message: 'Backend configuration created', 
        timestamp: new Date().toISOString() 
      });
    }
    
    socket.emit('deployment-log', { 
      message: 'Preparing OpenTofu deployment...', 
      timestamp: new Date().toISOString() 
    });
    
    // Combine environment variables
    const tofuEnv = {
      ...process.env,
      ...envVars
    };
    
    
    // Start the deployment process
    startTerraformApply(deploymentDir, socket, tofuEnv);
    
    res.json({ success: true, deploymentId });
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

/**
 * Get deployment history
 */
app.get('/api/deployments', async (req, res) => {
  try {
    const deployments = await getDeploymentHistory();
    res.json(deployments);
  } catch (error) {
    console.error('Error getting deployment history:', error);
    res.status(500).json({ error: 'Failed to get deployment history' });
  }
});

/**
 * Get specific deployment metadata
 */
app.get('/api/deployments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deployment = await getDeploymentMetadata(id);
    res.json(deployment);
  } catch (error) {
    console.error('Error getting deployment metadata:', error);
    res.status(500).json({ error: 'Failed to get deployment metadata' });
  }
});

/**
 * Destroy a deployment
 */
app.post('/api/deployments/:id/destroy', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if deployment exists
    const deploymentDir = getDeploymentDir(id);
    try {
      await fs.access(deploymentDir);
    } catch (error) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    
    const socket = io.to(id);
    
    // Extract environment variables (similar to deploy)
    // For destroy, we need the same environment as the original deployment
    const envVars = {
      ...process.env,
      'TF_IN_AUTOMATION': 'true',
      'TF_INPUT': 'false'
    };
    
    // Start the destroy process
    destroyDeployment(id, socket, envVars);
    
    res.json({ success: true, deploymentId: id, action: 'destroy' });
  } catch (error) {
    console.error('Destroy error:', error);
    res.status(500).json({ error: 'Destroy failed' });
  }
});

/**
 * Delete a deployment directory (cleanup)
 */
app.delete('/api/deployments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await deleteDeploymentDirectory(id);
    
    if (success) {
      res.json({ success: true, message: 'Deployment directory deleted' });
    } else {
      res.status(500).json({ error: 'Failed to delete deployment directory' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Catch-all handler for SPA routing in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip API routes and static assets
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    // Only handle GET requests for HTML routes
    if (req.method === 'GET' && !req.path.includes('.')) {
      return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
    next();
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  socket.on('join-deployment', (deploymentId) => {
    socket.join(deploymentId);
  });
  
  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// Start server
// In production with nginx, always use port 3001 for Node.js app
// PORT env var is used for nginx configuration only
const PORT = process.env.NODE_ENV === 'production' ? 3001 : (process.env.PORT || 3001);

ensureDirectories().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});