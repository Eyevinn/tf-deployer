import { useState } from 'react'
import { Github, Play, Settings, Terminal, Code, FileText } from 'lucide-react'
import RepositoryInput from './components/RepositoryInput'
import VariablesForm from './components/VariablesForm'
import DeploymentProgress from './components/DeploymentProgress'

interface RepoData {
  owner: string
  repo: string
  branch: string
  path: string
  terraformFiles: string[]
  tfvarsFile: string | null
  readmeFile: string | null
  variables: Record<string, any>
  terraformVariables: Record<string, any>
  tfvarsVariables: Record<string, any>
  readmeVariables: Record<string, any>
  readmeContent: string
  allFiles: Array<{ name: string; type: string }>
}

function App() {
  const [repoData, setRepoData] = useState<RepoData | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [userVariables, setUserVariables] = useState<Record<string, any> | null>(null)

  const handleRepositoryParsed = (data: RepoData) => {
    setRepoData(data)
  }

  const handleDeploy = (variables: Record<string, any>) => {
    const newDeploymentId = `deploy-${Date.now()}`
    setDeploymentId(newDeploymentId)
    setUserVariables(variables)
    setIsDeploying(true)
  }

  const handleDeploymentComplete = () => {
    setIsDeploying(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Terminal className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                Terraform UI Deployer
              </h1>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Github className="h-4 w-4" />
              <span>GitHub Repository Deployer</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Deploy Terraform Scripts from GitHub
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Enter a GitHub repository URL containing Terraform scripts, configure variables, 
              and deploy using OpenTofu with real-time progress monitoring.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Github className="h-5 w-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Repository Configuration
                  </h3>
                </div>
                <RepositoryInput onRepositoryParsed={handleRepositoryParsed} />
              </div>

              {repoData && (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <Settings className="h-5 w-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Variables Configuration
                    </h3>
                  </div>
                  <VariablesForm 
                    variables={repoData.variables}
                    onDeploy={handleDeploy}
                    isDeploying={isDeploying}
                  />
                </div>
              )}
            </div>

            <div className="space-y-6">
              {deploymentId && (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <Play className="h-5 w-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Deployment Progress
                    </h3>
                  </div>
                  <DeploymentProgress 
                    deploymentId={deploymentId}
                    repoData={repoData}
                    userVariables={userVariables}
                    onComplete={handleDeploymentComplete}
                  />
                </div>
              )}

              {repoData && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Repository Information
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Repository:</span>
                      <span className="font-mono">{repoData.owner}/{repoData.repo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Branch:</span>
                      <span className="font-mono">{repoData.branch}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Path:</span>
                      <span className="font-mono">{repoData.path}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Terraform Files:</span>
                        <span className="font-mono text-right">
                          {repoData.terraformFiles.join(', ')}
                        </span>
                      </div>
                      {repoData.tfvarsFile && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Variables File:</span>
                          <span className="font-mono">{repoData.tfvarsFile}</span>
                        </div>
                      )}
                      {repoData.readmeFile && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">README File:</span>
                          <span className="font-mono">{repoData.readmeFile}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-3 border-t">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Variable Sources</h4>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="bg-purple-50 p-3 rounded">
                          <div className="flex items-center space-x-1 mb-1">
                            <Terminal className="h-3 w-3 text-purple-600" />
                            <span className="font-medium text-purple-800">Terraform</span>
                          </div>
                          <span className="text-purple-700">
                            {Object.keys(repoData.terraformVariables || {}).length} variables
                          </span>
                        </div>
                        <div className="bg-blue-50 p-3 rounded">
                          <div className="flex items-center space-x-1 mb-1">
                            <Code className="h-3 w-3 text-blue-600" />
                            <span className="font-medium text-blue-800">tfvars</span>
                          </div>
                          <span className="text-blue-700">
                            {Object.keys(repoData.tfvarsVariables || {}).length} variables
                          </span>
                        </div>
                        <div className="bg-green-50 p-3 rounded">
                          <div className="flex items-center space-x-1 mb-1">
                            <FileText className="h-3 w-3 text-green-600" />
                            <span className="font-medium text-green-800">README</span>
                          </div>
                          <span className="text-green-700">
                            {Object.keys(repoData.readmeVariables || {}).length} variables
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <span className="text-gray-600 block mb-2">Files:</span>
                      <div className="space-y-1">
                        {repoData.allFiles.map((file, index) => (
                          <div key={index} className="flex items-center space-x-2 text-xs">
                            <span className={`px-2 py-1 rounded text-white ${
                              file.type === 'file' ? 'bg-blue-500' : 'bg-gray-500'
                            }`}>
                              {file.type}
                            </span>
                            <span className="font-mono">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
