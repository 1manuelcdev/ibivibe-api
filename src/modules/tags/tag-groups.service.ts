import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { CreateTagGroupDto } from './dto/create-tag-group.dto';
import { UpdateTagGroupDto } from './dto/update-tag-group.dto';

@Injectable()
export class TagGroupsService {
	constructor(private readonly prismaService: PrismaService) {}

	private readonly adminInclude = {
		tags: {
			orderBy: { position: 'asc' as const },
			include: { targets: true },
		},
	};

	create(dto: CreateTagGroupDto) {
		return this.prismaService.tag_group.create({ data: dto });
	}

	findAll() {
		return this.prismaService.tag_group.findMany({
			include: { tags: { orderBy: { position: 'asc' } } },
			orderBy: { name: 'asc' },
		});
	}

	findAllAdmin() {
		return this.prismaService.tag_group.findMany({
			include: this.adminInclude,
			orderBy: { name: 'asc' },
		});
	}

	async findOne(id: string) {
		const group = await this.prismaService.tag_group.findUnique({
			where: { id },
			include: { tags: { orderBy: { position: 'asc' } } },
		});
		if (!group) throw new NotFoundException();
		return group;
	}

	async findOneAdmin(id: string) {
		const group = await this.prismaService.tag_group.findUnique({
			where: { id },
			include: this.adminInclude,
		});
		if (!group) throw new NotFoundException('Tag group not found');
		return group;
	}

	async createAdmin(dto: CreateTagGroupDto) {
		const group = await this.prismaService.tag_group.create({ data: dto });
		return this.findOneAdmin(group.id);
	}

	async update(id: string, dto: UpdateTagGroupDto) {
		await this.findOne(id);
		return this.prismaService.tag_group.update({ where: { id }, data: dto });
	}

	async updateAdmin(id: string, dto: UpdateTagGroupDto) {
		await this.findOneAdmin(id);
		await this.prismaService.tag_group.update({ where: { id }, data: dto });
		return this.findOneAdmin(id);
	}

	async remove(id: string) {
		await this.findOne(id);
		return this.prismaService.tag_group.delete({ where: { id } });
	}

	async removeAdmin(id: string) {
		const group = await this.findOneAdmin(id);
		await this.prismaService.tag_group.delete({ where: { id } });
		return group;
	}
}
