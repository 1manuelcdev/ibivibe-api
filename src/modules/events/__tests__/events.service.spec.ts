import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { EventsService } from '../events.service';

describe('EventsService', () => {
	let service: EventsService;
	let prisma: DeepMockProxy<PrismaService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				EventsService,
				{
					provide: PrismaService,
					useValue: mockDeep<PrismaService>(),
				},
			],
		}).compile();

		service = module.get<EventsService>(EventsService);
		prisma = module.get<DeepMockProxy<PrismaService>>(PrismaService);

		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('rejects an event whose end is not after its start', async () => {
		await expect(
			service.create({
				owner_account_id: crypto.randomUUID(),
				name: 'Evento válido',
				type: 'simple',
				reach_level: 'local',
				start_date: '2026-10-07T20:00:00.000Z',
				end_date: '2026-10-07T19:00:00.000Z',
			} as any),
		).rejects.toThrow('end_date must be after start_date');
	});

	it('allows a draft without dates and persists its status', async () => {
		const ownerId = crypto.randomUUID();
		prisma.$transaction.mockImplementation(async (callback: any) =>
			callback(prisma),
		);
		prisma.account.findUnique.mockResolvedValue({
			id: ownerId,
			business: null,
		} as any);
		prisma.event.create.mockResolvedValue({
			id: crypto.randomUUID(),
			name: 'Rascunho',
			cities: [],
			tags: [],
			medias: [],
		} as any);

		const result = await service.create({
			owner_account_id: ownerId,
			name: 'Rascunho',
			type: 'simple',
			reach_level: 'local',
			status: 'draft',
		} as any);

		expect(result.name).toBe('Rascunho');
		expect(prisma.event.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'draft' }),
			}),
		);
	});

	it('rejects tags that are not enabled for events', async () => {
		const ownerId = crypto.randomUUID();
		prisma.$transaction.mockImplementation(async (callback: any) =>
			callback(prisma),
		);
		prisma.account.findUnique.mockResolvedValue({
			id: ownerId,
			business: null,
		} as any);
		prisma.city.findMany.mockResolvedValue([] as any);
		prisma.tag.findMany.mockResolvedValue([] as any);

		await expect(
			service.create({
				owner_account_id: ownerId,
				name: 'Evento com tag',
				type: 'simple',
				reach_level: 'local',
				start_date: '2026-10-07T18:00:00.000Z',
				end_date: '2026-10-07T19:00:00.000Z',
				tag_ids: [crypto.randomUUID()],
			} as any),
		).rejects.toThrow('target_type=event');
	});
});
