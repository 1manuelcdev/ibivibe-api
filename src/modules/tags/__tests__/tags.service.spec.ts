import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { TagsService } from '../tags.service';

describe('TagsService', () => {
	let service: TagsService;
	let prisma: DeepMockProxy<PrismaService>;

	const mockTag = {
		id: 'tag-1',
		name: 'Test Tag',
		slug: 'test-tag',
		description: 'A test tag',
		color: '#FF0000',
		group_id: 'group-1',
		position: 0,
		created_at: new Date(),
		updated_at: new Date(),
	};

	const mockGroup = {
		id: 'group-1',
		name: 'Test Group',
		description: 'A test group',
		created_at: new Date(),
		updated_at: new Date(),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TagsService,
				{
					provide: PrismaService,
					useValue: mockDeep<PrismaService>(),
				},
			],
		}).compile();

		service = module.get<TagsService>(TagsService);
		prisma = module.get(PrismaService);

		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create a tag', async () => {
			prisma.tag.create.mockResolvedValue(mockTag);

			const result = await service.create({
				name: 'Test Tag',
				group_id: 'group-1',
				description: 'A test tag',
				color: '#FF0000',
			});

			expect(result).toEqual(mockTag);
			expect(prisma.tag.create).toHaveBeenCalledWith({
				data: {
					name: 'Test Tag',
					slug: 'test-tag',
					group_id: 'group-1',
					description: 'A test tag',
					color: '#FF0000',
					position: 0,
				},
			});
		});

		it('should slugify tag name', async () => {
			prisma.tag.create.mockResolvedValue(mockTag);

			await service.create({
				name: 'Test Tag Name!',
				group_id: 'group-1',
			});

			expect(prisma.tag.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'test-tag-name' }),
				}),
			);
		});

		it('should create target associations when target types are provided', async () => {
			prisma.tag.create.mockResolvedValue(mockTag);

			await service.create({
				name: 'Festival',
				group_id: 'group-1',
				target_types: ['event' as any, 'city' as any],
			});

			expect(prisma.tag.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						targets: {
							create: [{ target_type: 'event' }, { target_type: 'city' }],
						},
					}),
				}),
			);
		});

		it('should handle diacritics in slugify', async () => {
			prisma.tag.create.mockResolvedValue(mockTag);

			await service.create({
				name: 'Café Réstaurant',
				group_id: 'group-1',
			});

			expect(prisma.tag.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'cafe-restaurant' }),
				}),
			);
		});
	});

	describe('findAll', () => {
		it('should return all tags', async () => {
			const tagWithGroup = { ...mockTag, group: mockGroup };
			prisma.tag.findMany.mockResolvedValue([tagWithGroup]);

			const result = await service.findAll();

			expect(result).toEqual([tagWithGroup]);
			expect(prisma.tag.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					include: { group: true, targets: true },
				}),
			);
		});

		it('should filter tags by group_id', async () => {
			prisma.tag.findMany.mockResolvedValue([]);

			await service.findAll({ group_id: 'group-1' });

			expect(prisma.tag.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ group_id: 'group-1' }),
				}),
			);
		});

		it('should filter tags by name', async () => {
			prisma.tag.findMany.mockResolvedValue([]);

			await service.findAll({ name: 'Test' });

			expect(prisma.tag.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						name: { contains: 'Test', mode: 'insensitive' },
					}),
				}),
			);
		});

		it('should filter tags by target type', async () => {
			prisma.tag.findMany.mockResolvedValue([]);

			await service.findAll({ target_type: 'event' as any });

			expect(prisma.tag.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						targets: { some: { target_type: 'event' } },
					}),
				}),
			);
		});
	});

	describe('findAllAdmin', () => {
		it('should return tags with their group and targets', async () => {
			const tagWithRelations = {
				...mockTag,
				group: mockGroup,
				targets: [{ id: 'target-1', target_type: 'event' }],
			};
			prisma.tag.findMany.mockResolvedValue([tagWithRelations] as never);

			const result = await service.findAllAdmin({ group_id: 'group-1' });

			expect(result).toEqual([tagWithRelations]);
			expect(prisma.tag.findMany).toHaveBeenCalledWith({
				where: { group_id: 'group-1' },
				include: { group: true, targets: true },
				orderBy: [{ group: { name: 'asc' } }, { position: 'asc' }],
			});
		});
	});

	describe('search', () => {
		it('should search tags by name', async () => {
			const tagWithGroup = { ...mockTag, group: mockGroup };
			prisma.tag.findMany.mockResolvedValue([tagWithGroup]);

			const result = await service.search('Test');

			expect(result).toEqual([tagWithGroup]);
			expect(prisma.tag.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						name: { contains: 'Test', mode: 'insensitive' },
					},
				}),
			);
		});
	});

	describe('findOne', () => {
		it('should return a tag by id', async () => {
			const tagWithGroup = { ...mockTag, group: mockGroup };
			prisma.tag.findUnique.mockResolvedValue(tagWithGroup);

			const result = await service.findOne('tag-1');

			expect(result).toEqual(tagWithGroup);
			expect(prisma.tag.findUnique).toHaveBeenCalledWith({
				where: { id: 'tag-1' },
				include: { group: true },
			});
		});

		it('should throw NotFoundException when tag not found', async () => {
			prisma.tag.findUnique.mockResolvedValue(null);

			await expect(service.findOne('non-existent')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('findBySlug', () => {
		it('should return a tag by slug', async () => {
			const tagWithGroup = { ...mockTag, group: mockGroup };
			prisma.tag.findUnique.mockResolvedValue(tagWithGroup);

			const result = await service.findBySlug('test-tag');

			expect(result).toEqual(tagWithGroup);
			expect(prisma.tag.findUnique).toHaveBeenCalledWith({
				where: { slug: 'test-tag' },
				include: { group: true },
			});
		});

		it('should throw NotFoundException when tag not found', async () => {
			prisma.tag.findUnique.mockResolvedValue(null);

			await expect(service.findBySlug('non-existent')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('update', () => {
		it('should update a tag', async () => {
			const updatedTag = {
				...mockTag,
				name: 'Updated Tag',
				slug: 'updated-tag',
			};
			prisma.tag.findUnique.mockResolvedValue(mockTag);
			prisma.tag.update.mockResolvedValue(updatedTag);

			const result = await service.update('tag-1', { name: 'Updated Tag' });

			expect(result).toEqual(updatedTag);
			expect(prisma.tag.update).toHaveBeenCalledWith({
				where: { id: 'tag-1' },
				data: {
					name: 'Updated Tag',
					slug: 'updated-tag',
				},
			});
		});

		it('should throw NotFoundException when tag to update not found', async () => {
			prisma.tag.findUnique.mockResolvedValue(null);

			await expect(
				service.update('non-existent', { name: 'Test' }),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('admin operations', () => {
		it('should reject creating a tag for a missing group', async () => {
			prisma.tag_group.findUnique.mockResolvedValue(null);

			await expect(
				service.createAdmin({ name: 'Tag', group_id: 'missing' }),
			).rejects.toThrow(NotFoundException);
			expect(prisma.tag.create).not.toHaveBeenCalled();
		});

		it('should create and return a tag with its admin relations', async () => {
			const created = { ...mockTag, group: mockGroup, targets: [] };
			prisma.tag_group.findUnique.mockResolvedValue({ id: 'group-1' } as never);
			prisma.tag.create.mockResolvedValue(mockTag);
			prisma.tag.findUnique.mockResolvedValue(created as never);

			await expect(
				service.createAdmin({
					name: 'Test Tag',
					group_id: 'group-1',
				}),
			).resolves.toEqual(created);
			expect(prisma.tag.findUnique).toHaveBeenLastCalledWith({
				where: { id: 'tag-1' },
				include: { group: true, targets: true },
			});
		});
	});

	describe('remove', () => {
		it('should delete a tag', async () => {
			prisma.tag.findUnique.mockResolvedValue(mockTag);
			prisma.tag.delete.mockResolvedValue(mockTag);

			const result = await service.remove('tag-1');

			expect(result).toEqual(mockTag);
			expect(prisma.tag.delete).toHaveBeenCalledWith({
				where: { id: 'tag-1' },
			});
		});

		it('should throw NotFoundException when tag to delete not found', async () => {
			prisma.tag.findUnique.mockResolvedValue(null);

			await expect(service.remove('non-existent')).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
