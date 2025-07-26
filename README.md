Architecture:
- `csvtojson` lib to parse csv fromStream into objects efficiently without utilizing too much memory at once.
- `express.js` to provide a quick service with minimal overhead
- Typescript with Prettier to ensure style consistency for the team
- Centralized logging module that allows us to store failed entries per extract based on lineNumber, or API errors

Setup:
`npm ci`
`npm run build`
`npm run start`

Questions for stakeholders:
- What is an average file size in terms of rows in csv. Will we expect headers to be in the file, or will the rows come in a common order without headers present?
- Do we expect file extract can be triggered at will by client or is it triggered internally?
    - If it is triggered by the client directly, should we have rate limits in place to prevent them from spawning to many ETL processes?
- What do we do with bad data rows in csv? Should we provide logging internally or to the client?
    - Do we have centralized logging platform to ensure errors in the code can be raised to stakeholders appropriately?

Improvements:
- Item API GET request should not accept federatedIds in the url. Max url length could be exceeded depending on the length of ids provided and common batch sizes. Although adding parameters to the body wouldn't be restful, it could be useful if the client started throwing some wild federatedIds at us.
- The item schema is set up in a weird way where I cannot link existing "option" type items in the database to "family" type items. There must be another table present that provides this link, or it might not be possible to lookup "option" type items by the parent family at all. Ideally, these schemas would be separated into two different tables (e.g. ItemFamily and ItemOption where the ItemOption also includes the familyFederatedId)
- If this ETL service were to be scaled to multiple instances, it would be nice to use something like a Redis cache to keep track of existing items by federatedId to avoid processing duplicate items that might be present in multiple csv files. This would apply to "family" type and "option" types.
- It could also be a good idea to separate the uploading of the CSV file and the ETL into two different services, with longer term storage in S3 of the files to process and a SQS queue to keep track of which files to process in order. Since this challenge didn't specify to created a distributed engine, that would be overkill for this code at this time.