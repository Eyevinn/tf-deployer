import { useState, useEffect, useRef } from 'react'
import { Terminal, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import axios from 'axios'

interface DeploymentProgressProps {
  deploymentId: string
  repoData: any
  userVariables: Record<string, any> | null
  onComplete: () => void
}

interface LogEntry {
  message: string
  timestamp: string
  type: 'log' | 'error' | 'complete'
}

const DeploymentProgress: React.FC<DeploymentProgressProps> = ({ 
  deploymentId, 
  repoData, 
  userVariables,
  onComplete 
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [status, setStatus] = useState<'pending' | 'running' | 'success' | 'error'>('pending')
  const [socket, setSocket] = useState<Socket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const newSocket = io()
    setSocket(newSocket)

    newSocket.emit('join-deployment', deploymentId)

    newSocket.on('deployment-log', (data: { message: string; timestamp: string }) => {
      setLogs(prev => [...prev, { ...data, type: 'log' }])
      setStatus('running')
    })

    newSocket.on('deployment-error', (data: { message: string; timestamp: string }) => {
      setLogs(prev => [...prev, { ...data, type: 'error' }])
    })

    newSocket.on('deployment-complete', (data: { 
      success: boolean; 
      message: string; 
      timestamp: string 
    }) => {
      setLogs(prev => [...prev, { ...data, type: 'complete' }])
      setStatus(data.success ? 'success' : 'error')
      onComplete()
    })

    return () => {
      newSocket.disconnect()
    }
  }, [deploymentId, onComplete])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (repoData && deploymentId) {
      startDeployment()
    }
  }, [repoData, deploymentId])

  const startDeployment = async () => {
    try {
      setStatus('running')
      setLogs([{ 
        message: 'Initializing deployment...', 
        timestamp: new Date().toISOString(), 
        type: 'log' 
      }])

      // Use user-submitted variables instead of original repo data values
      const variables = userVariables || {}

      await axios.post('/api/deploy', {
        repoData,
        variables,
        deploymentId
      })
    } catch (error: any) {
      setStatus('error')
      setLogs(prev => [...prev, {
        message: `Deployment failed: ${error.response?.data?.error || error.message}`,
        timestamp: new Date().toISOString(),
        type: 'error'
      }])
      onComplete()
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-500" />
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Waiting to start...'
      case 'running':
        return 'Deployment in progress...'
      case 'success':
        return 'Deployment completed successfully!'
      case 'error':
        return 'Deployment failed'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'text-gray-600'
      case 'running':
        return 'text-blue-600'
      case 'success':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
        {getStatusIcon()}
        <span className={`font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        <span className="text-sm text-gray-500">
          ID: {deploymentId}
        </span>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-auto">
        <div className="font-mono text-sm space-y-1">
          {logs.map((log, index) => (
            <div key={index} className="flex items-start space-x-2">
              <span className="text-gray-500 text-xs shrink-0">
                {formatTimestamp(log.timestamp)}
              </span>
              <div className="flex items-start space-x-1 min-w-0 flex-1">
                {log.type === 'error' && (
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                )}
                {log.type === 'complete' && (
                  <CheckCircle className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                )}
                <span className={`break-words ${
                  log.type === 'error' 
                    ? 'text-red-400' 
                    : log.type === 'complete'
                    ? 'text-green-400'
                    : 'text-white'
                }`}>
                  {log.message}
                </span>
              </div>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {status === 'success' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-medium text-green-800">
              Deployment Successful!
            </span>
          </div>
          <p className="mt-2 text-sm text-green-700">
            Your Terraform infrastructure has been deployed successfully. 
            Check the logs above for details about the created resources.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-red-800">
              Deployment Failed
            </span>
          </div>
          <p className="mt-2 text-sm text-red-700">
            The deployment encountered an error. Please check the logs above for details 
            and verify your configuration.
          </p>
        </div>
      )}
    </div>
  )
}

export default DeploymentProgress