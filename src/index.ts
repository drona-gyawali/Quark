import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'
import { logger } from './conf/logger.ts'
import { IngestRoutes } from './api/routes/ingestView.ts'
import { UploadView } from './api/routes/uploadView.ts'
import { RetriveView } from './api/routes/retriveView.ts'
import { SessionView } from './api/routes/sessionView.ts'

const app = new Elysia({ adapter: node() })
    .group("/api/v1", (app) => 
        app
            .use(IngestRoutes)
            .use(UploadView)
            .use(RetriveView)
            .use(SessionView)
    )
    .get("/api/v1/health", () => "i am up ")
    .listen(3000, ({hostname, port}) => {
        logger.info(`${hostname}:${port}`)
    })