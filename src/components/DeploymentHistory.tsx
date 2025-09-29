import { useState, useEffect } from 'react'
import { Clock, Trash2, AlertTriangle, CheckCircle, Play, Folder, FileText, Calendar } from 'lucide-react'
import axios from 'axios'
import io from 'socket.io-client'

interface Deployment {
  id: string
  createdAt: string
  lastModified: string
  description: string
  terraformFiles: number
  variables: number
  hasState: boolean
  isInitialized: boolean
  files: number
  size: number
  error?: string
}

const DeploymentHistory = () => {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [destroying, setDestroying] = useState<string | null>(null)
  const [destroyLogs, setDestroyLogs] = useState<Record<string, string[]>>({})
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)

  useEffect(() => {
    fetchDeployments()
  }, [])

  const fetchDeployments = async () => {
    try {
      const response = await axios.get('/api/deployments')
      console.log('Deployments response:', response.data) // Debug log
      // Ensure we always set an array
      setDeployments(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error fetching deployments:', error)
      setDeployments([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString()
  }

  const getRelativeTime = (dateString: string): string => {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const handleDestroy = async (deploymentId: string) => {
    if (!confirm(`Are you sure you want to destroy deployment ${deploymentId}? This will tear down all infrastructure created by this deployment.`)) {
      return
    }

    console.log('Starting destroy for deployment:', deploymentId) // Debug log
    setDestroying(deploymentId)
    setDestroyLogs(prev => ({ ...prev, [deploymentId]: [] }))

    // Connect to socket for real-time updates
    const socket = io()
    console.log('Socket created, emitting join-deployment') // Debug log
    socket.emit('join-deployment', deploymentId)

    socket.on('deployment-log', (data: { message: string; timestamp: string }) => {
      setDestroyLogs(prev => ({
        ...prev,
        [deploymentId]: [...(prev[deploymentId] || []), data.message]
      }))
    })

    socket.on('deployment-error', (data: { message: string; timestamp: string }) => {
      setDestroyLogs(prev => ({
        ...prev,
        [deploymentId]: [...(prev[deploymentId] || []), `ERROR: ${data.message}`]
      }))
    })

    socket.on('deployment-complete', (data: { success: boolean; message: string }) => {
      setDestroying(null)
      if (data.success) {
        // Refresh the deployment list
        fetchDeployments()
      }
      socket.disconnect()
    })

    try {
      console.log('Making destroy API call to:', `/api/deployments/${deploymentId}/destroy`) // Debug log
      const response = await axios.post(`/api/deployments/${deploymentId}/destroy`)
      console.log('Destroy API response:', response.data) // Debug log
    } catch (error) {
      console.error('Error starting destroy:', error)
      setDestroying(null)
      socket.disconnect()
    }
  }

  const handleDelete = async (deploymentId: string) => {
    if (!confirm(`Are you sure you want to delete deployment ${deploymentId}? This will remove all files but not destroy any infrastructure.`)) {
      return
    }

    try {
      await axios.delete(`/api/deployments/${deploymentId}`)
      fetchDeployments()
    } catch (error) {
      console.error('Error deleting deployment:', error)
      alert('Failed to delete deployment directory')
    }
  }

  const toggleLogs = (deploymentId: string) => {
    setExpandedLogs(expandedLogs === deploymentId ? null : deploymentId)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Clock className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Deployment History</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading deployments...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Clock className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Deployment History</h3>
        </div>
        <button
          onClick={fetchDeployments}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {deployments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Folder className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No deployments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.isArray(deployments) && deployments.map((deployment) => (
            <div key={deployment.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="font-medium text-gray-900 font-mono text-sm">
                      {deployment.id}
                    </h4>
                    <div className="flex items-center space-x-2">
                      {deployment.hasState && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </span>
                      )}
                      {deployment.isInitialized && !deployment.hasState && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Play className="h-3 w-3 mr-1" />
                          Initialized
                        </span>
                      )}
                      {deployment.error && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Error
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">{deployment.description}</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{getRelativeTime(deployment.createdAt)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <FileText className="h-3 w-3" />
                      <span>{deployment.terraformFiles} TF files</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>{deployment.variables} variables</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>{formatFileSize(deployment.size)}</span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-400 mt-2">
                    Created: {formatDate(deployment.createdAt)}
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {deployment.hasState && (
                    <button
                      onClick={() => handleDestroy(deployment.id)}
                      disabled={destroying === deployment.id}
                      className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {destroying === deployment.id ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600 mr-1"></div>
                          Destroying...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Destroy
                        </>
                      )}
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDelete(deployment.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </button>
                </div>
              </div>

              {destroying === deployment.id && destroyLogs[deployment.id] && (
                <div className="mt-4">
                  <button
                    onClick={() => toggleLogs(deployment.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 mb-2"
                  >
                    {expandedLogs === deployment.id ? 'Hide' : 'Show'} destroy logs
                  </button>
                  
                  {expandedLogs === deployment.id && (
                    <div className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded max-h-40 overflow-y-auto">
                      {destroyLogs[deployment.id].map((log, index) => (
                        <div key={index}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DeploymentHistory