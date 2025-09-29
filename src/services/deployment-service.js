/**
 * Deployment service for Terraform/OpenTofu operations
 * Handles deployment execution, environment variables, and tfvars generation
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Extract sensitive environment variables for Terraform/OpenTofu
 * @param {Object} variables - User-provided variables
 * @param {Object} terraformVariables - Original Terraform variable definitions
 * @returns {Object} Environment variables object
 */
function extractSensitiveEnvVars(variables, terraformVariables = {}) {
  const envVars = {};
  
  // Add common Terraform environment variables for backend configuration
  const terraformSystemEnvVars = [
    'TF_DATA_DIR',           // Directory for Terraform data
    'TF_WORKSPACE',          // Terraform workspace
    'TF_IN_AUTOMATION',      // Flag for automation mode
    'TF_INPUT',              // Disable interactive input
    'TF_CLI_CONFIG_FILE',    // CLI configuration file location
    'TF_PLUGIN_CACHE_DIR',   // Plugin cache directory
    'TF_REGISTRY_DISCOVERY_RETRY', // Registry discovery retry
    'TF_REGISTRY_CLIENT_TIMEOUT',  // Registry client timeout
    
    // Backend-specific environment variables
    'TF_BACKEND_CONFIG',     // Backend configuration
    'TF_FORCE_LOCAL_BACKEND', // Force local backend
    'TF_SKIP_REMOTE_TESTS',  // Skip remote tests
    
    // State locking and storage
    'TF_STATE_LOCK',         // Enable/disable state locking
    'TF_STATE_LOCK_TIMEOUT', // State lock timeout
    'TF_LOCK_TIMEOUT',       // Lock timeout
    
    // Cloud/remote backend variables
    'TF_CLOUD_ORGANIZATION', // Terraform Cloud organization
    'TF_CLOUD_HOSTNAME',     // Terraform Cloud hostname
    'TF_TOKEN',              // Terraform Cloud token
    'TF_TOKEN_app_terraform_io', // Terraform Cloud app token
    
    // Provider-specific variables that might affect state
    'AWS_PROFILE', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
    'AZURE_SUBSCRIPTION_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_PROJECT', 'GOOGLE_REGION',
    'CONSUL_HTTP_ADDR', 'CONSUL_HTTP_TOKEN',
    'ETCDV3_ENDPOINTS'
  ];
  
  // Include system Terraform environment variables if they exist
  terraformSystemEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      envVars[envVar] = process.env[envVar];
    }
  });
  
  // Set default values for automation
  envVars['TF_IN_AUTOMATION'] = 'true';
  envVars['TF_INPUT'] = 'false';
  
  // Extract variables marked as sensitive using original Terraform definitions
  Object.entries(variables).forEach(([key, userValue]) => {
    // Check if this variable is marked as sensitive in the original Terraform definition
    const terraformVar = terraformVariables[key];
    if (terraformVar && terraformVar.sensitive === true) {
      // Get the user-provided value
      const value = (userValue && typeof userValue === 'object' && userValue.value !== undefined) 
        ? userValue.value 
        : userValue;
      
      // Always pass sensitive variables as environment variables
      // For required variables without values, pass empty string to let Terraform handle the error gracefully
      const envValue = (value !== null && value !== undefined && value !== '') ? value : '';
      envVars[`TF_VAR_${key}`] = envValue;
    }
  });
  
  return envVars;
}

/**
 * Create backend configuration file if needed
 * @param {string} deploymentDir - Deployment directory path
 * @param {Object} envVars - Environment variables
 * @returns {boolean} Whether backend config was created
 */
async function createBackendConfig(deploymentDir, envVars) {
  // Create a basic backend configuration if TF_DATA_DIR is set
  if (envVars.TF_DATA_DIR) {
    const backendConfig = `
# Auto-generated backend configuration for state management
terraform {
  backend "local" {
    path = "${envVars.TF_DATA_DIR}/terraform.tfstate"
  }
}
`;
    
    const backendPath = path.join(deploymentDir, 'backend.tf');
    await fs.writeFile(backendPath, backendConfig);
    return true;
  }
  
  return false;
}

/**
 * Generate tfvars file content from variables
 * @param {Object} variables - Variables object
 * @returns {string} Terraform variables file content
 */
