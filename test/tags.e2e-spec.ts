/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
	INestApplication,
	ValidationPipe,
	VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from 'src/modules/common/prisma/prisma.module';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';
import { TagGroup } from 'src/modules/tags/entities/tag-group.entity';
import { Tag } from 'src/modules/tags/entities/tag.entity';
import { TagsModule } from 'src/modules/tags/tags.module';
import request from 'supertest';
import { App } from 'supertest/types';

describe('Tags (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	const BASE_PATH = '/api/v1/tags';

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({ isGlobal: true }),
				PrismaModule,
				TagsModule,
			],
		}).compile();

		app = moduleFixture.createNestApplication();

		app.setGlobalPrefix('/api');
		app.enableVersioning({ type: VersioningType.URI });

		prisma = moduleFixture.get<PrismaService>(PrismaService);

		app.useGlobalPipes(
			new ValidationPipe({ whitelist: true, transform: true }),
		);

		await app.init();
	});

	afterEach(async () => {
		await prisma.$executeRaw`TRUNCATE TABLE "tag" RESTART IDENTITY CASCADE`;
		await prisma.$executeRaw`TRUNCATE TABLE "tag_group" RESTART IDENTITY CASCADE`;
	});

	afterAll(async () => {
		await prisma.$disconnect();
		await app.close();
	});

	describe('Tag Groups', () => {
		it('GET /tags/groups -> lists all tag groups', async () => {
			await prisma.tag_group.create({
				data: { name: 'Test Group' },
			});

			const res = await request(app.getHttpServer())
				.get(`${BASE_PATH}/groups`)
				.expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(res.body[0].name).toBe('Test Group');
		});

		it('GET /tags/groups/:id -> returns 404 if not found', async () => {
			const fakeUuid = '00000000-0000-0000-0000-000000000000';
			await request(app.getHttpServer())
				.get(`${BASE_PATH}/groups/${fakeUuid}`)
				.expect(404);
		});

		it('GET /tags/groups/:id -> returns one tag group with tags', async () => {
			const groupId = '550e8400-e29b-41d4-a716-446655440000';
			await prisma.tag_group.create({
				data: { id: groupId, name: 'Moods' },
			});

			await prisma.tag.create({
				data: { name: 'Chill', slug: 'chill', group_id: groupId },
			});

			const res = await request(app.getHttpServer())
				.get(`${BASE_PATH}/groups/${groupId}`)
				.expect(200);

			const body = res.body as TagGroup & { tags: Tag[] };
			expect(body.id).toBe(groupId);
			expect(body.name).toBe('Moods');
			expect(body.tags).toBeDefined();
			expect(body.tags.length).toBe(1);
			expect(body.tags[0].name).toBe('Chill');
		});
	});

	describe('Tags', () => {
		let groupId: string;

		beforeEach(async () => {
			const group = await prisma.tag_group.create({
				data: { name: 'Default Group' },
			});
			groupId = group.id;
		});

		it('GET /tags -> lists all tags', async () => {
			await prisma.tag.create({
				data: { name: 'Tag One', slug: 'tag-one', group_id: groupId },
			});

			const res = await request(app.getHttpServer()).get(BASE_PATH).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(res.body[0].name).toBe('Tag One');
		});

		it('GET /tags -> returns empty array when no tags exist', async () => {
			const res = await request(app.getHttpServer()).get(BASE_PATH).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});

		it('GET /tags/:id -> returns 404 if not found', async () => {
			const fakeUuid = '00000000-0000-0000-0000-000000000000';
			await request(app.getHttpServer())
				.get(`${BASE_PATH}/${fakeUuid}`)
				.expect(404);
		});

		it('GET /tags/:id -> returns one tag by id', async () => {
			const tagId = '550e8400-e29b-41d4-a716-446655440010';
			await prisma.tag.create({
				data: {
					id: tagId,
					name: 'My Tag',
					slug: 'my-tag',
					group_id: groupId,
				},
			});

			const res = await request(app.getHttpServer())
				.get(`${BASE_PATH}/${tagId}`)
				.expect(200);

			const body = res.body as Tag;
			expect(body.id).toBe(tagId);
			expect(body.name).toBe('My Tag');
		});

		it('GET /tags/search?q=... -> searches tags by name', async () => {
			await prisma.tag.create({
				data: {
					name: 'Beach Vibes',
					slug: 'beach-vibes',
					group_id: groupId,
				},
			});
			await prisma.tag.create({
				data: {
					name: 'Mountain Hike',
					slug: 'mountain-hike',
					group_id: groupId,
				},
			});

			const res = await request(app.getHttpServer())
				.get(`${BASE_PATH}/search?q=Beach`)
				.expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(res.body[0].name).toBe('Beach Vibes');
		});
	});
});
