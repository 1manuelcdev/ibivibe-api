# API IbiVibe

<div>
  <img src='https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white' alt='NestJS'>
  <img src='https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white' alt='TypeScript'>
  <img src='https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white' alt='PostgreSQL'>
  <img src='https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white' alt='Prisma'>
  <img src='https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens' alt='JWT'>
  <img src='https://img.shields.io/badge/PostGIS-336791?style=for-the-badge&logo=postgresql&logoColor=white' alt='PostGIS'>
  <img src='https://img.shields.io/badge/Cloudflare_R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white' alt='Cloudflare R2'>
</div>

API RESTful desenvolvida com NestJS para a plataforma IbiVibe, conectando aplicações mobile e web para gestão de cidades, negócios, eventos e conteúdo multimídia na região do Ibiapaba.

## Funcionalidades

- **Autenticação e Autorização**: Registro, login/logout com JWT, refresh tokens e autenticação por cookies seguros.
- **Gestão de Contas Unificada**: Modelo único que combina dados de autenticação e perfil (slug, display_name, bio, avatar_url, type).
- **Contas Personalizadas**: Contas pessoais e empresariais com interesses e preferências.
- **Cidades**: Cadastro de cidades com localização geográfica (PostGIS), imagens de capa e categorias.
- **Negócios (Businesses)**: Gestão de estabelecimentos comerciais com CNPJ, categorias, múltiplas localizações e reach level.
- **Eventos**: Criação e gerenciamento de eventos com datas, tipo (simple/featured), localização e categorias.
- **Categorias**: Sistema hierárquico de categorias para cidades, negócios e eventos.
- **Leads**: Captura e gestão de leads (residentes, turistas, empresários).
- **Mídia**: Upload e gestão de imagens/vídeos usando Cloudflare R2 CDN.
- **Busca**: Pesquisa unificada por cidades, negócios e eventos.
- **Favoritos**: Sistema de favoritos para cidades, eventos e negócios.
- **Interesses**: Gestão de interesses por categoria para contas.
- **Documentação**: API documentada com Swagger (disponível em ambiente de desenvolvimento).

## Stack Principal

- **NestJS**: Framework Node.js para construção de APIs escaláveis.
- **TypeScript**: Tipagem estática para maior segurança e manutenibilidade.
- **Prisma**: ORM moderno com suporte a PostgreSQL.
- **PostgreSQL + PostGIS**: Banco de dados relacional com suporte a dados geoespaciais.
- **JWT**: Autenticação baseada em tokens com suporte a refresh tokens.
- **Cloudflare R2**: Armazenamento de mídia com CDN público.
- **Swagger/OpenAPI**: Documentação interativa da API.

## Estrutura do Banco de Dados

O projeto utiliza PostgreSQL com Prisma como ORM. Principais entidades:

- **account**: Modelo unificado que combina dados de autenticação e perfil (email, telefone, senha, slug, display_name, bio, avatar_url, type).
- **business**: Negócios associados a contas do tipo business (CNPJ, reach level, account_id).
- **city**: Cidades com localização geográfica (Point PostGIS), capa e descrição.
- **event**: Eventos com datas, tipo, owner (account_id) e localização.
- **media**: Mídia associada a contas, cidades ou eventos.
- **category**: Categorias hierárquicas para classificação de entidades.
- **account_interest**: Interesses de contas em categorias de negócios e eventos.
- **account_favorite**: Favoritos de contas (cidades, eventos, negócios).
- **lead**: Leads capturados através de formulários (residentes, turistas, empresários).

## Rotas e Endpoints

### Autenticação (`/api/v1/auth`)

- `POST /auth/login` - Autenticação de usuário
- `POST /auth/register` - Registro de novo usuário
- `POST /auth/refresh` - Renovação de token
- `POST /auth/logout` - Logout
- `GET /auth/check-unique` - Verificar uniqueness de campos
- `GET /auth/me` - Dados do usuário autenticado

### Contas (`/api/v1/accounts`)

