import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { CreateEventDTO } from './dto/create-event.dto';
import { UpdateEventDTO } from './dto/update-event.dto';

@Injectable()
export class EventsService {
	constructor(private readonly prismaService: PrismaService) {}

	private slugify(value: string) {
		return value
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '')
			.slice(0, 100);
	}

	private validateDates(
		start: string | Date | undefined,
		end: string | Date | undefined,
		published: boolean,
	) {
		if (!start || !end) {
			if (published)
				throw new BadRequestException(
					'Published events require start_date and end_date',
				);
			return;
		}
		const startDate = new Date(start);
		const endDate = new Date(end);
		if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()))
			throw new BadRequestException('Dates must be valid ISO 8601 values');
		if (endDate <= startDate)
			throw new BadRequestException('end_date must be after start_date');
	}

	private async validateReferences(
		tx: any,
		ownerAccountId: string,
		dto: CreateEventDTO,
	) {
		const owner = await tx.account.findUnique({
			where: { id: ownerAccountId },
			select: {
				id: true,
				business: {
					select: {
						max_reach_level: true,
						cities: { select: { city_id: true } },
					},
				},
			},
		});
		if (!owner) throw new NotFoundException('Owner account not found');
		if (
			dto.type === 'featured' &&
			(!owner.business || owner.business.max_reach_level !== 'regional')
		)
			throw new ForbiddenException(
				'Featured events require a regional business plan',
			);
		if (
			dto.reach_level === 'regional' &&
			(!owner.business || owner.business.max_reach_level !== 'regional')
		)
			throw new ForbiddenException(
				'Regional events require a regional business plan',
			);

		const cityIds = [...new Set(dto.city_ids ?? [])];
		if (cityIds.length) {
			const cities = await tx.city.findMany({
				where: { id: { in: cityIds } },
				select: { id: true },
			});
			if (cities.length !== cityIds.length)
				throw new NotFoundException('One or more cities were not found');
			if (owner.business) {
				const allowed = new Set(
					owner.business.cities.map(
						(city: { city_id: string }) => city.city_id,
					),
				);
				if (cityIds.some((cityId) => !allowed.has(cityId)))
					throw new ForbiddenException(
						'Events can only use the business headquarters or branch cities',
					);
			}
		}

		const tagIds = [...new Set(dto.tag_ids ?? [])];
		if (tagIds.length) {
			const tags = await tx.tag.findMany({
				where: {
					id: { in: tagIds },
					targets: { some: { target_type: 'event' } },
				},
				select: { id: true },
			});
			if (tags.length !== tagIds.length)
				throw new BadRequestException(
					'All tags must exist and support target_type=event',
				);
		}
	}

	private include() {
		return {
			cities: {
				include: { city: { select: { id: true, name: true, slug: true } } },
			},
			tags: {
				include: { tag: { select: { id: true, name: true, slug: true } } },
			},
			medias: {
				orderBy: [{ is_cover: 'desc' as const }, { position: 'asc' as const }],
			},
			owner: {
				select: {
					id: true,
					slug: true,
					display_name: true,
					avatar_url: true,
					type: true,
				},
			},
		};
	}

	private mapEvent(event: any) {
		return {
			...event,
			cities: (event.cities ?? []).map((item: any) => item.city),
			tags: (event.tags ?? []).map((item: any) => item.tag),
		};
	}

	async create(dto: CreateEventDTO, authenticatedAccountId?: string) {
		const ownerAccountId = authenticatedAccountId ?? dto.owner_account_id;
		if (!ownerAccountId)
			throw new BadRequestException('Authenticated account is required');
		const status = dto.status ?? 'published';
		this.validateDates(dto.start_date, dto.end_date, status === 'published');
		const slug = dto.slug || this.slugify(dto.name);
		try {
			const event = await this.prismaService.$transaction(async (tx) => {
				await this.validateReferences(tx, ownerAccountId, dto);
				return tx.event.create({
					data: {
						owner_account_id: ownerAccountId,
						name: dto.name,
						description: dto.description,
						slug,
						type: dto.type,
						active: dto.active,
						reach_level: dto.reach_level,
						start_date: dto.start_date ? new Date(dto.start_date) : new Date(0),
						end_date: dto.end_date ? new Date(dto.end_date) : new Date(0),
						status,
						cities: {
							create: (dto.city_ids ?? []).map((city_id) => ({
								city: { connect: { id: city_id } },
							})),
						},
						tags: {
							create: (dto.tag_ids ?? []).map((tag_id) => ({
								tag: { connect: { id: tag_id } },
							})),
						},
					},
					include: this.include(),
				});
			});
			return this.mapEvent(event);
		} catch (error: any) {
			if (error?.code === 'P2002')
				throw new ConflictException('Event slug already exists');
			throw error;
		}
	}

	async findAll(accountId?: string) {
		const events = await this.prismaService.event.findMany({
			where: accountId
				? { owner_account_id: accountId }
				: { status: 'published', active: true },
			include: this.include(),
			orderBy: { name: 'asc' },
		});
		return events.map((event) => this.mapEvent(event));
	}

	async findOne(id: string) {
		const event = await this.prismaService.event.findUnique({
			where: { id },
			include: this.include(),
		});
		if (!event) throw new NotFoundException('Event not found');
		return this.mapEvent(event);
	}

	private async owned(id: string, accountId: string) {
		const event = await this.prismaService.event.findUnique({
			where: { id },
			select: { id: true, owner_account_id: true },
		});
		if (!event) throw new NotFoundException('Event not found');
		if (event.owner_account_id !== accountId)
			throw new ForbiddenException('You do not own this event');
		return event;
	}

	async update(id: string, dto: UpdateEventDTO, accountId?: string) {
		if (accountId) await this.owned(id, accountId);
		const current = await this.prismaService.event.findUnique({
			where: { id },
		});
		if (!current) throw new NotFoundException('Event not found');
		const nextStatus = dto.status ?? current.status;
		this.validateDates(
			dto.start_date ?? current.start_date,
			dto.end_date ?? current.end_date,
			nextStatus === 'published',
		);
		if (dto.city_ids || dto.tag_ids)
			await this.validateReferences(
				this.prismaService,
				current.owner_account_id,
				{ ...current, ...dto } as CreateEventDTO,
			);
		const event = await this.prismaService.event.update({
			where: { id },
			data: {
				name: dto.name,
				description: dto.description,
				slug: dto.slug,
				type: dto.type,
				active: dto.active,
				reach_level: dto.reach_level,
				start_date: dto.start_date ? new Date(dto.start_date) : undefined,
				end_date: dto.end_date ? new Date(dto.end_date) : undefined,
				status: dto.status,
				cities: dto.city_ids
					? {
							deleteMany: {},
							create: dto.city_ids.map((city_id) => ({
								city: { connect: { id: city_id } },
							})),
						}
					: undefined,
				tags: dto.tag_ids
					? {
							deleteMany: {},
							create: dto.tag_ids.map((tag_id) => ({
								tag: { connect: { id: tag_id } },
							})),
						}
					: undefined,
			},
			include: this.include(),
		});
		return this.mapEvent(event);
	}

	async publish(id: string, accountId: string) {
		await this.owned(id, accountId);
		const event = await this.prismaService.event.findUniqueOrThrow({
			where: { id },
		});
		this.validateDates(event.start_date, event.end_date, true);
		return this.update(
			id,
			{ status: 'published' } as UpdateEventDTO,
			accountId,
		);
	}

	async remove(id: string, accountId?: string) {
		if (accountId) await this.owned(id, accountId);
		else await this.findOne(id);
		return this.prismaService.event.delete({ where: { id } });
	}
}
