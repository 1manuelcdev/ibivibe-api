import { Injectable, NotFoundException } from '@nestjs/common';
import { tag_target_type } from '@prisma/client';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
	constructor(private readonly prismaService: PrismaService) {}

	private readonly adminInclude = { group: true, targets: true };

	private slugify(name: string): string {
		return name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}

	create(dto: CreateTagDto) {
		return this.prismaService.tag.create({
			data: {
				name: dto.name,
				slug: this.slugify(dto.name),
				group_id: dto.group_id,
				description: dto.description,
				color: dto.color,
				position: dto.position ?? 0,
				...(dto.target_types && {
					targets: {
						create: dto.target_types.map((target_type) => ({ target_type })),
					},
				}),
			},
		});
	}

	findAll(filters?: {
		group_id?: string;
		name?: string;
		target_type?: tag_target_type;
	}) {
		return this.prismaService.tag.findMany({
			where: {
				...(filters?.group_id && { group_id: filters.group_id }),
				...(filters?.name && {
					name: { contains: filters.name, mode: 'insensitive' },
				}),
				...(filters?.target_type && {
					targets: { some: { target_type: filters.target_type } },
				}),
			},
			include: { group: true, targets: true },
			orderBy: [{ group: { name: 'asc' } }, { position: 'asc' }],
		});
	}

	findAllAdmin(filters?: {
		group_id?: string;
		name?: string;
		target_type?: tag_target_type;
	}) {
		return this.prismaService.tag.findMany({
			where: {
				...(filters?.group_id && { group_id: filters.group_id }),
				...(filters?.name && {
					name: { contains: filters.name, mode: 'insensitive' },
				}),
				...(filters?.target_type && {
					targets: { some: { target_type: filters.target_type } },
				}),
			},
			include: this.adminInclude,
			orderBy: [{ group: { name: 'asc' } }, { position: 'asc' }],
		});
	}

	search(query: string) {
		return this.prismaService.tag.findMany({
			where: {
				name: { contains: query, mode: 'insensitive' },
			},
			include: { group: true },
			orderBy: { name: 'asc' },
		});
	}

	async findOne(id: string) {
		const tag = await this.prismaService.tag.findUnique({
			where: { id },
			include: { group: true },
		});
		if (!tag) throw new NotFoundException();
		return tag;
	}

	async findOneAdmin(id: string) {
		const tag = await this.prismaService.tag.findUnique({
			where: { id },
			include: this.adminInclude,
		});
		if (!tag) throw new NotFoundException('Tag not found');
		return tag;
	}

	async createAdmin(dto: CreateTagDto) {
		const group = await this.prismaService.tag_group.findUnique({
			where: { id: dto.group_id },
			select: { id: true },
		});
		if (!group) throw new NotFoundException('Tag group not found');
		const tag = await this.create(dto);
		return this.findOneAdmin(tag.id);
	}

	async findBySlug(slug: string) {
		const tag = await this.prismaService.tag.findUnique({
			where: { slug },
			include: { group: true },
		});
		if (!tag) throw new NotFoundException();
		return tag;
	}

	async update(id: string, dto: UpdateTagDto) {
		await this.findOne(id);
		const { target_types, ...tagData } = dto;
		return this.prismaService.tag.update({
			where: { id },
			data: {
				...tagData,
				...(dto.name && { slug: this.slugify(dto.name) }),
				...(target_types && {
					targets: {
						deleteMany: {},
						create: target_types.map((target_type) => ({ target_type })),
					},
				}),
			},
		});
	}

	async updateAdmin(id: string, dto: UpdateTagDto) {
		await this.findOneAdmin(id);
		await this.update(id, dto);
		return this.findOneAdmin(id);
	}

	async remove(id: string) {
		await this.findOne(id);
		return this.prismaService.tag.delete({ where: { id } });
	}

	async removeAdmin(id: string) {
		const tag = await this.findOneAdmin(id);
		await this.prismaService.tag.delete({ where: { id } });
		return tag;
	}
}
