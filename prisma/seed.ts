import * as fs from 'fs';
import * as path from 'path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ——— TIPOS ———————————————————————————————————————————————————————————————————

interface TagGroupEntry {
	name: string;
	tags: string[];
	target_types?: TagTargetType[];
}

type TagTargetType = 'city' | 'business' | 'event';

interface CityEntry {
	name: string;
	slug: string;
	description: string;
	lat: number;
	lng: number;
	cover_img_url: string;
	tags: string[];
}

interface UserEntry {
	name: string;
	username: string;
	email: string;
	phone_number: string;
	password: string;
	birth_date: string;
	role: string;
	interests: string[];
	bio?: string;
	avatar_url?: string;
	type?: 'personal' | 'business';
}

interface BusinessCityRef {
	slug: string;
	is_headquarter: boolean;
	adress_specific: string;
}

interface MediaEntry {
	media_type: 'image' | 'video';
	url: string;
	is_cover: boolean;
	alt_text?: string;
}

interface BusinessEntry {
	name: string;
	slug: string;
	description: string;
	cnpj: string;
	max_reach_level: 'local' | 'regional';
	tags: string[];
	cities: BusinessCityRef[];
	medias: MediaEntry[];
}

interface EventCityRef {
	slug: string;
	adress_specific: string;
}

interface EventEntry {
	name: string;
	slug: string;
	description: string;
	cover_img_url: string;
	reach_level: 'local' | 'regional';
	type: 'simple' | 'featured';
	start_date: string;
	end_date: string;
	active: boolean;
	business_slug: string | null;
	user_email: string | null;
	tags: string[];
	cities: EventCityRef[];
	medias: MediaEntry[];
}

interface LeadEntry {
	name: string;
	email: string;
	phone_number: string;
	type: 'resident' | 'tourist' | 'business';
	business_name: string | null;
}

interface FavoriteEntry {
	user_email: string;
	city_slug?: string;
	event_slug?: string;
	business_slug?: string;
}

interface TagsData {
	groups: TagGroupEntry[];
	tag_targets?: Record<string, TagTargetType[]>;
}

// ——— HELPERS —————————————————————————————————————————————————————————————————

function loadJsonFile<T>(filePath: string): T {
	const data = fs.readFileSync(filePath, 'utf-8');
	return JSON.parse(data) as T;
}

function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

function loadSeedData() {
	const seedDataDir = path.join(__dirname, 'seed-data');

	const tagsData = loadJsonFile<TagsData>(path.join(seedDataDir, 'tags.json'));
	const cities = loadJsonFile<CityEntry[]>(
		path.join(seedDataDir, 'cities.json'),
	);
	const users = loadJsonFile<UserEntry[]>(path.join(seedDataDir, 'users.json'));
	const businesses = loadJsonFile<BusinessEntry[]>(
		path.join(seedDataDir, 'businesses.json'),
	);
	const events = loadJsonFile<EventEntry[]>(
		path.join(seedDataDir, 'events.json'),
	);
	const leads = loadJsonFile<LeadEntry[]>(path.join(seedDataDir, 'leads.json'));
	const favorites = loadJsonFile<FavoriteEntry[]>(
		path.join(seedDataDir, 'favorites.json'),
	);

	return {
		groups: tagsData.groups,
		tagTargets: tagsData.tag_targets ?? {},
		cities,
		users,
		businesses,
		events,
		leads,
		favorites,
	};
}

async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password);
}

// ——— MAIN ————————————————————————————————————————————————————————————————————

