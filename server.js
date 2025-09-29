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
    
    // Get optional tfvars file for default values
    const tfvarsFile = files.find(file => 
      file.name.endsWith('.tfvars') || file.name.endsWith('.tfvars.example')
    );
    
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
    
    // Parse tfvars for default values if available
    let tfvarsVariables = {};
    if (tfvarsFile) {
      try {
        const tfvarsResponse = await axios.get(tfvarsFile.download_url);
        const tfvarsContent = tfvarsResponse.data;
        tfvarsVariables = parseTfvarsContent(tfvarsContent);
      } catch (error) {
        console.log('Could not fetch tfvars file:', error.message);
      }
    }
    
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
    
    // Parse default value
    const defaultMatch = blockContent.match(/default\s*=\s*([^,}\n]+)/);
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

function startTerraformApply(deploymentDir, socket) {
  const tofu = spawn('tofu', ['apply', '-auto-approve', '-var-file=terraform.tfvars'], {
    cwd: deploymentDir,
    stdio: ['pipe', 'pipe', 'pipe']
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
}

function generateTfvarsContent(variables) {
  const lines = [];
  
  Object.entries(variables).forEach(([key, value]) => {
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
    
    // Override with tfvars value if available
    if (tfvarsVariables[key]) {
      merged[key].value = tfvarsVariables[key].value;
      merged[key].sources.push('tfvars');
    }
    
    // Enhance description from README if available and not already set
    if (readmeVariables[key] && readmeVariables[key].description && !merged[key].description) {
      merged[key].description = readmeVariables[key].description;
      if (!merged[key].sources.includes('readme')) {
        merged[key].sources.push('readme');
      }
    }
  });
  
  // Add variables that are only in tfvars (not defined in .tf files)
  Object.entries(tfvarsVariables).forEach(([key, tfvarsVar]) => {
    if (!merged[key]) {
      merged[key] = {
        ...tfvarsVar,
        sources: ['tfvars'],
        required: false // Variables only in tfvars are likely optional
      };
      
      // Add README description if available
      if (readmeVariables[key] && readmeVariables[key].description) {
        merged[key].description = readmeVariables[key].description;
        merged[key].sources.push('readme');
      }
    }
  });
  
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
    
    const tfvarsPath = path.join(deploymentDir, 'terraform.tfvars');
    const tfvarsContent = generateTfvarsContent(variables);
    
    await fs.writeFile(tfvarsPath, tfvarsContent);
    
    const socket = io.to(deploymentId);
    
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
    
    // First run terraform init
    const init = spawn('tofu', ['init'], {
      cwd: deploymentDir,
      stdio: ['pipe', 'pipe', 'pipe']
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
        startTerraformApply(deploymentDir, socket);
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