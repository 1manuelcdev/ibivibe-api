import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiConsumes,
} from '@nestjs/swagger';
import { CurrentAccount } from 'src/modules/common/decorators/current-account.decorator';
import { Public } from 'src/modules/common/decorators/public.decorator';
import {
	ReorderEventMediaDto,
	UpdateEventMediaDto,
	UploadEventMediaDto,
} from 'src/modules/medias/dtos/upload-media.dto';
import { MediasService } from 'src/modules/medias/medias.service';

import { CreateEventDTO } from './dto/create-event.dto';
import { UpdateEventDTO } from './dto/update-event.dto';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';

const eventMediaUploadOptions = {
	limits: { fileSize: 50 * 1024 * 1024, files: 1 },
	fileFilter: (
		_req: unknown,
		file: Express.Multer.File,
		callback: (error: Error | null, acceptFile: boolean) => void,
	) =>
		callback(
			null,
			[
				'image/jpeg',
				'image/png',
				'image/webp',
				'video/mp4',
				'video/webm',
			].includes(file.mimetype),
		),
};

@Controller({ path: 'events', version: '1' })
export class EventsController {
	constructor(
		private readonly eventsService: EventsService,
		private readonly mediasService: MediasService,
	) {}

	@ApiBearerAuth()
	@ApiBody({ type: CreateEventDTO })
	@ApiOperation({ summary: 'Cria um novo evento' })
	@ApiResponse({ status: 201, type: Event })
	@Post()
	create(
		@Body() createEventDto: CreateEventDTO,
		@CurrentAccount('id') accountId: string,
	) {
		return this.eventsService.create(createEventDto, accountId);
	}

	@ApiBearerAuth()
	@Public()
	@ApiOperation({ summary: 'Obtém todos os eventos' })
	@ApiResponse({ status: 200, type: Event, isArray: true })
	@Get()
	findAll() {
		return this.eventsService.findAll();
	}

	@ApiBearerAuth()
	@ApiOperation({ summary: 'Obtém os eventos da conta autenticada' })
	@ApiResponse({ status: 200, type: Event, isArray: true })
	@Get('owned')
	findOwned(@CurrentAccount('id') accountId: string) {
		return this.eventsService.findAll(accountId);
	}

	@ApiBearerAuth()
	@ApiOperation({ summary: 'Buscar um evento pelo ID' })
	@ApiParam({ name: 'id', description: 'UUID do evento' })
	@ApiResponse({ status: 200, type: Event })
	@ApiResponse({ status: 404, description: 'Evento não encontrado' })
	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.eventsService.findOne(id);
	}

	@ApiBearerAuth()
	@ApiOperation({ summary: 'Listar mídias de um evento' })
	@Get(':id/media')
	media(@Param('id') id: string) {
		return this.mediasService.getMediaByEvent(id);
	}

	@ApiBearerAuth()
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: { type: 'string', format: 'binary' },
				is_cover: { type: 'boolean' },
				position: { type: 'integer' },
				alt_text: { type: 'string' },
			},
			required: ['file'],
		},
	})
	@Post(':id/media')
	@UseInterceptors(FileInterceptor('file', eventMediaUploadOptions))
	mediaUpload(
		@Param('id') id: string,
		@CurrentAccount('id') accountId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: UploadEventMediaDto,
	) {
		return this.mediasService.addEventMedia(id, accountId, file, dto);
	}

	@ApiBearerAuth()
	@Patch(':id/media/order')
	mediaOrder(
		@Param('id') id: string,
		@CurrentAccount('id') accountId: string,
		@Body() dto: ReorderEventMediaDto,
	) {
		return this.mediasService.reorderEventMedia(id, accountId, dto.media_ids);
	}

	@ApiBearerAuth()
	@Patch(':id/media/:mediaId')
	mediaUpdate(
		@Param('id') id: string,
		@Param('mediaId') mediaId: string,
		@CurrentAccount('id') accountId: string,
		@Body() dto: UpdateEventMediaDto,
	) {
		return this.mediasService.updateEventMedia(id, mediaId, accountId, dto);
	}

	@ApiBearerAuth()
	@Delete(':id/media/:mediaId')
	mediaDelete(
		@Param('id') id: string,
		@Param('mediaId') mediaId: string,
		@CurrentAccount('id') accountId: string,
	) {
		return this.mediasService.removeEventMedia(id, mediaId, accountId);
	}

	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'UUID do evento' })
	@ApiBody({ type: UpdateEventDTO })
	@ApiOperation({ summary: 'Atualizar dados de um evento' })
	@ApiResponse({ status: 200, type: Event })
	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateEventDto: UpdateEventDTO,
		@CurrentAccount('id') accountId: string,
	) {
		return this.eventsService.update(id, updateEventDto, accountId);
	}

	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'UUID do evento' })
	@ApiOperation({ summary: 'Publicar um rascunho' })
	@ApiResponse({ status: 200, type: Event })
	@Patch(':id/publish')
	publish(@Param('id') id: string, @CurrentAccount('id') accountId: string) {
		return this.eventsService.publish(id, accountId);
	}

	@ApiBearerAuth()
	@ApiParam({ name: 'id', description: 'UUID do evento' })
	@ApiOperation({ summary: 'Remover um evento' })
	@ApiResponse({ status: 200, description: 'Mensagem de sucesso' })
	@Delete(':id')
	remove(@Param('id') id: string, @CurrentAccount('id') accountId: string) {
		return this.eventsService.remove(id, accountId);
	}
}
