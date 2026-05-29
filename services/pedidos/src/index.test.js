const request = require('supertest');
const app = require('./index');

describe('Pedidos Service', () => {
  it('should return healthy status on /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
  });
});
