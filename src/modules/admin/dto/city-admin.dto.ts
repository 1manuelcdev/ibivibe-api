import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsArray,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';

export class ReplaceCityTagsDto {
	@ApiProperty({ type: [String], format: 'uuid', example: ['tag-uuid-1'] })
	@IsArray()
	@IsUUID('4', { each: true })
	tag_ids: string[];
}

export class UpdateCityAdminDto {
	@ApiPropertyOptional({ example: 'Ubajara' })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiPropertyOptional({ example: 'ubajara' })
	@IsOptional()
	@IsString()
	slug?: string;

	@ApiPropertyOptional({ nullable: true, example: 'Descrição da cidade' })
	@IsOptional()
	@IsString()
	description?: string | null;

	@ApiPropertyOptional({
		nullable: true,
		example: 'https://cdn.example.com/city.webp',
	})
	@IsOptional()
	@IsString()
	cover_img_url?: string | null;

	@ApiPropertyOptional({ example: -3.851 })
	@IsOptional()
	@IsNumber()
	latitude?: number;

	@ApiPropertyOptional({ example: -40.921 })
	@IsOptional()
	@IsNumber()
	longitude?: number;
}
