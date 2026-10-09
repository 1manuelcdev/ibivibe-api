import { city } from '@prisma/client';

export class City implements city {
	name: string;
	id: string;
	slug: string;
	description: string | null;
	created_at: Date;
	updated_at: Date;
}
