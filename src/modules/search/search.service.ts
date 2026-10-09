import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { SearchResponseDto } from './entities/search-result.entity';

@Injectable()
export class SearchService {
	constructor(private readonly prismaService: PrismaService) {}

	async search(query: string): Promise<SearchResponseDto> {
		const [cities, businesses, events] = await Promise.all([
			this.prismaService.city.findMany({
				where: {
					name: {
						contains: query,
						mode: 'insensitive',
					},
				},
				take: 10,
				select: {
					id: true,
					name: true,
					slug: true,
					description: true,
				},
			}),
			this.prismaService.business.findMany({
				where: {
					account: {
						display_name: {
							contains: query,
							mode: 'insensitive',
						},
					},
				},
				select: {
					id: true,
					cnpj: true,
					max_reach_level: true,
					created_at: true,
					updated_at: true,
				},
				take: 10,
			}),
			this.prismaService.event.findMany({
				where: {
					name: {
						contains: query,
						mode: 'insensitive',
					},
					active: true,
				},
				take: 10,
				select: {
					id: true,
					name: true,
					slug: true,
					description: true,
					start_date: true,
					end_date: true,
					active: true,
				},
			}),
		]);

		return {
			cities,
			businesses,
			events,
		};
	}
}
