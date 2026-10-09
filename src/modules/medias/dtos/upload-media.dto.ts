import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class UploadMediaDto {
	@IsOptional() @IsString() @MaxLength(300) alt_text?: string;
}

export class UpdateBusinessMediaDto {
	@IsOptional()
	@Transform(({ value }) => Number(value))
	@IsInt()
	@Min(0)
	position?: number;
	@IsOptional() @IsString() @MaxLength(300) alt_text?: string;
}

export class ReorderBusinessMediaDto {
	@IsString({ each: true }) media_ids: string[];
}

export class UploadEventMediaDto extends UploadMediaDto {
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	is_cover?: boolean;
	@IsOptional()
	@Transform(({ value }) => Number(value))
	@IsInt()
	@Min(0)
	position?: number;
}

export class UpdateEventMediaDto extends UploadEventMediaDto {}

export class ReorderEventMediaDto {
	@IsString({ each: true }) media_ids: string[];
}
