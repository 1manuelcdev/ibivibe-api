import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { AccountInterestsService } from '../account-interests.service';

describe('AccountInterestsService', () => {
	let service: AccountInterestsService;
	let prisma: DeepMockProxy<PrismaService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AccountInterestsService,
				{ provide: PrismaService, useValue: mockDeep<PrismaService>() },
			],
		}).compile();

		service = module.get(AccountInterestsService);
		prisma = module.get(PrismaService);
	});

	it('classifies interests using target types instead of group names', async () => {
		prisma.account_interest.findMany.mockResolvedValue([
			{
				tag: {
					id: 'tag-shared',
					name: 'Turismo rural',
					targets: [
						{ target_type: 'city' },
						{ target_type: 'business' },
						{ target_type: 'event' },
					],
				},
			},
		] as any);

		expect(await service.findAllByAccountId('account-1')).toEqual({
			businesses: [{ id: 'tag-shared', name: 'Turismo rural' }],
			events: [{ id: 'tag-shared', name: 'Turismo rural' }],
		});
	});

	it('rejects interests that do not support the requested type', async () => {
		prisma.account.findUnique.mockResolvedValue({ id: 'account-1' } as any);
		prisma.tag.findMany.mockResolvedValue([]);

		await expect(
			service.upsert('account-1', {
				businesses: ['event-only-tag'],
				events: [],
			}),
		).rejects.toThrow(NotFoundException);
	});
});
