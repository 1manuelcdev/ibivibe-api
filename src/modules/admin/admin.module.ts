import { Module } from '@nestjs/common';

import { PrismaModule } from '../common/prisma/prisma.module';
import { MediasModule } from '../medias/medias.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
	imports: [PrismaModule, MediasModule],
	controllers: [AdminController],
	providers: [AdminService],
})
export class AdminModule {}
