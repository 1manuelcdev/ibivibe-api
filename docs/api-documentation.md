# API Documentation - Unified Account/Profile Model

## Overview

## Events: creation, drafts and media

`POST /api/v1/events` derives `owner_account_id` from the authenticated account. A
client-supplied owner is ignored when a token is present. The request supports:

```json
{
  "name": "Festival de Inverno",
  "description": "Descrição do evento",
  "slug": "festival-de-inverno",
  "type": "featured",
  "active": true,
  "reach_level": "regional",
  "start_date": "2026-10-07T18:00:00.000Z",
  "end_date": "2026-10-07T23:00:00.000Z",
  "city_ids": ["city-uuid"],
  "tag_ids": ["tag-uuid"],
  "status": "published"
}
```

`status` is `published` or `draft` and defaults to `published` for backward
compatibility. Published events require valid ISO 8601 dates and `end_date`
after `start_date`; drafts may be completed later. `GET /api/v1/events` returns
active published events. `GET /api/v1/events/owned` returns all events,
including drafts, for the authenticated account. `PATCH /api/v1/events/:id/publish`
publishes an owned draft after validating its dates.

Cities must exist and, for business accounts, belong to the headquarters or one
of its branches. Tags must exist and have `target_type=event`. `featured` and
`regional` events require the account business to have `max_reach_level=regional`.

Event media uses multipart upload:

- `GET /api/v1/events/:id/media`
- `POST /api/v1/events/:id/media` with `file`, optional `is_cover`, `position`, and `alt_text`
- `PATCH /api/v1/events/:id/media/:mediaId`
- `PATCH /api/v1/events/:id/media/order` with `{ "media_ids": ["uuid"] }`
- `DELETE /api/v1/events/:id/media/:mediaId`

Only the event owner can mutate media. At most one media item is the cover;
when omitted, the first uploaded item becomes the cover.

This document describes the API changes resulting from the migration to a unified account/profile model. The previous separate `account` and `profile` entities have been merged into a single `account` entity that contains both authentication and profile data.

## Key Changes

### 1. Unified Account Model

The new account model combines all fields from the previous account and profile models:

```typescript
interface Account {
	// Original account fields
	id: string;
	email: string;
	password: string;
	phone_number: string;
	name: string;
	active: boolean;
	is_verified: boolean;
	created_at: Date;
	updated_at: Date;

	// Merged profile fields
	slug: string;
	display_name: string;
	bio?: string;
	avatar_url?: string;
	type: account_type; // 'personal' | 'business'
}
```

### 2. Removed Endpoints

The following endpoints have been removed as their functionality is now integrated into the accounts module:

- `DELETE /profiles/:id` → Use `DELETE /accounts/:id`
- `PATCH /profiles/:id` → Use `PATCH /accounts/:id`
- `GET /profiles/:id` → Use `GET /accounts/:id`
- `POST /profiles` → Profile created with account
- `GET /profiles` → Use `GET /accounts/:id`
- `POST /profiles/:id/interests` → Use `PATCH /accounts/:id/interests`

### 3. Updated Endpoints

#### Accounts Module (`/api/v1/accounts`)

**GET /accounts**

- Description: List all accounts (paginated)
- Response: Array of `SecureAccountDTO`
- Changes: Now includes profile fields in response

**GET /accounts/:id**

- Description: Get account by ID
- Response: `SecureAccountDTO`
- Changes: Now includes profile fields in response

**PATCH /accounts/:id**

- Description: Update account data including profile fields
- Request Body: `UpdateAccountDTO`
- Response: `SecureAccountDTO`
- Changes: Can now update both account and profile fields

**DELETE /accounts/:id**

- Description: Remove account
- Response: Success message
- Changes: No functional change

**NEW: GET /accounts/:id/interests**

- Description: Get account interests
- Response: `AccountInterestsResult`
- Changes: Moved from profiles module

