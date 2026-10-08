# Tags por tipo de entidade

As tags continuam organizadas por `tag_group`, mas agora possuem aplicações independentes por entidade através de `target_types`.

Tipos válidos:

```ts
type TagTargetType = 'city' | 'business' | 'event';
```

Uma tag pode ser exclusiva de eventos, como `Festivais`, ou compartilhada entre cidades, empresas e eventos, como `Turismo rural`.

## Endpoints

A API usa o prefixo `/api` e versionamento URI:

```text
/api/v1/tags
```

Para carregar tags compatíveis com um formulário:

```http
GET /api/v1/tags?target_type=business
GET /api/v1/tags?target_type=city
GET /api/v1/tags?target_type=event
```

Os filtros podem ser combinados:

```http
GET /api/v1/tags?target_type=business&group_id=<groupId>
GET /api/v1/tags?target_type=event&name=festival
```

Esses endpoints são públicos. A resposta inclui o grupo e as aplicações:

```json
{
  "id": "tag-uuid",
  "name": "Festivais",
  "slug": "festivais",
  "group": { "id": "group-uuid", "name": "Eventos Abertos ao Público" },
  "targets": [
    { "id": "target-uuid", "tag_id": "tag-uuid", "target_type": "event" }
  ]
}
```

Use `targets[].target_type` como fonte da verdade. O frontend não deve inferir o tipo pelo nome do grupo.

## Grupos

```http
GET /api/v1/tags/groups
GET /api/v1/tags/groups/<groupId>
```

Esses endpoints não filtram por tipo. Para telas específicas, prefira `/tags?target_type=...` e agrupe os resultados pelo campo `group` no frontend.

## Criar e atualizar tags

Tags administrativas podem declarar suas aplicações:

```http
POST /api/v1/tags
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "Feiras de artesanato",
  "group_id": "group-uuid",
  "target_types": ["city", "event"]
}
```

Em um `PATCH`, enviar `target_types` substitui a lista atual; omitir o campo preserva as aplicações existentes.

## Empresas

Carregue as tags com `target_type=business` e envie seus IDs:

```http
PUT /api/v1/businesses/<businessId>/tags
```

```json
{ "tag_ids": ["tag-uuid-1", "tag-uuid-2"] }
```

O backend rejeita tags inexistentes ou incompatíveis com `business`.

## Interesses

```http
PATCH /api/v1/accounts/<accountId>/interests
```

```json
{
  "businesses": ["business-tag-uuid"],
  "events": ["event-tag-uuid"]
}
```

O frontend deve obter as opções separadamente usando `target_type=business` e `target_type=event`. Uma tag compartilhada pode aparecer nas duas listas.

## Seeds

As tags estão em [`prisma/seed-data/tags.json`](prisma/seed-data/tags.json), com `target_types` padrão por grupo e exceções em `tag_targets`.

Os demais dados foram separados por entidade em `cities.json`, `users.json`, `businesses.json`, `events.json`, `leads.json` e `favorites.json`. O seed recompõe esses arquivos em memória.

## Regras para o frontend

1. Filtrar sempre por `target_type` antes de exibir opções.
2. Enviar o `id` da tag, nunca o nome.
3. Usar apenas `city`, `business` e `event` como tipos válidos.
4. Invalidar o cache de tags após alterações administrativas.