function generateTfvarsContent(variables) {
  const lines = [];
  
  Object.entries(variables).forEach(([key, variableInfo]) => {
    // Handle null or undefined variableInfo
    if (!variableInfo) {
      return;
    }
    
    // Skip sensitive variables - they'll always be passed as environment variables now
    if (variableInfo.sensitive === true) {
      return;
    }
    
    // Extract the actual value - handle both object format and direct value format
    const value = (typeof variableInfo === 'object' && variableInfo.value !== undefined) 
      ? variableInfo.value 
      : variableInfo;
    let formattedValue;
    
    if (value === null || value === undefined) {
      formattedValue = 'null';
    } else if (typeof value === 'boolean') {
      formattedValue = value.toString();
    } else if (typeof value === 'number') {
      formattedValue = value.toString();
    } else if (typeof value === 'string') {
      // Escape quotes and handle multiline strings
      const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      formattedValue = `"${escapedValue}"`;
    } else if (Array.isArray(value)) {
      // Handle arrays/lists
      const arrayItems = value.map(item => {
        if (typeof item === 'string') {
          return `"${item.replace(/"/g, '\\"')}"`;
        }
        return item.toString();
      });
      formattedValue = `[${arrayItems.join(', ')}]`;
    } else if (typeof value === 'object') {
      // Handle objects/maps - convert to HCL format
      try {
        const objItems = Object.entries(value).map(([k, v]) => {
          const formattedKey = k.includes('-') || k.includes(' ') ? `"${k}"` : k;
          let formattedObjValue;
          if (typeof v === 'string') {
            formattedObjValue = `"${v.replace(/"/g, '\\"')}"`;
          } else {
            formattedObjValue = v.toString();
          }
          return `${formattedKey} = ${formattedObjValue}`;
        });
        formattedValue = `{\n  ${objItems.join('\n  ')}\n}`;
      } catch (error) {
        // Fallback to string representation
        formattedValue = `"${JSON.stringify(value).replace(/"/g, '\\"')}"`;
      }
    } else {
      // Fallback for any other type
      formattedValue = `"${value.toString()}"`;
    }
    
    lines.push(`${key} = ${formattedValue}`);
  });
  
  return lines.join('\n') + '\n'; // Ensure file ends with newline
}

/**
 * Start Terraform/OpenTofu apply process
 * @param {string} deploymentDir - Deployment directory path
 * @param {Object} socket - Socket.io socket for real-time communication
 * @param {Object} fullEnv - Complete environment variables
 */
function startTerraformApply(deploymentDir, socket, fullEnv = process.env) {
  // Debug: Test if tofu can see the environment variables
  socket.emit('deployment-log', { 
    message: 'Debug: Testing if tofu can see environment variables...', 
    timestamp: new Date().toISOString() 
  });
  
  const envTest = spawn('tofu', ['console'], {
    cwd: deploymentDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: fullEnv
  });
  
  // Send a command to check if variables are accessible
  const tfVarNames = Object.keys(fullEnv).filter(key => key.startsWith('TF_VAR_'));
  if (tfVarNames.length > 0) {
    const testCommands = tfVarNames.map(name => `var.${name.substring(7)}`).join('\n') + '\nexit\n';
    envTest.stdin.write(testCommands);
    envTest.stdin.end();
  } else {
    envTest.stdin.write('exit\n');
    envTest.stdin.end();
  }
  
  envTest.stdout.on('data', (data) => {
    const message = data.toString();
    if (message.trim() && !message.includes('exit')) {
      socket.emit('deployment-log', { 
        message: `Debug: Variable test result: ${message.trim()}`, 
        timestamp: new Date().toISOString() 
      });
    }
  });
  
  envTest.on('close', (code) => {
    socket.emit('deployment-log', { 
      message: 'Debug: Starting actual deployment...', 
      timestamp: new Date().toISOString() 
    });
    
    // Now run the actual apply
    const tofu = spawn('tofu', ['apply', '-auto-approve', '-var-file=terraform.tfvars'], {
      cwd: deploymentDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: fullEnv
    });
    
    tofu.stdout.on('data', (data) => {
      const message = data.toString();
      socket.emit('deployment-log', { 
        message, 
        timestamp: new Date().toISOString() 
      });
    });
    
    tofu.stderr.on('data', (data) => {
      const message = data.toString();
      socket.emit('deployment-error', { 
        message, 
        timestamp: new Date().toISOString() 
      });
    });
    
    tofu.on('close', (code) => {
      if (code === 0) {
        socket.emit('deployment-complete', { 
          success: true, 
          message: 'Deployment completed successfully',
          timestamp: new Date().toISOString() 
        });
      } else {
        socket.emit('deployment-complete', { 
          success: false, 
          message: `Deployment failed with exit code ${code}`,
          timestamp: new Date().toISOString() 
        });
      }
    });
  });
}

export {
  extractSensitiveEnvVars,
  createBackendConfig,
  generateTfvarsContent,
  startTerraformApply
};