# AWS Lambda Backend

This directory contains the serverless backend components for the College Football Imperial Map.

## Architecture

- **Ingest Function**: Hourly job that fetches game data from CFBD API and applies territory transfers
- **Admin Function**: Manual operations API for testing and maintenance
- **EventBridge Schedule**: Triggers the ingest function every hour
- **API Gateway**: REST API for admin operations

## Deployment

### Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **AWS SAM CLI** installed
3. **Supabase database** set up with schema
4. **CFBD API key** obtained

### Setup

1. **Install dependencies**:
   ```bash
   cd aws/lambda/ingest
   npm install
   cd ../admin  
   npm install
   ```

2. **Build functions**:
   ```bash
   npm run build
   ```

3. **Deploy using SAM**:
   ```bash
   sam build
   sam deploy --guided
   ```

   You'll be prompted for:
   - Stack name: `imperial-map-dev`
   - AWS Region: `us-east-1` (or your preferred region)
   - DatabaseUrl: Your Supabase connection string
   - CfbdApiKey: Your CollegeFootballData API key
   - RateLimitRps: `10` (API rate limit)

### Environment Variables

The Lambda functions require these environment variables:

- `DATABASE_URL`: Supabase Postgres connection string
- `CFBD_API_KEY`: CollegeFootballData API key
- `RATE_LIMIT_RPS`: Requests per second limit (default: 10)
- `NODE_ENV`: Environment (dev/prod)

## Functions

### Ingest Function

**Trigger**: EventBridge (hourly schedule)
**Purpose**: 
- Fetch games from CFBD API for last 48 hours
- Update games table with latest scores/status
- Apply territory transfers for newly finalized games
- Log all operations for audit

**Flow**:
1. Acquire job lock to prevent concurrent runs
2. Fetch recent games from CFBD API
3. Upsert games into database
4. Find finalized games not yet processed
5. Apply territory transfer rules
6. Update ownership and log transfers
7. Release job lock

### Admin Function

**Trigger**: API Gateway (manual)
**Purpose**: Administrative operations

**Endpoints**:
- `POST /admin/ingest` - Manual game ingestion
- `POST /admin/recompute` - Recompute territories from date
- `GET /admin/status` - Job status and metrics

## Monitoring

### CloudWatch Logs

- `/aws/lambda/imperial-map-ingest-{env}`: Ingest function logs
- `/aws/lambda/imperial-map-admin-{env}`: Admin function logs

### Key Metrics

- **Games processed per hour**: Should be consistent during season
- **Territory transfers**: Spikes after major games
- **API errors**: Monitor CFBD API failures
- **Database errors**: Connection issues or lock timeouts

### Alerts

Consider setting up CloudWatch alarms for:
- Function errors > 5% error rate
- Function duration > 4 minutes (near timeout)
- No successful runs > 2 hours

## Cost Optimization

- **Lambda**: Pay per invocation, scales to zero
- **EventBridge**: Minimal cost for hourly schedule
- **API Gateway**: Only pay for admin API calls
- **CloudWatch**: 14-day log retention to control costs

**Estimated monthly cost**: $5-15 depending on usage

## Development

### Local Testing

1. **Set up environment**:
   ```bash
   cp .env.example .env.local
   # Edit with your credentials
   ```

2. **Run locally**:
   ```bash
   sam local invoke IngestFunction --env-vars env.json
   ```

3. **Test admin API**:
   ```bash
   sam local start-api --env-vars env.json
   curl http://localhost:3000/admin/status
   ```

### Database Connection

The Lambda functions connect to Supabase Postgres using connection pooling to handle the serverless execution model efficiently.

### Error Handling

- All operations are wrapped in try-catch blocks
- Database operations use transactions for consistency
- Job locking prevents concurrent modifications
- Detailed logging for troubleshooting