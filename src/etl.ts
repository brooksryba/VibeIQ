import csv from 'csvtojson';
import path from 'path';

import Logger from './logging';
import { Queue } from './queue';
import { CSVRecordModel, Item } from './models';
import { RoleEnum } from './enum';

export function columnParser(value: string): string | null {
    // csvtojson library will return missing column values
    // as an empty string. Ensure we convert them to null
    // for our business logic below.
    return value === '' ? null : value;
}

export async function extractData(file: Express.Multer.File): Promise<unknown> {
    const filePath = path.resolve(file.path);
    const extractId = file.filename;
    let lineNumber = 0;

    // Initialize the csv parser in a streaming format to process
    // the entire file in pieces. This avoids loading the whole file
    // into memory at once.
    const parser = csv({
        colParser: {
            familyFederatedId: columnParser,
            optionFederatedId: columnParser,
            title: columnParser,
            details: columnParser,
        },
        checkType: true,
    });

    // Queue takes the parser as an argument so that
    // when the queue buffer size is reached, we can
    // pause the stream 'data' event while the queue
    // is being flushed.
    const queue = new Queue(extractId, parser);

    return parser
        .fromFile(filePath)
        .on('data', async (record) => {
            const itemRecord = JSON.parse(record.toString('utf-8'));
            await transformData(extractId, queue, itemRecord, lineNumber++);
        })
        .on('end', async () => {
            await onTransformComplete(extractId, queue, lineNumber++);
        })
        .on('error', (error: Error) => {
            onTransformError(extractId, error);
        });
}

export function onTransformError(extractId: string, error: Error) {
    Logger.error(`Extract could not complete!`, { extractId, ...error });
}

export async function onTransformComplete(extractId: string, queue: Queue, lineNumber: number) {
    // Process any additional records leftover from the
    // batching strategy.
    await queue.flush();

    Logger.info(`Extract completed! Processed ${lineNumber} records.`, { extractId });
}

export function transformItemRecord(record: CSVRecordModel): Item {
    let role: RoleEnum;
    let federatedId: string;

    if (record.optionFederatedId != null) {
        role = RoleEnum.OPTION;
        federatedId = record.optionFederatedId;
    } else if (record.familyFederatedId != null) {
        role = RoleEnum.FAMILY;
        federatedId = record.familyFederatedId;
    } else {
        throw new Error(`optionFederatedId or familyFederatedId must be provided`);
    }

    return new Item({
        name: record.title,
        description: record.details,
        roles: [role],
        federatedId,
    });
}

export async function transformData(
    extractId: string,
    queue: Queue,
    record: CSVRecordModel,
    lineNumber: number
): Promise<void> {
    return new Promise(async (resolve) => {
        try {
            // Add the record to a queue to be processed in batches
            // to reduce network overhead and improve throughput.
            const itemRecord = transformItemRecord(record);
            await queue.add(itemRecord);
        } catch (error: any) {
            if (error instanceof Error) {
                // In the future, we could expect that other errors could occur
                // when transforming the data. This
                Logger.error(`Could not transform record`, { extractId, lineNumber, ...error });
            }
        }

        // Always resolve the promise so that we can process all records,
        // even if some are faulty. Handle failures with logging so that
        // user can be notified of bad entries.
        resolve();
    });
}
