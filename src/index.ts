import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'
import { logger } from './conf/logger.ts'
import { IngestRoutes } from './api/routes/ingestView.ts'
import { UploadView } from './api/routes/uploadView.ts'
import { RetriveView } from './api/routes/retriveView.ts'
import { SessionView } from './api/routes/sessionView.ts'
import { auth } from './api/middleware/auth.ts'
import {cors} from "@elysiajs/cors"
import { profileView } from './api/routes/profileView.ts'

const app = new Elysia({ adapter: node() })
    .use(cors())
    .get("/api/v1/health", () => "up")
    .group("/api/v1", (app) => 
        app
            .use(auth)
            .use(IngestRoutes)
            .use(UploadView)
            .use(RetriveView)
            .use(SessionView)
            .use(profileView)
    )
    .listen(3000, ({hostname, port}) => {
        logger.info(`${hostname}:${port}`)
    })