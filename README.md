# Nestjs OpenApi Routes

this project finds all routes of a nestjs application and generates a basic OpenApi spec with using controller function names as their summary.
(this doesn't read body or response of the controllers)

## Installation

build the project using the build script which produces a tarball and install the tarball

## Usage with Fastify

```ts
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { addRouteDetection, generateOpenApi } from 'nestjs-openapi-routes'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  addRouteDetection(app) // <------- goes before app.listen if you're using fastify

  await app.listen()

  await generateOpenApi(app, {
    filename: 'filename',
    info: { title: 'Title of the project', version: process.env.npm_package_version ?? '0.1.0' },
    servers: [{ url: await app.getUrl() }]
  })
}
bootstrap()
```

## Usage with Express

```ts
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { addRouteDetection, generateOpenApi } from 'nestjs-openapi-routes'
import type { NestExpressApplication } from '@nestjs/platform-express'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'log', 'verbose']
  })

  await app.listen()

  addRouteDetection(app) // <------- goes after app.listen if you're using express
  await generateOpenApi(app, {
    filename: 'filename',
    info: { title: 'Title of the project', version: process.env.npm_package_version ?? '0.1.0' },
    servers: [{ url: await app.getUrl() }]
  })
}
bootstrap()
```
