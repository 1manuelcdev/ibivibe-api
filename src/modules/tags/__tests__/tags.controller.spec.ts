import { Test, TestingModule } from '@nestjs/testing';

import { TagGroupsService } from '../tag-groups.service';
import { TagsController } from '../tags.controller';
import { TagsService } from '../tags.service';

describe('TagsController', () => {
	let controller: TagsController;
	let tagsService: TagsService;
	let tagGroupsService: TagGroupsService;

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
			controllers: [TagsController],
			providers: [
				{
					provide: TagsService,
					useValue: {
						create: jest.fn(),
						findAll: jest.fn(),
						search: jest.fn(),
						findOne: jest.fn(),
						findBySlug: jest.fn(),
						update: jest.fn(),
						remove: jest.fn(),
					},
				},
				{
					provide: TagGroupsService,
					useValue: {
						create: jest.fn(),
						findAll: jest.fn(),
						findOne: jest.fn(),
						update: jest.fn(),
						remove: jest.fn(),
					},
				},
			],
		}).compile();

		controller = module.get<TagsController>(TagsController);
		tagsService = module.get<TagsService>(TagsService);
		tagGroupsService = module.get<TagGroupsService>(TagGroupsService);

		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(controller).toBeDefined();
	});

	describe('Tag Groups', () => {
		describe('findAllGroups', () => {
			it('should return all tag groups', async () => {
				const groupWithTags = { ...mockGroup, tags: [] };
				jest
					.spyOn(tagGroupsService, 'findAll')
					.mockResolvedValue([groupWithTags]);

				const result = await controller.findAllGroups();

				expect(result).toEqual([groupWithTags]);
				expect(tagGroupsService.findAll).toHaveBeenCalled();
			});
		});

		describe('findOneGroup', () => {
			it('should return a tag group by id', async () => {
				const groupWithTags = { ...mockGroup, tags: [] };
				jest
					.spyOn(tagGroupsService, 'findOne')
					.mockResolvedValue(groupWithTags);

				const result = await controller.findOneGroup('group-1');

				expect(result).toEqual(groupWithTags);
				expect(tagGroupsService.findOne).toHaveBeenCalledWith('group-1');
			});
		});
	});

	describe('Tags', () => {
		describe('searchTags', () => {
			it('should search tags by name', async () => {
				const tagWithGroup = { ...mockTag, group: mockGroup };
				jest.spyOn(tagsService, 'search').mockResolvedValue([tagWithGroup]);

				const result = await controller.searchTags('Test');

				expect(result).toEqual([tagWithGroup]);
				expect(tagsService.search).toHaveBeenCalledWith('Test');
			});
		});

		describe('findAllTags', () => {
			it('should return all tags', async () => {
				const tagWithGroup = { ...mockTag, group: mockGroup };
				jest.spyOn(tagsService, 'findAll').mockResolvedValue([tagWithGroup]);

				const result = await controller.findAllTags();

				expect(result).toEqual([tagWithGroup]);
				expect(tagsService.findAll).toHaveBeenCalledWith({
					group_id: undefined,
					name: undefined,
					target_type: undefined,
				});
			});

			it('should filter tags by group_id', async () => {
				jest.spyOn(tagsService, 'findAll').mockResolvedValue([]);

				await controller.findAllTags('group-1');

				expect(tagsService.findAll).toHaveBeenCalledWith({
					group_id: 'group-1',
					name: undefined,
					target_type: undefined,
				});
			});

			it('should filter tags by target type', async () => {
				jest.spyOn(tagsService, 'findAll').mockResolvedValue([]);

				await controller.findAllTags(undefined, undefined, 'event' as any);

				expect(tagsService.findAll).toHaveBeenCalledWith({
					group_id: undefined,
					name: undefined,
					target_type: 'event',
				});
			});
		});

		describe('findOneTag', () => {
			it('should return a tag by id', async () => {
				const tagWithGroup = { ...mockTag, group: mockGroup };
				jest.spyOn(tagsService, 'findOne').mockResolvedValue(tagWithGroup);

				const result = await controller.findOneTag('tag-1');

				expect(result).toEqual(tagWithGroup);
				expect(tagsService.findOne).toHaveBeenCalledWith('tag-1');
			});
		});
	});
});
