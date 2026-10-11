import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  it('GET /api/health - 공통 성공 응답 형식', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ success: true, data: { status: 'ok' } });
  });

  it('존재하지 않는 경로 - 공통 실패 응답 형식', () => {
    return request(app.getHttpServer())
      .get('/api/not-found')
      .expect(404)
      .expect((res) => {
        expect(res.body).toEqual({
          success: false,
          error: { code: 'NOT_FOUND', message: expect.any(String) },
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
