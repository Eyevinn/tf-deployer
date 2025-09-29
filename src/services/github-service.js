/**
 * GitHub API service utilities
 * Handles GitHub repository parsing, file fetching, and repository downloads
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { parseTerraformVariables, parseReadmeForVariables, mergeAllVariables } from '../utils/terraform-parser.js';

/**
 * Parse a GitHub URL and extract repository information
 * @param {string} repoUrl - GitHub repository URL
 * @returns {Object} Parsed repository data with owner, repo, branch, and path
 */
function parseGitHubUrl(repoUrl) {
  const urlPattern = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/;
  const match = repoUrl.match(urlPattern);
  
  if (!match) {
    throw new Error('Invalid GitHub URL format');
  }
  
  const [, owner, repo, branch, path] = match;
  
  return { owner, repo, branch, path };
}

/**
 * Fetch repository contents from GitHub API
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name  
 * @param {string} branch - Branch name
 * @param {string} path - Path within repository
 * @returns {Array} Array of file objects from GitHub API
 */
async function fetchRepositoryContents(owner, repo, branch, path) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await axios.get(apiUrl, {
    params: { ref: branch }
  });
  
  return response.data;
}

/**
 * Download a file from GitHub
 * @param {string} downloadUrl - GitHub download URL for the file
 * @returns {string} File content
 */
async function downloadFile(downloadUrl) {
  const response = await axios.get(downloadUrl);
  return response.data;
}

/**
 * Parse a GitHub repository for Terraform variables
 * @param {string} repoUrl - GitHub repository URL
 * @returns {Object} Complete repository analysis with variables
 */
async function parseGitHubRepository(repoUrl) {
  const { owner, repo, branch, path } = parseGitHubUrl(repoUrl);
  
  const files = await fetchRepositoryContents(owner, repo, branch, path);
  
  // Get Terraform files (.tf)
  const terraformFiles = files.filter(file => file.name.endsWith('.tf'));
  
  if (terraformFiles.length === 0) {
    throw new Error('No .tf files found in the repository');
  }
  
  // Skip tfvars file parsing - only use Terraform files for variables
  const tfvarsFile = null;
  
  // Get README file
  const readmeFile = files.find(file => 
    /^readme\.(md|txt)$/i.test(file.name)
  );
  
  // Parse all Terraform files for variable definitions
  let terraformVariables = {};
  for (const tfFile of terraformFiles) {
    try {
      const tfContent = await downloadFile(tfFile.download_url);
      const fileVariables = parseTerraformVariables(tfContent, tfFile.name);
      terraformVariables = { ...terraformVariables, ...fileVariables };
    } catch (error) {
      // Silently skip files that cannot be fetched
    }
  }
  
  // Skip tfvars parsing - sensitive variables not provided during deployment
  let tfvarsVariables = {};
  
  // Parse README for additional documentation
  let readmeContent = '';
  let readmeVariables = {};
  
  if (readmeFile) {
    try {
      readmeContent = await downloadFile(readmeFile.download_url);
      readmeVariables = parseReadmeForVariables(readmeContent);
    } catch (error) {
      // Silently skip README if it cannot be fetched
    }
  }
  
  // Merge variables from all sources
  const mergedVariables = mergeAllVariables(terraformVariables, tfvarsVariables, readmeVariables);
  
  return {
    owner,
    repo,
    branch,
    path,
    terraformFiles: terraformFiles.map(f => f.name),
    tfvarsFile: tfvarsFile?.name || null,
    readmeFile: readmeFile?.name || null,
    variables: mergedVariables,
    terraformVariables,
    tfvarsVariables,
    readmeVariables,
    readmeContent: readmeContent.substring(0, 2000), // First 2000 chars for reference
    allFiles: files.map(f => ({ name: f.name, type: f.type }))
  };
}

/**
 * Set file permissions based on GitHub's mode field or file detection
 * @param {string} filePath - Path to the file
 * @param {string} [mode] - Optional GitHub mode field (e.g., "100644", "100755")
 */
async function setFilePermissions(filePath, mode) {
  let permissions;
  
  if (mode) {
    // Convert GitHub mode to octal permissions
    // GitHub mode format: "100644" where last 3 digits are permissions
    permissions = parseInt(mode.slice(-3), 8);
    
    // Special handling for executable files
    if (mode === '100755') {
      // Executable file: 755 (rwxr-xr-x)
      permissions = 0o755;
    } else if (mode === '100644') {
      // Regular file: 644 (rw-r--r--)
      permissions = 0o644;
    }
  } else {
    // Default permissions when GitHub mode is not available
    permissions = 0o644; // Regular file permissions as default
  }
  
  // Additional check for script files by extension and common shell script names
  const fileName = path.basename(filePath);
  const scriptExtensions = ['.sh', '.bash', '.zsh', '.ksh', '.csh', '.fish', '.py', '.pl', '.rb', '.js', '.ts', '.run', '.command'];
  const commonScriptNames = ['install', 'setup', 'configure', 'deploy', 'build', 'start', 'stop', 'restart'];
  
  const isScriptFile = scriptExtensions.some(ext => fileName.endsWith(ext)) ||
                      commonScriptNames.some(name => fileName.toLowerCase() === name) ||
                      fileName.startsWith('install') ||
                      fileName.startsWith('setup') ||
                      fileName.startsWith('deploy');
  
  // Always make script files executable regardless of original permissions
  if (isScriptFile) {
    permissions = 0o755;
  }
  
  try {
    await fs.chmod(filePath, permissions);
    
    // Log when script files are made executable for debugging
    if (isScriptFile) {
      console.log(`Set executable permissions for script file: ${fileName}`);
    }
  } catch (error) {
    // Don't fail the entire process if permission setting fails
    // This might happen on some file systems or platforms that don't support chmod
    console.log(`Warning: Could not set permissions for ${fileName}: ${error.message}`);
  }
}

/**
 * Download repository files to a local directory
 * @param {Object} repoData - Repository data object
 * @param {string} targetDir - Target directory to download files to
 */
async function downloadRepository(repoData, targetDir) {
  const { owner, repo, branch, path: repoPath } = repoData;
  
  const files = await fetchRepositoryContents(owner, repo, branch, repoPath);
  
  for (const file of files) {
    if (file.type === 'file') {
      const fileContent = await downloadFile(file.download_url);
      const filePath = path.join(targetDir, file.name);
      await fs.writeFile(filePath, fileContent);
      
      // Set file permissions (use GitHub mode if available, otherwise detect scripts)
      await setFilePermissions(filePath, file.mode);
    }
  }
}

export {
  parseGitHubUrl,
  fetchRepositoryContents,
  downloadFile,
  parseGitHubRepository,
  downloadRepository,
  setFilePermissions
};