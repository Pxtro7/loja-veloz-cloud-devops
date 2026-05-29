/**
 * Serviço de Pagamentos - Loja Veloz
 * Processa pagamentos e gerencia transações
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
  defaultMeta: { service: 'pagamentos' },
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
const PORT = process.env.PORT || 3002;

// In-memory database (use PostgreSQL in production)
const pagamentosDB = new Map();

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'pagamentos',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Process payment
app.post('/processar', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { pedido_id, valor, forma_pagamento, dados_cartao } = req.body;

  logger.info('Processando pagamento', { traceId, pedido_id, valor, forma_pagamento });

  // Validation
  if (!pedido_id || !valor || !forma_pagamento) {
    return res.status(400).json({
      error: 'Campos obrigatórios: pedido_id, valor, forma_pagamento',
      traceId
    });
  }

  const pagamentoId = uuidv4();

  // Simulate payment processing (replace with real gateway integration)
  const processPayment = async () => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simulate success rate (90% success for demo)
    const isSuccess = Math.random() > 0.1;

    return {
      success: isSuccess,
      codigo_autorizacao: isSuccess ? `AUTH-${Date.now()}` : null,
      mensagem: isSuccess ? 'Pagamento autorizado' : 'Pagamento recusado',
      codigo_erro: isSuccess ? null : 'RECUSADO'
    };
  };

  try {
    const resultado = await processPayment();

    const pagamento = {
      id: pagamentoId,
      pedido_id,
      valor,
      forma_pagamento,
      status: resultado.success ? 'APROVADO' : 'RECUSADO',
      codigo_autorizacao: resultado.codigo_autorizacao,
      mensagem: resultado.mensagem,
      codigo_erro: resultado.codigo_erro,
      processado_em: new Date().toISOString(),
      traceId
    };

    pagamentosDB.set(pagamentoId, pagamento);

    logger.info('Pagamento processado', {
      traceId,
      pagamentoId,
      pedido_id,
      status: pagamento.status
    });

    res.status(resultado.success ? 201 : 400).json(pagamento);
  } catch (error) {
    logger.error('Erro ao processar pagamento', { traceId, error: error.message });
    
    res.status(500).json({
      error: 'Erro ao processar pagamento',
      message: error.message,
      traceId
    });
  }
});

// Get pagamento by ID
app.get('/:id', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  const pagamento = pagamentosDB.get(id);
  
  if (!pagamento) {
    return res.status(404).json({ error: 'Pagamento não encontrado', traceId });
  }

  res.json(pagamento);
});

// Get pagamento by pedido
app.get('/pedido/:pedido_id', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { pedido_id } = req.params;

  const pagamentos = Array.from(pagamentosDB.values())
    .filter(p => p.pedido_id === pedido_id);

  if (pagamentos.length === 0) {
    return res.status(404).json({ error: 'Nenhum pagamento encontrado para este pedido', traceId });
  }

  res.json(pagamentos[0]);
});

// List pagamentos
app.get('/', (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { status, limit = 50, offset = 0 } = req.query;

  let pagamentos = Array.from(pagamentosDB.values());

  if (status) {
    pagamentos = pagamentos.filter(p => p.status === status);
  }

  pagamentos = pagamentos
    .sort((a, b) => new Date(b.processado_em) - new Date(a.processado_em))
    .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    total: pagamentosDB.size,
    pagamentos,
    traceId
  });
});

// Refund payment
app.post('/:id/estornar', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  const { id } = req.params;

  const pagamento = pagamentosDB.get(id);
  
  if (!pagamento) {
    return res.status(404).json({ error: 'Pagamento não encontrado', traceId });
  }

  if (pagamento.status !== 'APROVADO') {
    return res.status(400).json({
      error: 'Apenas pagamentos aprovados podem ser estornados',
      status: pagamento.status,
      traceId
    });
  }

  // Simulate refund processing
  await new Promise(resolve => setTimeout(resolve, 500));

  pagamento.status = 'ESTORNADO';
  pagamento.estornado_em = new Date().toISOString();

  logger.info('Pagamento estornado', { traceId, pagamentoId: id });

  res.json(pagamento);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Serviço de Pagamentos listening on port ${PORT}`);
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
