import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { City } from './entities/city.entity';

@Injectable()
export class CitiesService {
	constructor(private readonly prismaService: PrismaService) {}

	async findAll(): Promise<City[]> {
		return this.prismaService.$queryRaw`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        ST_AsGeoJSON(c.location)::json as location,
		COALESCE(
		  (
		    SELECT json_agg(t.name)
		    FROM city_tag ct
		    JOIN tag t ON t.id = ct."tag_id"
		    WHERE ct."city_id" = c.id
		  ),
		  '[]'::json
		) as tags
      FROM city c
      ORDER BY c.name ASC
    `;
	}

	async findOne(id: string): Promise<City> {
		const cities: City[] = await this.prismaService.$queryRaw`
      SELECT
        id,
        name,
        slug,
        description,
	        ST_AsGeoJSON(location)::json as location,
	        COALESCE(
	          (
	            SELECT json_agg(t.name)
	            FROM city_tag ct
	            JOIN tag t ON t.id = ct."tag_id"
	            WHERE ct."city_id" = city.id
	          ),
	          '[]'::json
	        ) as tags
	      FROM city
      WHERE id = ${id}::uuid
      LIMIT 1
    `;

		if (Array.isArray(cities) && cities.length > 0) {
			return cities[0];
		}

		throw new NotFoundException('City not found');
	}
}
