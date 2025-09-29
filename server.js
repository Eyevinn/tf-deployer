import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import http from 'http';
import { Server as SocketIo } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

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

const TEMP_DIR = path.join(__dirname, 'temp');
const DEPLOYMENTS_DIR = path.join(__dirname, 'deployments');

async function ensureDirectories() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(DEPLOYMENTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

app.post('/api/parse-github-url', async (req, res) => {
  try {
    const { repoUrl } = req.body;
    
    const urlPattern = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/;
    const match = repoUrl.match(urlPattern);
    
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub URL format' });
    }
    
    const [, owner, repo, branch, path] = match;
    
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(apiUrl, {
      params: { ref: branch }
    });
    
    const files = response.data;
    
    // Get Terraform files (.tf)
    const terraformFiles = files.filter(file => file.name.endsWith('.tf'));
    
    if (terraformFiles.length === 0) {
      return res.status(404).json({ error: 'No .tf files found in the repository' });
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
        const tfResponse = await axios.get(tfFile.download_url);
        const tfContent = tfResponse.data;
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
        const readmeResponse = await axios.get(readmeFile.download_url);
        readmeContent = readmeResponse.data;
        readmeVariables = parseReadmeForVariables(readmeContent);
      } catch (error) {
        console.log('Could not fetch README:', error.message);
      }
    }
    
    // Merge variables from all sources
    const mergedVariables = mergeAllVariables(terraformVariables, tfvarsVariables, readmeVariables);
    
    res.json({
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
    });
    
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    res.status(500).json({ error: 'Failed to parse GitHub repository' });
  }
});

function parseTerraformVariables(content, fileName) {
  const variables = {};
  
  // Remove comments and normalize whitespace
  const cleanContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
    .replace(/\/\/.*$/gm, '') // Remove // comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Regex to match variable blocks
  const variableRegex = /variable\s+"([^"]+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  
  let match;
  while ((match = variableRegex.exec(cleanContent)) !== null) {
    const [, variableName, blockContent] = match;
    
    const variable = {
      name: variableName,
      source: 'terraform',
      file: fileName,
      type: 'string', // default
      description: '',
      default: null,
      sensitive: false,
      nullable: true,
      validation: []
    };
    
    // Parse type
    const typeMatch = blockContent.match(/type\s*=\s*([^\s\n]+)/);
    if (typeMatch) {
      variable.type = typeMatch[1].trim();
    }
    
    // Parse description
    const descriptionMatch = blockContent.match(/description\s*=\s*"([^"]*)"/) || 
                           blockContent.match(/description\s*=\s*'([^']*)'/);
    if (descriptionMatch) {
      variable.description = descriptionMatch[1];
    }
    
    // Parse default value - handle quoted strings and simple values
    const defaultMatch = blockContent.match(/default\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s\n]+)/);
    if (defaultMatch) {
      let defaultValue = defaultMatch[1].trim();
      
      // Parse the default value based on type
      if (defaultValue === 'null') {
        variable.default = null;
      } else if (defaultValue === 'true' || defaultValue === 'false') {
        variable.default = defaultValue === 'true';
      } else if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
        variable.default = defaultValue.slice(1, -1);
      } else if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
        variable.default = defaultValue.slice(1, -1);
      } else if (!isNaN(Number(defaultValue))) {
        variable.default = Number(defaultValue);
      } else if (defaultValue.startsWith('[') || defaultValue.startsWith('{')) {
        // For complex types, store as string for now
        variable.default = defaultValue;
      } else {
        variable.default = defaultValue;
      }
    }
    
    // Parse sensitive
    const sensitiveMatch = blockContent.match(/sensitive\s*=\s*(true|false)/);
    if (sensitiveMatch) {
      variable.sensitive = sensitiveMatch[1] === 'true';
    }
    
    // Parse nullable
    const nullableMatch = blockContent.match(/nullable\s*=\s*(true|false)/);
    if (nullableMatch) {
      variable.nullable = nullableMatch[1] === 'true';
    }
    
    // Determine the display type for UI
    let displayType = 'string';
    if (variable.type === 'bool' || variable.type === 'boolean') {
      displayType = 'boolean';
    } else if (variable.type === 'number') {
      displayType = 'number';
    } else if (variable.type.includes('list') || variable.type.includes('set')) {
      displayType = 'array';
    } else if (variable.type.includes('map') || variable.type.includes('object')) {
      displayType = 'object';
    }
    
    variables[variableName] = {
      value: variable.default,
      type: displayType,
      original: variable.default,
      description: variable.description,
      source: 'terraform',
      file: fileName,
      terraformType: variable.type,
      sensitive: variable.sensitive,
      nullable: variable.nullable,
      required: variable.default === null && !variable.nullable
    };
  }
  
  return variables;
}

