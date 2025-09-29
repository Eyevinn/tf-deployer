import { useState, useEffect } from 'react'
import { Play, Settings, AlertCircle, FileText, Code, Info, Terminal, Shield } from 'lucide-react'

interface Variable {
  value: any
  type: string
  original: string
  source?: string
  sources?: string[]
  description?: string
  file?: string
  terraformType?: string
  sensitive?: boolean
  nullable?: boolean
  required?: boolean
}

interface VariablesFormProps {
  variables: Record<string, Variable>
  onDeploy: (variables: Record<string, any>) => void
  isDeploying: boolean
}

const VariablesForm: React.FC<VariablesFormProps> = ({ variables, onDeploy, isDeploying }) => {
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const initialValues: Record<string, any> = {}
    Object.entries(variables).forEach(([key, variable]) => {
      initialValues[key] = variable.value
    })
    setFormValues(initialValues)
  }, [variables])

  const handleInputChange = (key: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [key]: value
    }))
    
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[key]
        return newErrors
      })
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    Object.entries(variables).forEach(([key, variable]) => {
      const value = formValues[key]
      
      if (value === undefined || value === null || value === '') {
        newErrors[key] = 'This field is required'
      } else if (variable.type === 'number' && isNaN(Number(value))) {
        newErrors[key] = 'Must be a valid number'
      } else if (variable.type === 'boolean' && typeof value !== 'boolean') {
        newErrors[key] = 'Must be true or false'
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validateForm()) {
      onDeploy(formValues)
    }
  }

  const renderInput = (key: string, variable: Variable) => {
    const value = formValues[key]
    const error = errors[key]
    
    switch (variable.type) {
      case 'boolean':
        return (
          <div className="flex items-center space-x-3">
            <label className="flex items-center">
              <input
                type="radio"
                name={key}
                value="true"
                checked={value === true}
                onChange={() => handleInputChange(key, true)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isDeploying}
              />
              <span className="ml-2 text-sm text-gray-700">True</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name={key}
                value="false"
                checked={value === false}
                onChange={() => handleInputChange(key, false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isDeploying}
              />
              <span className="ml-2 text-sm text-gray-700">False</span>
            </label>
          </div>
        )
      
      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => handleInputChange(key, Number(e.target.value))}
            className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={isDeploying}
          />
        )
      
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
              error ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={isDeploying}
          />
        )
    }
  }

  const hasVariables = Object.keys(variables).length > 0

  if (!hasVariables) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No variables found in the Terraform files</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {Object.entries(variables).map(([key, variable]) => (
          <div key={key} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <label htmlFor={key} className="block text-sm font-medium text-gray-700">
                  {key}
                  {variable.required && <span className="text-red-600 ml-1">*</span>}
                </label>
                <div className="flex items-center space-x-1">
                  {variable.terraformType && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {variable.terraformType}
                    </span>
                  )}
                  {variable.sensitive && (
                    <div className="flex items-center space-x-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                      <Shield className="h-3 w-3" />
                      <span>sensitive</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {variable.sources?.includes('terraform') && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                    <Terminal className="h-3 w-3" />
                    <span>terraform</span>
                  </div>
                )}
                {variable.sources?.includes('tfvars') && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    <Code className="h-3 w-3" />
                    <span>tfvars</span>
                  </div>
                )}
                {variable.sources?.includes('readme') && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                    <FileText className="h-3 w-3" />
                    <span>README</span>
                  </div>
                )}
              </div>
            </div>
            
            {variable.description && (
              <div className="flex items-start space-x-2 mb-3 p-2 bg-blue-50 rounded">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">{variable.description}</p>
              </div>
            )}
            
            {renderInput(key, variable)}
            
            {errors[key] && (
              <div className="flex items-center space-x-1 mt-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-600">{errors[key]}</span>
              </div>
            )}
            
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div>
                Default: <code className="bg-gray-100 px-1 rounded">{variable.original || 'null'}</code>
                {variable.sources && (
                  <span className="ml-2">
                    • Sources: {variable.sources.join(', ')}
                  </span>
                )}
              </div>
              {variable.file && (
                <div>
                  Defined in: <code className="bg-gray-100 px-1 rounded">{variable.file}</code>
                  {variable.nullable === false && <span className="ml-2 text-orange-600">• Not nullable</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t">
        <button
          type="submit"
          disabled={isDeploying || Object.keys(errors).length > 0}
          className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent 
                     text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 
                     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeploying ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Deploying...
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              Deploy with OpenTofu
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default VariablesForm