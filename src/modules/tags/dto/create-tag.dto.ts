import { tag_target_type } from '@prisma/client';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsArray, IsEnum } from 'class-validator';

export class CreateTagDto {
	@IsNotEmpty()
	@IsString()
	name: string;

	@IsNotEmpty()
	@IsString()
	group_id: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	color?: string;

	@IsOptional()
	@IsInt()
	position?: number;

	@IsOptional()
	@IsArray()
	@IsEnum(tag_target_type, { each: true })
	target_types?: tag_target_type[];
}
