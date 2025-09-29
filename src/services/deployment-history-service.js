/**
 * Deployment history service
 * Handles listing, managing, and destroying deployments
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getDeploymentsDir, getDeploymentDir } from '../utils/file-utils.js';

/**
 * Get list of all deployments with metadata
 * @returns {Array} Array of deployment objects
 */
async function getDeploymentHistory() {
  try {
    const deploymentsDir = getDeploymentsDir();
    const deploymentDirs = await fs.readdir(deploymentsDir);
    
    const deployments = [];
    
    for (const deploymentId of deploymentDirs) {
      const deploymentPath = path.join(deploymentsDir, deploymentId);
      
      try {
        const stats = await fs.stat(deploymentPath);
        
        if (stats.isDirectory()) {
          const deployment = await getDeploymentMetadata(deploymentId);
          deployments.push(deployment);
        }
      } catch (error) {
        // Skip if unable to read deployment directory
        console.warn(`Unable to read deployment ${deploymentId}:`, error.message);
      }
    }
    
    // Sort by creation time (newest first)
    deployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return deployments;
  } catch (error) {
    console.error('Error getting deployment history:', error);
    return [];
  }
}

/**
 * Get metadata for a specific deployment
 * @param {string} deploymentId - Deployment ID
 * @returns {Object} Deployment metadata
 */
async function getDeploymentMetadata(deploymentId) {
  const deploymentPath = getDeploymentDir(deploymentId);
  
  try {
    const stats = await fs.stat(deploymentPath);
    const files = await fs.readdir(deploymentPath);
    
    // Check for Terraform files and state
    const terraformFiles = files.filter(f => f.endsWith('.tf'));
    const tfvarsFiles = files.filter(f => f.endsWith('.tfvars'));
    const stateFiles = files.filter(f => f.includes('terraform.tfstate'));
    const lockFiles = files.filter(f => f.includes('.terraform.lock.hcl'));
    
    // Try to read tfvars to get some deployment info
    let variables = {};
    if (tfvarsFiles.length > 0) {
      try {
        const tfvarsContent = await fs.readFile(path.join(deploymentPath, tfvarsFiles[0]), 'utf-8');
        variables = parseTfvarsContent(tfvarsContent);
      } catch (error) {
        // Ignore tfvars parsing errors
      }
    }
    
    // Try to read README for additional context
    let description = '';
    const readmeFile = files.find(f => /^readme\.(md|txt)$/i.test(f));
    if (readmeFile) {
      try {
        const readmeContent = await fs.readFile(path.join(deploymentPath, readmeFile), 'utf-8');
        // Extract first line or first paragraph as description
        const firstLine = readmeContent.split('\n').find(line => line.trim().length > 0);
        if (firstLine) {
          description = firstLine.replace(/^#+\s*/, '').substring(0, 200);
        }
      } catch (error) {
        // Ignore README parsing errors
      }
    }
    
    // Check if deployment has state (is active)
    const hasState = stateFiles.length > 0;
    const isInitialized = lockFiles.length > 0;
    
    return {
      id: deploymentId,
      createdAt: stats.birthtime.toISOString(),
      lastModified: stats.mtime.toISOString(),
      description: description || 'No description available',
      terraformFiles: terraformFiles.length,
      variables: Object.keys(variables).length,
      hasState,
      isInitialized,
      files: files.length,
      size: await getDirectorySize(deploymentPath)
    };
  } catch (error) {
    return {
      id: deploymentId,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      description: 'Error reading deployment metadata',
      terraformFiles: 0,
      variables: 0,
      hasState: false,
      isInitialized: false,
      files: 0,
      size: 0,
      error: error.message
    };
  }
}

/**
 * Parse tfvars content to extract variable names
 * @param {string} content - Tfvars file content
 * @returns {Object} Parsed variables
 */
function parseTfvarsContent(content) {
  const variables = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (match) {
        variables[match[1]] = match[2];
      }
    }
  }
  
  return variables;
}

/**
 * Get directory size recursively
 * @param {string} dirPath - Directory path
 * @returns {number} Size in bytes
 */
async function getDirectorySize(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    return 0;
  }
}

/**
 * Destroy a deployment using OpenTofu destroy
 * @param {string} deploymentId - Deployment ID
 * @param {Object} socket - Socket.io socket for real-time communication
 * @param {Object} fullEnv - Complete environment variables
 */
function destroyDeployment(deploymentId, socket, fullEnv = process.env) {
  const deploymentDir = getDeploymentDir(deploymentId);
  
  socket.emit('deployment-log', { 
    message: `Starting destruction of deployment ${deploymentId}...`, 
    timestamp: new Date().toISOString() 
  });
  
  // Run tofu destroy
  const tofuDestroy = spawn('tofu', ['destroy', '-auto-approve'], {
    cwd: deploymentDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: fullEnv
  });
  
  tofuDestroy.stdout.on('data', (data) => {
    const message = data.toString();
    socket.emit('deployment-log', { 
      message, 
      timestamp: new Date().toISOString() 
    });
  });
  
  tofuDestroy.stderr.on('data', (data) => {
    const message = data.toString();
    socket.emit('deployment-error', { 
      message, 
      timestamp: new Date().toISOString() 
    });
  });
  
  tofuDestroy.on('close', (code) => {
    if (code === 0) {
      socket.emit('deployment-complete', { 
        success: true, 
        message: `Deployment ${deploymentId} destroyed successfully`,
        timestamp: new Date().toISOString() 
      });
    } else {
      socket.emit('deployment-complete', { 
        success: false, 
        message: `Destruction of deployment ${deploymentId} failed with exit code ${code}`,
        timestamp: new Date().toISOString() 
      });
    }
  });
}

/**
 * Delete a deployment directory (cleanup after destroy)
 * @param {string} deploymentId - Deployment ID
 */
async function deleteDeploymentDirectory(deploymentId) {
  const deploymentDir = getDeploymentDir(deploymentId);
  
  try {
    await fs.rm(deploymentDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Error deleting deployment directory ${deploymentId}:`, error);
    return false;
  }
}

export {
  getDeploymentHistory,
  getDeploymentMetadata,
  destroyDeployment,
  deleteDeploymentDirectory
};