- `GET /accounts` - Listar todas as contas (paginado)
- `GET /accounts/:id` - Obter conta por ID
- `PATCH /accounts/:id` - Atualizar conta (incluindo campos de perfil)
- `DELETE /accounts/:id` - Remover conta
- `GET /accounts/:id/interests` - Obter interesses da conta
- `PATCH /accounts/:id/interests` - Atualizar interesses da conta

> **Nota**: O `accountId` é extraído automaticamente do token JWT no header `Authorization`. Não é necessário passá-lo via path, query ou body.

### Cidades (`/api/v1/cities`)

- `GET /cities` - Listar cidades
- `GET /cities/:id` - Obter cidade por ID
- `GET /cities/:id/media` - Obter mídias da cidade

### Categorias (`/api/v1/categories`)

- `GET /categories` - Listar categorias
- `GET /categories/parents` - Listar categorias raiz
- `GET /categories/parents/:id/children` - Listar subcategorias
- `GET /categories/:id` - Obter categoria por ID
- `PATCH /categories/:id` - Atualizar categoria
- `DELETE /categories/:id` - Remover categoria

### Negócios (`/api/v1/businesses`)

- `POST /businesses` - Criar negócio
- `GET /businesses` - Listar negócios
- `GET /businesses/:id` - Obter negócio por ID
- `PATCH /businesses/:id` - Atualizar negócio
- `DELETE /businesses/:id` - Remover negócio
- `GET /businesses/:id/media` - Obter mídias do negócio

### Eventos (`/api/v1/events`)

- `POST /events` - Criar evento
- `GET /events` - Listar eventos
- `GET /events/:id` - Obter evento por ID
- `PATCH /events/:id` - Atualizar evento
- `DELETE /events/:id` - Remover evento

### Leads (`/api/v1/leads`)

- `POST /leads` - Criar lead
- `GET /leads` - Listar leads
- `GET /leads/:id` - Obter lead por ID
- `PATCH /leads/:id` - Atualizar lead
- `DELETE /leads/:id` - Remover lead

### Mídia (`/api/v1/media`)

- `POST /businesses/:id/profile-photo` - Envia a foto de perfil da empresa para o R2 (`media/businesses/profile-photos`)
- `DELETE /media/:key` - Remover mídia

### Busca (`/api/v1/search`)

- `GET /search` - Busca unificada por cidades, negócios e eventos

## Executando Localmente

### 1. Clonar o repositório

```bash
git clone https://github.com/1manuelc/ibivibe-api.git
cd ibivibe-api
```

### 2. Instalar dependências

```bash
npm install
# ou
pnpm install
# ou
yarn install
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
NODE_ENV="development"
PORT="3000"
SECRET_KEY="sua-chave-secreta-aqui"

DB_USER="seu-usuario"
DB_PASSWORD="sua-senha"
DB_NAME="ibivibe"
DB_PORT="5432"
DATABASE_URL="postgresql://usuario:senha@localhost:5432/ibivibe"

R2_ENDPOINT="https://..."
R2_ACCESS_KEY="..."
R2_SECRET_KEY="..."
R2_BUCKET="ibivibe-media"
R2_PUBLIC_URL="https://cdn.seudominio.com.br"
```

### Processamento de imagens

Os uploads de imagens passam pela API antes do R2. O servidor valida o conteúdo
binário (não apenas o `Content-Type` informado), limita cada arquivo a 5 MB e
rejeita dimensões maiores que 4096×4096 ou 16 megapixels. JPEG, PNG e WebP são
normalizados para WebP, sem metadados e com rotação EXIF aplicada. Fotos de
perfil são limitadas a 1024×1024 e imagens de galeria a 1920×1920.

As credenciais do R2 são exclusivas do backend. As variáveis usadas são
`R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` e
`R2_PUBLIC_URL`.

### 4. Configurar banco de dados

Certifique-se de ter PostgreSQL rodando com a extensão PostGIS habilitada.

```bash
npx prisma migrate dev --name init
```

### 5. Executar em modo desenvolvimento

```bash
npm run start:dev
```

A API estará disponível em:

- API: `http://localhost:3000/api`
- Documentação Swagger: `http://localhost:3000/docs`