**NEW: PATCH /accounts/:id/interests**

- Description: Update account interests
- Request Body: `UpdateInterestsDTO`
- Response: Updated interests count
- Changes: Moved from profiles module

### 4. Updated DTOs

#### SecureAccountDTO

Now includes all unified account fields:

```typescript
export class SecureAccountDTO {
	@ApiProperty({
		example: 'uuid-string',
		description: 'Account unique identifier',
	})
	id: string;

	@ApiProperty({
		example: 'joao@email.com',
		description: 'Account email address',
	})
	email: string;

	@ApiProperty({ example: 'João Silva', description: 'Account holder name' })
	name: string;

	@ApiProperty({
		example: '+5511999998888',
		description: 'Phone number in E.164 format',
	})
	phone_number: string;

	@ApiProperty({ example: true, description: 'Whether the account is active' })
	active: boolean;

	@ApiProperty({
		example: false,
		description: 'Whether the account is verified',
	})
	is_verified: boolean;

	@ApiProperty({
		example: '2024-01-01T00:00:00.000Z',
		description: 'Account creation date',
	})
	created_at: Date;

	@ApiProperty({
		example: '2024-01-01T00:00:00.000Z',
		description: 'Last update date',
	})
	updated_at: Date;

	// Profile fields
	@ApiProperty({
		example: 'joaosilva',
		description: 'Unique slug for the account',
	})
	slug: string;

	@ApiProperty({
		example: 'João Silva',
		description: 'Display name for the account',
	})
	display_name: string;

	@ApiPropertyOptional({
		example: 'Software developer passionate about technology',
		description: 'Account biography',
	})
	bio?: string;

	@ApiPropertyOptional({
		example: 'https://example.com/avatar.jpg',
		description: 'URL for account avatar image',
	})
	avatar_url?: string;

	@ApiProperty({
		enum: account_type,
		example: 'personal',
		description: 'Account type: personal or business',
	})
	type: account_type;

	@Exclude() password?: string;
}
```

#### UpdateAccountDTO

Now includes profile fields:

```typescript
export class UpdateAccountDTO {
	@ApiPropertyOptional({ example: 'João Silva' })
	name?: string;

	@ApiPropertyOptional({ example: 'joao@email.com' })
	email?: string;

	@ApiPropertyOptional({ example: 'NovaSenha@123', minLength: 8 })
	password?: string;

	@ApiPropertyOptional({ example: true })
	active?: boolean;

	// Profile fields
	@ApiPropertyOptional({
		example: 'joaosilva',
		description: 'Unique slug for the account',
	})
	slug?: string;

	@ApiPropertyOptional({
		example: 'João Silva',
		description: 'Display name for the account',
	})
	display_name?: string;

	@ApiPropertyOptional({
		example: 'Software developer passionate about technology',
		description: 'Account biography',
	})
	bio?: string;

	@ApiPropertyOptional({
		example: 'https://example.com/avatar.jpg',
		description: 'URL for account avatar image',
	})
	avatar_url?: string;

	@ApiPropertyOptional({
		enum: account_type,
		example: 'personal',
		description: 'Account type: personal or business',
	})
	type?: account_type;
}
```

#### RegisterDto

Already includes profile fields (no changes needed):

```typescript
export class RegisterDto {
	@ApiProperty({ example: 'João Silva' })
	name: string;

	@ApiProperty({
		example: 'joaosilva',
		description: 'Unique slug for the account',
	})
	slug: string;

	@ApiProperty({ example: 'joao@email.com' })
	email: string;

	@ApiProperty({
		example: '+5511999998888',
		description: 'Telefone no formato E.164',
	})
	phone_number: string;

	@ApiProperty({ example: 'Senha@123', minLength: 8 })
	password: string;

	@ApiProperty({ example: 'Senha@123', minLength: 8 })
	password_confirm: string;

	// Profile fields
	@ApiProperty({
		example: 'João Silva',
		description: 'Display name for the account',
	})
	display_name: string;

	@ApiProperty({
		example: 'Software developer passionate about technology',
		required: false,
	})
	bio?: string;

	@ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
	avatar_url?: string;

	@ApiProperty({ enum: account_type, example: 'personal', required: false })
	type?: account_type;
}
```

