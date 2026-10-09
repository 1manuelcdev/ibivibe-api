import { Module } from '@nestjs/common';

import { PrismaModule } from '../common/prisma/prisma.module';
import { MediasModule } from '../medias/medias.module';
import { TagsModule } from '../tags/tags.module';
import { AdminTagsController } from './admin-tags.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
	imports: [PrismaModule, MediasModule, TagsModule],
	controllers: [AdminTagsController, AdminController],
	providers: [AdminService],
})
export class AdminModule {}
