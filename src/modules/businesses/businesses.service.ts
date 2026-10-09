import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import {
	BusinessHourDto,
	BusinessHourExceptionDto,
} from './dto/business-hours.dto';
import {
	CreateBusinessLocationDto,
	UpdateBusinessLocationDto,
} from './dto/business-location.dto';
import { BusinessOnboardingDto } from './dto/business-onboarding.dto';
import {
	UpdateBusinessProfileDto,
	UpdateBusinessContactDto,
} from './dto/business-profile.dto';
import {
	CreateBusinessServiceDto,
	UpdateBusinessServiceDto,
} from './dto/business-service.dto';
import { CreateBusinessDTO } from './dto/create-business.dto';

@Injectable()
export class BusinessesService {
	constructor(private readonly prismaService: PrismaService) {}

	private readonly select = {
		id: true,
		created_at: true,
		updated_at: true,
		max_reach_level: true,
		cnpj: true,
		commercial_name: true,
		profile_photo_url: true,
		description: true,
		is_verified: true,
		verified_at: true,
		accepts_payment: true,
		offers_delivery: true,
		in_person_service: true,
		accessibility: true,
		parking: true,
		wifi: true,
		account: {
			select: {
				id: true,
				bio: true,
				slug: true,
				display_name: true,
				avatar_url: true,
				type: true,
			},
		},
		tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
	};

	private mapBusiness(business: any, includeCnpj = true) {
		return {
			id: business.id,
			account_id: business.account.id,
			slug: business.account.slug,
			name: business.commercial_name || business.account.display_name,
			commercial_name:
				business.commercial_name || business.account.display_name,
			bio: business.account.bio,
			description: business.description,
			avatar_url: business.profile_photo_url || business.account.avatar_url,
			type: business.account.type,
			max_reach_level: business.max_reach_level,
			...(includeCnpj ? { cnpj: business.cnpj } : {}),
			is_verified: business.is_verified,
			verified_at: business.verified_at,
			facilities: {
				accepts_payment: business.accepts_payment,
				offers_delivery: business.offers_delivery,
				in_person_service: business.in_person_service,
				accessibility: business.accessibility,
				parking: business.parking,
				wifi: business.wifi,
			},
			tags: (business.tags || []).map((t) => t.tag.name),
			created_at: business.created_at,
			updated_at: business.updated_at,
		};
	}

	private async owned(id: string, accountId: string) {
		const business = await this.prismaService.business.findUnique({
			where: { id },
			select: { id: true, owner_account_id: true },
		});
		if (!business) throw new NotFoundException('Business not found');
		if (business.owner_account_id !== accountId)
			throw new ForbiddenException('You do not own this business');
		return business;
	}

	async create(dto: CreateBusinessDTO) {
		return this.prismaService.business.create({
			data: {
				owner_account_id: dto.account_id,
				cnpj: dto.cnpj,
				max_reach_level: dto.max_reach_level,
			},
		});
	}

