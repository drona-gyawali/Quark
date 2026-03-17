import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'
import { logger } from './conf/logger.ts'

// TODO: create a api so we can build web app
const app = new Elysia({ adapter: node() }) 
	.get('/', () => 'Hello Dorna')
	.listen(3000, ({hostname, port}) => {
        logger.info(`${hostname}:${port}`)
    })