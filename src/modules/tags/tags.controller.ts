import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { tag_target_type } from '@prisma/client';
import { Public } from 'src/modules/common/decorators/public.decorator';

import { TagGroup } from './entities/tag-group.entity';
import { Tag } from './entities/tag.entity';
import { TagGroupsService } from './tag-groups.service';
import { TagsService } from './tags.service';

@Controller({ path: 'tags', version: '1' })
export class TagsController {
	constructor(
		private readonly tagsService: TagsService,
		private readonly tagGroupsService: TagGroupsService,
	) {}

	@ApiOperation({ summary: 'List all tag groups' })
	@ApiResponse({ status: 200, type: TagGroup, isArray: true })
	@Public()
	@Get('groups')
	findAllGroups() {
		return this.tagGroupsService.findAll();
	}

	@ApiOperation({ summary: 'Get tag group by ID' })
	@ApiParam({
		name: 'id',
		description: 'UUID of the tag group',
		required: true,
	})
	@ApiResponse({ status: 200, type: TagGroup })
	@ApiResponse({ status: 404, description: 'Tag group not found' })
	@Public()
	@Get('groups/:id')
	findOneGroup(@Param('id') id: string) {
		return this.tagGroupsService.findOne(id);
	}

	@ApiOperation({ summary: 'Search tags by name' })
	@ApiQuery({ name: 'q', description: 'Search query', required: true })
	@ApiResponse({ status: 200, type: Tag, isArray: true })
	@Public()
	@Get('search')
	searchTags(@Query('q') query: string) {
		return this.tagsService.search(query);
	}

	@ApiOperation({ summary: 'List all tags' })
	@ApiResponse({ status: 200, type: Tag, isArray: true })
	@ApiQuery({
		name: 'group_id',
		description: 'Filter by group ID',
		required: false,
	})
	@ApiQuery({ name: 'name', description: 'Filter by name', required: false })
	@ApiQuery({
		name: 'target_type',
		description: 'Filter by target entity type',
		enum: tag_target_type,
		required: false,
	})
	@Public()
	@Get()
	findAllTags(
		@Query('group_id') group_id?: string,
		@Query('name') name?: string,
		@Query('target_type') target_type?: tag_target_type,
	) {
		return this.tagsService.findAll({ group_id, name, target_type });
	}

	@ApiOperation({ summary: 'Get tag by ID' })
	@ApiParam({ name: 'id', description: 'UUID of the tag', required: true })
	@ApiResponse({ status: 200, type: Tag })
	@ApiResponse({ status: 404, description: 'Tag not found' })
	@Public()
	@Get(':id')
	findOneTag(@Param('id') id: string) {
		return this.tagsService.findOne(id);
	}
}
