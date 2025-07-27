import { Express, Request, Response, Router } from 'express';
const { randomUUID } = require('crypto');

import Logger from '../logging';
import { Entry, ItemModel, BatchItemsRequest, Item } from '../models';

export interface GetFederatedIdsRequest {
    federatedIds: string;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function mock_api(app: Express) {
    const router = Router();
    const memoryDB: Record<Entry<ItemModel>['id'], Entry<ItemModel>> = {};

    router.get(
        '/byFederatedIds',
        async (req: Request<{}, {}, {}, GetFederatedIdsRequest>, res: Response) => {
            const federatedIds = req.query.federatedIds.split(',');

            const filteredItems = Object.values(memoryDB).filter((item) => {
                return federatedIds.includes(item.federatedId);
            });

            await sleep(2000);

            res.json({ items: filteredItems });

            Logger.info('MOCK API: Received request for get item by id')
        }
    );

    router.post('/batch', async (req: Request<{}, {}, BatchItemsRequest>, res) => {
        req.body.items.forEach((item) => {
            const id = randomUUID();
            memoryDB[id] = {
                ...item,
                id,
            };
        });

        await sleep(2000);

        Logger.info(`MOCK API: Received request to post ${req.body.items.length} items`)

        res.json({ success: true });
    });

    router.put('/batch', async (req: Request<{}, {}, BatchItemsRequest>, res) => {
        req.body.items.forEach((item) => {
            memoryDB[item.id] = item;
        });

        await sleep(2000);

        Logger.info(`MOCK API: Received request to put ${req.body.items.length} items`)

        res.json({ success: true });
    });

    router.get('/all', (req, res) => {
        res.json({ items: Object.values(memoryDB) });
    });

    app.use('/items', router);
}