## Executando com Docker

Com o Docker e o ngrok instalados e as variáveis da API configuradas no arquivo `.env`, suba o container e abra o túnel público:

```bash
pnpm docker:up
```

O comando compila a imagem, inicia a API em `http://localhost:3000` e executa `ngrok http 3000`. O endereço público do túnel é exibido no terminal.

Para encerrar o túnel ngrok, parar a API e remover os recursos do Compose:

```bash
pnpm docker:down
```

O banco de dados continua sendo o definido por `DATABASE_URL` no `.env`. Se ele estiver rodando no próprio computador, troque `localhost` na URL por `host.docker.internal` para que o container consiga acessá-lo (por exemplo, `postgresql://usuario:senha@host.docker.internal:5432/ibivibe`).

## Scripts Disponíveis

- `npm run build` - Compila o projeto TypeScript
- `npm run lint` - Executa o linter
- `npm run lint:fix` - Corrige problemas do linter automaticamente com Oxlint
- `npm run fmt` - Formata código com Oxfmt
- `npm run fmt:check` - Verifica formatação
- `npm run start` - Inicia em modo produção
- `npm run start:dev` - Inicia em modo desenvolvimento com hot-reload
- `pnpm docker:up` - Compila e sobe a API em Docker na porta 3000
- `pnpm docker:down` - Encerra o ngrok, para a API e remove os recursos do Docker Compose
- `pnpm ngrok:up` / `pnpm ngrok:down` - Inicia ou encerra apenas o túnel ngrok
- `npm run db:migrate` - Executa migrações em produção
- `npm run db:migrate:dev` - Executa migrações em desenvolvimento
- `npm run db:studio` - Abre Prisma Studio
- `npm run db:seed` - Popula o banco com dados iniciais
- `npm run test:unit` - Executa testes unitários
- `npm run test:unit:cov` - Executa testes com coverage
- `npm run test:e2e` - Executa testes end-to-end

## Autenticação

A API utiliza JWT com cookies seguros. O fluxo:

1. **Registro**: `POST /auth/register`
2. **Login**: `POST /auth/login`
3. **Requisições autenticadas**: Envie o token no header `Authorization: Bearer <token>`
4. **Refresh**: `POST /auth/refresh` para renovar tokens expirados

## Validação de Dados

Todas as requisições são validadas usando `class-validator` e `class-transformer`, garantindo integridade dos dados. Erros retornam mensagens claras e estruturadas.

## CORS

A API permite requisições das seguintes origens:

- `http://localhost:3001`
- `https://ibivibe.com.br`
- `https://www.ibivibe.com.br`
- `https://ibivibe-landingpage.vercel.app`

## Arquitetura

O projeto segue a arquitetura modular do NestJS:

```
src/
├── modules/
│   ├── accounts/      - Gestão de contas unificadas
│   ├── auth/          - Autenticação e JWT
│   ├── businesses/    - Negócios/Estabelecimentos
│   ├── categories/    - Categorias hierárquicas
│   ├── cities/        - Cidades com geolocalização
│   ├── events/        - Eventos
│   ├── favorites/     - Sistema de favoritos
│   ├── leads/         - Leads e contato
│   ├── medias/        - Upload e gestão de mídia
│   ├── search/        - Busca unificada
│   └── app/           - Módulo raiz
├── common/            - Componentes compartilhados
├── utils/             - Funções utilitárias
└── main.ts            - Ponto de entrada
```

## Tecnologias e Dependências

### Dependências Principais

- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- `@prisma/client`, `@prisma/adapter-pg`
- `jsonwebtoken`, `@types/jsonwebtoken`
- `argon2` - Hash de senhas
- `class-validator`, `class-transformer`
- `@aws-sdk/client-s3` - Integração com R2
- `swagger-ui-express`, `@nestjs/swagger`

### Dependências de Desenvolvimento

- `typescript`
- `jest`, `@nestjs/testing`
- `eslint`, `prettier`
- `oxlint`, `oxfmt`

## Autor

[@1manuelc](https://github.com/1manuelc)

## Licença

MIT
