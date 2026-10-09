import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { event_status, event_type, reach_level } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsArray,
	IsDateString,
	IsEnum,
	IsIn,
	IsISO8601,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	MinLength,
} from 'class-validator';

export class CreateEventDTO {
	@ApiPropertyOptional({
		example: 'uuidv4',
		type: String,
	})
	@IsOptional()
	@IsUUID('4')
	owner_account_id?: string;

	@ApiProperty({
		example: 'Evento Importante',
		minLength: 4,
		maxLength: 200,
		type: String,
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(4)
	@MaxLength(200)
	name: string;

	@ApiProperty({
		example: 'Descrição do evento',
		maxLength: 300,
		type: String,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(300)
	description: string;

	@ApiPropertyOptional({
		example: 'evento-importante',
		minLength: 4,
		maxLength: 100,
		type: String,
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	slug?: string;

	@ApiProperty({
		example: 'simple',
		enum: ['simple', 'featured'],
		description: 'Tipo de evento categorizado',
	})
	@IsNotEmpty()
	@IsString()
	@IsIn(['simple', 'featured'])
	type: event_type;

	@ApiProperty({ example: { active: true }, type: Boolean })
	@Transform(({ value }) =>
		value && typeof value === 'object' ? value.active : value,
	)
	@IsBoolean()
	active = true;

	@ApiProperty({
		example: 'local',
		enum: ['local', 'regional'],
		description: 'Alcance do evento',
	})
	@IsNotEmpty()
	@IsString()
	@IsIn(['local', 'regional'])
	reach_level: reach_level;

	@IsOptional()
	@IsDateString()
	@IsISO8601()
	start_date?: string;

	@IsOptional()
	@IsDateString()
	@IsISO8601()
	end_date?: string;

	@ApiPropertyOptional({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	city_ids?: string[];

	@ApiPropertyOptional({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	tag_ids?: string[];

	@ApiPropertyOptional({ enum: event_status, default: event_status.published })
	@IsOptional()
	@IsEnum(event_status)
	status?: event_status;
}
