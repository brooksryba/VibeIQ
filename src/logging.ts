import winston from 'winston';

// Ideally, this winston instance would also implement a transport
// to something like DataDog or another service which could help
// provide alerting to the appropriate stakeholders for critical
// errors in the pipeline.
const Logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console(), // optional
  ],
});

export default Logger;