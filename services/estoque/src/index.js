/**
 * Serviço de Estoque - Loja Veloz
 * Gerencia inventário de produtos
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'estoque' },
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
const PORT = process.env.PORT || 3003;

// In-memory database (use PostgreSQL in production)
const estoqueDB = new Map();

// Initialize with sample products
const initSampleData = () => {
  const produtos = [
    { id: 'prod-001', nome: 'Smartphone XYZ', quantidade: 150, preco: 1999.90 },
    { id: 'prod-002', nome: 'Notebook ABC', quantidade: 75, preco: 3499.90 },
    { id: 'prod-003', nome: 'Fone Bluetooth', quantidade: 300, preco: 199.90 },
    { id: 'prod-004', nome: 'Smartwatch Pro', quantidade: 200, preco: 599.90 },
    { id: 'prod-005', nome: 'Carregador Turbo', quantidade: 500, preco: 79.90 }
  ];

  produtos.forEach(p => {
    estoqueDB.set(p.id, {
      ...p,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  logger.info(`Initialized ${produtos.length} sample products`);
};

initSampleData();

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'estoque',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    produtos_total: estoqueDB.size
  });
});

// Get produto by ID
app.get('/:id', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  const produto = estoqueDB.get(id);
  
  if (!produto) {
    return res.status(404).json({ error: 'Produto não encontrado', traceId });
  }

  res.json(produto);
});

// List produtos
app.get('/', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { disponivel, limit = 50, offset = 0 } = req.query;

  let produtos = Array.from(estoqueDB.values());

  if (disponivel === 'true') {
    produtos = produtos.filter(p => p.quantidade > 0);
  }

  produtos = produtos
    .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    total: estoqueDB.size,
    produtos,
    traceId
  });
});

// Create produto
app.post('/', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { nome, quantidade, preco } = req.body;

  if (!nome || quantidade === undefined || !preco) {
    return res.status(400).json({
      error: 'Campos obrigatórios: nome, quantidade, preco',
      traceId
    });
  }

  const produtoId = `prod-${uuidv4().substr(0, 8)}`;

  const produto = {
    id: produtoId,
    nome,
    quantidade: parseInt(quantidade),
    preco: parseFloat(preco),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  estoqueDB.set(produtoId, produto);

  logger.info('Produto criado', { traceId, produtoId, nome });

  res.status(201).json(produto);
});

// Update quantidade (increment/decrement)
app.patch('/:id/decrementar', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;
  const { quantidade } = req.body;

  const produto = estoqueDB.get(id);
  
  if (!produto) {
    return res.status(404).json({ error: 'Produto não encontrado', traceId });
  }

  if (produto.quantidade < quantidade) {
    return res.status(400).json({
      error: 'Quantidade insuficiente em estoque',
      disponivel: produto.quantidade,
      solicitado: quantidade,
      traceId
    });
  }

  produto.quantidade -= parseInt(quantidade);
  produto.updated_at = new Date().toISOString();

  logger.info('Estoque decrementado', {
    traceId,
    produtoId: id,
    quantidade_dec: quantidade,
    quantidade_atual: produto.quantidade
  });

  res.json(produto);
});

// Increment estoque
app.patch('/:id/incrementar', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;
  const { quantidade } = req.body;

  const produto = estoqueDB.get(id);
  
  if (!produto) {
    return res.status(404).json({ error: 'Produto não encontrado', traceId });
  }

  produto.quantidade += parseInt(quantidade);
  produto.updated_at = new Date().toISOString();

  logger.info('Estoque incrementado', {
    traceId,
    produtoId: id,
    quantidade_inc: quantidade,
    quantidade_atual: produto.quantidade
  });

  res.json(produto);
});

// Delete produto
app.delete('/:id', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  if (!estoqueDB.has(id)) {
    return res.status(404).json({ error: 'Produto não encontrado', traceId });
  }

  estoqueDB.delete(id);

  logger.info('Produto removido', { traceId, produtoId: id });

  res.status(204).send();
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Serviço de Estoque listening on port ${PORT}`);
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
