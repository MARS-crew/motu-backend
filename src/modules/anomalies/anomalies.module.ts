import { Module } from '@nestjs/common';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { AnomaliesController } from './anomalies.controller.js';
import { AnomaliesService } from './anomalies.service.js';
import { AnomalyDetectorService } from './anomaly-detector.service.js';

@Module({
  imports: [MatchingModule, AdminActivityLogsModule],
  controllers: [AnomaliesController],
  providers: [AnomaliesService, AnomalyDetectorService],
  exports: [AnomaliesService],
})
export class AnomaliesModule {}
