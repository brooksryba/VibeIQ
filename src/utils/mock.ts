import { Express, Request, Response, Router } from 'express';
const { randomUUID } = require('crypto');

import Logger from '../logging';
import { Entry, ItemModel, BatchItemsRequest, Item } from '../models';

export interface GetFederatedIdsRequest {
    federatedIds: string;
}

export function mock_api(app: Express) {
    const router = Router();
    const memoryDB: Record<Entry<ItemModel>['id'], Entry<ItemModel>> = {};

    router.get('/byFederatedIds', (req: Request<{}, {}, {}, GetFederatedIdsRequest>, res: Response) => {
        const federatedIds = req.query.federatedIds.split(',');

        const filteredItems = Object.values(memoryDB).filter((item) => {
            return item.federatedId in federatedIds;
        });

        res.json({ items: filteredItems });
    });

    router.post('/batch', (req: Request<{}, {}, BatchItemsRequest>, res) => {
        req.body.items.forEach((item) => {
            const id = randomUUID();
            memoryDB[id] = {
                ...item,
                id,
            };
        });

        res.json({ success: true })
    });

    router.put('/batch', (req: Request<{}, {}, BatchItemsRequest>, res) => {
        req.body.items.forEach((item) => {
            memoryDB[item.id] = item;
        });

        res.json({ success: true })
    });

    app.use('/items', router);
}
