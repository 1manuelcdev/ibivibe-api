import { randomUUID } from 'crypto';

import {
	ConflictException,
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import {
	ImageProcessingService,
	type ImageUploadPurpose,
} from './image-processing.service';
import { R2StorageService } from './r2-storage.service';

@Injectable()
export class MediasService {
	private static readonly MAX_BUSINESS_GALLERY_ITEMS = 10;
	private readonly logger = new Logger(MediasService.name);

	constructor(
		private readonly prismaService: PrismaService,
		private readonly imageProcessingService: ImageProcessingService,
		private readonly storageService: R2StorageService,
	) {}

	private assertImage(file: Express.Multer.File) {
		if (!file) throw new BadRequestException('Image file is required');
	}

	async upload(file: Express.Multer.File, purpose: ImageUploadPurpose) {
		this.assertImage(file);
		const startedAt = performance.now();
		const processed = await this.imageProcessingService.process(file, purpose);
		const folder =
			purpose === 'business-profile'
				? 'media/businesses/profile-photos'
				: purpose === 'event-gallery'
					? 'media/events/gallery'
					: purpose === 'city-gallery'
						? 'media/cities/gallery'
						: 'media/businesses/gallery';
		const key = `${folder}/${randomUUID()}.${processed.extension}`;
		const uploaded = await this.storageService.upload(
			key,
			processed.buffer,
			processed.contentType,
		);
		this.logger.log(
			`Image uploaded (${purpose}): ${file.size}B → ${processed.buffer.length}B in ${Math.round(performance.now() - startedAt)}ms`,
		);
		return uploaded;
	}

	async delete(key: string) {
		return this.storageService.delete(key);
	}

	getPublicUrl(key: string) {
		return this.storageService.getPublicUrl(key);
	}

	async getMediaByCity(id: string): Promise<any[]> {
		return this.prismaService.media.findMany({
			where: { city_id: id },
			orderBy: [{ is_cover: 'desc' }, { position: 'asc' }],
		});
	}

	async getMediaByAccount(id: string) {
		return this.prismaService.media.findMany({
			where: { account_id: id },
			orderBy: [{ is_cover: 'desc' }, { position: 'asc' }],
		});
	}

	async getMediaByBusiness(id: string) {
		return this.prismaService.media.findMany({
			where: { business_id: id },
			orderBy: [{ is_cover: 'desc' }, { position: 'asc' }],
		});
	}

	private async assertOwner(businessId: string, accountId: string) {
		const business = await this.prismaService.business.findUnique({
			where: { id: businessId },
			select: { owner_account_id: true },
		});
		if (!business) throw new NotFoundException('Business not found');
		if (business.owner_account_id !== accountId)
			throw new ForbiddenException('You do not own this business');
	}

	private async assertEventOwner(eventId: string, accountId: string) {
		const event = await this.prismaService.event.findUnique({
			where: { id: eventId },
			select: { owner_account_id: true },
		});
		if (!event) throw new NotFoundException('Event not found');
		if (event.owner_account_id !== accountId)
			throw new ForbiddenException('You do not own this event');
	}

	private async assertCity(cityId: string) {
		const city = await this.prismaService.city.findUnique({
			where: { id: cityId },
			select: { id: true },
		});
		if (!city) throw new NotFoundException('City not found');
	}

	private keyFromUrl(url: string) {
		return this.storageService.keyFromPublicUrl(url);
	}

	private async promoteNextCover(
		tx: any,
		ownerField: 'city_id' | 'event_id',
		ownerId: string,
	) {
		const next = await tx.media.findFirst({
			where: { [ownerField]: ownerId },
			orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
		});
		if (next)
			await tx.media.update({
				where: { id: next.id },
				data: { is_cover: true },
			});
	}

	async addBusinessMedia(
		businessId: string,
		accountId: string,
		file: Express.Multer.File,
		dto: any,
	) {
		await this.assertOwner(businessId, accountId);
		this.assertImage(file);
		const count = await this.prismaService.media.count({
			where: { business_id: businessId },
		});
		if (count >= MediasService.MAX_BUSINESS_GALLERY_ITEMS)
			throw new ConflictException(
				'Business gallery limit of 10 images reached',
			);
		const uploaded = await this.upload(file, 'business-gallery');
		try {
			return await this.prismaService.$transaction(async (tx) => {
				const position =
					dto.position ??
					(await tx.media.count({ where: { business_id: businessId } }));
				return tx.media.create({
					data: {
						business_id: businessId,
						media_type: 'image',
						url: uploaded.url,
						is_cover: false,
						position,
						alt_text: dto.alt_text,
					},
				});
			});
		} catch (error) {
			await this.delete(uploaded.key).catch(() => undefined);
			throw error;
		}
	}

	async uploadBusinessProfilePhoto(
		businessId: string,
		accountId: string,
		file: Express.Multer.File,
	) {
		await this.assertOwner(businessId, accountId);
		const current = await this.prismaService.business.findUnique({
			where: { id: businessId },
			select: { profile_photo_url: true },
		});
		const uploaded = await this.upload(file, 'business-profile');
		try {
			const business = await this.prismaService.business.update({
				where: { id: businessId },
				data: { profile_photo_url: uploaded.url },
				select: { profile_photo_url: true },
			});
			const currentKey = current?.profile_photo_url
				? this.keyFromUrl(current.profile_photo_url)
				: null;
			if (currentKey) await this.delete(currentKey).catch(() => undefined);
			return { profile_photo_url: business.profile_photo_url };
		} catch (error) {
			await this.delete(uploaded.key).catch(() => undefined);
			throw error;
		}
	}

	async removeBusinessProfilePhoto(businessId: string, accountId: string) {
		await this.assertOwner(businessId, accountId);
		const business = await this.prismaService.business.findUnique({
			where: { id: businessId },
			select: { profile_photo_url: true },
		});
		if (!business?.profile_photo_url)
			throw new NotFoundException('Profile photo not found');
		await this.prismaService.business.update({
			where: { id: businessId },
			data: { profile_photo_url: null },
		});
		const key = this.keyFromUrl(business.profile_photo_url);
		if (key) await this.delete(key).catch(() => undefined);
		return { deleted: true };
	}

	async updateBusinessMedia(
		businessId: string,
		mediaId: string,
		accountId: string,
		dto: any,
	) {
		await this.assertOwner(businessId, accountId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, business_id: businessId },
		});
		if (!media) throw new NotFoundException('Media not found');
		return this.prismaService.$transaction(async (tx) => {
			return tx.media.update({
				where: { id: mediaId },
				data: {
					position: dto.position,
					alt_text: dto.alt_text,
				},
			});
		});
	}

	async removeBusinessMedia(
		businessId: string,
		mediaId: string,
		accountId: string,
	) {
		await this.assertOwner(businessId, accountId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, business_id: businessId },
		});
		if (!media) throw new NotFoundException('Media not found');
		await this.prismaService.media.delete({ where: { id: mediaId } });
		const key = this.keyFromUrl(media.url);
		if (key) await this.delete(key).catch(() => undefined);
		return { deleted: true };
	}

	async reorderBusinessMedia(
		businessId: string,
		accountId: string,
		mediaIds: string[],
	) {
		await this.assertOwner(businessId, accountId);
		const records = await this.prismaService.media.findMany({
			where: { business_id: businessId, id: { in: mediaIds } },
			select: { id: true },
		});
		if (records.length !== mediaIds.length)
			throw new NotFoundException(
				'One or more media do not belong to this business',
			);
		return this.prismaService.$transaction(
			mediaIds.map((id, position) =>
				this.prismaService.media.update({ where: { id }, data: { position } }),
			),
		);
	}

	async getMediaByEvent(id: string) {
		return this.prismaService.media.findMany({
			where: { event_id: id },
			orderBy: [{ is_cover: 'desc' }, { position: 'asc' }],
		});
	}

	async addEventMedia(
		eventId: string,
		accountId: string,
		file: Express.Multer.File,
		dto: any,
	) {
		await this.assertEventOwner(eventId, accountId);
		this.assertImage(file);
		const uploaded = file.mimetype.startsWith('video/')
			? await this.storageService.upload(
					`media/events/gallery/${randomUUID()}-${file.originalname}`,
					file.buffer,
					file.mimetype,
				)
			: await this.upload(file, 'event-gallery');
		try {
			return await this.prismaService.$transaction(async (tx) => {
				const mediaCount = await tx.media.count({
					where: { event_id: eventId },
				});
				const position = dto.position ?? mediaCount;
				const isCover = dto.is_cover ?? mediaCount === 0;
				if (isCover)
					await tx.media.updateMany({
						where: { event_id: eventId },
						data: { is_cover: false },
					});
				return tx.media.create({
					data: {
						event_id: eventId,
						media_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
						url: uploaded.url,
						is_cover: isCover,
						position,
						alt_text: dto.alt_text,
					},
				});
			});
		} catch (error) {
			await this.delete(uploaded.key).catch(() => undefined);
			throw error;
		}
	}

	async updateEventMedia(
		eventId: string,
		mediaId: string,
		accountId: string,
		dto: any,
	) {
		await this.assertEventOwner(eventId, accountId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, event_id: eventId },
		});
		if (!media) throw new NotFoundException('Media not found');
		return this.prismaService.$transaction(async (tx) => {
			if (dto.is_cover)
				await tx.media.updateMany({
					where: { event_id: eventId, id: { not: mediaId } },
					data: { is_cover: false },
				});
			return tx.media.update({
				where: { id: mediaId },
				data: {
					position: dto.position,
					is_cover: dto.is_cover,
					alt_text: dto.alt_text,
				},
			});
		});
	}

	async reorderEventMedia(
		eventId: string,
		accountId: string,
		mediaIds: string[],
	) {
		await this.assertEventOwner(eventId, accountId);
		const records = await this.prismaService.media.findMany({
			where: { event_id: eventId, id: { in: mediaIds } },
			select: { id: true },
		});
		if (records.length !== mediaIds.length)
			throw new NotFoundException(
				'One or more media do not belong to this event',
			);
		return this.prismaService.$transaction(
			mediaIds.map((id, position) =>
				this.prismaService.media.update({ where: { id }, data: { position } }),
			),
		);
	}

	async removeEventMedia(eventId: string, mediaId: string, accountId: string) {
		await this.assertEventOwner(eventId, accountId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, event_id: eventId },
		});
		if (!media) throw new NotFoundException('Media not found');
		await this.prismaService.$transaction(async (tx) => {
			await tx.media.delete({ where: { id: mediaId } });
			if (media.is_cover) await this.promoteNextCover(tx, 'event_id', eventId);
		});
		const key = this.keyFromUrl(media.url);
		if (key) await this.delete(key).catch(() => undefined);
		return { deleted: true };
	}

	async getMediaByAdminCity(cityId: string) {
		await this.assertCity(cityId);
		return this.getMediaByCity(cityId);
	}

	async addAdminCityMedia(cityId: string, file: Express.Multer.File, dto: any) {
		await this.assertCity(cityId);
		this.assertImage(file);
		const uploaded = file.mimetype.startsWith('video/')
			? await this.storageService.upload(
					`media/cities/gallery/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
					file.buffer,
					file.mimetype,
				)
			: await this.upload(file, 'city-gallery');
		try {
			return await this.prismaService.$transaction(async (tx) => {
				const mediaCount = await tx.media.count({
					where: { city_id: cityId },
				});
				const position = dto.position ?? mediaCount;
				const isCover = dto.is_cover ?? mediaCount === 0;
				if (isCover)
					await tx.media.updateMany({
						where: { city_id: cityId },
						data: { is_cover: false },
					});
				return tx.media.create({
					data: {
						city_id: cityId,
						media_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
						url: uploaded.url,
						is_cover: isCover,
						position,
						alt_text: dto.alt_text,
					},
				});
			});
		} catch (error) {
			await this.delete(uploaded.key).catch(() => undefined);
			throw error;
		}
	}

	async updateAdminCityMedia(cityId: string, mediaId: string, dto: any) {
		await this.assertCity(cityId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, city_id: cityId },
		});
		if (!media) throw new NotFoundException('Media not found');
		return this.prismaService.$transaction(async (tx) => {
			if (dto.is_cover)
				await tx.media.updateMany({
					where: { city_id: cityId, id: { not: mediaId } },
					data: { is_cover: false },
				});
			return tx.media.update({
				where: { id: mediaId },
				data: {
					position: dto.position,
					is_cover: dto.is_cover,
					alt_text: dto.alt_text,
				},
			});
		});
	}

	async reorderAdminCityMedia(cityId: string, mediaIds: string[]) {
		await this.assertCity(cityId);
		const records = await this.prismaService.media.findMany({
			where: { city_id: cityId, id: { in: mediaIds } },
			select: { id: true },
		});
		if (records.length !== mediaIds.length)
			throw new NotFoundException(
				'One or more media do not belong to this city',
			);
		return this.prismaService.$transaction(
			mediaIds.map((id, position) =>
				this.prismaService.media.update({ where: { id }, data: { position } }),
			),
		);
	}

	async removeAdminCityMedia(cityId: string, mediaId: string) {
		await this.assertCity(cityId);
		const media = await this.prismaService.media.findFirst({
			where: { id: mediaId, city_id: cityId },
		});
		if (!media) throw new NotFoundException('Media not found');
		await this.prismaService.$transaction(async (tx) => {
			await tx.media.delete({ where: { id: mediaId } });
			if (media.is_cover) await this.promoteNextCover(tx, 'city_id', cityId);
		});
		const key = this.keyFromUrl(media.url);
		if (key) await this.delete(key).catch(() => undefined);
		return { deleted: true };
	}
}
