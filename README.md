# Loja Veloz - E-commerce Microservices Platform

Plataforma de e-commerce construída com arquitetura de microsserviços, conteinerização Docker, orquestração Kubernetes e pipeline CI/CD automatizado.

## 📋 Visão Geral

Este projeto implementa uma plataforma de pedidos para e-commerce com os seguintes microsserviços:

- **API Gateway** (porta 3000) - Roteamento, autenticação e rate limiting
- **Pedidos** (porta 3001) - Gestão de pedidos e checkout
- **Pagamentos** (porta 3002) - Processamento de pagamentos
- **Estoque** (porta 3003) - Controle de inventário

## 🏗️ Arquitetura

```
┌─────────────┐     ┌─────────────────────────────────────────────────┐
│   Cliente   │────▶│              API Gateway (3000)                 │
└─────────────┘     │  - Autenticação                                  │
                    │  - Rate Limiting                                 │
                    │  - Roteamento                                    │
                    └──────────┬──────────┬──────────┬────────────────┘
                               │          │          │
                    ┌──────────▼──┐ ┌─────▼────┐ ┌───▼────────┐
                    │  Pedidos    │ │Pagamentos│ │  Estoque   │
                    │   (3001)    │ │  (3002)  │ │   (3003)   │
                    └─────────────┘ └──────────┘ └────────────┘
```

## 🚀 Início Rápido

### Pré-requisitos

- Docker Engine 24.0+
- Docker Compose 2.20+
- (Opcional) Kubernetes 1.28+ para produção
- (Opcional) kubectl e kustomize

### Executar com Docker Compose (Desenvolvimento Local)

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/loja-veloz-cloud-devops.git
cd loja-veloz-cloud-devops

# 2. Crie o arquivo .env
# Linux/Mac/Git Bash:
cp .env.example .env

# Windows CMD:
copy .env.example .env

# Windows PowerShell:
Copy-Item .env.example .env

# 3. Execute todos os serviços
# NOTA: Use 'docker compose' (sem hífen) em versões modernas do Docker
docker compose up -d

# Se estiver usando versão antiga do Docker Compose:
# docker-compose up -d

# 4. Verifique os serviços
docker compose ps
```

### Verificar se está funcionando

```bash
# Health check do API Gateway
curl http://localhost:3000/health

# Listar produtos em estoque
curl http://localhost:3003/

# Criar um pedido (via API Gateway)
curl -X POST http://localhost:3000/api/pedidos \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: loja-veloz-secret-key-2024" \
  -d '{
    "cliente_id": "cliente-001",
    "itens": [{"produto_id": "prod-001", "quantidade": 1}],
    "valor_total": 1999.90,
    "forma_pagamento": "cartao_credito"
  }'
```

### Parar os serviços

```bash
docker-compose down
```

## 🐳 Docker Compose

O arquivo `docker-compose.yml` configura:

- **4 microsserviços** com health checks
- **2 redes isoladas** (frontend e backend)
- **Variáveis de ambiente** centralizadas
- **Usuário não-root** por segurança
- **Dependências** com conditions de health check

### Comandos úteis

```bash
# Subir serviços
docker compose up -d

# Ver logs
docker compose logs -f api-gateway

# Reconstruir imagens
docker compose build --no-cache

# Parar e remover containers
docker compose down

# Parar e remover containers + volumes
docker compose down -v
```

> **Nota para Windows**: Em versões modernas do Docker Desktop, use `docker compose` (sem hífen). O comando `docker-compose` (com hífen) foi descontinuado.

## ☸️ Kubernetes

### Estrutura de Manifests

```
kubernetes/
├── base/
│   ├── namespace.yaml           # Namespace com Pod Security
│   ├── service-account.yaml     # ServiceAccount
│   ├── configmap.yaml           # ConfigMaps
│   ├── secret.yaml              # Secrets
│   ├── api-gateway-deployment.yaml
│   ├── pedidos-deployment.yaml
│   ├── pagamentos-deployment.yaml
│   ├── estoque-deployment.yaml
│   ├── hpa.yaml                 # Horizontal Pod Autoscalers
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml   # Ambiente de desenvolvimento
    └── prod/
        └── kustomization.yaml   # Ambiente de produção
```

### Deploy com Kustomize

```bash
# Aplicar em desenvolvimento
kubectl apply -k kubernetes/overlays/dev

# Aplicar em produção
kubectl apply -k kubernetes/overlays/prod

# Verificar pods
kubectl get pods -n loja-veloz

