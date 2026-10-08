import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

type TransactionClient = Parameters<
	Parameters<typeof prisma.$transaction>[0]
>[0];

async function main() {
	console.log('🚀 Starting migration: categories → tag_group + tag\n');

	// Step 1: Check if old category table exists
	console.log('1️⃣  Checking for existing category table...');
	const tableExists = await prisma.$queryRaw<{ exists: boolean }[]>`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_name = 'category'
		) as exists
	`;

	if (!tableExists[0]?.exists) {
		console.log(
			'   ✅ No category table found. Creating tag_groups and tags from seed data...\n',
		);

		// Create tag_groups and tags from seed data files
		const tagsData = JSON.parse(
			require('fs').readFileSync(
				require('path').join(__dirname, '..', 'seed-data', 'tags.json'),
				'utf-8',
			),
		);

		const allGroups = tagsData.groups;

		for (const group of allGroups) {
			await prisma.$executeRaw`
				INSERT INTO tag_group (id, name, created_at, updated_at)
				VALUES (gen_random_uuid(), ${group.name}, now(), now())
				ON CONFLICT (name) DO UPDATE SET updated_at = now()
			`;

			const groupRows = await prisma.$queryRaw<{ id: string }[]>`
				SELECT id FROM tag_group WHERE name = ${group.name}
			`;
			const groupId = groupRows[0]?.id;

			if (!groupId) {
				console.warn(
					`   ⚠️  Failed to get group_id for "${group.name}". Skipping.`,
				);
				continue;
			}

			let position = 0;
			for (const tagName of group.tags) {
				const slug = generateSlug(tagName);
				await prisma.$executeRaw`
					INSERT INTO tag (id, name, slug, group_id, position, created_at, updated_at)
					VALUES (gen_random_uuid(), ${tagName}, ${slug}, ${groupId}, ${position}, now(), now())
					ON CONFLICT (slug) DO UPDATE SET
						name = EXCLUDED.name,
						group_id = EXCLUDED.group_id,
						position = EXCLUDED.position,
						updated_at = now()
				`;
				position++;
			}

			console.log(
				`   ✅ Group "${group.name}" created with ${group.tags.length} tags`,
			);
		}

		console.log('\n✅ Migration completed successfully!');
		return;
	}

	// Step 2: Fetch all existing categories
	console.log('2️⃣  Fetching existing categories...');
	type CategoryRow = {
		id: string;
		name: string;
		parent_id: string | null;
		entities: string[];
	};

	const categories = await prisma.$queryRaw<CategoryRow[]>`
		SELECT id, name, parent_id, entities FROM category
	`;
	console.log(`   Found ${categories.length} categories.`);

	// Steps 3-8 run inside a transaction for atomicity
	await prisma.$transaction(async (tx: TransactionClient) => {
		// Step 3: Create tag_groups from parent categories
		console.log('\n3️⃣  Creating tag_groups from parent categories...');
		const parentCategories = categories.filter((c) => c.parent_id === null);
		const tagGroupMap = new Map<string, string>();

		for (const parent of parentCategories) {
			await tx.$executeRaw`
				INSERT INTO tag_group (id, name, created_at, updated_at)
				VALUES (gen_random_uuid(), ${parent.name}, now(), now())
				ON CONFLICT (name) DO UPDATE SET updated_at = now()
			`;

			const groupRows = await tx.$queryRaw<{ id: string }[]>`
				SELECT id FROM tag_group WHERE name = ${parent.name}
			`;
			const newGroupId = groupRows[0]?.id;

			if (newGroupId) {
				tagGroupMap.set(parent.id, newGroupId);
				console.log(`   ✅ Group "${parent.name}" created`);
			}
		}

		// Step 4: Create tags from child categories
		console.log('\n4️⃣  Creating tags from child categories...');
		const childCategories = categories.filter((c) => c.parent_id !== null);
		const tagMap = new Map<string, string>();

		const childCategoriesByGroup = new Map<string, CategoryRow[]>();
		for (const child of childCategories) {
			const list = childCategoriesByGroup.get(child.parent_id!) ?? [];
			list.push(child);
			childCategoriesByGroup.set(child.parent_id!, list);
		}

		for (const [parentId, children] of Array.from(
			childCategoriesByGroup.entries(),
		)) {
			const groupId = tagGroupMap.get(parentId);
			if (!groupId) {
				console.warn(
					`   ⚠️  Group not found for parent ${parentId}. Skipping ${children.length} tags.`,
				);
				continue;
			}

			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				const slug = generateSlug(child.name);
				await tx.$executeRaw`
					INSERT INTO tag (id, name, slug, group_id, position, created_at, updated_at)
					VALUES (gen_random_uuid(), ${child.name}, ${slug}, ${groupId}, ${i}, now(), now())
					ON CONFLICT (slug) DO UPDATE SET
						name = EXCLUDED.name,
						group_id = EXCLUDED.group_id,
						position = EXCLUDED.position,
						updated_at = now()
				`;

				const tagRows = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM tag WHERE slug = ${slug}
				`;
				const tagId = tagRows[0]?.id;

				if (tagId) {
					tagMap.set(child.id, tagId);
					console.log(`   ✅ Tag "${child.name}" created (slug: ${slug})`);
				}
			}
		}

		// Step 5: Migrate junction tables
		console.log('\n5️⃣  Migrating junction tables...');

		// 5a: business_category → business_tag
		console.log('   📦 Migrating business_category → business_tag...');
		const businessCategoryRows = await tx.$queryRaw<
			{ business_id: string; category_id: string }[]
		>`SELECT business_id, category_id FROM business_category`;

		for (const row of businessCategoryRows) {
			const tagId = tagMap.get(row.category_id);
			if (tagId) {
				await tx.$executeRaw`
					INSERT INTO business_tag (id, business_id, tag_id, created_at)
					VALUES (gen_random_uuid(), ${row.business_id}, ${tagId}, now())
					ON CONFLICT (business_id, tag_id) DO NOTHING
				`;
			}
		}
		console.log(
			`   ✅ ${businessCategoryRows.length} business_category rows migrated`,
		);

		// 5b: event_category → event_tag
		console.log('   🎉 Migrating event_category → event_tag...');
		const eventCategoryRows = await tx.$queryRaw<
			{ event_id: string; category_id: string }[]
		>`SELECT event_id, category_id FROM event_category`;

		for (const row of eventCategoryRows) {
			const tagId = tagMap.get(row.category_id);
			if (tagId) {
				await tx.$executeRaw`
					INSERT INTO event_tag (id, event_id, tag_id, created_at)
					VALUES (gen_random_uuid(), ${row.event_id}, ${tagId}, now())
					ON CONFLICT (event_id, tag_id) DO NOTHING
				`;
			}
		}
		console.log(
			`   ✅ ${eventCategoryRows.length} event_category rows migrated`,
		);

		// 5c: city_category → city_tag
		console.log('   🏙️  Migrating city_category → city_tag...');
		const cityCategoryRows = await tx.$queryRaw<
			{ city_id: string; category_id: string }[]
		>`SELECT city_id, category_id FROM city_category`;

		for (const row of cityCategoryRows) {
			const tagId = tagMap.get(row.category_id);
			if (tagId) {
				await tx.$executeRaw`
					INSERT INTO city_tag (id, city_id, tag_id)
					VALUES (gen_random_uuid(), ${row.city_id}, ${tagId})
					ON CONFLICT (city_id, tag_id) DO NOTHING
				`;
			}
		}
		console.log(`   ✅ ${cityCategoryRows.length} city_category rows migrated`);

		// 5d: account_interest (category_id → tag_id)
		console.log('   👤 Migrating account_interest (category_id → tag_id)...');
		const accountInterestRows = await tx.$queryRaw<
			{ id: string; account_id: string; category_id: string }[]
		>`SELECT id, account_id, category_id FROM account_interest`;

		await tx.$executeRaw`
			ALTER TABLE account_interest ADD COLUMN IF NOT EXISTS tag_id UUID
		`;

		for (const row of accountInterestRows) {
			const tagId = tagMap.get(row.category_id);
			if (tagId) {
				await tx.$executeRaw`
					UPDATE account_interest SET tag_id = ${tagId} WHERE id = ${row.id}
				`;
			}
		}

		// Validate no unmapped rows remain before setting NOT NULL
		const unmappedCount = await tx.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*) as count FROM account_interest WHERE tag_id IS NULL
		`;
		if (unmappedCount[0]?.count && unmappedCount[0].count > BigInt(0)) {
			console.warn(
				`   ⚠️  ${unmappedCount[0].count} account_interest rows have no matching tag. Deleting them.`,
			);
			await tx.$executeRaw`DELETE FROM account_interest WHERE tag_id IS NULL`;
		}

		await tx.$executeRaw`
			ALTER TABLE account_interest ALTER COLUMN tag_id SET NOT NULL
		`;
		await tx.$executeRaw`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'account_interest_tag_id_fkey'
				) THEN
					ALTER TABLE account_interest
						ADD CONSTRAINT account_interest_tag_id_fkey
						FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE;
				END IF;
			END
			$$
		`;

		await tx.$executeRaw`
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'account_interest' AND column_name = 'category_id'
				) THEN
					ALTER TABLE account_interest DROP CONSTRAINT IF EXISTS account_interest_category_id_fkey;
					ALTER TABLE account_interest DROP COLUMN category_id;
				END IF;
			END
			$$
		`;
		console.log(
			`   ✅ ${accountInterestRows.length} account_interest rows migrated`,
		);

		// Step 6: Drop old junction tables
		console.log('\n6️⃣  Dropping old junction tables...');
		await tx.$executeRaw`DROP TABLE IF EXISTS business_category CASCADE`;
		await tx.$executeRaw`DROP TABLE IF EXISTS event_category CASCADE`;
		await tx.$executeRaw`DROP TABLE IF EXISTS city_category CASCADE`;
		console.log('   ✅ Old junction tables dropped');

		// Step 7: Drop old category table
		console.log('\n7️⃣  Dropping old category table...');
		await tx.$executeRaw`DROP TABLE IF EXISTS category CASCADE`;
		console.log('   ✅ Category table dropped');

		// Step 8: Drop entity_category enum
		console.log('\n8️⃣  Dropping entity_category enum...');
		await tx.$executeRaw`
			DO $$
			BEGIN
				IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_category') THEN
					DROP TYPE entity_category;
				END IF;
			END
			$$
		`;
		console.log('   ✅ entity_category enum dropped');
	});

	console.log('\n🎉 Migration completed successfully!');
}

main()
	.catch((e) => {
		console.error('❌ Migration failed:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
