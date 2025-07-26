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
    const queue = new Queue(extractId);

    // Initialize the csv parser in a streaming format to process
    // the entire file in pieces. This avoids loading the whole file
    // into memory at once.
    return csv({
        colParser: {
            familyFederatedId: columnParser,
            optionFederatedId: columnParser,
            title: columnParser,
            details: columnParser,
        },
        checkType: true,
    })
        .fromFile(filePath)
        .subscribe(
            (record, lineNumber) => { transformData(extractId, queue, record, lineNumber) },
            () => { onTransformError(extractId) },
            () => { onTransformComplete(extractId, queue) }
        );
}

export async function onTransformError(extractId: string) {
    Logger.error(`Extract ${extractId} could not complete!`);
}

export async function onTransformComplete(extractId: string, queue: Queue) {
    // Process any additional records leftover from the
    // batching strategy.
    await queue.flush();

    Logger.info(`Extract ${extractId} completed!`);
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

export async function transformData(extractId: string, queue: Queue, record: CSVRecordModel, lineNumber: number): Promise<void> {
    return new Promise(async (resolve) => {
        try {
            // Add the record to a queue to be processed in batches
            // to reduce network overhead and improve throughput.
            const itemRecord = transformItemRecord(record);
            await queue.add(itemRecord);
        } catch (error) {
            // In the future, we could expect that other errors could occur
            // when transforming the data. This
            Logger.error(`(${extractId}: Line ${lineNumber+1}) Could not transform record`, { error });
        }

        // Always resolve the promise so that we can process all records,
        // even if some are faulty. Handle failures with logging so that
        // user can be notified of bad entries.
        resolve();
    });
}