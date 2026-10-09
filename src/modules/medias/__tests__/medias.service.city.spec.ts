import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { ImageProcessingService } from '../image-processing.service';
import { MediasService } from '../medias.service';
import { R2StorageService } from '../r2-storage.service';

describe('MediasService city administration', () => {
	let service: MediasService;
	let prisma: DeepMockProxy<PrismaService>;
	let storage: DeepMockProxy<R2StorageService>;
	let imageProcessing: DeepMockProxy<ImageProcessingService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MediasService,
				{ provide: PrismaService, useValue: mockDeep<PrismaService>() },
				{
					provide: ImageProcessingService,
					useValue: mockDeep<ImageProcessingService>(),
				},
				{ provide: R2StorageService, useValue: mockDeep<R2StorageService>() },
			],
		}).compile();

		service = module.get<MediasService>(MediasService);
		prisma = module.get<DeepMockProxy<PrismaService>>(PrismaService);
		storage = module.get<DeepMockProxy<R2StorageService>>(R2StorageService);
		imageProcessing = module.get<DeepMockProxy<ImageProcessingService>>(
			ImageProcessingService,
		);
	});

	it('makes the first uploaded city media the cover when omitted', async () => {
		prisma.city.findUnique.mockResolvedValue({ id: 'city-1' } as never);
		prisma.$transaction.mockImplementation(async (callback: any) =>
			callback(prisma),
		);
		prisma.media.count.mockResolvedValue(0);
		prisma.media.create.mockResolvedValue({
			id: 'media-1',
			city_id: 'city-1',
			is_cover: true,
		} as never);
		imageProcessing.process.mockResolvedValue({
			buffer: Buffer.from('optimized'),
			contentType: 'image/webp',
			extension: 'webp',
		});
		storage.upload.mockResolvedValue({
			key: 'media/cities/gallery/media-1.webp',
			url: 'https://cdn.test/media-1.webp',
		});

		await service.addAdminCityMedia(
			'city-1',
			{
				buffer: Buffer.from('image'),
				size: 5,
				mimetype: 'image/png',
				originalname: 'city.png',
			} as Express.Multer.File,
			{},
		);

		expect(prisma.media.updateMany).toHaveBeenCalledWith({
			where: { city_id: 'city-1' },
			data: { is_cover: false },
		});
		expect(prisma.media.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				city_id: 'city-1',
				media_type: 'image',
				is_cover: true,
				position: 0,
			}),
		});
	});

	it('rejects media operations for a missing city', async () => {
		prisma.city.findUnique.mockResolvedValue(null);

		await expect(service.getMediaByAdminCity('missing')).rejects.toThrow(
			NotFoundException,
		);
	});

	it('rejects reordering media that does not belong to the city', async () => {
		prisma.city.findUnique.mockResolvedValue({ id: 'city-1' } as never);
		prisma.media.findMany.mockResolvedValue([{ id: 'media-1' }] as never);

		await expect(
			service.reorderAdminCityMedia('city-1', ['media-1', 'media-2']),
		).rejects.toThrow(NotFoundException);
	});
});
