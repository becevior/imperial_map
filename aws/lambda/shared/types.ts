// Shared types for AWS Lambda functions
// Mirror the frontend types but optimized for backend use

export interface LambdaResponse {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export interface JobContext {
  jobName: string
  runId: string
  startTime: Date
}

export interface DbConfig {
  connectionString: string
  maxConnections?: number
  ssl?: boolean
}

export interface CfbdConfig {
  apiKey: string
  baseUrl: string
  rateLimitRps: number
}

export interface LambdaEvent {
  source?: string
  'detail-type'?: string
  detail?: any
  httpMethod?: string
  path?: string
  queryStringParameters?: Record<string, string>
  body?: string
  headers?: Record<string, string>
}

export interface IngestResult {
  gamesProcessed: number
  transfersApplied: number
  errors: string[]
  duration: number
  jobId: string
}

export interface GameUpdate {
  id: string
  status: string
  homeScore?: number
  awayScore?: number
  lastUpdated: string
}