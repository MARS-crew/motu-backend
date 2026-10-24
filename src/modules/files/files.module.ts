import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FileStorageService } from './file-storage.service.js';
@Module({
  controllers: [FilesController],
  providers: [FilesService, FileStorageService],
  exports: [FilesService],
})
export class FilesModule {}
