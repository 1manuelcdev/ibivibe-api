import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { AdminService } from '../admin.service';

describe('AdminService city management', () => {
	let service: AdminService;
	let prisma: DeepMockProxy<PrismaService>;
	const city = {
		id: '550e8400-e29b-41d4-a716-446655440000',
		name: 'Ubajara',
		slug: 'ubajara',
		description: 'Serra',
		location: { type: 'Point', coordinates: [-40.921, -3.851] },
		tags: [],
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AdminService,
				{ provide: PrismaService, useValue: mockDeep<PrismaService>() },
			],
		}).compile();

		service = module.get<AdminService>(AdminService);
		prisma = module.get<DeepMockProxy<PrismaService>>(PrismaService);
		prisma.$queryRaw.mockResolvedValue([city] as never);
	});

	it('preserves absent fields and allows clearing nullable city fields', async () => {
		prisma.$executeRaw.mockResolvedValue(1);

		await service.updateCity(city.id, {
			description: null,
		});

		expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
		expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
	});

	it('rejects updating only one coordinate', async () => {
		await expect(
			service.updateCity(city.id, { latitude: -3.851 }),
		).rejects.toThrow(BadRequestException);
		expect(prisma.$executeRaw).not.toHaveBeenCalled();
	});

	it('replaces city tags only with valid city-target tags', async () => {
		prisma.tag.findMany.mockResolvedValue([
			{ id: 'tag-1' },
			{ id: 'tag-2' },
		] as never);
		const tx = mockDeep<PrismaService>();
		prisma.$transaction.mockImplementation(async (callback: any) =>
			callback(tx),
		);

		await service.replaceCityTags(city.id, ['tag-1', 'tag-2', 'tag-2']);

		expect(prisma.tag.findMany).toHaveBeenCalledWith({
			where: {
				id: { in: ['tag-1', 'tag-2'] },
				targets: { some: { target_type: 'city' } },
			},
			select: { id: true },
		});
		expect(tx.city_tag.deleteMany).toHaveBeenCalledWith({
			where: { city_id: city.id },
		});
		expect(tx.city_tag.createMany).toHaveBeenCalledWith({
			data: [
				{ city_id: city.id, tag_id: 'tag-1' },
				{ city_id: city.id, tag_id: 'tag-2' },
			],
		});
	});

	it('rejects a tag that does not exist or is not configured for cities', async () => {
		prisma.tag.findMany.mockResolvedValue([{ id: 'tag-1' }] as never);

		await expect(
			service.replaceCityTags(city.id, ['tag-1', 'tag-2']),
		).rejects.toThrow(BadRequestException);
		expect(prisma.$transaction).not.toHaveBeenCalled();
	});

	it('returns 404 when updating a missing city', async () => {
		prisma.$queryRaw.mockResolvedValue([]);

		await expect(service.updateCity(city.id, {})).rejects.toThrow(
			NotFoundException,
		);
	});
});
