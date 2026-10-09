import { Test, TestingModule } from '@nestjs/testing';

import { TagGroupsService } from '../../tags/tag-groups.service';
import { TagsService } from '../../tags/tags.service';
import { AdminTagsController } from '../admin-tags.controller';

describe('AdminTagsController', () => {
	let controller: AdminTagsController;
	let tagGroupsService: TagGroupsService;
	let tagsService: TagsService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AdminTagsController],
			providers: [
				{
					provide: TagGroupsService,
					useValue: {
						findAllAdmin: jest.fn(),
						createAdmin: jest.fn(),
						updateAdmin: jest.fn(),
						removeAdmin: jest.fn(),
					},
				},
				{
					provide: TagsService,
					useValue: {
						findAllAdmin: jest.fn(),
						findOneAdmin: jest.fn(),
						createAdmin: jest.fn(),
						updateAdmin: jest.fn(),
						removeAdmin: jest.fn(),
					},
				},
			],
		}).compile();

		controller = module.get(AdminTagsController);
		tagGroupsService = module.get(TagGroupsService);
		tagsService = module.get(TagsService);
		jest.clearAllMocks();
	});

	it('lists groups through the admin service', async () => {
		const groups = [{ id: 'group-1', tags: [{ targets: [] }] }];
		jest
			.spyOn(tagGroupsService, 'findAllAdmin')
			.mockResolvedValue(groups as never);

		await expect(controller.listGroups()).resolves.toEqual(groups);
		expect(tagGroupsService.findAllAdmin).toHaveBeenCalled();
	});

	it('passes tag filters to the admin service', async () => {
		jest.spyOn(tagsService, 'findAllAdmin').mockResolvedValue([]);

		await controller.listTags('group-1', 'Festival', 'event');

		expect(tagsService.findAllAdmin).toHaveBeenCalledWith({
			group_id: 'group-1',
			name: 'Festival',
			target_type: 'event',
		});
	});

	it('uses admin methods for tag mutations', async () => {
		jest.spyOn(tagsService, 'createAdmin').mockResolvedValue({} as never);
		jest.spyOn(tagsService, 'updateAdmin').mockResolvedValue({} as never);
		jest.spyOn(tagsService, 'removeAdmin').mockResolvedValue({} as never);

		await controller.createTag({ name: 'Festival', group_id: 'group-1' });
		await controller.updateTag('tag-1', { name: 'Updated' });
		await controller.removeTag('tag-1');

		expect(tagsService.createAdmin).toHaveBeenCalledWith({
			name: 'Festival',
			group_id: 'group-1',
		});
		expect(tagsService.updateAdmin).toHaveBeenCalledWith('tag-1', {
			name: 'Updated',
		});
		expect(tagsService.removeAdmin).toHaveBeenCalledWith('tag-1');
	});
});
