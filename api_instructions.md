# FPL Frontend on Vercel - Databricks SQL Warehouse API Integration

Complete guide to connect your Vercel-hosted frontend to your FPL Data Pipeline in Databricks.

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Databricks Setup](#databricks-setup)
3. [Connection Methods](#connection-methods)
4. [Vercel Backend API Setup](#vercel-backend-api-setup)
5. [Frontend Integration](#frontend-integration)
6. [Sample Queries](#sample-queries)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### What You Need:
- ✅ Databricks workspace (you have this)
- ✅ FPL data pipeline running (you have this in `workspace.fplgeek.*` tables)
- ✅ Vercel account
- ✅ Next.js/React project

### Tables Available:
```
workspace.fplgeek.players
workspace.fplgeek.teams
workspace.fplgeek.fixtures
workspace.fplgeek.player_history
workspace.fplgeek.preprocessed_data
workspace.fplgeek.predictions
workspace.fplgeek.feature_importance
workspace.fplgeek.league_analysis
```

---

## 2. Databricks Setup

### Step 1: Create SQL Warehouse

1. Go to **Databricks Console** → **SQL Warehouses**
2. Click **Create SQL Warehouse**
3. Configure:
   - **Name**: `fpl-api-warehouse`
   - **Cluster size**: `2X-Small` (cheapest, sufficient for frontend queries)
   - **Auto Stop**: `10 minutes` (save costs)
   - **Type**: `Serverless` (recommended) or `Pro`
4. Click **Create**
5. **Wait for it to start**, then note the **Warehouse ID** from the URL:
   ```
   https://<workspace-url>/sql/warehouses/<WAREHOUSE_ID>
   ```

### Step 2: Get Connection Details

1. In SQL Warehouse page, click **Connection Details**
2. Copy:
   - **Server hostname**: `<workspace>.cloud.databricks.com`
   - **HTTP path**: `/sql/1.0/warehouses/<warehouse_id>`
   - **Port**: `443`

### Step 3: Generate Personal Access Token

1. Click your **profile icon** (top right) → **Settings**
2. Go to **Developer** → **Access tokens**
3. Click **Manage** → **Generate new token**
4. Set:
   - **Comment**: `FPL Vercel API`
   - **Lifetime**: `90 days` (or customize)
5. Click **Generate**
6. **⚠️ COPY THE TOKEN NOW** (you won't see it again)

---

## 3. Connection Methods

### Option A: REST API (Recommended for Vercel)
**Best for serverless functions, no dependencies**

### Option B: Databricks SQL Connector for Python
**Best if you're using Python backend**

### Option C: ODBC/JDBC
**Best for traditional server setups (not ideal for Vercel)**

We'll use **Option A (REST API)** for Vercel.

---

## 4. Vercel Backend API Setup

### Project Structure
```
my-fpl-app/
├── pages/
│   └── api/
│       ├── players.js          # Get all players with predictions
│       ├── top-picks.js        # Get top predicted players
│       ├── player/[id].js      # Get specific player details
│       └── fixtures.js         # Get upcoming fixtures
├── lib/
│   └── databricks.js           # Databricks connection utility
├── .env.local                  # Environment variables
└── package.json
```

### Step 1: Create Environment Variables

Create `.env.local` in your project root:

```bash
# .env.local
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi1234567890abcdef
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/abc123def456
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=fplgeek
```

### Step 2: Add to Vercel Environment Variables

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add each variable from `.env.local`
3. Set scope to **Production, Preview, Development**

### Step 3: Create Databricks Utility

Create `lib/databricks.js`:

```javascript
// lib/databricks.js

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_HTTP_PATH = process.env.DATABRICKS_HTTP_PATH;
const CATALOG = process.env.DATABRICKS_CATALOG || 'workspace';
const SCHEMA = process.env.DATABRICKS_SCHEMA || 'fplgeek';

/**
 * Execute SQL query on Databricks SQL Warehouse
 * @param {string} query - SQL query to execute
 * @returns {Promise<Array>} - Query results
 */
export async function executeQuery(query) {
  const url = `https://${DATABRICKS_HOST}/api/2.0/sql/statements/`;
  
  const payload = {
    statement: query,
    warehouse_id: DATABRICKS_HTTP_PATH.split('/').pop(),
    catalog: CATALOG,
    schema: SCHEMA,
    wait_timeout: '30s',
    on_wait_timeout: 'CONTINUE'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Databricks API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    // Handle async execution
    if (result.status.state === 'PENDING' || result.status.state === 'RUNNING') {
      return await pollStatement(result.statement_id);
    }
    
    return parseResults(result);
  } catch (error) {
    console.error('Databricks query error:', error);
    throw error;
  }
}

/**
 * Poll statement until completion
 */
async function pollStatement(statementId) {
  const url = `https://${DATABRICKS_HOST}/api/2.0/sql/statements/${statementId}`;
  
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
      },
    });
    
    const result = await response.json();
    
    if (result.status.state === 'SUCCEEDED') {
      return parseResults(result);
    }
    
    if (result.status.state === 'FAILED' || result.status.state === 'CANCELED') {
      throw new Error(`Query failed: ${result.status.error?.message || 'Unknown error'}`);
    }
    
    // Wait 1 second before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('Query timeout');
}

/**
 * Parse Databricks result into array of objects
 */
function parseResults(result) {
  if (!result.result || !result.result.data_array) {
    return [];
  }
  
  const columns = result.manifest.schema.columns.map(col => col.name);
  const rows = result.result.data_array;
  
  return rows.map(row => {
    const obj = {};
    columns.forEach((col, index) => {
      obj[col] = row[index];
    });
    return obj;
  });
}

/**
 * Helper to safely parse JSON strings in results
 */
export function parseJsonColumn(data, columnName) {
  return data.map(row => ({
    ...row,
    [columnName]: row[columnName] ? JSON.parse(row[columnName]) : null
  }));
}
```

### Step 4: Create API Routes

#### `pages/api/players.js` - Get All Players with Predictions

```javascript
// pages/api/players.js
import { executeQuery, parseJsonColumn } from '../../lib/databricks';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { position, minPrice, maxPrice, limit = 100 } = req.query;
    
    let filters = [];
    if (position) filters.push(`player_data.element_type = ${position}`);
    if (minPrice) filters.push(`player_data.now_cost >= ${parseFloat(minPrice) * 10}`);
    if (maxPrice) filters.push(`player_data.now_cost <= ${parseFloat(maxPrice) * 10}`);
    
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        p.id,
        p.data as player_data,
        pred.data as prediction_data
      FROM workspace.fplgeek.players p
      LEFT JOIN workspace.fplgeek.predictions pred ON p.id = pred.player_id
      ${whereClause}
      ORDER BY pred.predicted_points DESC
      LIMIT ${limit}
    `;
    
    let results = await executeQuery(query);
    
    // Parse JSON columns
    results = parseJsonColumn(results, 'player_data');
    results = parseJsonColumn(results, 'prediction_data');
    
    // Transform to clean response
    const players = results.map(row => ({
      id: row.id,
      name: row.player_data?.web_name || 'Unknown',
      team: row.player_data?.team,
      position: row.player_data?.element_type,
      price: (row.player_data?.now_cost || 0) / 10,
      predictedPoints: row.prediction_data?.predicted_points || 0,
      form: row.player_data?.form,
      selectedBy: row.player_data?.selected_by_percent,
    }));
    
    res.status(200).json({ success: true, data: players });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
```

#### `pages/api/top-picks.js` - Get Top Predicted Players

```javascript
// pages/api/top-picks.js
import { executeQuery, parseJsonColumn } from '../../lib/databricks';

export default async function handler(req, res) {
  try {
    const { count = 15, gameweek } = req.query;
    
    const gwFilter = gameweek ? `AND pred.next_gameweek = ${gameweek}` : '';
    
    const query = `
      SELECT 
        p.id,
        p.data as player_data,
        pred.data as prediction_data,
        t.data as team_data
      FROM workspace.fplgeek.predictions pred
      JOIN workspace.fplgeek.players p ON pred.player_id = p.id
      JOIN workspace.fplgeek.teams t ON JSON_EXTRACT_SCALAR(p.data, '$.team') = CAST(t.id AS STRING)
      WHERE pred.predicted_points > 0
      ${gwFilter}
      ORDER BY pred.predicted_points DESC
      LIMIT ${count}
    `;
    
    let results = await executeQuery(query);
    results = parseJsonColumn(results, 'player_data');
    results = parseJsonColumn(results, 'prediction_data');
    results = parseJsonColumn(results, 'team_data');
    
    const topPicks = results.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      name: row.player_data?.web_name,
      teamName: row.team_data?.name,
      teamShort: row.team_data?.short_name,
      position: ['', 'GK', 'DEF', 'MID', 'FWD'][row.player_data?.element_type] || 'Unknown',
      price: (row.player_data?.now_cost || 0) / 10,
      predictedPoints: row.prediction_data?.predicted_points?.toFixed(2),
      form: row.player_data?.form,
      selectedBy: `${row.player_data?.selected_by_percent}%`,
    }));
    
    res.status(200).json({ success: true, data: topPicks });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
```

#### `pages/api/player/[id].js` - Get Player Details

```javascript
// pages/api/player/[id].js
import { executeQuery, parseJsonColumn } from '../../../lib/databricks';

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Player ID required' });
  }
  
  try {
    const query = `
      SELECT 
        p.id,
        p.data as player_data,
        pred.data as prediction_data,
        hist.data as history_data
      FROM workspace.fplgeek.players p
      LEFT JOIN workspace.fplgeek.predictions pred ON p.id = pred.player_id
      LEFT JOIN workspace.fplgeek.player_history hist ON p.id = hist.player_id
      WHERE p.id = ${id}
    `;
    
    let results = await executeQuery(query);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    results = parseJsonColumn(results, 'player_data');
    results = parseJsonColumn(results, 'prediction_data');
    results = parseJsonColumn(results, 'history_data');
    
    const player = results[0];
    
    res.status(200).json({
      success: true,
      data: {
        id: player.id,
        ...player.player_data,
        prediction: player.prediction_data,
        history: player.history_data,
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
```

#### `pages/api/fixtures.js` - Get Upcoming Fixtures

```javascript
// pages/api/fixtures.js
import { executeQuery, parseJsonColumn } from '../../lib/databricks';

export default async function handler(req, res) {
  try {
    const { gameweek, team } = req.query;
    
    let filters = [];
    if (gameweek) filters.push(`JSON_EXTRACT_SCALAR(f.data, '$.event') = '${gameweek}'`);
    if (team) filters.push(`(JSON_EXTRACT_SCALAR(f.data, '$.team_h') = '${team}' OR JSON_EXTRACT_SCALAR(f.data, '$.team_a') = '${team}')`);
    
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        f.id,
        f.data as fixture_data,
        th.data as team_h_data,
        ta.data as team_a_data
      FROM workspace.fplgeek.fixtures f
      LEFT JOIN workspace.fplgeek.teams th ON JSON_EXTRACT_SCALAR(f.data, '$.team_h') = CAST(th.id AS STRING)
      LEFT JOIN workspace.fplgeek.teams ta ON JSON_EXTRACT_SCALAR(f.data, '$.team_a') = CAST(ta.id AS STRING)
      ${whereClause}
      ORDER BY JSON_EXTRACT_SCALAR(f.data, '$.kickoff_time')
      LIMIT 50
    `;
    
    let results = await executeQuery(query);
    results = parseJsonColumn(results, 'fixture_data');
    results = parseJsonColumn(results, 'team_h_data');
    results = parseJsonColumn(results, 'team_a_data');
    
    const fixtures = results.map(row => ({
      id: row.id,
      gameweek: row.fixture_data?.event,
      kickoffTime: row.fixture_data?.kickoff_time,
      homeTeam: {
        id: row.fixture_data?.team_h,
        name: row.team_h_data?.name,
        short: row.team_h_data?.short_name,
      },
      awayTeam: {
        id: row.fixture_data?.team_a,
        name: row.team_a_data?.name,
        short: row.team_a_data?.short_name,
      },
      difficulty: {
        home: row.fixture_data?.team_h_difficulty,
        away: row.fixture_data?.team_a_difficulty,
      },
    }));
    
    res.status(200).json({ success: true, data: fixtures });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
```

---

## 5. Frontend Integration

### Example: Top Picks Component (React)

```jsx
// components/TopPicks.jsx
import { useState, useEffect } from 'react';

export default function TopPicks() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTopPicks() {
      try {
        const res = await fetch('/api/top-picks?count=15');
        const data = await res.json();
        
        if (data.success) {
          setPlayers(data.data);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchTopPicks();
  }, []);

  if (loading) return <div>Loading predictions...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="top-picks">
      <h2>Top 15 Predicted Players (Next GW)</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Team</th>
            <th>Pos</th>
            <th>Price</th>
            <th>Predicted Pts</th>
            <th>Ownership</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id}>
              <td>{player.rank}</td>
              <td>{player.name}</td>
              <td>{player.teamShort}</td>
              <td>{player.position}</td>
              <td>£{player.price}m</td>
              <td><strong>{player.predictedPoints}</strong></td>
              <td>{player.selectedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Example: Player Search with Filters

```jsx
// components/PlayerSearch.jsx
import { useState } from 'react';

export default function PlayerSearch() {
  const [filters, setFilters] = useState({ position: '', minPrice: '', maxPrice: '' });
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchPlayers = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.position) params.append('position', filters.position);
    if (filters.minPrice) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
    
    const res = await fetch(`/api/players?${params.toString()}`);
    const data = await res.json();
    
    if (data.success) setPlayers(data.data);
    setLoading(false);
  };

  return (
    <div>
      <div className="filters">
        <select 
          value={filters.position} 
          onChange={(e) => setFilters({...filters, position: e.target.value})}
        >
          <option value="">All Positions</option>
          <option value="1">Goalkeeper</option>
          <option value="2">Defender</option>
          <option value="3">Midfielder</option>
          <option value="4">Forward</option>
        </select>
        
        <input 
          type="number" 
          placeholder="Min Price"
          value={filters.minPrice}
          onChange={(e) => setFilters({...filters, minPrice: e.target.value})}
        />
        
        <input 
          type="number" 
          placeholder="Max Price"
          value={filters.maxPrice}
          onChange={(e) => setFilters({...filters, maxPrice: e.target.value})}
        />
        
        <button onClick={searchPlayers} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      
      <div className="results">
        {players.map(player => (
          <div key={player.id} className="player-card">
            <h3>{player.name}</h3>
            <p>Price: £{player.price}m</p>
            <p>Predicted: {player.predictedPoints} pts</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Sample Queries

### Direct SQL Queries You Can Use

```sql
-- Get top 10 predicted players by position
SELECT 
  p.id,
  JSON_EXTRACT_SCALAR(p.data, '$.web_name') as name,
  JSON_EXTRACT_SCALAR(p.data, '$.element_type') as position,
  JSON_EXTRACT_SCALAR(p.data, '$.now_cost') as price,
  pred.predicted_points
FROM workspace.fplgeek.players p
JOIN workspace.fplgeek.predictions pred ON p.id = pred.player_id
WHERE JSON_EXTRACT_SCALAR(p.data, '$.element_type') = '3'  -- Midfielders
ORDER BY pred.predicted_points DESC
LIMIT 10;

-- Get best value players (points per million)
SELECT 
  JSON_EXTRACT_SCALAR(p.data, '$.web_name') as name,
  CAST(JSON_EXTRACT_SCALAR(p.data, '$.now_cost') AS FLOAT) / 10 as price,
  pred.predicted_points,
  (pred.predicted_points / (CAST(JSON_EXTRACT_SCALAR(p.data, '$.now_cost') AS FLOAT) / 10)) as value
FROM workspace.fplgeek.players p
JOIN workspace.fplgeek.predictions pred ON p.id = pred.player_id
WHERE pred.predicted_points > 0
ORDER BY value DESC
LIMIT 20;

-- Get fixtures with difficulty
SELECT 
  JSON_EXTRACT_SCALAR(f.data, '$.event') as gameweek,
  th.name as home_team,
  ta.name as away_team,
  JSON_EXTRACT_SCALAR(f.data, '$.team_h_difficulty') as home_difficulty,
  JSON_EXTRACT_SCALAR(f.data, '$.team_a_difficulty') as away_difficulty,
  JSON_EXTRACT_SCALAR(f.data, '$.kickoff_time') as kickoff
FROM workspace.fplgeek.fixtures f
JOIN workspace.fplgeek.teams th ON JSON_EXTRACT_SCALAR(f.data, '$.team_h') = CAST(th.id AS STRING)
JOIN workspace.fplgeek.teams ta ON JSON_EXTRACT_SCALAR(f.data, '$.team_a') = CAST(ta.id AS STRING)
WHERE JSON_EXTRACT_SCALAR(f.data, '$.event') = '10'
ORDER BY kickoff;

-- Get player history stats
SELECT 
  p.id,
  JSON_EXTRACT_SCALAR(p.data, '$.web_name') as name,
  JSON_EXTRACT_SCALAR(hist.data, '$.total_points') as total_points,
  JSON_EXTRACT_SCALAR(hist.data, '$.goals_scored') as goals,
  JSON_EXTRACT_SCALAR(hist.data, '$.assists') as assists
FROM workspace.fplgeek.players p
JOIN workspace.fplgeek.player_history hist ON p.id = hist.player_id
WHERE p.id = 123;
```

---

## 7. Security Best Practices

### ✅ DO:
1. **Never commit tokens to Git**
   - Use `.env.local` for local dev
   - Use Vercel environment variables for production
   - Add `.env.local` to `.gitignore`

2. **Implement rate limiting**
   ```javascript
   // Use Vercel Rate Limiting or implement custom
   import rateLimit from 'express-rate-limit';
   ```

3. **Add request validation**
   ```javascript
   if (isNaN(id) || id < 1) {
     return res.status(400).json({ error: 'Invalid ID' });
   }
   ```

4. **Set up CORS properly**
   ```javascript
   res.setHeader('Access-Control-Allow-Origin', 'https://your-domain.vercel.app');
   ```

5. **Use SQL parameter binding** (prevent injection)
   ```javascript
   // Already handled by Databricks API
   ```

### ❌ DON'T:
1. Don't expose your Databricks token in client-side code
2. Don't allow arbitrary SQL from frontend
3. Don't return sensitive data (emails, internal IDs)
4. Don't skip input validation

### Token Rotation
```bash
# Rotate tokens every 90 days
# 1. Generate new token in Databricks
# 2. Update Vercel environment variable
# 3. Redeploy (automatic)
# 4. Revoke old token after 24 hours
```

---

## 8. Troubleshooting

### Common Issues

#### 1. **401 Unauthorized**
```
Error: Databricks API error: 401
```
**Fix:**
- Check token is correct in `.env.local`
- Regenerate token if expired
- Verify token has workspace access

#### 2. **Warehouse Not Running**
```
Error: Warehouse is stopped
```
**Fix:**
- Go to Databricks → SQL Warehouses
- Click **Start** on your warehouse
- Wait 30-60 seconds for startup

#### 3. **Query Timeout**
```
Error: Query timeout
```
**Fix:**
- Increase `wait_timeout` in `executeQuery`
- Optimize query with indexes
- Reduce result set with LIMIT

#### 4. **CORS Errors**
```
Access to fetch blocked by CORS policy
```
**Fix:**
- API routes automatically handled by Vercel
- Don't call Databricks API from client-side

#### 5. **JSON Parse Error**
```
SyntaxError: Unexpected token in JSON
```
**Fix:**
- Check data column contains valid JSON
- Add null checks before JSON.parse
- Use `parseJsonColumn` utility

### Testing Connection

Create a test endpoint:

```javascript
// pages/api/test-connection.js
import { executeQuery } from '../../lib/databricks';

export default async function handler(req, res) {
  try {
    const result = await executeQuery('SELECT 1 as test');
    res.status(200).json({ 
      success: true, 
      message: 'Connection successful',
      result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
```

Test: `curl http://localhost:3000/api/test-connection`

---

## 9. Deployment Checklist

### Before Deploying to Vercel:

- [ ] SQL Warehouse is created and running
- [ ] Personal Access Token generated
- [ ] `.env.local` configured locally
- [ ] Environment variables added to Vercel
- [ ] All API routes tested locally
- [ ] Error handling implemented
- [ ] Rate limiting configured
- [ ] `.gitignore` includes `.env.local`
- [ ] CORS configured (if needed)
- [ ] SQL queries optimized with LIMIT

### Deploy:

```bash
# Install dependencies
npm install

# Test locally
npm run dev
# Visit http://localhost:3000/api/top-picks

# Deploy to Vercel
vercel --prod
```

---

## 10. Performance Optimization

### Caching Strategy

```javascript
// pages/api/top-picks.js with caching
export const config = {
  runtime: 'edge', // Use Edge runtime for faster responses
};

export default async function handler(req, res) {
  // Set cache headers (cache for 5 minutes)
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  
  // ... rest of your code
}
```

### Incremental Static Regeneration (ISR)

For Next.js pages:

```javascript
// pages/players.jsx
export async function getStaticProps() {
  const res = await fetch('http://localhost:3000/api/top-picks');
  const data = await res.json();
  
  return {
    props: { players: data.data },
    revalidate: 300, // Regenerate every 5 minutes
  };
}
```

---

## 11. Cost Optimization

### Databricks Costs:
- **2X-Small Serverless**: ~$0.22/hour (only when running)
- **Auto-stop**: Set to 10 minutes
- **Expected cost**: <$10/month for typical FPL app usage

### Vercel Costs:
- **Hobby plan**: Free (100GB bandwidth, 100 serverless executions)
- **Pro plan**: $20/month (if you exceed hobby limits)

---

## 12. Next Steps

1. **Set up monitoring**:
   - Vercel Analytics
   - Databricks Query History
   - Error logging (Sentry, LogRocket)

2. **Add features**:
   - User authentication (NextAuth.js)
   - Save favorite players
   - Team builder with budget calculator
   - Weekly email reports

3. **Optimize data pipeline**:
   - Schedule notebook to run weekly (Databricks Jobs)
   - Add incremental updates
   - Monitor prediction accuracy

---

## 📞 Quick Reference

### Environment Variables
```bash
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi...
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/...
DATABRICKS_WAREHOUSE_ID=your-warehouse-id
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=fplgeek
```

### API Endpoints
```
GET /api/top-picks?count=15&gameweek=10
GET /api/players?position=3&minPrice=5&maxPrice=10
GET /api/player/[id]
GET /api/fixtures?gameweek=10&team=1
```

### Useful Links
- [Databricks SQL Statement API Docs](https://docs.databricks.com/api/workspace/statementexecution)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

**You're all set!** 🚀

Your FPL data pipeline is ready to power a production frontend. Start with the test connection endpoint, then build out your UI components.