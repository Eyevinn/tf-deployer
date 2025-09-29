import { useState } from 'react'
import { Github, Search, AlertCircle, CheckCircle } from 'lucide-react'
import axios from 'axios'

interface RepositoryInputProps {
  onRepositoryParsed: (data: any) => void
}

const RepositoryInput: React.FC<RepositoryInputProps> = ({ onRepositoryParsed }) => {
  const [repoUrl, setRepoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL')
      return
    }

    if (!repoUrl.includes('github.com') || !repoUrl.includes('/tree/')) {
      setError('Please enter a valid GitHub repository URL with a specific branch and path')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await axios.post('/api/parse-github-url', {
        repoUrl: repoUrl.trim()
      })

      setSuccess(true)
      onRepositoryParsed(response.data)
    } catch (error: any) {
      setError(
        error.response?.data?.error || 
        'Failed to parse repository. Please check the URL and try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const exampleUrl = "https://github.com/EyevinnOSC/terraform-examples/tree/main/examples/intercom"

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="repo-url" className="block text-sm font-medium text-gray-700 mb-2">
            GitHub Repository URL
          </label>
          <div className="relative">
            <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/tree/branch/path"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm 
                         focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={isLoading}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Enter a GitHub URL pointing to a directory containing Terraform files with a .tfvars file
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !repoUrl.trim()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium 
                     rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none 
                     focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 
                     disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Parsing Repository...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Parse Repository
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-700">
            Repository parsed successfully! Configure variables below.
          </span>
        </div>
      )}

      <div className="bg-gray-50 rounded-md p-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Example URL:</p>
        <button
          type="button"
          onClick={() => setRepoUrl(exampleUrl)}
          className="text-xs text-blue-600 hover:text-blue-800 font-mono break-all"
        >
          {exampleUrl}
        </button>
      </div>
    </div>
  )
}

export default RepositoryInput