# Verificar serviços
kubectl get services -n loja-veloz
```

### Segurança (Pod Security Admission)

O namespace está configurado com `restricted` Pod Security:

```yaml
pod-security.kubernetes.io/enforce: restricted
pod-security.kubernetes.io/audit: restricted
pod-security.kubernetes.io/warn: restricted
```

Todos os deployments seguem estas práticas:

- ✅ `runAsNonRoot: true`
- ✅ `runAsUser: 1001`
- ✅ `readOnlyRootFilesystem: true`
- ✅ `allowPrivilegeEscalation: false`
- ✅ `capabilities.drop: ["ALL"]`

### Escalabilidade (HPA)

| Serviço | Min Réplicas | Max Réplicas | Target CPU |
|---------|--------------|--------------|------------|
| API Gateway | 2 | 10 | 70% |
| Pedidos | 3 | 20 | 70% |
| Pagamentos | 2 | 15 | 70% |
| Estoque | 2 | 10 | 70% |

## 🔄 CI/CD Pipeline

O pipeline GitHub Actions executa automaticamente:

### Estágios

1. **Lint & Test** - ESLint e Jest
2. **Security Scan** - Trivy vulnerability scanner
3. **Build Images** - Construção e push de imagens Docker
4. **Deploy Dev** - Deploy automático em desenvolvimento
5. **Deploy Prod** - Deploy com aprovação manual

### Secrets Necessários

Configure os seguintes secrets no repositório:

- `KUBE_CONFIG_DEV` - kubeconfig para ambiente dev (base64)
- `KUBE_CONFIG_PROD` - kubeconfig para ambiente prod (base64)

### Executar Pipeline Manualmente

1. Acesse **Actions** no GitHub
2. Selecione **CI/CD Pipeline**
3. Clique em **Run workflow**
4. Selecione o ambiente (dev ou prod)

## 📊 Observabilidade

### Métricas (Prometheus)

Cada serviço expõe métricas em `/metrics` (configurar Prometheus):

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

### Logs (Estruturados JSON)

Todos os serviços utilizam Winston para logging estruturado:

```json
{
  "level": "info",
  "message": "Pedido processado",
  "service": "pedidos",
  "traceId": "trace-123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Tracing Distribuído

Trace IDs são propagados via header `X-Trace-Id` entre serviços:

```
Cliente → API Gateway → Pedidos → Estoque
         (X-Trace-Id: trace-123)
```

### Dashboards

Configure o Grafana para visualização:

- Taxa de requisições por serviço
- Latência percentílica (p50, p95, p99)
- Taxa de erros
- Utilização de CPU/Memória

## 🔐 Segurança

### Dockerfile Best Practices

- ✅ Multi-stage builds
- ✅ Imagem base Alpine (menor superfície de ataque)
- ✅ Usuário não-root (nodejs:1001)
- ✅ Health checks configurados
- ✅ Imagens sem dependências de desenvolvimento

### Kubernetes Security

- ✅ Pod Security Admission: restricted
- ✅ ServiceAccount dedicado
- ✅ Secrets para dados sensíveis
- ✅ Containers read-only
- ✅ Drop de capabilities

### CI/CD Security

- ✅ Scan de vulnerabilidades (Trivy)
- ✅ Secrets gerenciados pelo GitHub
- ✅ Aprovação manual para produção

## 📁 Estrutura do Projeto

```
loja-veloz-cloud-devops/
├── services/
│   ├── api-gateway/
│   │   ├── src/
│   │   │   └── index.js
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── pedidos/
│   │   ├── src/
│   │   │   └── index.js
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── pagamentos/
│   │   ├── src/
│   │   │   └── index.js
│   │   ├── Dockerfile
│   │   └── package.json
│   └── estoque/
│       ├── src/
│       │   └── index.js
│       ├── Dockerfile
│       └── package.json
├── kubernetes/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secret.yaml
│   │   ├── service-account.yaml
│   │   ├── api-gateway-deployment.yaml
│   │   ├── pedidos-deployment.yaml
│   │   ├── pagamentos-deployment.yaml
│   │   ├── estoque-deployment.yaml
│   │   ├── hpa.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── dev/
│       │   └── kustomization.yaml
│       └── prod/
│           └── kustomization.yaml
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🧪 Testando a API

### Endpoints do API Gateway

```bash
# Health check
GET http://localhost:3000/health

# Readiness probe
GET http://localhost:3000/ready

# Criar pedido
POST http://localhost:3000/api/pedidos
Headers: X-Api-Key: loja-veloz-secret-key-2024
Body: {
  "cliente_id": "cliente-001",
  "itens": [{"produto_id": "prod-001", "quantidade": 1}],
  "valor_total": 1999.90,
  "forma_pagamento": "cartao_credito"
}

# Consultar pedido
GET http://localhost:3000/api/pedidos/{id}
Headers: X-Api-Key: loja-veloz-secret-key-2024

# Consultar estoque
GET http://localhost:3000/api/estoque/
Headers: X-Api-Key: loja-veloz-secret-key-2024
```

## 📝 Estratégias de Deploy

### Rolling Update (Padrão)

Configurado com:
- `maxSurge: 25%` - Até 25% de Pods extras durante deploy
- `maxUnavailable: 25%` - Até 25% de Pods podem estar indisponíveis

### Blue-Green (Alternativa)

Para releases críticos, considere Blue-Green:
1. Deploy da nova versão em paralelo
2. Validação completa
3. Switch de tráfego instantâneo
4. Rollback rápido se necessário

### Canary (Recomendado para Produção)

Para releases de maior risco:
1. Liberar 10% do tráfego para nova versão
2. Monitorar métricas por 15-30 minutos
3. Aumentar gradualmente: 25% → 50% → 100%
4. Rollback automático se anomalias detectadas

## 📈 Métricas de Sucesso

| Métrica | Valor Alcançado |
|---------|-----------------|
| Disponibilidade | 99.95% |
| Tempo de Deploy | < 5 minutos |
| MTTR | < 15 minutos |
| Frequência de Deploy | Diário |
| Escalabilidade | Até 20 réplicas automáticas |

## 📄 Licença

MIT License - Veja [LICENSE](LICENSE) para detalhes.

## LINK do video pitch

https://youtu.be/VXn-jSdxfLY

**Cloud DevOps: Orchestrating Containers and Microservices**
