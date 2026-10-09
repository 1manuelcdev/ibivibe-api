import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword } from 'src/modules/common/password/password.util';

import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AdminService {
	constructor(private readonly prisma: PrismaService) {}

	async overview() {
		const [accounts, businesses, events, cities, leads, reviews] =
			await Promise.all([
				this.prisma.account.count(),
				this.prisma.business.count(),
				this.prisma.event.count(),
				this.prisma.city.count(),
				this.prisma.lead.count(),
				this.prisma.review.count(),
			]);
		return {
			accounts,
			businesses,
			events,
			cities,
			leads,
			reviews,
			generated_at: new Date(),
		};
	}

	private assertResource(resource: string) {
		if (
			!['accounts', 'cities', 'businesses', 'events', 'tags'].includes(resource)
		) {
			throw new BadRequestException('Unsupported admin resource');
		}
	}

	private citySelect() {
		return Prisma.sql`
			SELECT
				c.id,
				c.name,
				c.slug,
				c.description,
				ST_AsGeoJSON(c.location)::json AS location,
				COALESCE(
					(
						SELECT json_agg(
							json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
							ORDER BY t.name
						)
						FROM city_tag ct
						JOIN tag t ON t.id = ct."tag_id"
						WHERE ct."city_id" = c.id
					),
					'[]'::json
				) AS tags
			FROM city c`;
	}

	private async findCity(id: string) {
		const rows = await this.prisma.$queryRaw<any[]>(
			Prisma.sql`${this.citySelect()} WHERE c.id = ${id}::uuid LIMIT 1`,
		);
		if (!rows[0]) throw new NotFoundException('City not found');
		return rows[0];
	}

	async updateCity(id: string, input: object) {
		const payload = input as Record<string, unknown>;
		await this.findCity(id);
		const hasLatitude =
			Object.prototype.hasOwnProperty.call(payload, 'latitude') &&
			payload.latitude !== undefined;
		const hasLongitude =
			Object.prototype.hasOwnProperty.call(payload, 'longitude') &&
			payload.longitude !== undefined;
		if (hasLatitude !== hasLongitude)
			throw new BadRequestException(
				'latitude and longitude must be provided together',
			);

		const assignments: Prisma.Sql[] = [];
		if (
			Object.prototype.hasOwnProperty.call(payload, 'name') &&
			payload.name !== undefined
		)
			assignments.push(Prisma.sql`"name" = ${payload.name}`);
		if (
			Object.prototype.hasOwnProperty.call(payload, 'slug') &&
			payload.slug !== undefined
		)
			assignments.push(Prisma.sql`"slug" = ${payload.slug}`);
		if (
			Object.prototype.hasOwnProperty.call(payload, 'description') &&
			payload.description !== undefined
		)
			assignments.push(Prisma.sql`"description" = ${payload.description}`);
		if (hasLatitude && hasLongitude) {
			const latitude = Number(payload.latitude);
			const longitude = Number(payload.longitude);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
				throw new BadRequestException('latitude and longitude must be numbers');
			assignments.push(
				Prisma.sql`"location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
			);
		}

		if (assignments.length) {
			try {
				await this.prisma.$executeRaw(
					Prisma.sql`UPDATE city SET ${Prisma.join(assignments, ', ')}, "updated_at" = now() WHERE id = ${id}::uuid`,
				);
			} catch (error: any) {
				if (error?.code === 'P2002' || error?.code === '23505')
					throw new ConflictException('City slug already exists');
				throw error;
			}
		}
		return this.findCity(id);
	}

	async replaceCityTags(cityId: string, tagIds: string[]) {
		await this.findCity(cityId);
		const ids = [...new Set(tagIds)];
		if (ids.length) {
			const tags = await this.prisma.tag.findMany({
				where: { id: { in: ids }, targets: { some: { target_type: 'city' } } },
				select: { id: true },
			});
			if (tags.length !== ids.length)
				throw new BadRequestException(
					'All tags must exist and support target_type=city',
				);
		}
		await this.prisma.$transaction(async (tx) => {
			await tx.city_tag.deleteMany({ where: { city_id: cityId } });
			if (ids.length)
				await tx.city_tag.createMany({
					data: ids.map((tag_id) => ({ city_id: cityId, tag_id })),
				});
		});
		return this.findCity(cityId);
	}

	async list(resource: string) {
		this.assertResource(resource);
		if (resource === 'accounts')
			return this.prisma.account.findMany({
				omit: { password: true },
				orderBy: { created_at: 'desc' },
			});
		if (resource === 'cities')
			return this.prisma.$queryRaw`${this.citySelect()} ORDER BY c.name ASC`;
		if (resource === 'businesses')
			return this.prisma.business.findMany({
				orderBy: { created_at: 'desc' },
				select: {
					id: true,
					owner_account_id: true,
					cnpj: true,
					max_reach_level: true,
					created_at: true,
					account: { select: { display_name: true, email: true, type: true } },
					tags: { include: { tag: true } },
				},
			});
		if (resource === 'events') {
			const events = await this.prisma.event.findMany({
				orderBy: { created_at: 'desc' },
				select: {
					id: true,
					owner_account_id: true,
					name: true,
					slug: true,
					description: true,
					type: true,
					reach_level: true,
					start_date: true,
					end_date: true,
					active: true,
					created_at: true,
					owner: { select: { display_name: true, email: true } },
					tags: { include: { tag: true } },
				},
			});
			return events;
		}
		return this.prisma.tag.findMany({
			orderBy: [{ group: { name: 'asc' } }, { position: 'asc' }],
			include: { group: true },
		});
	}

	async create(resource: string, input: Record<string, unknown>) {
		this.assertResource(resource);
		if (resource === 'accounts') {
			const password = String(input.password ?? '');
			if (!password) throw new BadRequestException('Password is required');
			return this.prisma.account.create({
				data: {
					email: String(input.email),
					name: String(input.name ?? input.display_name),
					display_name: String(input.display_name ?? input.name),
					password: await hashPassword(password),
					phone_number: input.phone_number ? String(input.phone_number) : null,
					slug: input.slug ? String(input.slug) : null,
					type: input.type === 'business' ? 'business' : 'personal',
				},
				omit: { password: true },
			});
		}
		if (resource === 'cities') {
			const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
				INSERT INTO city (name, slug, description, location)
				VALUES (
					${String(input.name)},
					${String(input.slug)},
					${input.description ? String(input.description) : null},
					ST_SetSRID(ST_MakePoint(${Number(input.longitude ?? 0)}, ${Number(input.latitude ?? 0)}), 4326)
				)
				RETURNING id
			`;
			return this.findCity(rows[0].id);
		}
		if (resource === 'businesses')
			return this.prisma.business.create({
				data: {
					owner_account_id: String(input.account_id),
					cnpj: input.cnpj ? String(input.cnpj) : null,
					max_reach_level:
						input.max_reach_level === 'regional' ? 'regional' : 'local',
				},
				include: { account: true },
			});
		if (resource === 'events')
			return this.prisma.event.create({
				data: {
					owner_account_id: String(input.owner_account_id),
					name: String(input.name),
					slug: String(input.slug),
					description: input.description ? String(input.description) : null,
					type: input.type === 'featured' ? 'featured' : 'simple',
					reach_level: input.reach_level === 'regional' ? 'regional' : 'local',
					active: input.active !== 'false',
					start_date: new Date(String(input.start_date)),
					end_date: new Date(String(input.end_date)),
				},
			});
		return this.prisma.tag.create({
			data: {
				name: String(input.name),
				slug: String(input.name)
					.toLowerCase()
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '')
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/(^-|-$)/g, ''),
				group_id: String(input.group_id),
				description: input.description ? String(input.description) : null,
				color: input.color ? String(input.color) : null,
				position: Number(input.position ?? 0),
			},
		});
	}

	async update(resource: string, id: string, input: Record<string, unknown>) {
		this.assertResource(resource);
		if (resource === 'accounts')
			return this.prisma.account.update({
				where: { id },
				data: {
					display_name: input.display_name
						? String(input.display_name)
						: undefined,
					email: input.email ? String(input.email) : undefined,
					active:
						input.active !== undefined ? input.active !== 'false' : undefined,
				},
				omit: { password: true },
			});
		if (resource === 'cities') return this.updateCity(id, input);
		if (resource === 'businesses')
			return this.prisma.business.update({
				where: { id },
				data: {
					cnpj: input.cnpj ? String(input.cnpj) : undefined,
					max_reach_level:
						input.max_reach_level === 'regional' ? 'regional' : undefined,
				},
			});
		if (resource === 'events')
			return this.prisma.event.update({
				where: { id },
				data: {
					name: input.name ? String(input.name) : undefined,
					slug: input.slug ? String(input.slug) : undefined,
					description: input.description
						? String(input.description)
						: undefined,
					active:
						input.active !== undefined ? input.active !== 'false' : undefined,
				},
			});
		return this.prisma.tag.update({
			where: { id },
			data: {
				name: input.name ? String(input.name) : undefined,
				description: input.description ? String(input.description) : undefined,
				color: input.color ? String(input.color) : undefined,
				position:
					input.position !== undefined ? Number(input.position) : undefined,
			},
		});
	}

	async remove(resource: string, id: string) {
		this.assertResource(resource);
		try {
			if (resource === 'accounts')
				return this.prisma.account.delete({
					where: { id },
					omit: { password: true },
				});
			if (resource === 'cities')
				return this.prisma.city.delete({ where: { id } });
			if (resource === 'businesses')
				return this.prisma.business.delete({ where: { id } });
			if (resource === 'events')
				return this.prisma.event.delete({ where: { id } });
			return this.prisma.tag.delete({ where: { id } });
		} catch {
			throw new NotFoundException('Resource not found');
		}
	}
}
