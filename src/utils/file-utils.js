/**
 * File system utilities
 * Handles directory creation and file management for the application
 * 
 * Environment Variables:
 * - TEMP_DIR: Custom temporary directory (defaults to ./temp)
 * - DEPLOYMENTS_DIR: Custom deployments directory (defaults to ./deployments)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory constants with environment variable support
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, '../../temp');
const DEPLOYMENTS_DIR = process.env.DEPLOYMENTS_DIR || path.join(__dirname, '../../deployments');

/**
 * Ensure required directories exist
 * Creates temp and deployments directories if they don't exist
 */
async function ensureDirectories() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(DEPLOYMENTS_DIR, { recursive: true });
    
    console.log(`Using TEMP_DIR: ${TEMP_DIR}`);
    console.log(`Using DEPLOYMENTS_DIR: ${DEPLOYMENTS_DIR}`);
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

/**
 * Get the temp directory path
 * @returns {string} Temp directory path
 */
function getTempDir() {
  return TEMP_DIR;
}

/**
 * Get the deployments directory path
 * @returns {string} Deployments directory path
 */
function getDeploymentsDir() {
  return DEPLOYMENTS_DIR;
}

/**
 * Generate a unique deployment directory path
 * @param {string} deploymentId - Unique deployment identifier
 * @returns {string} Full path to deployment directory
 */
function getDeploymentDir(deploymentId) {
  return path.join(DEPLOYMENTS_DIR, deploymentId);
}

export {
  ensureDirectories,
  getTempDir,
  getDeploymentsDir,
  getDeploymentDir,
  TEMP_DIR,
  DEPLOYMENTS_DIR
};