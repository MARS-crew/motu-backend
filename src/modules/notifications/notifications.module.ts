import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationSettingsController } from './notification-settings.controller.js';
import { NotificationSettingsService } from './notification-settings.service.js';

@Module({
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [NotificationsService, NotificationSettingsService],
  exports: [NotificationsService, NotificationSettingsService],
})
export class NotificationsModule {}
