import { randomUUID } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/modules/common/prisma/prisma.service';

import { UpdateInterestsDTO } from './dtos/update-interests.dto';

export interface AccountInterestsResult {
	businesses: { id: string; name: string }[];
	events: { id: string; name: string }[];
}

@Injectable()
export class AccountInterestsService {
	constructor(private readonly prismaService: PrismaService) {}

	async findAllByAccountId(accountId: string): Promise<AccountInterestsResult> {
		const interests = await this.prismaService.account_interest.findMany({
			where: { account_id: accountId },
			include: {
				tag: {
					include: { targets: true },
				},
			},
		});

		const businesses: { id: string; name: string }[] = [];
		const events: { id: string; name: string }[] = [];

		for (const interest of interests) {
			const tag = interest.tag;
			const targetTypes = new Set(
				tag.targets.map((target) => target.target_type),
			);

			if (targetTypes.has('business')) {
				businesses.push({ id: tag.id, name: tag.name });
			}
			if (targetTypes.has('event')) {
				events.push({ id: tag.id, name: tag.name });
			}
		}

		return { businesses, events };
	}

	async upsert(accountId: string, dto: UpdateInterestsDTO) {
		const account = await this.prismaService.account.findUnique({
			where: { id: accountId },
		});

		if (!account) {
			throw new NotFoundException('Account not found');
		}

		const requestedBusinessTags = [...new Set(dto.businesses || [])];
		const requestedEventTags = [...new Set(dto.events || [])];
		const validTags = await this.prismaService.tag.findMany({
			where: {
				OR: [
					{
						id: { in: requestedBusinessTags },
						targets: { some: { target_type: 'business' } },
					},
					{
						id: { in: requestedEventTags },
						targets: { some: { target_type: 'event' } },
					},
				],
			},
			select: { id: true },
		});
		if (
			validTags.length !==
			new Set([...requestedBusinessTags, ...requestedEventTags]).size
		) {
			throw new NotFoundException(
				'One or more interests were not found or are not available for the requested type',
			);
		}

		const businessesData = requestedBusinessTags.map((bInterest) => ({
			id: randomUUID(),
			account_id: accountId,
			tag_id: bInterest,
		}));

		const eventsData = requestedEventTags.map((eInterest) => ({
			id: randomUUID(),
			account_id: accountId,
			tag_id: eInterest,
		}));

		await this.prismaService.$transaction([
			this.prismaService.account_interest.deleteMany({
				where: { account_id: accountId },
			}),
			...(businessesData.length > 0
				? [
						this.prismaService.account_interest.createMany({
							data: businessesData,
							skipDuplicates: true,
						}),
					]
				: []),
			...(eventsData.length > 0
				? [
						this.prismaService.account_interest.createMany({
							data: eventsData,
							skipDuplicates: true,
						}),
					]
				: []),
		]);

		const updatedInterests = await this.prismaService.account_interest.findMany(
			{
				where: { account_id: accountId },
				select: { tag_id: true },
			},
		);

		return { count: updatedInterests.length };
	}
}
