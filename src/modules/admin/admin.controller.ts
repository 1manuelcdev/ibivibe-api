import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Put,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator';
import {
	ReorderEventMediaDto,
	UpdateEventMediaDto,
	UploadEventMediaDto,
} from '../medias/dtos/upload-media.dto';
import { MediasService } from '../medias/medias.service';
import { AdminService } from './admin.service';
import { ReplaceCityTagsDto, UpdateCityAdminDto } from './dto/city-admin.dto';

const cityMediaUploadOptions = {
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

@ApiTags('Admin')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Token ausente ou inválido' })
@ApiResponse({
	status: 403,
	description: 'Usuário sem permissão administrativa',
})
@Controller({ path: 'admin', version: '1' })
@Roles('admin', 'super_admin')
export class AdminController {
	constructor(
		private readonly adminService: AdminService,
		private readonly mediasService: MediasService,
	) {}

	@Get('overview')
	@ApiOperation({ summary: 'Resumo operacional do painel administrativo' })
	overview() {
		return this.adminService.overview();
	}

	@Get('resources/:resource')
	list(@Param('resource') resource: string) {
		return this.adminService.list(resource);
	}

	@Post('resources/:resource')
	create(
		@Param('resource') resource: string,
		@Body() body: Record<string, unknown>,
	) {
		return this.adminService.create(resource, body);
	}

	@ApiOperation({ summary: 'Atualizar uma cidade administrativa' })
	@ApiParam({ name: 'id', description: 'UUID da cidade' })
	@ApiBody({ type: UpdateCityAdminDto })
	@ApiResponse({
		status: 400,
		description: 'Payload inválido ou coordenada incompleta',
	})
	@ApiResponse({ status: 401, description: 'Token ausente ou inválido' })
	@ApiResponse({
		status: 403,
		description: 'Usuário sem permissão administrativa',
	})
	@ApiResponse({ status: 404, description: 'Cidade não encontrada' })
	@Patch('resources/cities/:id')
	updateCity(@Param('id') id: string, @Body() body: UpdateCityAdminDto) {
		return this.adminService.updateCity(id, body);
	}

	@ApiOperation({ summary: 'Substituir as tags de uma cidade' })
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiBody({ type: ReplaceCityTagsDto })
	@ApiResponse({
		status: 400,
		description: 'Tag inexistente ou incompatível com city',
	})
	@ApiResponse({ status: 404, description: 'Cidade não encontrada' })
	@Put('resources/cities/:cityId/tags')
	replaceCityTags(
		@Param('cityId') cityId: string,
		@Body() body: ReplaceCityTagsDto,
	) {
		return this.adminService.replaceCityTags(cityId, body.tag_ids);
	}

	@ApiOperation({ summary: 'Listar mídias administrativas de uma cidade' })
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiResponse({ status: 404, description: 'Cidade não encontrada' })
	@Get('resources/cities/:cityId/media')
	cityMedia(@Param('cityId') cityId: string) {
		return this.mediasService.getMediaByAdminCity(cityId);
	}

	@ApiOperation({ summary: 'Enviar mídia administrativa para uma cidade' })
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: { type: 'string', format: 'binary' },
				is_cover: { type: 'boolean' },
				position: { type: 'integer', minimum: 0 },
				alt_text: { type: 'string' },
			},
			required: ['file'],
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Arquivo ausente ou tipo não suportado',
	})
	@ApiResponse({ status: 404, description: 'Cidade não encontrada' })
	@Post('resources/cities/:cityId/media')
	@UseInterceptors(FileInterceptor('file', cityMediaUploadOptions))
	cityMediaUpload(
		@Param('cityId') cityId: string,
		@UploadedFile() file: Express.Multer.File,
		@Body() body: UploadEventMediaDto,
	) {
		return this.mediasService.addAdminCityMedia(cityId, file, body);
	}

	@ApiOperation({ summary: 'Reordenar mídias de uma cidade' })
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiBody({ type: ReorderEventMediaDto })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	@ApiResponse({ status: 404, description: 'Cidade ou mídia não encontrada' })
	@Patch('resources/cities/:cityId/media/order')
	reorderCityMedia(
		@Param('cityId') cityId: string,
		@Body() body: ReorderEventMediaDto,
	) {
		return this.mediasService.reorderAdminCityMedia(cityId, body.media_ids);
	}

	@ApiOperation({
		summary: 'Atualizar capa, posição ou texto de uma mídia da cidade',
	})
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiParam({ name: 'mediaId', description: 'UUID da mídia' })
	@ApiBody({ type: UpdateEventMediaDto })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	@ApiResponse({ status: 404, description: 'Cidade ou mídia não encontrada' })
	@Patch('resources/cities/:cityId/media/:mediaId')
	updateCityMedia(
		@Param('cityId') cityId: string,
		@Param('mediaId') mediaId: string,
		@Body() body: UpdateEventMediaDto,
	) {
		return this.mediasService.updateAdminCityMedia(cityId, mediaId, body);
	}

	@ApiOperation({ summary: 'Remover mídia administrativa de uma cidade' })
	@ApiParam({ name: 'cityId', description: 'UUID da cidade' })
	@ApiParam({ name: 'mediaId', description: 'UUID da mídia' })
	@ApiResponse({ status: 404, description: 'Cidade ou mídia não encontrada' })
	@Delete('resources/cities/:cityId/media/:mediaId')
	removeCityMedia(
		@Param('cityId') cityId: string,
		@Param('mediaId') mediaId: string,
	) {
		return this.mediasService.removeAdminCityMedia(cityId, mediaId);
	}

	@Patch('resources/:resource/:id')
	update(
		@Param('resource') resource: string,
		@Param('id') id: string,
		@Body() body: Record<string, unknown>,
	) {
		return this.adminService.update(resource, id, body);
	}

	@Delete('resources/:resource/:id')
	remove(@Param('resource') resource: string, @Param('id') id: string) {
		return this.adminService.remove(resource, id);
	}
}