async function main() {
	console.log('🌱 Carregando dados de seed...');
	const data = loadSeedData();
	console.log('✅ Dados carregados.');

	await prisma.$transaction(
		async (tx: Prisma.TransactionClient) => {
			// ─── 1. TAGS (tag_group + tag) ─────────────────────────────────────

			console.log('\n🏷️  Seeding tag_groups e tags...');

			// Mapa tag name -> id para resolver lookups posteriores
			const tagMap = new Map<string, string>();
			const tagTargetMap = new Map<string, Set<TagTargetType>>();

			// Criar tag_groups e suas tags
			for (const group of data.groups) {
				const createdGroup = await tx.tag_group.upsert({
					where: { name: group.name },
					update: {},
					create: { name: group.name },
				});

				let position = 0;
				for (const tagName of group.tags) {
					const slug = generateSlug(tagName);
					const createdTag = await tx.tag.upsert({
						where: { slug },
						update: {
							name: tagName,
							group_id: createdGroup.id,
							position,
						},
						create: {
							name: tagName,
							slug,
							group_id: createdGroup.id,
							position,
						},
					});
					tagMap.set(createdTag.name, createdTag.id);

					const targetTypes =
						data.tagTargets[tagName] ?? group.target_types ?? [];
					if (targetTypes.length) {
						await tx.tag_target.createMany({
							data: targetTypes.map((target_type) => ({
								tag_id: createdTag.id,
								target_type,
							})),
							skipDuplicates: true,
						});
					}
					tagTargetMap.set(createdTag.id, new Set(targetTypes));
					position++;
				}

				console.log(`  ✅ Group "${group.name}" com ${group.tags.length} tags`);
			}

			console.log(`  ✅ Total: ${tagMap.size} tags processadas.`);

			const resolveTag = (
				name: string,
				targetType: TagTargetType,
				context: string,
			) => {
				const tagId = tagMap.get(name);
				if (!tagId) {
					console.warn(`  ⚠️  Tag "${name}" não encontrada para ${context}.`);
					return undefined;
				}
				if (!tagTargetMap.get(tagId)?.has(targetType)) {
					console.warn(
						`  ⚠️  Tag "${name}" não disponível para ${targetType} (${context}).`,
					);
					return undefined;
				}
				return tagId;
			};

			// ─── 2. CIDADES ─────────────────────────────────────────────────

			console.log('\n🏙️  Seeding cidades...');

			const cityMap = new Map<string, string>(); // slug -> id

			for (const cityData of data.cities) {
				// city tem campo Unsupported("geometry"), então create/upsert não existem no tipo.
				// Usamos raw SQL para insert/update + location em uma só operação.
				await tx.$executeRaw`
					INSERT INTO city (id, slug, name, description, cover_img_url, location, created_at, updated_at)
					VALUES (
						gen_random_uuid(),
						${cityData.slug},
						${cityData.name},
						${cityData.description},
						${cityData.cover_img_url},
						ST_SetSRID(ST_MakePoint(${cityData.lng}, ${cityData.lat}), 4326),
						now(),
						now()
					)
					ON CONFLICT (slug) DO UPDATE SET
						name         = EXCLUDED.name,
						description  = EXCLUDED.description,
						cover_img_url = EXCLUDED.cover_img_url,
						location     = EXCLUDED.location,
						updated_at   = now()
				`;

				// Busca o id gerado para usar nos relacionamentos
				const rows = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM city WHERE slug = ${cityData.slug}
				`;
				const cityId = rows[0]?.id;
				if (!cityId) {
					console.warn(
						`  ⚠️  Falha ao recuperar id da cidade "${cityData.slug}". Pulando tags.`,
					);
					continue;
				}

				cityMap.set(cityData.slug, cityId);

				// Tags da cidade
				for (const tagName of cityData.tags) {
					const tagId = resolveTag(
						tagName,
						'city',
						`cidade "${cityData.name}"`,
					);
					if (!tagId) continue;

					await tx.city_tag.upsert({
						where: {
							city_id_tag_id: {
								city_id: cityId,
								tag_id: tagId,
							},
						},
						update: {},
						create: { city_id: cityId, tag_id: tagId },
					});
				}
			}

			console.log(`  ✅ ${cityMap.size} cidades processadas.`);

			// ─── 3. CONTAS DE USUÁRIO (unificado account + profile) ───

			console.log('\n👤 Seeding usuários...');

			// email -> account id
			const accountMap = new Map<string, string>();

			for (const userData of data.users) {
				const hashedPassword = await hashPassword(userData.password);
				const role =
					userData.role === 'superuser'
						? 'super_admin'
						: userData.role === 'admin'
							? 'admin'
							: 'user';

				// Cria account unificado com campos do perfil
				const account = await tx.account.upsert({
					where: { email: userData.email },
					update: {
						name: userData.name,
						password: hashedPassword,
						phone_number: userData.phone_number,
						is_verified: true,
						slug: userData.username,
						display_name: userData.name,
						bio: userData.bio,
						avatar_url: userData.avatar_url,
						gender: 'male',
						type: userData.type || 'personal',
					},
					create: {
						name: userData.name,
						email: userData.email,
						password: hashedPassword,
						phone_number: userData.phone_number,
						is_verified: true,
						slug: userData.username,
						display_name: userData.name,
						bio: userData.bio,
						avatar_url: userData.avatar_url,
						type: userData.type || 'personal',
					},
				});

				await tx.$executeRaw`UPDATE account SET role = ${role}::account_role WHERE id = ${account.id}::uuid`;

				accountMap.set(userData.email, account.id);

				// Interesses do usuário (agora account_interest com tag_id)
				for (const interestName of userData.interests) {
					const tagId = tagMap.get(interestName);
					if (!tagId) {
						console.warn(
							`  ⚠️  Tag de interesse "${interestName}" não encontrada para usuário "${userData.email}".`,
						);
						continue;
					}

					await tx.account_interest.upsert({
						where: {
							account_id_tag_id: {
								account_id: account.id,
								tag_id: tagId,
							},
						},
						update: {},
						create: { account_id: account.id, tag_id: tagId },
					});
				}
			}

			console.log(`  ✅ ${accountMap.size} contas de usuário processadas.`);

			// ─── 4. BUSINESSES ──────────────────────────────────────────────

			console.log('\n🏢 Seeding empresas...');

			// slug -> account id do business
			const businessAccountMap = new Map<string, string>();

			for (const bizData of data.businesses) {
				// Cria account do tipo business
				const businessAccount = await tx.account.upsert({
					where: { slug: bizData.slug },
					update: {
						display_name: bizData.name,
						bio: bizData.description,
						type: 'business',
					},
					create: {
						id: crypto.randomUUID(),
						email: `business-${bizData.slug}@ibivibe.local`,
						password: await hashPassword('temp-password'),
						phone_number: `+5588${Math.floor(Math.random() * 100000000)
							.toString()
							.padStart(8, '0')}`,
						name: bizData.name,
						slug: bizData.slug,
						display_name: bizData.name,
						bio: bizData.description,
						type: 'business',
						is_verified: true,
					},
				});

				businessAccountMap.set(bizData.slug, businessAccount.id);

				// Cria registro business
				const business = await tx.business.upsert({
					where: { owner_account_id: businessAccount.id },
					update: {
						commercial_name: bizData.name,
						description: bizData.description,
						cnpj: bizData.cnpj,
						max_reach_level: bizData.max_reach_level,
					},
					create: {
						owner_account_id: businessAccount.id,
						commercial_name: bizData.name,
						description: bizData.description,
						cnpj: bizData.cnpj,
						max_reach_level: bizData.max_reach_level,
					},
				});

				// Tags do business
				for (const tagName of bizData.tags) {
					const tagId = resolveTag(
						tagName,
						'business',
						`business "${bizData.slug}"`,
					);
					if (!tagId) continue;

					await tx.business_tag.upsert({
						where: {
							business_id_tag_id: {
								business_id: business.id,
								tag_id: tagId,
							},
						},
						update: {},
						create: {
							business_id: business.id,
							tag_id: tagId,
						},
					});
				}

				// Cidades do business
				for (const cityRef of bizData.cities) {
					const cityId = cityMap.get(cityRef.slug);
					if (!cityId) {
						console.warn(
							`  ⚠️  Cidade "${cityRef.slug}" não encontrada para business "${bizData.slug}".`,
						);
						continue;
					}

					// business_city não tem unique composta no schema, usa firstOrCreate via findFirst
					const existing = await tx.business_city.findFirst({
						where: {
							business_id: business.id,
							city_id: cityId,
						},
					});

					if (!existing) {
						await tx.business_city.create({
							data: {
								business_id: business.id,
								city_id: cityId,
								is_headquarter: cityRef.is_headquarter,
								address_specific: cityRef.adress_specific,
							},
						});
					}
				}

				// Mídias do business (vinculadas diretamente à empresa)
				for (const media of bizData.medias) {
					const existingMedia = await tx.media.findFirst({
						where: { business_id: business.id, url: media.url },
					});

					if (existingMedia) {
						await tx.media.update({
							where: { id: existingMedia.id },
							data: {
								media_type: media.media_type,
								is_cover: media.is_cover,
								alt_text: media.alt_text,
							},
						});
					} else {
						await tx.media.create({
							data: {
								business_id: business.id,
								media_type: media.media_type,
								url: media.url,
								is_cover: media.is_cover,
								alt_text: media.alt_text,
							},
						});
					}
				}
			}

			console.log(`  ✅ ${businessAccountMap.size} businesses processados.`);

			// ─── 5. EVENTOS ─────────────────────────────────────────────────

			console.log('\n🎉 Seeding eventos...');

			let eventCount = 0;

			for (const evData of data.events) {
				// Determina o owner: business account ou user account
				let ownerAccountId: string | undefined;

				if (evData.business_slug) {
					ownerAccountId = businessAccountMap.get(evData.business_slug);
					if (!ownerAccountId) {
						console.warn(
							`  ⚠️  Business "${evData.business_slug}" não encontrado para evento "${evData.slug}". Pulando.`,
						);
						continue;
					}
				} else if (evData.user_email) {
					// Busca a account do usuário pelo email
					ownerAccountId = accountMap.get(evData.user_email);
					if (!ownerAccountId) {
						console.warn(
							`  ⚠️  Usuário "${evData.user_email}" não encontrado para evento "${evData.slug}". Pulando.`,
						);
						continue;
					}
				}

				if (!ownerAccountId) {
					console.warn(
						`  ⚠️  Owner não resolvido para evento "${evData.slug}". Pulando.`,
					);
					continue;
				}

				const event = await tx.event.upsert({
					where: { slug: evData.slug },
					update: {
						name: evData.name,
						description: evData.description,
						cover_img_url: evData.cover_img_url,
						reach_level: evData.reach_level,
						type: evData.type,
						start_date: new Date(evData.start_date),
						end_date: new Date(evData.end_date),
						active: evData.active,
					},
					create: {
						slug: evData.slug,
						owner_account_id: ownerAccountId,
						name: evData.name,
						description: evData.description,
						cover_img_url: evData.cover_img_url,
						reach_level: evData.reach_level,
						type: evData.type,
						start_date: new Date(evData.start_date),
						end_date: new Date(evData.end_date),
						active: evData.active,
					},
				});

				// Tags do evento
				for (const tagName of evData.tags) {
					const tagId = resolveTag(tagName, 'event', `evento "${evData.slug}"`);
					if (!tagId) continue;

					await tx.event_tag.upsert({
						where: {
							event_id_tag_id: {
								event_id: event.id,
								tag_id: tagId,
							},
						},
						update: {},
						create: { event_id: event.id, tag_id: tagId },
					});
				}

				// Cidades do evento
				for (const cityRef of evData.cities) {
					const cityId = cityMap.get(cityRef.slug);
					if (!cityId) {
						console.warn(
							`  ⚠️  Cidade "${cityRef.slug}" não encontrada para evento "${evData.slug}".`,
						);
						continue;
					}

					const existing = await tx.event_city.findFirst({
						where: { event_id: event.id, city_id: cityId },
					});

					if (!existing) {
						await tx.event_city.create({
							data: {
								event_id: event.id,
								city_id: cityId,
								address_specific: cityRef.adress_specific,
							},
						});
					}
				}

				// Mídias do evento
				for (const media of evData.medias) {
					await tx.media.create({
						data: {
							event_id: event.id,
							media_type: media.media_type,
							url: media.url,
							is_cover: media.is_cover,
						},
					});
				}

				eventCount++;
			}

			console.log(`  ✅ ${eventCount} eventos processados.`);

			// ─── 6. FAVORITES ────────────────────────────────────────────────

			console.log('\n❤️  Seeding favoritos...');

			let favoriteCount = 0;

			for (const favData of data.favorites) {
				const accountId = accountMap.get(favData.user_email);
				if (!accountId) {
					console.warn(
						`  ⚠️  Conta "${favData.user_email}" não encontrada para favorito. Pulando.`,
					);
					continue;
				}

				// Favorite de cidade
				if (favData.city_slug) {
					const cityId = cityMap.get(favData.city_slug);
					if (!cityId) {
						console.warn(
							`  ⚠️  Cidade "${favData.city_slug}" não encontrada para favorito.`,
						);
					} else {
						await tx.account_favorite.upsert({
							where: {
								account_id_city_id: {
									account_id: accountId,
									city_id: cityId,
								},
							},
							update: {},
							create: {
								account_id: accountId,
								city_id: cityId,
							},
						});
						favoriteCount++;
					}
				}

				// Favorite de evento
				if (favData.event_slug) {
					const event = await tx.event.findUnique({
						where: { slug: favData.event_slug },
					});
					if (!event) {
						console.warn(
							`  ⚠️  Evento "${favData.event_slug}" não encontrado para favorito.`,
						);
					} else {
						await tx.account_favorite.upsert({
							where: {
								account_id_event_id: {
									account_id: accountId,
									event_id: event.id,
								},
							},
							update: {},
							create: {
								account_id: accountId,
								event_id: event.id,
							},
						});
						favoriteCount++;
					}
				}

				// Favorite de business
				if (favData.business_slug) {
					const businessAccountId = businessAccountMap.get(
						favData.business_slug,
					);
					if (!businessAccountId) {
						console.warn(
							`  ⚠️  Business "${favData.business_slug}" não encontrado para favorito.`,
						);
					} else {
						const business = await tx.business.findUnique({
							where: { owner_account_id: businessAccountId },
						});
						if (business) {
							await tx.account_favorite.upsert({
								where: {
									account_id_business_id: {
										account_id: accountId,
										business_id: business.id,
									},
								},
								update: {},
								create: {
									account_id: accountId,
									business_id: business.id,
								},
							});
							favoriteCount++;
						}
					}
				}
			}

			console.log(`  ✅ ${favoriteCount} favoritos processados.`);

			// ─── 7. LEADS ─────────────────────────────────────────────────────

			console.log('\n📋 Seeding leads...');

			for (const leadData of data.leads) {
				await tx.lead.upsert({
					where: { email: leadData.email },
					update: {
						name: leadData.name,
						phone_number: leadData.phone_number,
						type: leadData.type,
						business_name: leadData.business_name,
					},
					create: {
						name: leadData.name,
						email: leadData.email,
						phone_number: leadData.phone_number,
						type: leadData.type,
						business_name: leadData.business_name,
					},
				});
			}

			console.log(`  ✅ ${data.leads.length} leads processados.`);
		},
		{ timeout: 60000 },
	);

	console.log('\n🚀 Seeding concluído com sucesso!');
}

main()
	.then(async () => {
		await prisma.$disconnect();
		await pool.end();
	})
	.catch(async (e) => {
		console.error('❌ Erro fatal no seeding:', e);
		await prisma.$disconnect();
		await pool.end();
		process.exit(1);
	});