### 5. Database Schema Changes

#### Removed Tables

- `profile`
- `account_profile`
- `profile_interest`
- `profile_favorite`

#### Updated Tables

- `account`: Added profile fields (slug, display_name, bio, avatar_url, type)
- `business`: Changed `profile_id` to `account_id`
- `event`: Changed `owner_profile_id` to `owner_account_id`
- `media`: Changed `profile_id` to `account_id`

#### New Tables

- `account_interest`: Replaces `profile_interest`
- `account_favorite`: Replaces `profile_favorite`

### 6. Authentication Flow Changes

The authentication flow remains the same, but the registration process now creates a unified account with all profile fields:

1. **Registration**: `POST /auth/register` - Creates account with profile fields
2. **Login**: `POST /auth/login` - No changes
3. **Profile Management**: Use accounts endpoints instead of profiles

### 7. Business and Event Ownership

Businesses and events now reference accounts directly:

```typescript
// Business creation
{
  "account_id": "account-uuid", // Changed from profile_id
  "name": "Business Name",
  // ... other fields
}

// Event creation
{
  "owner_account_id": "account-uuid", // Changed from owner_profile_id
  "title": "Event Title",
  // ... other fields
}
```

### 8. Migration Impact

#### Frontend Changes Required

- Update API calls to use accounts endpoints instead of profiles
- Update data models to handle unified account structure
- Update forms to include profile fields in account management

#### Backend Changes

- All profile-related functionality moved to accounts module
- Removed profiles module completely
- Updated all foreign key references

### 9. API Version

The API version has been updated to `2.0` to reflect these breaking changes.

### 10. Swagger Documentation

Updated Swagger documentation is available at `/docs` in development environment with:

- Updated endpoint descriptions
- New request/response models
- Removed deprecated endpoints
- Added new interests endpoints

## Examples

### Creating a New Account

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "João Silva",
  "slug": "joaosilva",
  "email": "joao@email.com",
  "phone_number": "+5511999998888",
  "password": "Senha@123",
  "password_confirm": "Senha@123",
  "display_name": "João Silva",
  "bio": "Software developer passionate about technology",
  "avatar_url": "https://example.com/avatar.jpg",
  "type": "personal"
}
```

### Updating Account Profile

```bash
PATCH /api/v1/accounts/{account-id}
Content-Type: application/json
Authorization: Bearer {token}

{
  "display_name": "João Silva Jr",
  "bio": "Senior Software Developer",
  "avatar_url": "https://example.com/new-avatar.jpg"
}
```

### Getting Account Interests

```bash
GET /api/v1/accounts/{account-id}/interests
Authorization: Bearer {token}

Response:
{
  "businesses": [
    { "id": "cat-uuid-1", "name": "Restaurantes" },
    { "id": "cat-uuid-2", "name": "Tecnologia" }
  ],
  "events": [
    { "id": "cat-uuid-3", "name": "Cultura" },
    { "id": "cat-uuid-4", "name": "Esportes" }
  ]
}
```

### Updating Account Interests

```bash
PATCH /api/v1/accounts/{account-id}/interests
Content-Type: application/json
Authorization: Bearer {token}

{
  "businesses": ["cat-uuid-1", "cat-uuid-2"],
  "events": ["cat-uuid-3", "cat-uuid-4"]
}
```

## Summary

The unified account/profile model simplifies the API architecture by:

- Eliminating the need for separate profile management
- Reducing the number of database tables
- Simplifying the authentication and user management flow
- Maintaining all existing functionality with fewer endpoints
- Providing a more intuitive API structure for developers