function parseTfvarsContent(content) {
  const variables = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      let parsedValue = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      
      if (parsedValue === 'true' || parsedValue === 'false') {
        parsedValue = parsedValue === 'true';
      } else if (!isNaN(parsedValue) && parsedValue !== '') {
        parsedValue = Number(parsedValue);
      }
      
      variables[key] = {
        value: parsedValue,
        type: typeof parsedValue,
        original: value,
        source: 'tfvars'
      };
    }
  }
  
  return variables;
}

function parseReadmeForVariables(content) {
  const variables = {};
  
  // Patterns to look for variable definitions in README
  const patterns = [
    // Pattern 1: | variable_name | description | type | default |
    /\|\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g,
    
    // Pattern 2: - `variable_name` - description (default: value)
    /[-*]\s*`([a-zA-Z_][a-zA-Z0-9_]*)`\s*[-:]?\s*([^(]+)(?:\(default:\s*([^)]+)\))?/g,
    
    // Pattern 3: variable_name: description (Default: value)
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([^(]+)(?:\(Default:\s*([^)]+)\))?/gm,
    
    // Pattern 4: ## variable_name or ### variable_name
    /^#{2,3}\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/gm
  ];
  
  // Extract variables from table format
  let match;
  while ((match = patterns[0].exec(content)) !== null) {
    const [, name, description, type, defaultValue] = match;
    if (name && !name.toLowerCase().includes('variable')) { // Skip header rows
      variables[name] = {
        value: parseDefaultValue(defaultValue),
        type: inferType(type, defaultValue),
        description: description.trim(),
        source: 'readme',
        original: defaultValue
      };
    }
  }
  
  // Extract from bullet points
  patterns[0].lastIndex = 0;
  while ((match = patterns[1].exec(content)) !== null) {
    const [, name, description, defaultValue] = match;
    if (!variables[name]) {
      variables[name] = {
        value: parseDefaultValue(defaultValue),
        type: inferType('', defaultValue),
        description: description.trim(),
        source: 'readme',
        original: defaultValue || ''
      };
    }
  }
  
  // Extract from colon format
  patterns[1].lastIndex = 0;
  while ((match = patterns[2].exec(content)) !== null) {
    const [, name, description, defaultValue] = match;
    if (!variables[name]) {
      variables[name] = {
        value: parseDefaultValue(defaultValue),
        type: inferType('', defaultValue),
        description: description.trim(),
        source: 'readme',
        original: defaultValue || ''
      };
    }
  }
  
  return variables;
}

function parseDefaultValue(value) {
  if (!value || value.trim() === '' || value.trim() === '-') {
    return '';
  }
  
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true';
  }
  
  if (!isNaN(trimmed) && trimmed !== '') {
    return Number(trimmed);
  }
  
  return trimmed;
}

function inferType(typeHint, defaultValue) {
  if (typeHint) {
    const hint = typeHint.toLowerCase().trim();
    if (hint.includes('bool') || hint.includes('boolean')) return 'boolean';
    if (hint.includes('number') || hint.includes('int')) return 'number';
    if (hint.includes('string')) return 'string';
  }
  
  if (defaultValue) {
    const parsed = parseDefaultValue(defaultValue);
    return typeof parsed;
  }
  
  return 'string';
}

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

function mergeAllVariables(terraformVariables, tfvarsVariables, readmeVariables) {
  const merged = {};
  
  // Start with Terraform variables as the primary source
  Object.entries(terraformVariables).forEach(([key, terraformVar]) => {
    merged[key] = {
      ...terraformVar,
      sources: ['terraform']
    };
    
    // Skip tfvars processing - only use Terraform and README sources
    
    // Enhance description from README if available and not already set
    if (readmeVariables[key] && readmeVariables[key].description && !merged[key].description) {
      merged[key].description = readmeVariables[key].description;
      if (!merged[key].sources.includes('readme')) {
        merged[key].sources.push('readme');
      }
    }
  });
  
  // Skip tfvars-only variables processing since we're not parsing tfvars
  
  // Add variables that are only in README (documentation-only)
  Object.entries(readmeVariables).forEach(([key, readmeVar]) => {
    if (!merged[key]) {
      merged[key] = {
        ...readmeVar,
        sources: ['readme'],
        required: false // README-only variables are documentation
      };
    }
  });
  
  return merged;
}

