/**
 * Serviço de Pedidos - Loja Veloz
 * Gerencia criação e consulta de pedidos
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
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
  defaultMeta: { service: 'pedidos' },
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
const PORT = process.env.PORT || 3001;
const ESTOQUE_SERVICE_URL = process.env.ESTOQUE_SERVICE_URL || 'http://estoque:3003';
const PAGAMENTOS_SERVICE_URL = process.env.PAGAMENTOS_SERVICE_URL || 'http://pagamentos:3002';

// In-memory database (use PostgreSQL in production)
const pedidosDB = new Map();

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'pedidos',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Create pedido
app.post('/', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { cliente_id, itens, valor_total, forma_pagamento } = req.body;

  logger.info('Criando pedido', { traceId, cliente_id, quantidade_itens: itens?.length });

  // Validation
  if (!cliente_id || !itens || !valor_total || !forma_pagamento) {
    return res.status(400).json({
      error: 'Campos obrigatórios: cliente_id, itens, valor_total, forma_pagamento',
      traceId
    });
  }

  const pedidoId = uuidv4();

  try {
    // Check estoque for all items
    for (const item of itens) {
      const estoqueResponse = await axios.get(
        `${ESTOQUE_SERVICE_URL}/${item.produto_id}`,
        { headers: { 'X-Trace-Id': traceId }, timeout: 5000 }
      );
      
      if (estoqueResponse.data.quantidade < item.quantidade) {
        logger.warn('Estoque insuficiente', { traceId, produto_id: item.produto_id });
        return res.status(400).json({
          error: `Estoque insuficiente para produto ${item.produto_id}`,
          traceId
        });
      }
    }

    // Create pedido record
    const pedido = {
      id: pedidoId,
      cliente_id,
      itens,
      valor_total,
      forma_pagamento,
      status: 'PENDENTE_PAGAMENTO',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    pedidosDB.set(pedidoId, pedido);

    // Request payment processing
    const pagamentoResponse = await axios.post(
      `${PAGAMENTOS_SERVICE_URL}/processar`,
      {
        pedido_id: pedidoId,
        valor: valor_total,
        forma_pagamento
      },
      { headers: { 'X-Trace-Id': traceId }, timeout: 30000 }
    );

    // Update pedido status
    pedido.status = pagamentoResponse.data.status === 'APROVADO' 
      ? 'CONFIRMADO' 
      : 'CANCELADO';
    pedido.pagamento_id = pagamentoResponse.data.pagamento_id;
    pedido.updated_at = new Date().toISOString();

    // Update estoque if payment approved
    if (pedido.status === 'CONFIRMADO') {
      for (const item of itens) {
        await axios.patch(
          `${ESTOQUE_SERVICE_URL}/${item.produto_id}/decrementar`,
          { quantidade: item.quantidade },
          { headers: { 'X-Trace-Id': traceId }, timeout: 5000 }
        );
      }
    }

    logger.info('Pedido processado', { traceId, pedidoId, status: pedido.status });

    res.status(201).json(pedido);
  } catch (error) {
    logger.error('Erro ao processar pedido', { traceId, error: error.message });
    
    // Cancel pedido on error
    const pedido = pedidosDB.get(pedidoId);
    if (pedido) {
      pedido.status = 'ERRO';
      pedido.erro = error.message;
    }
    
    res.status(500).json({
      error: 'Erro ao processar pedido',
      message: error.message,
      traceId
    });
  }
});

// Get pedido by ID
app.get('/:id', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  const pedido = pedidosDB.get(id);
  
  if (!pedido) {
    return res.status(404).json({ error: 'Pedido não encontrado', traceId });
  }

  res.json(pedido);
});

// List pedidos
app.get('/', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { cliente_id, status, limit = 50, offset = 0 } = req.query;

  let pedidos = Array.from(pedidosDB.values());

  if (cliente_id) {
    pedidos = pedidos.filter(p => p.cliente_id === cliente_id);
  }
  if (status) {
    pedidos = pedidos.filter(p => p.status === status);
  }

  pedidos = pedidos
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    total: pedidosDB.size,
    pedidos,
    traceId
  });
});

// Cancel pedido
app.patch('/:id/cancelar', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  const pedido = pedidosDB.get(id);
  
  if (!pedido) {
    return res.status(404).json({ error: 'Pedido não encontrado', traceId });
  }

  if (pedido.status !== 'PENDENTE_PAGAMENTO') {
    return res.status(400).json({
      error: 'Pedido não pode ser cancelado no status atual',
      status: pedido.status,
      traceId
    });
  }

  pedido.status = 'CANCELADO';
  pedido.updated_at = new Date().toISOString();

  logger.info('Pedido cancelado', { traceId, pedidoId: id });

  res.json(pedido);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Serviço de Pedidos listening on port ${PORT}`);
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