	async onboard(accountId: string, dto: BusinessOnboardingDto) {
		const branchCityIds = [...new Set(dto.branch_city_ids ?? [])].filter(
			(cityId) => cityId !== dto.headquarters_city_id,
		);
		const cityIds = [dto.headquarters_city_id, ...branchCityIds];
		try {
			return await this.prismaService.$transaction(async (tx) => {
				const account = await tx.account.findUnique({
					where: { id: accountId },
					select: { id: true, type: true, business: { select: { id: true } } },
				});
				if (!account) throw new NotFoundException('Account not found');
				if (account.business)
					throw new ConflictException('Account already has a business');
				const cities = await tx.city.findMany({
					where: { id: { in: cityIds } },
					select: { id: true, name: true, slug: true },
				});
				if (cities.length !== cityIds.length)
					throw new NotFoundException('One or more cities were not found');
				const business = await tx.business.create({
					data: {
						owner_account_id: accountId,
						commercial_name: dto.name,
						cnpj: dto.cnpj,
						cities: {
							create: cityIds.map((cityId) => ({
								city_id: cityId,
								is_headquarter: cityId === dto.headquarters_city_id,
							})),
						},
					},
					include: {
						cities: {
							include: {
								city: { select: { id: true, name: true, slug: true } },
							},
						},
					},
				});
				await tx.account.update({
					where: { id: accountId },
					data: { display_name: dto.name, type: 'business' },
				});
				return {
					...business,
					account_id: accountId,
					name: dto.name,
					commercial_name: dto.name,
					headquarters_city_id: dto.headquarters_city_id,
					branch_city_ids: branchCityIds,
					headquarters_city: business.cities.find((c) => c.is_headquarter)
						?.city,
					branch_cities: business.cities
						.filter((c) => !c.is_headquarter)
						.map((c) => c.city),
				};
			});
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof ConflictException
			)
				throw error;
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			)
				throw new ConflictException('Account or headquarters already exists');
			throw error;
		}
	}

	async findAll() {
		const rows = await this.prismaService.business.findMany({
			select: this.select,
			orderBy: { created_at: 'desc' },
		});
		return rows.map((b) => this.mapBusiness(b, false));
	}
	async findOne(id: string) {
		const b = await this.prismaService.business.findUnique({
			where: { id },
			select: this.select,
		});
		if (!b) throw new NotFoundException();
		return this.mapBusiness(b, false);
	}

	async updateProfile(
		id: string,
		accountId: string,
		dto: UpdateBusinessProfileDto,
	) {
		await this.owned(id, accountId);
		const { bio, ...businessData } = dto;
		const b = await this.prismaService.$transaction(async (tx) => {
			if (bio !== undefined)
				await tx.account.update({ where: { id: accountId }, data: { bio } });
			return tx.business.update({
				where: { id },
				data: businessData,
				select: this.select,
			});
		});
		return this.mapBusiness(b);
	}
	async update(id: string, dto: any) {
		const b = await this.prismaService.business.update({
			where: { id },
			data: { cnpj: dto.cnpj, max_reach_level: dto.max_reach_level },
			select: this.select,
		});
		return this.mapBusiness(b);
	}
	async remove(id: string, accountId?: string) {
		if (accountId) await this.owned(id, accountId);
		const b = await this.prismaService.business.delete({
			where: { id },
			select: this.select,
		});
		return this.mapBusiness(b);
	}

	async getContact(id: string) {
		await this.findOne(id);
		return (
			this.prismaService.business_social_links.findUnique({
				where: { business_id: id },
			}) || {
				business_id: id,
				phone: null,
				whatsapp: null,
				public_email: null,
				website: null,
				instagram: null,
				facebook: null,
			}
		);
	}
	async updateContact(
		id: string,
		accountId: string,
		dto: UpdateBusinessContactDto,
	) {
		await this.owned(id, accountId);
		return this.prismaService.business_social_links.upsert({
			where: { business_id: id },
			create: { business_id: id, ...dto },
			update: dto,
		});
	}

	async locations(id: string) {
		await this.findOne(id);
		return this.prismaService.business_city.findMany({
			where: { business_id: id },
			include: { city: { select: { id: true, name: true, slug: true } } },
			orderBy: { is_headquarter: 'desc' },
		});
	}
	async createLocation(
		id: string,
		accountId: string,
		dto: CreateBusinessLocationDto,
	) {
		await this.owned(id, accountId);
		await this.ensureCity(id, dto.city_id);
		if (dto.is_headquarter) {
			const headquarters = await this.prismaService.business_city.findFirst({
				where: { business_id: id, is_headquarter: true },
			});
			if (headquarters) {
				throw new ConflictException('Business already has a headquarters');
			}
		}

		try {
			return await this.prismaService.business_city.create({
				data: { business_id: id, ...dto },
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				throw new ConflictException(
					dto.is_headquarter
						? 'Business already has a headquarters'
						: 'City already associated with this business',
				);
			}
			throw error;
		}
	}
	async updateLocation(
		id: string,
		locationId: string,
		accountId: string,
		dto: UpdateBusinessLocationDto,
	) {
		await this.owned(id, accountId);
		const location = await this.prismaService.business_city.findFirst({
			where: { id: locationId, business_id: id },
		});
		if (!location) throw new NotFoundException('Location not found');
		if (dto.city_id && dto.city_id !== location.city_id)
			await this.ensureCity(id, dto.city_id, locationId);
		return this.prismaService.business_city.update({
			where: { id: locationId },
			data: dto,
		});
	}
	async deleteLocation(id: string, locationId: string, accountId: string) {
		await this.owned(id, accountId);
		const location = await this.prismaService.business_city.findFirst({
			where: { id: locationId, business_id: id },
		});
		if (!location) throw new NotFoundException('Location not found');
		await this.prismaService.business_city.delete({
			where: { id: locationId },
		});
		return { deleted: true };
	}
	private async ensureCity(
		businessId: string,
		cityId: string,
		exceptId?: string,
	) {
		const city = await this.prismaService.city.findUnique({
			where: { id: cityId },
			select: { id: true },
		});
		if (!city) throw new NotFoundException('City not found');
		const duplicate = await this.prismaService.business_city.findFirst({
			where: {
				business_id: businessId,
				city_id: cityId,
				...(exceptId ? { id: { not: exceptId } } : {}),
			},
		});
		if (duplicate)
			throw new ConflictException('City already associated with this business');
	}

	async getHours(id: string) {
		await this.findOne(id);
		return this.prismaService.business_hours.findMany({
			where: { business_id: id },
			orderBy: [{ business_city_id: 'asc' }, { weekday: 'asc' }],
		});
	}
	async putHours(id: string, accountId: string, hours: BusinessHourDto[]) {
		await this.owned(id, accountId);
		const keys = hours.map(
			(h) => `${h.business_city_id || 'all'}:${h.weekday}`,
		);
		if (new Set(keys).size !== keys.length)
			throw new ConflictException('Duplicate weekday schedule');
		const locationIds = [
			...new Set(hours.map((h) => h.business_city_id).filter(Boolean)),
		] as string[];
		if (
			locationIds.length &&
			(await this.prismaService.business_city.count({
				where: { business_id: id, id: { in: locationIds } },
			})) !== locationIds.length
		)
			throw new BadRequestException('Invalid business location');
		return this.prismaService.$transaction(async (tx) => {
			await tx.business_hours.deleteMany({ where: { business_id: id } });
			if (!hours.length) return [];
			return tx.business_hours.createManyAndReturn({
				data: hours.map((h) => ({ ...h, business_id: id })),
			});
		});
	}
	async putExceptions(
		id: string,
		accountId: string,
		exceptions: BusinessHourExceptionDto[],
	) {
		await this.owned(id, accountId);
		const keys = exceptions.map(
			(e) => `${e.business_city_id || 'all'}:${e.date.slice(0, 10)}`,
		);
		if (new Set(keys).size !== keys.length)
			throw new ConflictException('Duplicate hour exception');
		const locationIds = [
			...new Set(exceptions.map((e) => e.business_city_id).filter(Boolean)),
		] as string[];
		if (
			locationIds.length &&
			(await this.prismaService.business_city.count({
				where: { business_id: id, id: { in: locationIds } },
			})) !== locationIds.length
		)
			throw new BadRequestException('Invalid business location');
		return this.prismaService.$transaction(async (tx) => {
			await tx.business_hour_exception.deleteMany({
				where: { business_id: id },
			});
			if (!exceptions.length) return [];
			return tx.business_hour_exception.createManyAndReturn({
				data: exceptions.map((e) => ({
					...e,
					business_id: id,
					date: new Date(e.date),
				})),
			});
		});
	}
	async hoursStatus(id: string, cityId?: string) {
		await this.findOne(id);
		const now = new Date();
		const date = now.toISOString().slice(0, 10);
		const exception =
			await this.prismaService.business_hour_exception.findFirst({
				where: {
					business_id: id,
					date: new Date(date),
					...(cityId
						? { business_city_id: cityId }
						: { business_city_id: null }),
				},
			});
		if (exception?.is_closed)
			return { status: 'closed_exceptionally', reason: exception.reason };
		const weekday = now.getDay();
		const hour = await this.prismaService.business_hours.findFirst({
			where: {
				business_id: id,
				weekday,
				...(cityId ? { business_city_id: cityId } : { business_city_id: null }),
			},
		});
		if (!hour || hour.is_closed || !hour.opens_at || !hour.closes_at)
			return { status: 'not_informed' };
		const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
		const open =
			current >= hour.opens_at &&
			current < hour.closes_at &&
			!(
				hour.break_start &&
				hour.break_end &&
				current >= hour.break_start &&
				current < hour.break_end
			);
		const minutes = (value: string) =>
			Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
		const nowMinutes = minutes(current);
		const status = open
			? minutes(hour.closes_at) - nowMinutes <= 60
				? 'closes_soon'
				: 'open'
			: nowMinutes < minutes(hour.opens_at) &&
				  minutes(hour.opens_at) - nowMinutes <= 60
				? 'opens_soon'
				: 'closed';
		return { status, opens_at: hour.opens_at, closes_at: hour.closes_at };
	}

	async services(id: string) {
		await this.findOne(id);
		return this.prismaService.business_service.findMany({
			where: { business_id: id, active: true },
			orderBy: { position: 'asc' },
		});
	}
	async createService(
		id: string,
		accountId: string,
		dto: CreateBusinessServiceDto,
	) {
		await this.owned(id, accountId);
		return this.prismaService.business_service.create({
			data: { business_id: id, ...dto },
		});
	}
	async updateService(
		id: string,
		serviceId: string,
		accountId: string,
		dto: UpdateBusinessServiceDto,
	) {
		await this.owned(id, accountId);
		const s = await this.prismaService.business_service.findFirst({
			where: { id: serviceId, business_id: id },
		});
		if (!s) throw new NotFoundException('Service not found');
		return this.prismaService.business_service.update({
			where: { id: serviceId },
			data: dto,
		});
	}
	async deleteService(id: string, serviceId: string, accountId: string) {
		await this.owned(id, accountId);
		const s = await this.prismaService.business_service.findFirst({
			where: { id: serviceId, business_id: id },
		});
		if (!s) throw new NotFoundException('Service not found');
		await this.prismaService.business_service.delete({
			where: { id: serviceId },
		});
		return { deleted: true };
	}
	async updateTags(id: string, accountId: string, tagIds: string[]) {
		await this.owned(id, accountId);
		const tags = await this.prismaService.tag.findMany({
			where: {
				id: { in: tagIds },
				targets: { some: { target_type: 'business' } },
			},
			select: { id: true },
		});
		if (tags.length !== new Set(tagIds).size)
			throw new NotFoundException(
				'One or more tags were not found or are not available for businesses',
			);
		await this.prismaService.$transaction(async (tx) => {
			await tx.business_tag.deleteMany({ where: { business_id: id } });
			if (tagIds.length)
				await tx.business_tag.createMany({
					data: [...new Set(tagIds)].map((tag_id) => ({
						business_id: id,
						tag_id,
					})),
				});
		});
		return this.findOne(id);
	}

	async publicProfile(id: string) {
		const business = await this.prismaService.business.findUnique({
			where: { id },
			select: {
				...this.select,
				social_links: true,
				cities: {
					include: { city: { select: { id: true, name: true, slug: true } } },
				},
				medias: { orderBy: { position: 'asc' } },
				services: { where: { active: true }, orderBy: { position: 'asc' } },
				hours: { orderBy: { weekday: 'asc' } },
				reviews: { select: { rating: true } },
			},
		});
		if (!business) throw new NotFoundException('Business not found');
		const reviews = business.reviews;
		const average_rating = reviews.length
			? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
			: 0;
		const events = await this.prismaService.event.findMany({
			where: { owner_account_id: business.account.id, active: true },
			orderBy: { start_date: 'asc' },
			select: {
				id: true,
				slug: true,
				name: true,
				description: true,
				start_date: true,
				end_date: true,
			},
		});
		return {
			...this.mapBusiness(business, false),
			contact: business.social_links,
			media: business.medias,
			locations: business.cities,
			hours: business.hours,
			services: business.services,
			reviews: { average_rating, total_reviews: reviews.length },
			events,
		};
	}
}
