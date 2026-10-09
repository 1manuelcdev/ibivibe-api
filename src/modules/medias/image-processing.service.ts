import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ImageUploadPurpose =
	| 'business-gallery'
	| 'business-profile'
	| 'event-gallery';

export type ProcessedImage = {
	buffer: Buffer;
	contentType: 'image/webp';
	extension: 'webp';
};

type ImagePolicy = {
	maxBytes: number;
	maxHeight: number;
	maxPixels: number;
	maxWidth: number;
	outputHeight: number;
	outputWidth: number;
};

@Injectable()
export class ImageProcessingService {
	private static readonly ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
	private static readonly POLICIES: Record<ImageUploadPurpose, ImagePolicy> = {
		'business-profile': {
			maxBytes: 5 * 1024 * 1024,
			maxWidth: 4096,
			maxHeight: 4096,
			maxPixels: 16_000_000,
			outputWidth: 1024,
			outputHeight: 1024,
		},
		'business-gallery': {
			maxBytes: 5 * 1024 * 1024,
			maxWidth: 4096,
			maxHeight: 4096,
			maxPixels: 16_000_000,
			outputWidth: 1920,
			outputHeight: 1920,
		},
		'event-gallery': {
			maxBytes: 10 * 1024 * 1024,
			maxWidth: 4096,
			maxHeight: 4096,
			maxPixels: 16_000_000,
			outputWidth: 1920,
			outputHeight: 1920,
		},
	};

	async process(
		file: Express.Multer.File,
		purpose: ImageUploadPurpose,
	): Promise<ProcessedImage> {
		const policy = ImageProcessingService.POLICIES[purpose];
		if (!file?.buffer?.length)
			throw new BadRequestException({
				code: 'INVALID_IMAGE',
				message: 'A valid image file is required.',
			});
		if (file.size > policy.maxBytes)
			throw new BadRequestException({
				code: 'IMAGE_TOO_LARGE',
				message: 'The image exceeds the maximum allowed size.',
			});

		let metadata: sharp.Metadata;
		try {
			metadata = await sharp(file.buffer, {
				limitInputPixels: policy.maxPixels,
				failOn: 'error',
			}).metadata();
		} catch {
			throw new BadRequestException({
				code: 'INVALID_IMAGE',
				message: 'The uploaded file is not a valid image.',
			});
		}

		if (
			!metadata.format ||
			!ImageProcessingService.ALLOWED_FORMATS.has(metadata.format)
		)
			throw new BadRequestException({
				code: 'INVALID_IMAGE_TYPE',
				message: 'Only JPEG, PNG, and WebP images are allowed.',
			});
		if (!metadata.width || !metadata.height)
			throw new BadRequestException({
				code: 'INVALID_IMAGE',
				message: 'The image dimensions could not be read.',
			});
		if (
			metadata.width > policy.maxWidth ||
			metadata.height > policy.maxHeight ||
			metadata.width * metadata.height > policy.maxPixels
		)
			throw new BadRequestException({
				code: 'IMAGE_DIMENSIONS_TOO_LARGE',
				message: 'The image dimensions exceed the allowed limit.',
			});

		try {
			const buffer = await sharp(file.buffer, {
				limitInputPixels: policy.maxPixels,
				failOn: 'error',
			})
				.rotate()
				.resize({
					width: policy.outputWidth,
					height: policy.outputHeight,
					fit: 'inside',
					withoutEnlargement: true,
				})
				.webp({ quality: 82, effort: 6 })
				.toBuffer();
			return { buffer, contentType: 'image/webp', extension: 'webp' };
		} catch {
			throw new BadRequestException({
				code: 'IMAGE_PROCESSING_FAILED',
				message: 'The image could not be processed.',
			});
		}
	}
}
