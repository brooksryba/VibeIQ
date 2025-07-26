import express from 'express';
import multer from 'multer';

import Logger from './logging';
import { extractData } from './etl';
import { mock_api } from './utils/mock';

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = 3000;

app.use(express.json());

// This is the main endpoint that will be exposed to the users
// in order to post a file to be extracted and processed in our
// system.
app.post('/extract', upload.single('file'), (req, res) => {
    if (!req.file) {
        Logger.error(`Extract was provided no file.`);
        return res.status(400).send('No file uploaded');
    }

    const extractId = req.file.filename;

    try {
        extractData(req.file);

        // API will operate asynchronously, so we want to return back to the user
        // an indication that the extract was started or let them know if there was
        // a problem initializing. Errors will be logged externally based on the UUID
        // of the uploaded file for tracking.
        Logger.info(`Extract launched`, { extractId });
        res.json({ message: `Extract ${extractId} launched` });
    } catch (e: any) {
        Logger.error(`Extract could not be launched`, { extractId });
        return res.status(400).send(`Extract ${extractId} could not be launched`);
    }
});

// These methods are used for testing of this service in order to mock
// the Item API endpoints that would typically be in a separate service.
mock_api(app);

app.listen(port, () => {
    Logger.info(`Server running at http://localhost:${port}`);
});
