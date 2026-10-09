import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/modules/common/prisma/prisma.module';
import { MediasModule } from 'src/modules/medias/medias.module';

import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
	imports: [PrismaModule, MediasModule],
	controllers: [EventsController],
	providers: [EventsService],
})
export class EventsModule {}
