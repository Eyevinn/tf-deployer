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
      console.log(`Could not fetch ${tfFile.name}:`, error.message);
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
      console.log('Could not fetch README:', error.message);
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
    }
  }
}

export {
  parseGitHubUrl,
  fetchRepositoryContents,
  downloadFile,
  parseGitHubRepository,
  downloadRepository
};