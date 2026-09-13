import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './database/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: async () => [{ '?column?': 1 }],
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports process liveness', () => {
      expect(appController.getLiveness()).toEqual({ status: 'ok' });
    });

    it('reports database readiness', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ok',
      });
    });
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
