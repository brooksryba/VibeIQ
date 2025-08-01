import { ItemModel, Entry, ItemsResponse } from '../models';
import { FetchOptions } from '../models/fetch_options.model';
import Logger from '../logging';
import Bottleneck from 'bottleneck';

export class SDK {
    private _baseURL: string;
    private _limiter: Bottleneck;
    private _fetch: typeof fetch;

    public constructor(baseURL: string) {
        this._baseURL = baseURL;

        // Create an instance of the Bottleneck class
        // which will prevent the API on Lambda from being
        // called more than 1000 times at once. By setting
        // highWater to null, no 'strategy' will be used which
        // ensures that no requests will be dropped. This will come
        // at the expense of higer memory while the service is continuing
        // to queue records.
        this._limiter = new Bottleneck({
            maxConcurrent: 100,
            highWater: null,
        })

        this._fetch = this._limiter.wrap(fetch);
    }

    public async chunk<T>(
        body: T[],
        chunkSize: number,
        callback: (chunk: T[], index: number) => Promise<Response>
    ): Promise<void> {
        for (let i = 0; i < body.length; i += chunkSize) {
            const chunk = body.slice(i, i + chunkSize);
            await callback(chunk, i / chunkSize);
        }
    }

    public async get(
        path: string,
        queryParams?: Record<string, string | number | boolean>,
        options: FetchOptions = {}
    ): Promise<Response> {
        const query =
            queryParams != null
                ? '?' + new URLSearchParams(queryParams as Record<string, string>).toString()
                : '';

        return this._fetch(`${this._baseURL}${path}${query}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                ...(options.headers || {}),
            },
        });
    }
    public async post(path: string, body: any, options: FetchOptions = {}): Promise<Response> {
        return this._fetch(`${this._baseURL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            body: JSON.stringify(body),
        });
    }

    public async put(path: string, body: any, options: FetchOptions = {}): Promise<Response> {
        return this._fetch(`${this._baseURL}${path}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            body: JSON.stringify(body),
        });
    }

    static instance = new SDK('http://localhost:3000');
}

export class ItemAPI {
    // In production, we would want to set this variable to 100. For testing,
    // I have reduced this value to 10 so that I can test the chunking logic
    // in conjunction with the Queue processor.
    public static batchSize = 100;

    public static async getItemsByFederatedIds(
        federatedIds: Array<ItemModel['federatedId']>
    ): Promise<Record<string, Entry<ItemModel>>> {
        const request = await SDK.instance.get('/items/byFederatedIds', {
            federatedIds: federatedIds.join(','),
        });

        const jsonBody: ItemsResponse = await request.json();
        const items: Array<Entry<ItemModel>> = jsonBody.items;

        return items.reduce<Record<Entry<ItemModel>['id'], Entry<ItemModel>>>((acc, item) => {
            acc[item.federatedId] = item;
            return acc;
        }, {});
    }

    public static postItem(item: ItemModel): Promise<unknown> {
        return SDK.instance.post('/items', item);
    }

    public static postItems(items: Array<ItemModel>): Promise<unknown> {
        return SDK.instance.chunk(items, ItemAPI.batchSize, (chunk) => {
            return SDK.instance.post('/items/batch', { items: chunk });
        });
    }

    public static putItem(item: Entry<ItemModel>): Promise<unknown> {
        return SDK.instance.put(`/items/${item.id}`, item);
    }

    public static putItems(items: Array<ItemModel>): Promise<unknown> {
        return SDK.instance.chunk(items, ItemAPI.batchSize, (chunk) => {
            return SDK.instance.put('/items/batch', { items: chunk });
        });
    }
}
