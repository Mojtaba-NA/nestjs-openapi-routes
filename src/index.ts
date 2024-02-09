import { PATH_METADATA } from '@nestjs/common/constants'
import { MetadataScanner, type NestContainer } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { writeFile } from 'fs/promises'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import http from 'http'

const allowed_methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

type OpenAPI = {
  openapi: string
  servers: Array<{ url: string }>
  info: {
    title: string
    version: string
  }
  tags: Array<{ name: string }>
  paths: Record<
    string,
    | Record<
        string,
        {
          summary: string
          tags: Array<string>
          responses: { 200: { description: string } }
          parameters: Array<{
            name: string
            in: string
            required: boolean
            schema: {
              type: string
            }
          }>
        }
      >
    | undefined
  >
}

type Routes = Array<{ method: string; url: string }>

type Controllers = Record<string, Array<string>>

const routes: Routes = []

type App =
  | NestFastifyApplication<http.Server>
  | NestExpressApplication<Server<typeof IncomingMessage, typeof ServerResponse>>

type Options = {
  servers: OpenAPI['servers']
  info: OpenAPI['info']
  filename: string
}

export function addRouteDetection(app: App) {
  let engine: 'Express' | 'Fastify' = 'Express'

  try {
    ;(<any>app).disable()
  } catch {
    engine = 'Fastify'
  }

  if ('disable' in app || engine === 'Express') {
    app
      .getHttpAdapter()
      .getHttpServer()
      ._events.request._router.stack.filter((s: any) => !!s.route)
      .forEach((s: any) => {
        routes.push({ url: s.route.path, method: Object.keys(s.route.methods)[0] })
      })
  } else {
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRoute', routeOptions => {
        if (
          typeof routeOptions.method === 'string' &&
          allowed_methods.includes(routeOptions.method)
        ) {
          routes.push({ method: routeOptions.method, url: routeOptions.url })
        }
      })
  }
}

export async function generateOpenApi(app: App, opts: Options) {
  const container: NestContainer = (<any>app).container
  const modules = container.getModules()
  const scanner = new MetadataScanner()

  const ctrls: Controllers = {}

  modules.forEach(({ controllers }) => {
    controllers.forEach(controller => {
      const controller_path = Reflect.getMetadata(PATH_METADATA, controller.metatype)
      ctrls[controller_path] = scanner.getAllMethodNames(controller.instance)
    })
  })

  const schema: OpenAPI = {
    openapi: '3.0.3',
    servers: opts.servers,
    info: opts.info,
    tags: Object.entries(ctrls).map(([key]) => ({ name: key })),
    paths: create_paths(ctrls)
  }

  await writeFile(`./${opts.filename}-${opts.info.version}.json`, JSON.stringify(schema))
}

type SomeBS = Record<
  string,
  Array<{ method: string; url: string; tags: Array<string>; summary?: string }> | undefined
>

const create_paths = (ctrls: Controllers) => {
  const ctrls_keys = Object.keys(ctrls)

  const somebs: SomeBS = {}

  routes
    .map(v => {
      const first_segment = v.url.split('/').slice(1, 3).join('/')
      if (ctrls_keys.includes(first_segment)) {
        return Object.assign(v, { tags: [first_segment] })
      }
      const just_start = v.url.split('/').slice(1, 2)[0]
      if (ctrls_keys.includes(just_start)) {
        return Object.assign(v, { tags: [just_start] })
      }

      return Object.assign(v, { tags: ['/'] })
    })
    .forEach(v => {
      if (somebs[v.tags[0]]) {
        somebs[v.tags[0]]!.push(v)
      } else {
        somebs[v.tags[0]] = [v]
      }
    })

  Object.entries(somebs).forEach(([key, value]) => {
    somebs[key] = value?.map((v, i) => {
      return Object.assign(v, { summary: ctrls[v.tags[0]][i] })
    })
  })

  const paths: OpenAPI['paths'] = {}

  Object.entries(somebs).forEach(([, value]) => {
    const unique_paths = new Set(value?.map(v => v.url))

    for (const path of unique_paths) {
      const shared = value?.filter(v => v.url === path)

      if (shared) {
        shared.forEach(s => {
          let new_path = path
          const matches = new_path.match(/:[^/]+/g) ?? []
          if (matches.length) {
            matches.forEach(v => {
              new_path = new_path.replace(v, `{${v.split(':').slice(1, 2)[0]}}`)
            })
          }

          const parameters = matches.map(v => {
            return {
              name: v.split(':').slice(1, 2)[0],
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          })

          paths[new_path] = Object.assign(paths[new_path] ?? {}, {
            [s.method.toLowerCase()]: {
              tags: s.tags,
              summary: s.summary,
              ...(parameters.length && { parameters }),
              responses: { 200: { description: 'successful operation' } }
            }
          })
        })
      }
    }
  })

  return paths
}
