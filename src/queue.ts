import Logger from './logging';
import { RoleEnum } from './enum';
import { ItemModel, Item, Entry } from './models';
import { ItemAPI } from './utils';

export class Queue {
    // Do not exceed max batch size in one queue
    private static _maxBuffer = ItemAPI.batchSize;

    // Store the extractId for logging purposes
    private _extractId: string;

    // Buffer variables only exist until the queue is flushed. Using a dictionary
    // for fast lookup of keys.
    private _bufferCount = 0;
    private _bufferItems: Record<ItemModel['federatedId'], Item> = {};
    private _bufferFamilyIds: Record<ItemModel['federatedId'], boolean> = {};

    // Other variables persist across queue flushes for quicker lookup at the expense of higher memory.
    // TODO: Investiage record size and how many families we generally deal with. If there are a ton
    // of product categories, this could cause the memory to explode.
    private _familyItems: Record<ItemModel['federatedId'], Entry<ItemModel> | ItemModel> = {};

    public constructor(extractId: string) {
        this._extractId = extractId;
    }

    public async add(item: Item) {
        try {
            // We need to lookup the family item later to see if it needs to be created.
            if (RoleEnum.FAMILY in item.roles && !(item.federatedId in this._familyItems)) {
                this._bufferFamilyIds[item.federatedId] = true;
            }

            // Since we remove duplicates by taking the latest entry in the
            // CSV file, we only want to add to the buffer count if the entry
            // is unique.
            if (!(item.federatedId in this._bufferItems)) {
                this._bufferCount++;
            }

            // Add the item to the buffer and check if the queue
            // needs to be flushed.
            this._bufferItems[item.federatedId] = item;
            await this._check();
        } catch (error) {
            // This will capture errors thrown by the API.
            Logger.error(`(${this._extractId}) Could not process records`, { error });
        }
    }

    private async _check() {
        // Only process the item queue in chunks based on the max
        // batch size of the Item API.
        if (this._bufferCount >= Queue._maxBuffer) {
            await this.flush();
        }
    }

    private _cleanup() {
        // Clear existing queue and reset counter
        this._bufferItems = {};
        this._bufferFamilyIds = {};
        this._bufferCount = 0;

        Logger.info(`(${this._extractId}) Cleaning up records from queue`);
    }

    public async flush() {
        Logger.info(`(${this._extractId}) Flushing ${this._bufferCount} records from queue`)

        const bufferItemKeys = Object.keys(this._bufferItems);
        const bufferFamilyKeys = Object.keys(this._bufferFamilyIds);

        Logger.info('call5')

        const existingItems = await ItemAPI.getItemsByFederatedIds(bufferItemKeys);

        // Inject the new family lookup table into the cache.
        // Add the database entries in second so that records
        // have the database id field when possible, although
        // we don't use this field at the moment.
        this._familyItems = {
            ...this._familyItems,
            ...(await ItemAPI.getItemsByFederatedIds(bufferFamilyKeys)),
        };

        const toCreate: Array<ItemModel> = [];
        const toUpdate: Array<Entry<ItemModel>> = [];

        Logger.info('call4')

        // Iterate over buffer family ids and determine what to post in the database.
        // This set is a unique list, so it will only process a family once per batch
        // when it appears.
        Object.keys(this._bufferFamilyIds).forEach((federatedId) => {
            if (!(federatedId in this._familyItems)) {
                const familyRecord = new Item({
                    federatedId,
                    name: Item.defaultName,
                    description: Item.defaultDescription,
                    roles: [RoleEnum.FAMILY],
                });

                this._familyItems[federatedId] = familyRecord;
                toCreate.push(familyRecord);
            }
        });

        Logger.info('call3')

        // Iterate over buffer items and determine what to update in database
        // and what to create in the database.
        Object.values(this._bufferItems).forEach((item) => {
            if (item.federatedId in existingItems) {
                const existingItem = existingItems[item.federatedId];

                // It is possible that we already have an existing item in the
                // database, and we should only really send data to the Item API
                // for this entry if there are fields that are out of date.
                //
                // The compare function is a simple example of how we can filter out
                // records that do not need to be sent to the database. To do this properly,
                // we would ideally have access to a timestamp in the csv for when the record
                // was updated / created and compare that to the update time in the database.
                if (!item.compare(existingItem)) {
                    toUpdate.push({
                        id: existingItem.id,
                        ...item,
                    });
                }
            } else if(!(item.federatedId in this._familyItems)) {
                // We check to see that this is not a family that we are already planning to
                // create above, which would result in a duplicated record if the federatedId
                // field is not a unique key in the database.
                toCreate.push(item);
            }
        });

        Logger.info('call2')

        // Send batch requests to API. While we try to limit the queue
        // size to the max batch size for the Item API, it is possible
        // that the addition of missing family records in the batch requests
        // puts us over this limit. For this reason, the ItemAPI / SDK will
        // automatically chunk up our batch requests to respect the max item
        // limit.
        if (toUpdate.length > 0) {
            await ItemAPI.putItems(toUpdate);
        }

        if (toCreate.length > 0) {
            await ItemAPI.postItems(toCreate);
        }

        Logger.info('call1')

        this._cleanup();
    }
}
