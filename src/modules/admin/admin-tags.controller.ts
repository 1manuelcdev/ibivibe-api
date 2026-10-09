import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { tag_target_type } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { CreateTagGroupDto } from '../tags/dto/create-tag-group.dto';
import { CreateTagDto } from '../tags/dto/create-tag.dto';
import { UpdateTagGroupDto } from '../tags/dto/update-tag-group.dto';
import { UpdateTagDto } from '../tags/dto/update-tag.dto';
import { TagGroupsService } from '../tags/tag-groups.service';
import { TagsService } from '../tags/tags.service';

@ApiTags('Admin - Tags')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Token ausente ou inválido' })
@ApiResponse({
	status: 403,
	description: 'Usuário sem permissão administrativa',
})
@Controller({ path: 'admin', version: '1' })
@Roles('admin', 'super_admin')
export class AdminTagsController {
	constructor(
		private readonly tagGroupsService: TagGroupsService,
		private readonly tagsService: TagsService,
	) {}

	@Get('resources/tag-groups')
	@ApiOperation({ summary: 'Listar grupos de tags com tags e destinos' })
	@ApiResponse({ status: 200, description: 'Grupos ordenados por nome' })
	listGroups() {
		return this.tagGroupsService.findAllAdmin();
	}

	@Post('resources/tag-groups')
	@ApiOperation({ summary: 'Criar grupo de tags' })
	@ApiBody({ type: CreateTagGroupDto })
	@ApiResponse({ status: 201, description: 'Grupo criado' })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	createGroup(@Body() dto: CreateTagGroupDto) {
		return this.tagGroupsService.createAdmin(dto);
	}

	@Patch('resources/tag-groups/:id')
	@ApiOperation({ summary: 'Atualizar grupo de tags' })
	@ApiParam({ name: 'id', description: 'UUID do grupo' })
	@ApiBody({ type: UpdateTagGroupDto })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	@ApiResponse({ status: 404, description: 'Grupo não encontrado' })
	updateGroup(@Param('id') id: string, @Body() dto: UpdateTagGroupDto) {
		return this.tagGroupsService.updateAdmin(id, dto);
	}

	@Delete('resources/tag-groups/:id')
	@ApiOperation({ summary: 'Excluir grupo de tags' })
	@ApiParam({ name: 'id', description: 'UUID do grupo' })
	@ApiResponse({ status: 404, description: 'Grupo não encontrado' })
	removeGroup(@Param('id') id: string) {
		return this.tagGroupsService.removeAdmin(id);
	}

	@Get('resources/tags')
	@ApiOperation({ summary: 'Listar tags administrativas com destinos' })
	@ApiQuery({ name: 'group_id', required: false })
	@ApiQuery({ name: 'name', required: false })
	@ApiQuery({ name: 'target_type', enum: tag_target_type, required: false })
	@ApiResponse({
		status: 200,
		description: 'Tags ordenadas por grupo e posição',
	})
	listTags(
		@Query('group_id') group_id?: string,
		@Query('name') name?: string,
		@Query('target_type') target_type?: tag_target_type,
	) {
		return this.tagsService.findAllAdmin({ group_id, name, target_type });
	}

	@Get('resources/tags/:id')
	@ApiOperation({ summary: 'Obter tag administrativa com destinos' })
	@ApiParam({ name: 'id', description: 'UUID da tag' })
	@ApiResponse({ status: 404, description: 'Tag não encontrada' })
	getTag(@Param('id') id: string) {
		return this.tagsService.findOneAdmin(id);
	}

	@Post('resources/tags')
	@ApiOperation({ summary: 'Criar tag administrativa' })
	@ApiBody({ type: CreateTagDto })
	@ApiResponse({ status: 201, description: 'Tag criada' })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	@ApiResponse({ status: 404, description: 'Grupo não encontrado' })
	createTag(@Body() dto: CreateTagDto) {
		return this.tagsService.createAdmin(dto);
	}

	@Patch('resources/tags/:id')
	@ApiOperation({ summary: 'Atualizar tag administrativa' })
	@ApiParam({ name: 'id', description: 'UUID da tag' })
	@ApiBody({ type: UpdateTagDto })
	@ApiResponse({ status: 400, description: 'Payload inválido' })
	@ApiResponse({ status: 404, description: 'Tag não encontrada' })
	updateTag(@Param('id') id: string, @Body() dto: UpdateTagDto) {
		return this.tagsService.updateAdmin(id, dto);
	}

	@Delete('resources/tags/:id')
	@ApiOperation({ summary: 'Excluir tag administrativa' })
	@ApiParam({ name: 'id', description: 'UUID da tag' })
	@ApiResponse({ status: 404, description: 'Tag não encontrada' })
	removeTag(@Param('id') id: string) {
		return this.tagsService.removeAdmin(id);
	}
}
