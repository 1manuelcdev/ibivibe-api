import {
	INestApplication,
	ValidationPipe,
	VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { account_role } from '@prisma/client';
import { AdminModule } from 'src/modules/admin/admin.module';
import { AuthGuard } from 'src/modules/common/guards/auth.guard';
import { RolesGuard } from 'src/modules/common/guards/roles.guard';
import { JwtModule } from 'src/modules/common/jwt/jwt.module';
import { JwtService } from 'src/modules/common/jwt/jwt.service';
import { hashPassword } from 'src/modules/common/password/password.util';
import { PrismaModule } from 'src/modules/common/prisma/prisma.module';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';
import { R2StorageService } from 'src/modules/medias/r2-storage.service';
import request from 'supertest';
import { App } from 'supertest/types';

describe('Admin cities (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	let jwt: JwtService;
	const BASE_PATH = '/api/v1/admin/resources/cities';
	const cityId = '550e8400-e29b-41d4-a716-446655440000';
	const storage = {
		upload: jest.fn(async (key: string) => ({
			key,
			url: `https://cdn.test/${key}`,
		})),
		delete: jest.fn(async () => ({ deleted: true })),
		getPublicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
		keyFromPublicUrl: jest.fn((url: string) =>
			url.startsWith('https://cdn.test/')
				? url.slice('https://cdn.test/'.length)
				: null,
		),
	};

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({ isGlobal: true }),
				PrismaModule,
				JwtModule,
				AdminModule,
			],
		})
			.overrideProvider(R2StorageService)
			.useValue(storage)
			.compile();

		app = moduleFixture.createNestApplication();
		app.setGlobalPrefix('/api');
		app.enableVersioning({ type: VersioningType.URI });
		app.useGlobalPipes(
			new ValidationPipe({ whitelist: true, transform: true }),
		);
		prisma = moduleFixture.get<PrismaService>(PrismaService);
		jwt = moduleFixture.get<JwtService>(JwtService);
		app.useGlobalGuards(
			new AuthGuard(app.get(Reflector), app.get(JwtService)),
			new RolesGuard(app.get(Reflector)),
		);
		await app.init();
	});

	afterEach(async () => {
		await prisma.$executeRaw`
			TRUNCATE TABLE "media", "city_tag", "tag_target", "tag", "tag_group", "city", "account"
			RESTART IDENTITY CASCADE
		`;
		jest.clearAllMocks();
	});

	afterAll(async () => {
		await prisma.$disconnect();
		await app.close();
	});

	const createAccount = async (role: account_role) =>
		prisma.account.create({
			data: {
				id: crypto.randomUUID(),
				email: `${role}-${crypto.randomUUID()}@test.com`,
				password: await hashPassword('password123'),
				name: role,
				display_name: role,
				type: 'personal',
				role,
				is_verified: true,
				active: true,
			},
		});

	const tokenFor = (accountId: string, role: account_role) =>
		jwt.sign({ id: accountId, role }, {});

	const authHeader = async (role: account_role = 'admin') => {
		const account = await createAccount(role);
		return `Bearer ${tokenFor(account.id, role)}`;
	};

	const createCity = async () => {
		await prisma.$executeRaw`
			INSERT INTO "city" (id, name, slug, description, location, created_at, updated_at)
			VALUES (
				${cityId}::uuid,
				'Ubajara',
				'ubajara',
				'Descrição antiga',
				ST_SetSRID(ST_MakePoint(-40.921, -3.851), 4326),
				NOW(), NOW()
			)
		`;
	};

	it('requires an administrative role', async () => {
		await request(app.getHttpServer()).get(BASE_PATH).expect(401);

		const userAuth = await authHeader('user');
		await request(app.getHttpServer())
			.get(BASE_PATH)
			.set('Authorization', userAuth)
			.expect(403);
	});

	it('updates coordinates and clears nullable fields', async () => {
		await createCity();
		const auth = await authHeader();

		const response = await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${cityId}`)
			.set('Authorization', auth)
			.send({
				description: null,
				latitude: -3.852,
				longitude: -40.922,
			})
			.expect(200);

		expect(response.body.description).toBeNull();
		expect(response.body.location.coordinates).toEqual([-40.922, -3.852]);

		const stored = await prisma.$queryRaw<
			Array<{ description: string | null }>
		>`SELECT description FROM "city" WHERE id = ${cityId}::uuid`;
		expect(stored[0]).toEqual({ description: null });
	});

	it('replaces city tags and returns complete tag objects', async () => {
		await createCity();
		const group = await prisma.tag_group.create({
			data: { name: `Cities ${crypto.randomUUID()}` },
		});
		const tag = await prisma.tag.create({
			data: {
				name: 'Turismo rural',
				slug: `turismo-rural-${crypto.randomUUID()}`,
				group_id: group.id,
			},
		});
		await prisma.tag_target.create({
			data: { tag_id: tag.id, target_type: 'city' },
		});
		const auth = await authHeader('super_admin');

		const response = await request(app.getHttpServer())
			.put(`${BASE_PATH}/${cityId}/tags`)
			.set('Authorization', auth)
			.send({ tag_ids: [tag.id] })
			.expect(200);

		expect(response.body.tags).toEqual([
			expect.objectContaining({
				id: tag.id,
				name: 'Turismo rural',
				slug: expect.stringContaining('turismo-rural-'),
			}),
		]);
	});

	it('uploads and reorders city media', async () => {
		await createCity();
		const auth = await authHeader();
		const onePixelPng = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64',
		);

		const upload = await request(app.getHttpServer())
			.post(`${BASE_PATH}/${cityId}/media`)
			.set('Authorization', auth)
			.field('alt_text', 'Vista da serra')
			.attach('file', onePixelPng, {
				filename: 'city.png',
				contentType: 'image/png',
			})
			.expect(201);

		expect(upload.body.is_cover).toBe(true);
		expect(upload.body.media_type).toBe('image');

		const list = await request(app.getHttpServer())
			.get(`${BASE_PATH}/${cityId}/media`)
			.set('Authorization', auth)
			.expect(200);
		expect(list.body).toHaveLength(1);

		await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${cityId}/media/order`)
			.set('Authorization', auth)
			.send({ media_ids: [list.body[0].id] })
			.expect(200);

		const stored = await prisma.media.findUnique({
			where: { id: list.body[0].id },
		});
		expect(stored?.position).toBe(0);
	});
});
