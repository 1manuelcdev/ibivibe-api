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

describe('Admin tags (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	let jwt: JwtService;
	const storage = {
		upload: jest.fn(),
		delete: jest.fn(),
		getPublicUrl: jest.fn(),
		keyFromPublicUrl: jest.fn(),
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
			TRUNCATE TABLE "tag_target", "tag", "tag_group", "account"
			RESTART IDENTITY CASCADE
		`;
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

	const authHeader = async (role: account_role = 'admin') => {
		const account = await createAccount(role);
		return `Bearer ${jwt.sign({ id: account.id, role }, {})}`;
	};

	it('requires an administrative role and keeps legacy writes unavailable', async () => {
		await request(app.getHttpServer())
			.get('/api/v1/admin/resources/tag-groups')
			.expect(401);

		const userAuth = await authHeader('user');
		await request(app.getHttpServer())
			.get('/api/v1/admin/resources/tag-groups')
			.set('Authorization', userAuth)
			.expect(403);

		const adminAuth = await authHeader();
		await request(app.getHttpServer())
			.post('/api/v1/tags/groups')
			.set('Authorization', adminAuth)
			.send({ name: 'Legacy write' })
			.expect(404);
	});

	it('supports complete group and tag CRUD with targets', async () => {
		const auth = await authHeader('super_admin');
		const groupResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/resources/tag-groups')
			.set('Authorization', auth)
			.send({ name: `Events ${crypto.randomUUID()}`, description: 'Initial' })
			.expect(201);
		const groupId = groupResponse.body.id;

		const tagResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/resources/tags')
			.set('Authorization', auth)
			.send({
				name: 'Festivais',
				group_id: groupId,
				target_types: ['event', 'city'],
			})
			.expect(201);
		const tagId = tagResponse.body.id;

		expect(tagResponse.body.targets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tag_id: tagId, target_type: 'event' }),
			]),
		);

		const groups = await request(app.getHttpServer())
			.get('/api/v1/admin/resources/tag-groups')
			.set('Authorization', auth)
			.expect(200);
		expect(groups.body[0].tags[0]).toEqual(
			expect.objectContaining({ id: tagId, group_id: groupId }),
		);
		expect(groups.body[0].tags[0].targets).toHaveLength(2);

		await request(app.getHttpServer())
			.patch(`/api/v1/admin/resources/tags/${tagId}`)
			.set('Authorization', auth)
			.send({ name: 'Festivais atualizados', target_types: ['city'] })
			.expect(200);

		await request(app.getHttpServer())
			.patch(`/api/v1/admin/resources/tag-groups/${groupId}`)
			.set('Authorization', auth)
			.send({ description: 'Updated' })
			.expect(200);

		await request(app.getHttpServer())
			.delete(`/api/v1/admin/resources/tags/${tagId}`)
			.set('Authorization', auth)
			.expect(200);
		await request(app.getHttpServer())
			.delete(`/api/v1/admin/resources/tag-groups/${groupId}`)
			.set('Authorization', auth)
			.expect(200);
	});
});
