/**
 * Terraform parsing utilities
 * Handles parsing of Terraform files, tfvars, and README files for variable definitions
 */

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

export {
  parseTerraformVariables,
  parseTfvarsContent,
  parseReadmeForVariables,
  parseDefaultValue,
  inferType,
  mergeAllVariables,
  mergeVariables
};