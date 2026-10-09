-- Normalize legacy cover URLs into media records before enforcing one cover
-- per city/event. The legacy columns remain temporarily for rollback and
-- compatibility with older deployments, but are cleared after migration.

WITH ranked_city_covers AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY city_id
			ORDER BY position ASC, created_at ASC, id ASC
		) AS cover_rank
	FROM media
	WHERE city_id IS NOT NULL AND is_cover = true
)
UPDATE media
SET is_cover = false
WHERE id IN (
	SELECT id FROM ranked_city_covers WHERE cover_rank > 1
);

WITH ranked_event_covers AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY event_id
			ORDER BY position ASC, created_at ASC, id ASC
		) AS cover_rank
	FROM media
	WHERE event_id IS NOT NULL AND is_cover = true
)
UPDATE media
SET is_cover = false
WHERE id IN (
	SELECT id FROM ranked_event_covers WHERE cover_rank > 1
);

INSERT INTO media (city_id, media_type, url, is_cover, position, alt_text)
SELECT
	c.id,
	'image'::media_type,
	c.cover_img_url,
	true,
	COALESCE((
		SELECT MAX(m.position) + 1
		FROM media m
		WHERE m.city_id = c.id
	), 0),
	'Migrated from city.cover_img_url'
FROM city c
WHERE c.cover_img_url IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM media m
		WHERE m.city_id = c.id AND m.is_cover = true
	);

INSERT INTO media (event_id, media_type, url, is_cover, position, alt_text)
SELECT
	e.id,
	'image'::media_type,
	e.cover_img_url,
	true,
	COALESCE((
		SELECT MAX(m.position) + 1
		FROM media m
		WHERE m.event_id = e.id
	), 0),
	'Migrated from event.cover_img_url'
FROM event e
WHERE e.cover_img_url IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM media m
		WHERE m.event_id = e.id AND m.is_cover = true
	);

UPDATE city SET cover_img_url = NULL WHERE cover_img_url IS NOT NULL;
UPDATE event SET cover_img_url = NULL WHERE cover_img_url IS NOT NULL;

CREATE UNIQUE INDEX "media_unique_city_cover"
ON media (city_id)
WHERE is_cover = true AND city_id IS NOT NULL;

CREATE UNIQUE INDEX "media_unique_event_cover"
ON media (event_id)
WHERE is_cover = true AND event_id IS NOT NULL;
