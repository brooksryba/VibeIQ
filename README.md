# Architecture
- Typescript with Prettier to ensure style consistency for the team
- `csvtojson` lib to parse csv into objects using streams efficiently without utilizing too much memory at once.
    - Built-in conversion to object notation with header mapping
    - Supports async transform hook if the transform needs to be more complex
    - Handles parsing nulls and other built-in conversions
- `express.js` with `multer` to provide a quick API that handles file uploads with minimal overhead
- `bottleneck` library to provide a max concurrency and optional cool-down time for the api calls to the Lambda
    - As mentioned below in the improvements, Bottleneck supports Redis to help track distributed calls to the Lambda to ensure that if this service was scaled up, we would not risk hurting the Item API because of the Lambda concurrent request limit.
- Centralized logging module with `winston` that allows us to store failed entries per extract based on lineNumber, or API errors.
    - Flexible output configuration through this library depending on the tools available to the engineering team

# Data Transformation
The ETL pipeline has been setup to process data as outlined in the challenge document. Here is an overview:
- Columns missing optionFederatedId and familyFederatedId will be logged and ignored
- Columns with only familyFederatedId are mapped to the role "family"
- All other columns are mapped to the role "option"
- Rows that exist in the database but have different name or description values will be updated with a PUT request
- Duplicate rows will be logged and ignored
- Batch requests are utilized in favor of individual PUT and POST requests

# Setup:
```
npm ci
npm run build
npm run start
```

## Testing with sample data:
```
curl -X POST -F "file=@data.csv" http://localhost:3000/extract
```

# Notes:
- Mock Item API was provided for my own testing purposes. This could easily be tested against the real Item API by updating the SDK file to point towards the real API url.
- With the current setup, it's hard to see Bottleneck in action. You can reproduce the test I did by updating `maxConcurrent` in the SDK file to 1 request and spawning multiple extracts through the curl command above rapidly.
- There is an artificial delay on my mock api to provide some real world latency/processing delay on the database requests, which is also helpful when testing the maxConcurrency.
- Determining the amount of throughput of this service is difficult given external variables like how long we can expect Item API requests to take. Keeping this in mind, I have designed this ETL engine in a way that it will maximize processed rows as best as possible given the hardware / memory contraints of the machine this would be hosted on. More CPU allocation will help to some extent with processing speed. To give any reasonable estimate of the throughput of this service I would need to be provided with more information about the real-world scenario this service would face when being deployed in conjunction with the Item API.

## Questions for stakeholders:
- What is an average file size in terms of rows in csv?
- Will we expect headers to be in the file, or will the rows come in a common order without headers present?
- Do we expect file extract can be triggered at will by client or is it triggered internally?
    - If it is triggered by the client directly, should we have rate limits in place to prevent them from spawning to many ETL processes?
- What do we do with bad data rows in csv? Should we provide logging internally or to the client?
    - Do we have centralized logging platform to ensure errors in the code can be raised to stakeholders appropriately?

## Improvements:
- Item API GET request should not accept federatedIds in the url. Max url length could be exceeded depending on the length of ids provided and common batch sizes. Although adding parameters to the body wouldn't be RESTful, it could be useful if the client started throwing some wild federatedIds at us in the future.
- The item schema is set up in a weird way where I cannot link existing "option" type items in the database to "family" type items. There must be another table present that provides this link, or it might not be possible to lookup "option" type items by the parent family at all. Ideally, these schemas would be separated into two different tables (e.g. ItemFamily and ItemOption where the ItemOption also includes the familyFederatedId)
- If this ETL service were to be scaled to multiple instances, it would be nice to use something like a Redis cache to keep track of existing items by federatedId to avoid processing duplicate items that might be present in multiple csv files. This would apply to "family" type and "option" types. Redis could also be used along with the Bottleneck library to monitor concurrent requests across all instances of this service.
- It could also be a good idea to separate the uploading of the CSV file and the ETL into two different services, with longer term storage in S3 of the files to process and a SQS queue to keep track of which files to process in order. Since this challenge didn't specify to created a distributed engine, that would be overkill for this code at this time. This would allow extract jobs to be scheduled easier if we are experiencing heavy loads on different parts of the application like max-scaling hit on the ETL services, or heavy load on the Lambda Item API.