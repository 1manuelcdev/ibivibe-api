import {
	INestApplication,
	ValidationPipe,
	VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { hashPassword } from 'src/modules/common/password/password.util';
import { PrismaModule } from 'src/modules/common/prisma/prisma.module';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';
import { EventsModule } from 'src/modules/events/events.module';
import { MediasService } from 'src/modules/medias/medias.service';
import { R2StorageService } from 'src/modules/medias/r2-storage.service';
import request from 'supertest';
import { App } from 'supertest/types';

describe('Events (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	const BASE_PATH = '/api/v1/events';
	const mediaService = {
		getMediaByEvent: jest.fn(),
		addEventMedia: jest.fn(),
		updateEventMedia: jest.fn(),
		reorderEventMedia: jest.fn(),
		removeEventMedia: jest.fn(),
	};

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({ isGlobal: true }),
				PrismaModule,
				EventsModule,
			],
		})
			.overrideProvider(MediasService)
			.useValue(mediaService)
			.overrideProvider(R2StorageService)
			.useValue({})
			.compile();

		app = moduleFixture.createNestApplication();
		app.setGlobalPrefix('/api');
		app.enableVersioning({ type: VersioningType.URI });
		prisma = moduleFixture.get<PrismaService>(PrismaService);
		app.use((req: any, _res: any, next: () => void) => {
			const accountId = req.headers['x-test-account-id'];
			if (accountId) req.user = { id: accountId, role: 'user' };
			next();
		});
		app.useGlobalPipes(
			new ValidationPipe({ whitelist: true, transform: true }),
		);
		await app.init();
	});

	afterEach(async () => {
		await prisma.$executeRaw`TRUNCATE TABLE "event", "account", "tag_group", "city" RESTART IDENTITY CASCADE`;
		jest.clearAllMocks();
	});

	afterAll(async () => {
		await prisma.$disconnect();
		await app.close();
	});

	const createAccount = async (
		slug: string,
		type: 'personal' | 'business' = 'personal',
	) =>
		prisma.account.create({
			data: {
				id: crypto.randomUUID(),
				email: `event-${slug}@test.com`,
				password: await hashPassword('password123'),
				phone_number: `+5588${Date.now().toString().slice(-8)}`,
				name: slug,
				slug,
				display_name: slug,
				type,
				is_verified: true,
				active: true,
			},
		});

	const createReferences = async () => {
		const group = await prisma.tag_group.create({
			data: { name: `Events ${crypto.randomUUID()}` },
		});
		const tag = await prisma.tag.create({
			data: {
				name: 'Festival',
				slug: `festival-${crypto.randomUUID()}`,
				group_id: group.id,
			},
		});
		await prisma.tag_target.create({
			data: { tag_id: tag.id, target_type: 'event' },
		});
		const cityId = crypto.randomUUID();
		await prisma.$executeRaw`
			INSERT INTO "city" (id, slug, name, location, created_at, updated_at)
			VALUES (${cityId}::uuid, ${`city-${cityId}`}, 'Event City', ST_SetSRID(ST_MakePoint(-40, -3), 4326), NOW(), NOW())
		`;
		return { cityId, tagId: tag.id };
	};

	const payload = (
		ownerId: string,
		refs?: { cityId: string; tagId: string },
	) => ({
		owner_account_id: ownerId,
		name: 'New Event',
		description: 'New Description',
		type: 'simple',
		reach_level: 'local',
		start_date: '2026-10-07T18:00:00.000Z',
		end_date: '2026-10-07T20:00:00.000Z',
		...(refs ? { city_ids: [refs.cityId], tag_ids: [refs.tagId] } : {}),
	});

	it('lists only active published events publicly and returns owned drafts privately', async () => {
		const owner = await createAccount('list-owner');
		const published = await prisma.event.create({
			data: {
				...payload(owner.id),
				slug: 'published-event',
				status: 'published',
			} as any,
		});
		await prisma.event.create({
			data: {
				...payload(owner.id),
				slug: 'draft-event',
				status: 'draft',
			} as any,
		});

		const publicResponse = await request(app.getHttpServer())
			.get(BASE_PATH)
			.expect(200);
		const ownedResponse = await request(app.getHttpServer())
			.get(`${BASE_PATH}/owned`)
			.set('x-test-account-id', owner.id)
			.expect(200);
		expect(publicResponse.body.map((event: any) => event.id)).toEqual([
			published.id,
		]);
		expect(ownedResponse.body).toHaveLength(2);
	});

	it('creates a published event with cities and event-compatible tags', async () => {
		const owner = await createAccount('create-owner');
		const refs = await createReferences();
		const response = await request(app.getHttpServer())
			.post(BASE_PATH)
			.set('x-test-account-id', owner.id)
			.send(payload('ignored-owner', refs))
			.expect(201);

		expect(response.body.status).toBe('published');
		expect(response.body.cities).toEqual([
			expect.objectContaining({ id: refs.cityId }),
		]);
		expect(response.body.tags).toEqual([
			expect.objectContaining({ id: refs.tagId }),
		]);
		expect(response.body.owner_account_id).toBe(owner.id);
	});

	it('saves a draft and publishes it only after dates are supplied', async () => {
		const owner = await createAccount('draft-owner');
		const draft = await request(app.getHttpServer())
			.post(BASE_PATH)
			.set('x-test-account-id', owner.id)
			.send({
				...payload(owner.id),
				status: 'draft',
				start_date: undefined,
				end_date: undefined,
			})
			.expect(201);
		expect(draft.body.status).toBe('draft');
		await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${draft.body.id}/publish`)
			.set('x-test-account-id', owner.id)
			.expect(400);
		await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${draft.body.id}`)
			.set('x-test-account-id', owner.id)
			.send({
				start_date: '2026-10-07T18:00:00.000Z',
				end_date: '2026-10-07T20:00:00.000Z',
			})
			.expect(200);
		const published = await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${draft.body.id}/publish`)
			.set('x-test-account-id', owner.id)
			.expect(200);
		expect(published.body.status).toBe('published');
	});

	it('rejects invalid tags and prevents another account from editing', async () => {
		const owner = await createAccount('secure-owner');
		const other = await createAccount('other-owner');
		await request(app.getHttpServer())
			.post(BASE_PATH)
			.set('x-test-account-id', owner.id)
			.send({ ...payload(owner.id), tag_ids: [crypto.randomUUID()] })
			.expect(400);
		const event = await request(app.getHttpServer())
			.post(BASE_PATH)
			.set('x-test-account-id', owner.id)
			.send(payload(owner.id))
			.expect(201);
		await request(app.getHttpServer())
			.patch(`${BASE_PATH}/${event.body.id}`)
			.set('x-test-account-id', other.id)
			.send({ name: 'Hijacked Event' })
			.expect(403);
	});

	it('rejects cities that do not exist', async () => {
		const owner = await createAccount('city-owner');
		await request(app.getHttpServer())
			.post(BASE_PATH)
			.set('x-test-account-id', owner.id)
			.send({ ...payload(owner.id), city_ids: [crypto.randomUUID()] })
			.expect(404);
	});

	it('exposes the event media contract through the event routes', async () => {
		const owner = await createAccount('media-owner');
		mediaService.getMediaByEvent.mockResolvedValue([
			{ id: 'media-1', is_cover: true, position: 0 },
		]);
		mediaService.addEventMedia.mockResolvedValue({
			id: 'media-1',
			is_cover: true,
			position: 0,
		});
		await request(app.getHttpServer())
			.get(`${BASE_PATH}/event-1/media`)
			.expect(200);
		await request(app.getHttpServer())
			.post(`${BASE_PATH}/event-1/media`)
			.set('x-test-account-id', owner.id)
			.attach('file', Buffer.from('image'), 'cover.png')
			.field('is_cover', 'true')
			.expect(201);
		expect(mediaService.addEventMedia).toHaveBeenCalled();
	});
});
