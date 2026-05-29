/**
 * API Gateway - Loja Veloz
 * Centraliza roteamento, autenticação e rate limiting
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const winston = require('winston');

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Environment variables
const PORT = process.env.PORT || 3000;
const PEDIDOS_SERVICE_URL = process.env.PEDIDOS_SERVICE_URL || 'http://pedidos:3001';
const PAGAMENTOS_SERVICE_URL = process.env.PAGAMENTOS_SERVICE_URL || 'http://pagamentos:3002';
const ESTOQUE_SERVICE_URL = process.env.ESTOQUE_SERVICE_URL || 'http://estoque:3003';
const API_KEY = process.env.API_KEY || 'default-api-key';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  const traceId = req.headers['x-trace-id'] || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  logger.info(`${req.method} ${req.path}`, { traceId, ip: req.ip });
  next();
});

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized - Invalid API Key' });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness probe
app.get('/ready', async (req, res) => {
  try {
    // Check downstream services
    const services = [
      { name: 'pedidos', url: `${PEDIDOS_SERVICE_URL}/health` },
      { name: 'pagamentos', url: `${PAGAMENTOS_SERVICE_URL}/health` },
      { name: 'estoque', url: `${ESTOQUE_SERVICE_URL}/health` }
    ];

    const checks = await Promise.allSettled(
      services.map(s => axios.get(s.url, { timeout: 2000 }))
    );

    const results = services.map((s, i) => ({
      service: s.name,
      status: checks[i].status === 'fulfilled' ? 'up' : 'down'
    }));

    const allHealthy = results.every(r => r.status === 'up');
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'degraded',
      services: results
    });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Proxy routes to microservices
const proxyRequest = async (targetUrl, req, res) => {
  try {
    const config = {
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': req.traceId
      },
      timeout: 30000
    };
    
    const response = await axios(config);
    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error('Proxy error', { 
      traceId: req.traceId, 
      error: error.message,
      targetUrl 
    });
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: 'Service unavailable', traceId: req.traceId });
    }
  }
};

// Routes with authentication
app.use('/api/pedidos', authenticateApiKey, (req, res) => {
  proxyRequest(`${PEDIDOS_SERVICE_URL}${req.path}`, req, res);
});

app.use('/api/pagamentos', authenticateApiKey, (req, res) => {
  proxyRequest(`${PAGAMENTOS_SERVICE_URL}${req.path}`, req, res);
});

app.use('/api/estoque', authenticateApiKey, (req, res) => {
  proxyRequest(`${ESTOQUE_SERVICE_URL}${req.path}`, req, res);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Loja Veloz API Gateway',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /ready - Readiness probe',
      'POST /api/pedidos - Pedidos service',
      'POST /api/pagamentos - Pagamentos service',
      'GET /api/estoque - Estoque service'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    traceId: req.traceId, 
    error: err.message,
    stack: err.stack 
  });
  res.status(500).json({ 
    error: 'Internal Server Error',
    traceId: req.traceId 
  });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`API Gateway listening on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