// Keep the old function for backward compatibility if needed
function mergeVariables(tfvarsVariables, readmeVariables) {
  const merged = { ...readmeVariables };
  
  // tfvars takes precedence, but we add description from README if available
  Object.entries(tfvarsVariables).forEach(([key, tfvarsVar]) => {
    if (merged[key]) {
      // Merge: use tfvars value but keep README description
      merged[key] = {
        ...tfvarsVar,
        description: readmeVariables[key].description || '',
        sources: ['tfvars', 'readme']
      };
    } else {
      // Only in tfvars
      merged[key] = {
        ...tfvarsVar,
        sources: ['tfvars']
      };
    }
  });
  
  // Mark README-only variables
  Object.entries(readmeVariables).forEach(([key, readmeVar]) => {
    if (!tfvarsVariables[key]) {
      merged[key] = {
        ...readmeVar,
        sources: ['readme']
      };
    }
  });
  
  return merged;
}

app.post('/api/deploy', async (req, res) => {
  try {
    const { repoData, variables, deploymentId } = req.body;
    
    if (!deploymentId) {
      return res.status(400).json({ error: 'Deployment ID is required' });
    }
    
    const deploymentDir = path.join(DEPLOYMENTS_DIR, deploymentId);
    await fs.mkdir(deploymentDir, { recursive: true });
    
    await downloadRepository(repoData, deploymentDir);
    
    // Extract environment variables for sensitive variables and system config
    // Use original Terraform variables from repoData for sensitive flag detection
    const terraformVariables = repoData.terraformVariables || {};
    const envVars = extractSensitiveEnvVars(variables, terraformVariables);
    
    const tfvarsPath = path.join(deploymentDir, 'terraform.tfvars');
    const tfvarsContent = generateTfvarsContent(variables);
    
    await fs.writeFile(tfvarsPath, tfvarsContent);
    
    const socket = io.to(deploymentId);
    
    // Create backend configuration if needed
    const backendCreated = await createBackendConfig(deploymentDir, envVars);
    if (backendCreated) {
      socket.emit('deployment-log', { 
        message: 'Created backend configuration for state management', 
        timestamp: new Date().toISOString() 
      });
    }
    
    socket.emit('deployment-log', { 
      message: 'Repository downloaded and terraform.tfvars created', 
      timestamp: new Date().toISOString() 
    });
    
    socket.emit('deployment-log', { 
      message: `Generated terraform.tfvars:\n${tfvarsContent}`, 
      timestamp: new Date().toISOString() 
    });
    
    socket.emit('deployment-log', { 
      message: 'Initializing Terraform...', 
      timestamp: new Date().toISOString() 
    });
    
    // Debug: Log all variables being processed
    socket.emit('deployment-log', { 
      message: `Debug: Processing ${Object.keys(variables).length} variables: ${Object.keys(variables).join(', ')}`, 
      timestamp: new Date().toISOString() 
    });
    
    // Debug: Show detailed structure of each variable
    Object.entries(variables).forEach(([key, info]) => {
      socket.emit('deployment-log', { 
        message: `Debug: ${key} - type: ${typeof info}, isObject: ${typeof info === 'object' && info !== null}`, 
        timestamp: new Date().toISOString() 
      });
      
      if (info && typeof info === 'object' && info !== null) {
        socket.emit('deployment-log', { 
          message: `Debug: ${key} structure: sensitive=${info.sensitive}, value=${info.value ? '[SET]' : '[EMPTY]'}, type=${info.type}`, 
          timestamp: new Date().toISOString() 
        });
        
        // Show all properties of the object
        socket.emit('deployment-log', { 
          message: `Debug: ${key} all properties: ${JSON.stringify(info)}`, 
          timestamp: new Date().toISOString() 
        });
      } else {
        socket.emit('deployment-log', { 
          message: `Debug: ${key} value: ${JSON.stringify(info)}`, 
          timestamp: new Date().toISOString() 
        });
      }
    });
    
    // Debug: Show original Terraform variables structure
    socket.emit('deployment-log', { 
      message: `Debug: Original Terraform variables: ${Object.keys(terraformVariables).join(', ')}`, 
      timestamp: new Date().toISOString() 
    });
    
    Object.entries(terraformVariables).forEach(([key, info]) => {
      if (info) {
        socket.emit('deployment-log', { 
          message: `Debug: TF ${key} - sensitive: ${info.sensitive}, required: ${info.required}`, 
          timestamp: new Date().toISOString() 
        });
      }
    });
    
    // Debug: Show which variables are marked as sensitive using original TF definitions
    const sensitiveVarNames = Object.entries(variables)
      .filter(([key, userValue]) => {
        const terraformVar = terraformVariables[key];
        return terraformVar && terraformVar.sensitive === true;
      })
      .map(([key]) => key);
    
    if (sensitiveVarNames.length > 0) {
      socket.emit('deployment-log', { 
        message: `Debug: Variables marked as sensitive in TF: ${sensitiveVarNames.join(', ')}`, 
        timestamp: new Date().toISOString() 
      });
    } else {
      socket.emit('deployment-log', { 
        message: `Debug: No variables marked as sensitive in TF definitions!`, 
        timestamp: new Date().toISOString() 
      });
    }
    
    // Log environment variables being set (categorize them)
    const envVarNames = Object.keys(envVars);
    if (envVarNames.length > 0) {
      const systemVars = envVarNames.filter(name => !name.startsWith('TF_VAR_'));
      const sensitiveVars = envVarNames.filter(name => name.startsWith('TF_VAR_'));
      
      if (systemVars.length > 0) {
        socket.emit('deployment-log', { 
          message: `Using Terraform system environment variables: ${systemVars.join(', ')}`, 
          timestamp: new Date().toISOString() 
        });
      }
      
      if (sensitiveVars.length > 0) {
        socket.emit('deployment-log', { 
          message: `Setting sensitive variables as environment variables: ${sensitiveVars.join(', ')}`, 
          timestamp: new Date().toISOString() 
        });
      }
      
      // Debug: Show actual values being set (only for debugging)
      Object.entries(envVars).forEach(([key, value]) => {
        if (key.startsWith('TF_VAR_')) {
          socket.emit('deployment-log', { 
            message: `Debug: ${key}=${value ? '[SET]' : '[EMPTY]'}`, 
            timestamp: new Date().toISOString() 
          });
        }
      });
    } else {
      socket.emit('deployment-log', { 
        message: 'Debug: No environment variables extracted', 
        timestamp: new Date().toISOString() 
      });
    }
    
    // Debug: Show exactly what environment will be passed to tofu
    const tofuEnv = { ...process.env, ...envVars };
    const tofuEnvVars = Object.keys(tofuEnv).filter(key => key.startsWith('TF_VAR_') || key.startsWith('TF_'));
    
    if (tofuEnvVars.length > 0) {
      socket.emit('deployment-log', { 
        message: `Debug: Environment variables that will be passed to tofu: ${tofuEnvVars.join(', ')}`, 
        timestamp: new Date().toISOString() 
      });
      
      // Show specific TF_VAR_ variables and their status
      tofuEnvVars.filter(key => key.startsWith('TF_VAR_')).forEach(key => {
        const hasValue = tofuEnv[key] && tofuEnv[key].length > 0;
        socket.emit('deployment-log', { 
          message: `Debug: ${key}=${hasValue ? '[HAS_VALUE]' : '[EMPTY]'}`, 
          timestamp: new Date().toISOString() 
        });
      });
    }
    
    // First run terraform init
    const init = spawn('tofu', ['init'], {
      cwd: deploymentDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: tofuEnv
    });
    
    init.stdout.on('data', (data) => {
      const message = data.toString();
      socket.emit('deployment-log', { 
        message, 
        timestamp: new Date().toISOString() 
      });
    });
    
    init.stderr.on('data', (data) => {
      const message = data.toString();
      socket.emit('deployment-error', { 
        message, 
        timestamp: new Date().toISOString() 
      });
    });
    
    init.on('close', (code) => {
      if (code === 0) {
        socket.emit('deployment-log', { 
          message: 'Terraform initialization completed. Starting deployment...', 
          timestamp: new Date().toISOString() 
        });
        
        // Start the apply process
        startTerraformApply(deploymentDir, socket, tofuEnv);
      } else {
        socket.emit('deployment-complete', { 
          success: false, 
          message: `Terraform initialization failed with exit code ${code}`,
          timestamp: new Date().toISOString() 
        });
      }
    });
    
    res.json({ success: true, deploymentId });
    
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

async function downloadRepository(repoData, targetDir) {
  const { owner, repo, branch, path: repoPath } = repoData;
  
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
  const response = await axios.get(apiUrl, {
    params: { ref: branch }
  });
  
  const files = response.data;
  
  for (const file of files) {
    if (file.type === 'file') {
      const fileResponse = await axios.get(file.download_url);
      const filePath = path.join(targetDir, file.name);
      await fs.writeFile(filePath, fileResponse.data);
    }
  }
}

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

const PORT = process.env.PORT || 3001;

ensureDirectories().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});